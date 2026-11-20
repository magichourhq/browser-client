import { MagicHourClient, type ClientSettings } from "../../src/index.js";

export const API = "https://api.magichour.ai";
// Signed URLs live on a Magic Hour host, so credential checks must use the exact API origin.
export const STORAGE = "https://videos.magichour.ai";
export const API_KEY = "mh_test_KEY_8f2a91";

export type Call = {
  url: string;
  method: string;
  headers: Headers;
  redirect: RequestRedirect;
  credentials: RequestCredentials;
  /** Parsed JSON for JSON requests, otherwise the raw bytes. */
  body: any;
};

export type FakeApiOptions = {
  /** Statuses returned by successive polls. The last one repeats. */
  statuses?: string[];
  /** HTTP status for create requests. */
  createStatus?: number;
  /** Raw response for create requests, replacing the normal one. */
  createResponse?: () => Response;
  /** Accepts the create request, then fails like a connection reset. */
  createNetworkError?: boolean;
  /** Answers matching requests with a 307 back to the same URL. */
  redirect?: (call: Call) => boolean;
  /** HTTP status for polls. */
  projectStatus?: number;
  /** Overrides the downloads on a complete project. */
  downloads?: (url: string) => { url: string; expires_at: string }[];
  /** HTTP status for downloads. */
  downloadStatus?: number;
  emptyDownload?: boolean;
  /** Serves an unrequested 206 with half the file. */
  partialDownload?: boolean;
  /** Body for the upload-URL request. */
  uploadUrlsBody?: unknown;
  /** HTTP status for the upload PUT. */
  uploadStatus?: number;
  /** Text in every error response body, to check it never reaches the caller. */
  errorMessage?: string;
  /** Requests that get no response until aborted. */
  hold?: (call: Call) => boolean;
  /** Responses whose body stalls until aborted. */
  stallBody?: (call: Call) => boolean;
  /** Responses whose body breaks partway. */
  breakBody?: (call: Call) => boolean;
};

const kinds: Record<string, "image" | "video"> = {
  "/v1/ai-image-generator": "image",
  "/v1/text-to-video": "video",
  "/v1/image-to-video": "video",
};

export function isCreate(call: Call): boolean {
  return call.method === "POST" && new URL(call.url).pathname in kinds;
}
export function isPoll(call: Call): boolean {
  return /-projects\//.test(call.url);
}
export function isDownload(call: Call): boolean {
  return call.method === "GET" && call.url.startsWith(STORAGE);
}
export function isUpload(call: Call): boolean {
  return call.method === "PUT";
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(abortError(signal));
    else signal.addEventListener("abort", () => reject(abortError(signal)), { once: true });
  });
}

function stalledBody(signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream(
    {
      pull(controller) {
        if (signal.aborted) return controller.error(abortError(signal));
        signal.addEventListener("abort", () => controller.error(abortError(signal)), {
          once: true,
        });
        return new Promise(() => {});
      },
    },
    { highWaterMark: 0 }
  );
}

/** Sends a few bytes, then fails like a reset connection. */
function brokenBody(prefix: Uint8Array): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    pull(controller) {
      if (sent) return controller.error(new TypeError("terminated: other side closed"));
      sent = true;
      controller.enqueue(prefix);
    },
  });
}

/**
 * A strict stand-in for the Magic Hour API and its signed-URL storage. It answers only the exact
 * method and route the real API accepts and follows real `fetch` semantics for aborts and
 * redirects.
 */
