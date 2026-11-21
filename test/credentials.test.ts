// Where the API key and custom headers go, and what errors may reveal.
import { describe, expect, test } from "vitest";
import { MagicHourClient } from "../src/index.js";
import { API, API_KEY, fakeApi, isCreate, isDownload } from "./setup/fake-api.js";
import { expectNoSecret, failingFetch, generate, rejection } from "./setup/helpers.js";

const png = new Uint8Array([137, 80, 78, 71]);

describe("where the API key and headers go", () => {
  test("API requests get the key and custom headers; storage gets neither, nor cookies", async () => {
    const api = fakeApi({ statuses: ["complete"] });
    const client = api.client();
    const headers = { "X-Trace-Id": "trace-1" };
    const filePath = await client.uploadImage(png, "png");
    const id = await client.create(
      "image-to-video",
      { end_seconds: 5, assets: { image_file_path: filePath } },
      undefined,
      headers
    );
    const project = await client.wait(id, "video", undefined, headers);
    expect(await client.download(project.downloads[0].url)).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    );
    expect(api.uploads[0].bytes).toEqual(png);

    const apiCalls = api.calls.filter((c) => new URL(c.url).origin === API);
    for (const call of apiCalls)
      expect(call.headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
    for (const call of [...api.creates(), ...api.polls()])
      expect(call.headers.get("X-Trace-Id")).toBe("trace-1");
    // The upload and the download.
    expect(api.storage()).toHaveLength(2);
    for (const call of api.storage()) {
      expect(call.credentials).toBe("omit");
      expect([...call.headers.keys()]).not.toContain("authorization");
      expect([...call.headers.keys()]).not.toContain("x-trace-id");
      expect(call.url).not.toContain(API_KEY);
    }
  });
});

describe("errors never reveal secrets", () => {
  test("an HTTP error passes on the API's code and message", async () => {
    const api = fakeApi({ createStatus: 400, errorMessage: "Unsupported model." });
    const error = await rejection(generate(api));
    expect(error).toMatchObject({
      status: 400,
      code: "http_400",
      message: "Unsupported model.",
    });
  });

  test("an HTTP error body that isn't the documented JSON is dropped", async () => {
    const api = fakeApi();
    const fetch = async () => new Response("BODY_SECRET", { status: 500 });
    const error = await rejection(api.client({ fetch }).uploadImage(png, "png"));
    expect(error).toMatchObject({ message: "Magic Hour API returned HTTP 500.", code: undefined });
    expectNoSecret(error, "BODY_SECRET");
  });

  // V8's JSON parse error quotes the first 10 characters of the text.
  test("an invalid JSON response doesn't echo the body", async () => {
    const api = fakeApi();
    const fetch: typeof globalThis.fetch = async () =>
      new Response('SECRET {"items": [', { headers: { "Content-Type": "application/json" } });
    expectNoSecret(await rejection(api.client({ fetch }).uploadImage(png, "png")), "SECRET");
  });

  // Node's fetch errors can include the URL, and a custom fetch can include anything.
  test.each([
    ["an API request", isCreate],
    ["a download", isDownload],
  ])("a fetch error on %s doesn't echo its message", async (_, match) => {
    const api = fakeApi({ statuses: ["complete"] });
    const fetch = failingFetch(
      api,
      match,
      (request) => new TypeError(`connect failed for ${request.url} with ${API_KEY}`)
    );
    const client = api.client({ fetch });
    const error = await rejection(
      generate(api, client).then((project) => client.download(project.downloads[0].url))
    );
    expect(error).toBeInstanceOf(Error);
    expectNoSecret(error, API_KEY);
    expectNoSecret(error, "SIGNED_");
  });

  // The runtime's error for a bad header value repeats the value.
  test("an API key that isn't a valid header value doesn't appear", async () => {
    const api = fakeApi();
    const error = await rejection(generate(api, api.client({ apiKey: "bad\nKEY_SECRET_9" })));
    expectNoSecret(error, "KEY_SECRET_9");
    expect(api.calls).toHaveLength(0);
  });
});

test("a missing API key throws in the constructor", () => {
  expect(() => new MagicHourClient({ apiKey: " " })).toThrow(/API key is required/);
});
