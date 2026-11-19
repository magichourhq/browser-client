import { createTimeoutSignal } from "./abort.js";
import { MagicHourError } from "./errors.js";
import { englishMessage, type MessageFormatter } from "./messages.js";
import type { Project, ProjectKind } from "./projects.js";

export type ClientSettings = {
  apiKey: string;
  formatMessage?: MessageFormatter;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};
/** REST client for the Magic Hour API. Never retries a paid POST. */
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
    this.fetcher = settings.fetch ?? ((input, init) => fetch(input, init));
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
    return createTimeoutSignal(this.timeoutMs, signal).signal;
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
    const timeout = signal ? undefined : createTimeoutSignal(this.timeoutMs);
    try {
      const response = await this.fetcher(`https://api.magichour.ai${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: signal ?? timeout?.signal,
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
      return (await response.json()) as T;
    } finally {
      timeout?.clear();
    }
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
}
