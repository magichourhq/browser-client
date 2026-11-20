// Downloads never return a failed, empty or partial file as a success. Uploads stop before the
// PUT when the upload details are unusable, and a failed PUT is an error.
import { describe, expect, test } from "vitest";
import { fakeApi, type FakeApiOptions, STORAGE } from "./setup/fake-api.js";
import { generate, rejection } from "./setup/helpers.js";

const png = new Uint8Array([137, 80, 78, 71]);

describe("download", () => {
  test.each<[string, FakeApiOptions]>([
    ["a failed download", { downloadStatus: 403 }],
    ["an empty download", { emptyDownload: true }],
    ["an unrequested partial download (206)", { partialDownload: true }],
  ])("%s fails", async (_, options) => {
    const api = fakeApi({ statuses: ["complete"], ...options });
    const project = await generate(api);
    await rejection(api.client().download(project.downloads[0].url));
  });
});

describe("uploadImage", () => {
  const signed = `${STORAGE}/uploads/input-1.png?X-Goog-Signature=sig`;
  function response(item: Record<string, unknown>) {
    return { items: [{ upload_url: signed, file_path: "api-assets/x.png", ...item }] };
  }

  // The file path goes into a paid request, so it must be usable before anything is uploaded.
  test.each([
    ["no file path", response({ file_path: undefined })],
    ["a blank file path", response({ file_path: "  " })],
    ["a plain-HTTP upload URL", response({ upload_url: signed.replace("https:", "http:") })],
  ])("an upload-URL response with %s fails before uploading", async (_, uploadUrlsBody) => {
    const api = fakeApi({ uploadUrlsBody });
    await rejection(api.client().uploadImage(png, "png"));
    expect(api.calls).toHaveLength(1);
  });

  test("a failed upload fails", async () => {
    const api = fakeApi({ uploadStatus: 403 });
    await expect(api.client().uploadImage(png, "png")).rejects.toThrow(/HTTP 403/);
  });
});
