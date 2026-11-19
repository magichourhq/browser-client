import type {
  AiImageGeneratorCreateResponse,
  FilesUploadUrlsCreateBody,
  FilesUploadUrlsCreateResponse,
  ImageToVideoCreateResponse,
} from "@magichourhq/api-types";
import { abortable, abortError, createTimeoutSignal } from "./abort.js";
import type { CreateArguments } from "./endpoints.js";
import { MagicHourError } from "./errors.js";
import { withEnglishFallback, type MessageFormatter } from "./messages.js";
import type { Project, ProjectKind } from "./projects.js";
import { httpsURL } from "./urls.js";

type CreatedProject = Pick<AiImageGeneratorCreateResponse | ImageToVideoCreateResponse, "id">;
type PreparedRequest = { url: string; init: RequestInit };

const API_ORIGIN = "https://api.magichour.ai";

/** A 4xx means the API refused the job, except 408, where the outcome is unknown. */
const wasRejected = (status?: number) =>
  status !== undefined && status >= 400 && status < 500 && status !== 408;

/** Releases a response body the client will not read, so it cannot outlive the deadline. */
const discardBody = (response: Response) => void response.body?.cancel().catch(() => {});

export type ClientSettings = {
  apiKey: string;
  formatMessage?: MessageFormatter;
  fetch?: typeof globalThis.fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProjectCreated?: (project: { id: string; kind: ProjectKind }) => void | Promise<void>;
};
/** REST client for the Magic Hour API. Never retries a paid POST. */
export class MagicHourClient {
  private readonly fetcher: typeof globalThis.fetch;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  private readonly formatMessage: MessageFormatter;
  constructor(private readonly settings: ClientSettings) {
    this.formatMessage = withEnglishFallback(settings.formatMessage);
    if (!settings.apiKey?.trim())
      throw new Error(
        this.formatMessage({
          defaultMessage: "Magic Hour API key is required.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    this.fetcher = settings.fetch ?? ((input, init) => fetch(input, init));
    this.pollIntervalMs = settings.pollIntervalMs ?? 2000;
    this.timeoutMs = settings.timeoutMs ?? 600_000;
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs < 0)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Invalid poll interval.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Invalid timeout.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
  }
  /** Shares one deadline across several calls. Its timer runs until it fires or `signal` aborts. */
  signal(signal?: AbortSignal): AbortSignal {
    return createTimeoutSignal(this.timeoutMs, signal).signal;
  }
  async request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    extraHeaders?: Record<string, string | undefined>
  ): Promise<T> {
    return this.send<T>(this.prepareRequest(path, body, extraHeaders), signal);
  }
  private prepareRequest(
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string | undefined>
  ): PreparedRequest {
    try {
      const url = new URL(path, API_ORIGIN);
      if (url.origin !== API_ORIGIN) throw new Error("Unexpected API origin.");
      const headers = new Headers();
      for (const [key, value] of Object.entries(extraHeaders ?? {}))
        if (value !== undefined) headers.set(key, value);
      headers.set("Authorization", `Bearer ${this.settings.apiKey.trim()}`);
      headers.set("Accept", "application/json");
      if (body !== undefined) headers.set("Content-Type", "application/json");
      return {
        url: url.href,
        init: {
          method: body === undefined ? "GET" : "POST",
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
        },
      };
    } catch {
      // Parser and header errors can repeat a URL, header value or API key.
      throw new MagicHourError(
        this.formatMessage({
          defaultMessage: "The Magic Hour request is invalid and was not sent.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        }),
        undefined,
        undefined,
        this.formatMessage
      );
    }
  }
  private async send<T>({ url, init }: PreparedRequest, signal?: AbortSignal): Promise<T> {
    return this.withDeadline(signal, async (deadline) => {
      const response = await this.fetchWithin(url, init, deadline);
      if (!response.ok) {
        discardBody(response);
        // Do not echo a remote response that could contain credentials or signed URLs.
        throw new MagicHourError(
          this.formatMessage(
            {
              defaultMessage: "Magic Hour API returned HTTP {status}.",
              description: "Error shown when a Magic Hour API operation cannot complete.",
            },
            { status: response.status }
          ),
          undefined,
          response.status,
          this.formatMessage
        );
      }
      try {
        return (await abortable(response.json(), deadline)) as T;
      } catch (error) {
        if (deadline.aborted) throw error;
        // JSON parser errors can quote the response body.
        throw new MagicHourError(
          this.formatMessage({
            defaultMessage: "Magic Hour API returned an invalid response.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          }),
          undefined,
          response.status,
          this.formatMessage
        );
      }
    });
  }
  async create(...[endpoint, kind, body, signal, headers]: CreateArguments): Promise<string> {
    return this.withDeadline(signal, async (deadline) => {
      if (deadline.aborted) throw abortError(deadline);
      const request = this.prepareRequest(`/v1/${endpoint}`, body, headers);
      let created: CreatedProject | null;
      try {
        created = await this.send<CreatedProject | null>(request, deadline);
      } catch (error) {
        const status = error instanceof MagicHourError ? error.status : undefined;
        if (wasRejected(status)) throw error;
        throw new MagicHourError(
          this.formatMessage({
            defaultMessage:
              "Generation submission was interrupted. Acceptance is unknown; check account history before submitting again.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          }),
          undefined,
          status,
          this.formatMessage
        );
      }
      const id = created?.id;
      if (typeof id !== "string" || !id)
        throw new MagicHourError(
          this.formatMessage({
            defaultMessage: "Missing project ID. Check account history before submitting again.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          }),
          undefined,
          undefined,
          this.formatMessage
        );
      try {
        await abortable(
          Promise.resolve().then(() => this.settings.onProjectCreated?.({ id, kind })),
          deadline
        );
      } catch {
        throw this.projectError(
          this.formatMessage({
            defaultMessage: "Could not save the accepted project ID.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          }),
          id
        );
      }
      return id;
    });
  }
  async getProject<Kind extends ProjectKind>(
    id: string,
    kind: Kind,
    signal?: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<Project<Kind>> {
    return this.request<Project<Kind>>(
      `/v1/${kind}-projects/${encodeURIComponent(id)}`,
      undefined,
      signal,
      headers
    );
  }
  async wait<Kind extends ProjectKind>(
    id: string,
    kind: Kind,
    signal?: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<Project<Kind>> {
    return this.withDeadline(signal, async (deadline) => {
      try {
        while (true) {
          if (deadline.aborted) throw this.projectError(this.waitingStoppedMessage(), id);
          const project = await this.getProject(id, kind, deadline, headers);
          if (project.status === "complete") {
            if (!project.downloads?.length)
              throw this.projectError(
                this.formatMessage({
                  defaultMessage: "Completed project has no downloadable output.",
                  description: "Error shown when a Magic Hour API operation cannot complete.",
                }),
                id
              );
            try {
              for (const download of project.downloads) httpsURL(download.url, this.formatMessage);
            } catch (error) {
              throw this.projectError((error as Error).message, id);
            }
            return project;
          }
          if (project.status === "error" || project.status === "canceled")
            throw this.projectError(
              project.status === "error"
                ? this.formatMessage({
                    defaultMessage: "Generation error.",
                    description: "The generation failed on the server.",
                  })
                : this.formatMessage({
                    defaultMessage: "Generation canceled.",
                    description: "The generation was canceled on the server.",
                  }),
              id
            );
          if (!["draft", "queued", "rendering"].includes(project.status))
            throw this.projectError(
              this.formatMessage({
                defaultMessage: "Unknown project status.",
                description: "Error shown when a Magic Hour API operation cannot complete.",
              }),
              id
            );
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              deadline.removeEventListener("abort", abort);
              resolve();
            };
            const timer = setTimeout(done, this.pollIntervalMs);
            const abort = () => {
              clearTimeout(timer);
              deadline.removeEventListener("abort", abort);
              reject(new Error(this.waitingStoppedMessage()));
            };
            deadline.addEventListener("abort", abort, { once: true });
            if (deadline.aborted) abort();
          });
        }
      } catch (error) {
        if (error instanceof MagicHourError && error.projectId) throw error;
        throw this.projectError(
          deadline.aborted
            ? this.waitingStoppedMessage()
            : this.formatMessage({
                defaultMessage: "Could not retrieve the project.",
                description: "Error shown when a Magic Hour API operation cannot complete.",
              }),
          id
        );
      }
    });
  }
  async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.withDeadline(signal, async (deadline) => {
      const response = await this.fetchWithin(
        httpsURL(url, this.formatMessage),
        { credentials: "omit" },
        deadline
      );
      if (!response.ok) {
        discardBody(response);
        throw new Error(
          this.formatMessage(
            {
              defaultMessage: "Media download returned HTTP {status}.",
              description: "Error shown when a Magic Hour API operation cannot complete.",
            },
            { status: response.status }
          )
        );
      }
      return new Uint8Array(await abortable(response.arrayBuffer(), deadline));
    });
  }
  async uploadImage(bytes: Uint8Array, extension: string, signal?: AbortSignal): Promise<string> {
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) || !bytes.length)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Expected a nonempty PNG, JPEG, or WebP image.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    return this.withDeadline(signal, async (deadline) => {
      const uploadRequest: FilesUploadUrlsCreateBody = { items: [{ type: "image", extension }] };
      const uploadUrls = await this.request<FilesUploadUrlsCreateResponse | null>(
        "/v1/files/upload-urls",
        uploadRequest,
        deadline
      );
      const item = uploadUrls?.items?.[0];
      if (!item?.file_path || !item.upload_url)
        throw new Error(
          this.formatMessage({
            defaultMessage: "Invalid upload response.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          })
        );
      const response = await this.fetchWithin(
        httpsURL(item.upload_url, this.formatMessage),
        { method: "PUT", body: bytes as BodyInit, credentials: "omit" },
        deadline
      );
      discardBody(response);
      if (!response.ok)
        throw new Error(
          this.formatMessage(
            {
              defaultMessage: "Image upload returned HTTP {status}.",
              description: "Error shown when a Magic Hour API operation cannot complete.",
            },
            { status: response.status }
          )
        );
      return item.file_path;
    });
  }
  /** Enforces the deadline even when a custom `fetch` ignores its signal. */
  private async fetchWithin(
    url: string,
    init: RequestInit,
    deadline: AbortSignal
  ): Promise<Response> {
    const pending = this.fetcher(url, { ...init, signal: deadline });
    try {
      return await abortable(pending, deadline);
    } catch (error) {
      pending.then(discardBody, () => {});
      throw error;
    }
  }
  private async withDeadline<T>(
    signal: AbortSignal | undefined,
    run: (deadline: AbortSignal) => Promise<T>
  ): Promise<T> {
    const deadline = createTimeoutSignal(this.timeoutMs, signal);
    try {
      return await run(deadline.signal);
    } finally {
      deadline.clear();
    }
  }
  private projectError(message: string, id: string): MagicHourError {
    return new MagicHourError(message, id, undefined, this.formatMessage);
  }
  private waitingStoppedMessage(): string {
    return this.formatMessage({
      defaultMessage: "Waiting stopped.",
      description: "Error shown when a Magic Hour API operation cannot complete.",
    });
  }
}
