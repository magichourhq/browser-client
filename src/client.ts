import type {
  AiImageGeneratorCreateResponse,
  FilesUploadUrlsCreateBody,
  FilesUploadUrlsCreateResponse,
  ImageToVideoCreateResponse,
} from "@magichourhq/api-types";
import { abortable, abortError, createTimeoutSignal } from "./abort.js";
import type { CreateArguments } from "./endpoints.js";
import { MagicHourError } from "./errors.js";
import { englishMessage, messages, type MessageFormatter } from "./messages.js";
import type { Project, ProjectKind } from "./projects.js";
import { httpsURL } from "./urls.js";

type CreatedProject = Pick<AiImageGeneratorCreateResponse | ImageToVideoCreateResponse, "id">;
type PreparedRequest = { url: string; init: RequestInit };
type RequestHeaders = Record<string, string | undefined>;

/** A 4xx means the API refused the job, except 408, where the outcome is unknown. */
function wasRejected(status?: number): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 408;
}

export type ClientSettings = {
  apiKey: string;
  formatMessage?: MessageFormatter;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProjectCreated?: (project: { id: string; kind: ProjectKind }) => void | Promise<void>;
};
/** REST client for the Magic Hour API. Never retries a paid POST. */
export class MagicHourClient {
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  private readonly formatMessage: MessageFormatter;
  constructor(private readonly settings: ClientSettings) {
    this.formatMessage = settings.formatMessage ?? englishMessage;
    if (!settings.apiKey?.trim()) throw new Error(this.formatMessage(messages.apiKeyRequired));
    this.pollIntervalMs = settings.pollIntervalMs ?? 2000;
    this.timeoutMs = settings.timeoutMs ?? 600_000;
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs < 0)
      throw new Error(this.formatMessage(messages.invalidPollInterval));
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error(this.formatMessage(messages.invalidTimeout));
  }
  /** Shares one deadline across several calls. Its timer runs until it fires or `signal` aborts. */
  signal(signal?: AbortSignal): AbortSignal {
    return createTimeoutSignal(this.timeoutMs, signal).signal;
  }
  async create(...[endpoint, kind, body, signal, headers]: CreateArguments): Promise<string> {
    const request = this.prepareRequest(`/v1/${endpoint}`, body, headers);
    return this.withDeadline(signal, async (deadline) => {
      if (deadline.aborted) throw abortError(deadline);
      let created: CreatedProject | null;
      try {
        created = await this.send<CreatedProject | null>(request, deadline);
      } catch (error) {
        const status = error instanceof MagicHourError ? error.status : undefined;
        if (wasRejected(status)) throw error;
        throw new MagicHourError(
          this.formatMessage(messages.submissionInterrupted),
          undefined,
          status,
          this.formatMessage
        );
      }
      const id = created?.id;
      if (typeof id !== "string" || !id)
        throw new MagicHourError(
          this.formatMessage(messages.missingProjectId),
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
        throw this.projectError(this.formatMessage(messages.projectIdNotSaved), id);
      }
      return id;
    });
  }
  async getProject<Kind extends ProjectKind>(
    id: string,
    kind: Kind,
    signal?: AbortSignal,
    headers?: RequestHeaders
  ): Promise<Project<Kind>> {
    const path = `/v1/${kind}-projects/${encodeURIComponent(id)}`;
    return this.send<Project<Kind>>(this.prepareRequest(path, undefined, headers), signal);
  }
  async wait<Kind extends ProjectKind>(
    id: string,
    kind: Kind,
    signal?: AbortSignal,
    headers?: RequestHeaders
  ): Promise<Project<Kind>> {
    return this.withDeadline(signal, async (deadline) => {
      try {
        while (true) {
          if (deadline.aborted)
            throw this.projectError(this.formatMessage(messages.waitingStopped), id);
          const project = await this.getProject(id, kind, deadline, headers);
          if (project.status === "complete") {
            if (!project.downloads?.length)
              throw this.projectError(this.formatMessage(messages.noDownloadableOutput), id);
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
                ? this.formatMessage(messages.generationError)
                : this.formatMessage(messages.generationCanceled),
              id
            );
          if (!["draft", "queued", "rendering"].includes(project.status))
            throw this.projectError(this.formatMessage(messages.unknownProjectStatus), id);
          await abortable(
            new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs)),
            deadline
          );
        }
      } catch (error) {
        if (error instanceof MagicHourError && error.projectId) throw error;
        throw this.projectError(
          deadline.aborted
            ? this.formatMessage(messages.waitingStopped)
            : this.formatMessage(messages.projectNotRetrieved),
          id
        );
      }
    });
  }
  async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.withDeadline(signal, async (deadline) => {
      const response = await fetch(httpsURL(url, this.formatMessage), {
        signal: deadline,
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(
          this.formatMessage(messages.downloadHttpError, { status: response.status })
        );
      return new Uint8Array(await response.arrayBuffer());
    });
  }
  async uploadImage(bytes: Uint8Array, extension: string, signal?: AbortSignal): Promise<string> {
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) || !bytes.length)
      throw new Error(this.formatMessage(messages.invalidImage));
    return this.withDeadline(signal, async (deadline) => {
      const uploadRequest: FilesUploadUrlsCreateBody = { items: [{ type: "image", extension }] };
      const uploadUrls = await this.send<FilesUploadUrlsCreateResponse | null>(
        this.prepareRequest("/v1/files/upload-urls", uploadRequest),
        deadline
      );
      const item = uploadUrls?.items?.[0];
      if (!item?.file_path || !item.upload_url)
        throw new Error(this.formatMessage(messages.invalidUploadResponse));
      const response = await fetch(httpsURL(item.upload_url, this.formatMessage), {
        method: "PUT",
        body: bytes as BodyInit,
        signal: deadline,
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(this.formatMessage(messages.uploadHttpError, { status: response.status }));
      return item.file_path;
    });
  }
  private prepareRequest(path: string, body?: unknown, extraHeaders?: RequestHeaders) {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(extraHeaders ?? {}))
        if (value !== undefined) headers.set(key, value);
      headers.set("Authorization", `Bearer ${this.settings.apiKey.trim()}`);
      headers.set("Accept", "application/json");
      if (body !== undefined) headers.set("Content-Type", "application/json");
      const request: PreparedRequest = {
        url: `https://api.magichour.ai${path}`,
        init: {
          method: body === undefined ? "GET" : "POST",
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
        },
      };
      return request;
    } catch {
      // Header errors can repeat the value, including the API key.
      throw new MagicHourError(
        this.formatMessage(messages.invalidRequest),
        undefined,
        undefined,
        this.formatMessage
      );
    }
  }
  private async send<T>({ url, init }: PreparedRequest, signal?: AbortSignal): Promise<T> {
    return this.withDeadline(signal, async (deadline) => {
      const response = await fetch(url, { ...init, signal: deadline });
      if (!response.ok) {
        // Do not echo a remote response that could contain credentials or signed URLs.
        throw new MagicHourError(
          this.formatMessage(messages.apiHttpError, { status: response.status }),
          undefined,
          response.status,
          this.formatMessage
        );
      }
      try {
        return (await response.json()) as T;
      } catch {
        if (deadline.aborted) throw abortError(deadline);
        // JSON parser errors can quote the response body.
        throw new MagicHourError(
          this.formatMessage(messages.invalidApiResponse),
          undefined,
          response.status,
          this.formatMessage
        );
      }
    });
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
}