export function fakeApi(options: FakeApiOptions = {}) {
  const calls: Call[] = [];
  const projects = new Map<string, { kind: string; url: string; polls: number }>();
  const uploads: { url: string; filePath: string; bytes?: Uint8Array }[] = [];
  const output = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  function error(status: number): Response {
    return Response.json(
      { code: `http_${status}`, message: options.errorMessage ?? `Request failed (${status})` },
      { status }
    );
  }

  function accept(path: string): Response {
    if (options.createStatus) return error(options.createStatus);
    if (options.createResponse) return options.createResponse();
    const n = projects.size + 1;
    const kind = kinds[path];
    const id = `${kind}-${n}`;
    const url = `${STORAGE}/outputs/${id}?X-Goog-Signature=SIGNED_${n}`;
    projects.set(id, { kind, url, polls: 0 });
    return Response.json({ id, credits_charged: 1 });
  }

  function respond(call: Call): Response {
    const { method } = call;
    const { origin, pathname } = new URL(call.url);
    if (origin === STORAGE) {
      if (method === "PUT") {
        const upload = uploads.find((u) => u.url === call.url && !u.bytes);
        if (!upload) return error(403);
        if (options.uploadStatus) return error(options.uploadStatus);
        upload.bytes = call.body;
        return new Response(null);
      }
      const project = [...projects.values()].find((p) => p.url === call.url);
      if (method !== "GET" || !project) return error(404);
      if (options.downloadStatus) return error(options.downloadStatus);
      if (options.emptyDownload) return new Response(new Uint8Array(0));
      if (options.partialDownload)
        return new Response(output.subarray(0, 4), {
          status: 206,
          headers: { "Content-Range": `bytes 0-3/${output.length}` },
        });
      return new Response(output);
    }
    if (origin !== API) return error(404);
    const json = call.headers.get("Content-Type") === "application/json";

    if (method === "POST" && pathname === "/v1/files/upload-urls") {
      if (!json) return error(415);
      const n = uploads.length + 1;
      const upload = {
        url: `${STORAGE}/uploads/input-${n}.png?X-Goog-Signature=SIGNED_UP_${n}`,
        filePath: `api-assets/test/input-${n}.png`,
      };
      uploads.push(upload);
      return Response.json(
        options.uploadUrlsBody ?? {
          items: [{ upload_url: upload.url, file_path: upload.filePath, expires_at: "2099-01-01" }],
        }
      );
    }

    if (method === "POST" && pathname in kinds) {
      if (!json) return error(415);
      if (options.createNetworkError) {
        accept(pathname);
        throw Object.assign(new TypeError("fetch failed"), { cause: new Error("read ECONNRESET") });
      }
      return accept(pathname);
    }

    const match = /^\/v1\/(image|video)-projects\/([^/]+)$/.exec(pathname);
    if (method === "GET" && match) {
      if (options.projectStatus) return error(options.projectStatus);
      const id = decodeURIComponent(match[2]);
      const project = projects.get(id);
      if (!project || project.kind !== match[1]) return error(404);
      const statuses = options.statuses ?? ["queued", "rendering", "complete"];
      const status = statuses[Math.min(project.polls++, statuses.length - 1)];
      const downloads =
        status === "complete"
          ? (options.downloads?.(project.url) ?? [{ url: project.url, expires_at: "2099-01-01" }])
          : [];
      return Response.json({ id, status, downloads, credits_charged: 1 });
    }
    return error(404);
  }

  async function handle(call: Call, signal: AbortSignal): Promise<Response> {
    calls.push(call);
    if (options.hold?.(call)) return untilAborted(signal);
    if (options.stallBody?.(call)) {
      const response = respond(call);
      return new Response(stalledBody(signal), response);
    }
    if (options.breakBody?.(call)) {
      const bytes = new Uint8Array(await respond(call).arrayBuffer());
      return new Response(brokenBody(bytes.subarray(0, 4)));
    }
    if (options.redirect?.(call)) {
      // What the real fetch does with a 307 in each redirect mode.
      if (call.redirect === "error") throw new TypeError("fetch failed: unexpected redirect");
      if (call.redirect === "manual")
        return new Response(null, { status: 307, headers: { Location: call.url } });
      // "follow" sends the request again, body included.
      calls.push(call);
    }
    return respond(call);
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const signal = init?.signal ?? request.signal;
    if (signal.aborted) throw abortError(signal);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const json = request.headers.get("Content-Type") === "application/json";
    return handle(
      {
        url: request.url,
        method: request.method,
        headers: request.headers,
        redirect: request.redirect,
        credentials: init?.credentials ?? request.credentials,
        body: bytes.length
          ? json
            ? JSON.parse(new TextDecoder().decode(bytes))
            : bytes
          : undefined,
      },
      signal
    );
  };

  return {
    calls,
    fetch,
    uploads,
    creates: () => calls.filter(isCreate),
    polls: () => calls.filter(isPoll),
    storage: () => calls.filter((c) => new URL(c.url).origin === STORAGE),
    /** A client on this fake. Polls without waiting unless the settings say otherwise. */
    client(settings: Partial<ClientSettings> = {}) {
      return new MagicHourClient({ apiKey: API_KEY, fetch, pollIntervalMs: 0, ...settings });
    },
  };
}

export type Api = ReturnType<typeof fakeApi>;
