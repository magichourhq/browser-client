import type {
  AiImageGeneratorCreateResponse,
  FilesUploadUrlsCreateBody,
  FilesUploadUrlsCreateResponse,
  ImageToVideoCreateResponse,
} from "@magichourhq/api-types";
import { abortable, abortError, createTimeoutSignal, sleep } from "./abort.js";
import { createKinds, type CreateArguments } from "./endpoints.js";
import { MagicHourError } from "./errors.js";
import {
  englishMessage,
  messages,
  type MessageDescriptor,
  type MessageFormatter,
} from "./messages.js";
import type { Project, ProjectKind } from "./projects.js";
import { httpsURL } from "./urls.js";

type CreatedProject = Pick<AiImageGeneratorCreateResponse | ImageToVideoCreateResponse, "id">;
type PreparedRequest = { url: string; init: RequestInit };
type RequestHeaders = Record<string, string | undefined>;

/** Reads the API's documented `{ code, message }` error body. Anything else is dropped. */
async function apiError(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    const { code, message } = Object(JSON.parse(await response.text()));
    return { code, message };
  } catch {
    return {};
  }
}
/** A 4xx means the API refused the job, except 408, where the outcome is unknown. */
function wasRejected(status?: number): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 408;
}

export type ClientSettings = {
  apiKey: string;
  /** Replaces the global `fetch`, for example to add logging or run in tests. */
  fetch?: typeof fetch;
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
  private readonly fetch: typeof fetch;
  constructor(private readonly settings: ClientSettings) {
    // Look up the global at call time so it is never called with the wrong `this`.
    this.fetch = settings.fetch ?? ((input, init) => fetch(input, init));
    const format = settings.formatMessage ?? englishMessage;
    // Pass a copy so a host formatter cannot change the shared message table.
    this.formatMessage = (message, values) => {
      try {
        return format({ ...message }, values);
      } catch {
        // A broken translation must not replace an error that carries an accepted project ID.
        return englishMessage(message, values);
      }
    };
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
    // The caller owns this signal and may never use it, so it must not keep Node running.
    return createTimeoutSignal(this.timeoutMs, signal, { keepAlive: false }).signal;
  }
  async create(...[endpoint, body, signal, headers]: CreateArguments): Promise<string> {
    // Without a known kind, the accepted project could not be resumed.
    const kind: ProjectKind | undefined = createKinds[endpoint];
    if (kind !== "image" && kind !== "video") throw this.invalidRequest();
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
      // A blank ID can't be polled or resumed, so treat it like a missing one.
      if (typeof id !== "string" || !id.trim())
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
          // Clears its timer on abort, so a cancelled wait doesn't keep the process running.
          await sleep(this.pollIntervalMs, deadline);
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
      const response = await this.fetchSafely(
        httpsURL(url, this.formatMessage),
        { signal: deadline, credentials: "omit" },
        deadline,
        messages.downloadFailed
      );
      // A 206 is only part of the file; this client never asks for a range.
      if (!response.ok || response.status === 206)
        throw new Error(
          this.formatMessage(messages.downloadHttpError, { status: response.status })
        );
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        if (deadline.aborted) throw abortError(deadline);
        throw new Error(this.formatMessage(messages.downloadFailed));
      }
      if (!bytes.length) throw new Error(this.formatMessage(messages.emptyDownload));
      return bytes;
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
      // The file path goes into a paid request, so reject anything unusable before uploading.
      if (
        typeof item?.file_path !== "string" ||
        !item.file_path.trim() ||
        typeof item.upload_url !== "string"
      )
        throw new Error(this.formatMessage(messages.invalidUploadResponse));
      const response = await this.fetchSafely(
        httpsURL(item.upload_url, this.formatMessage),
        { method: "PUT", body: bytes as BodyInit, signal: deadline, credentials: "omit" },
        deadline,
        messages.uploadFailed
      );
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
      throw this.invalidRequest();
    }
  }
  private async send<T>({ url, init }: PreparedRequest, signal?: AbortSignal): Promise<T> {
    return this.withDeadline(signal, async (deadline) => {
      const response = await this.fetchSafely(
        url,
        { ...init, signal: deadline },
        deadline,
        messages.networkError
      );
      if (!response.ok) {
        const { code, message } = await apiError(response);
        const status = this.formatMessage(messages.apiHttpError, { status: response.status });
        throw new MagicHourError(
          message ? `${status} ${message}` : status,
          undefined,
          response.status,
          this.formatMessage,
          code
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
  /** Calls fetch, replacing its errors, which can repeat request details, with a fixed message. */
  private async fetchSafely(
    url: string,
    init: RequestInit,
    deadline: AbortSignal,
    failure: MessageDescriptor
  ): Promise<Response> {
    try {
      return await this.fetch(url, init);
    } catch {
      if (deadline.aborted) throw abortError(deadline);
      throw new MagicHourError(
        this.formatMessage(failure),
        undefined,
        undefined,
        this.formatMessage
      );
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
  private invalidRequest(): MagicHourError {
    return new MagicHourError(
      this.formatMessage(messages.invalidRequest),
      undefined,
      undefined,
      this.formatMessage
    );
  }
  private projectError(message: string, id: string): MagicHourError {
    return new MagicHourError(message, id, undefined, this.formatMessage);
  }
}
