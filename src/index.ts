/** REST client for the Magic Hour API. Never retries a paid POST. */
export type MessageDescriptor = { id?: string; defaultMessage: string; description: string };
export type MessageFormatter = (
  message: MessageDescriptor,
  values?: Record<string, string | number>
) => string;
export const englishMessage: MessageFormatter = (message, values = {}) =>
  message.defaultMessage.replace(/\{(\w+)\}/g, (placeholder, key) =>
    String(values[key] ?? placeholder)
  );
export type ProjectKind = "image" | "video";
export type Project = {
  id: string;
  status: "draft" | "queued" | "rendering" | "complete" | "error" | "canceled";
  credits_charged: number;
  downloads: { url: string; expires_at: string }[];
  error?: { message: string; code: string } | null;
};
export class MagicHourError extends Error {
  readonly isRetryable = false;
  constructor(
    message: string,
    readonly projectId?: string,
    readonly status?: number,
    formatMessage: MessageFormatter = englishMessage
  ) {
    super(
      projectId
        ? formatMessage(
            {
              defaultMessage:
                "{message} (project {projectId}; resume this project instead of generating again)",
              description:
                "Error recovery guidance containing the original error and accepted project ID.",
            },
            { message, projectId }
          )
        : message
    );
    this.name = "MagicHourError";
  }
}
export type ClientSettings = {
  apiKey: string;
  formatMessage?: MessageFormatter;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};
export class MagicHourClient {
  private readonly fetcher: typeof globalThis.fetch;
  readonly timeoutMs: number;
  private readonly formatMessage: MessageFormatter;
  constructor(private readonly settings: ClientSettings) {
    this.formatMessage = settings.formatMessage ?? englishMessage;
    if (!settings.apiKey?.trim())
      throw new Error(
        this.formatMessage({
          defaultMessage: "Magic Hour API key is required.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    this.fetcher = settings.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = settings.timeoutMs ?? 600_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Invalid timeout.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
  }
  signal(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }
  async request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    extraHeaders?: Record<string, string | undefined>
  ): Promise<T> {
    const headers = new Headers();
    for (const [key, value] of Object.entries(extraHeaders ?? {}))
      if (value !== undefined) headers.set(key, value);
    headers.set("Authorization", `Bearer ${this.settings.apiKey.trim()}`);
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await this.fetcher(`https://api.magichour.ai${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: signal ?? this.signal(),
      redirect: "error",
    });
    if (!response.ok) {
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
    return response.json() as Promise<T>;
  }
  async getProject(
    id: string,
    kind: ProjectKind,
    signal?: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<Project> {
    return this.request<Project>(
      `/v1/${kind}-projects/${encodeURIComponent(id)}`,
      undefined,
      signal,
      headers
    );
  }
}
