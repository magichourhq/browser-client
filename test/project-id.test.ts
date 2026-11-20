// Once the API accepts a job it's paid for, so every later failure must name the project. The
// caller can then resume it instead of paying again.
import { describe, expect, test } from "vitest";
import { fakeApi, type FakeApiOptions, isPoll } from "./setup/fake-api.js";
import {
  expectNoSecret,
  expectProjectId,
  failingFetch,
  generate,
  latch,
  rejection,
  underFakeTime,
} from "./setup/helpers.js";

const body = { image_count: 1, style: { prompt: "Mug" } };

describe("wait", () => {
  test.each([
    ["error", /Generation error/],
    ["canceled", /Generation canceled/],
    ["exploded", /Unknown project status/],
  ])("a project with status %s", async (status, message) => {
    const api = fakeApi({ statuses: ["rendering", status] });
    const error = await rejection(generate(api));
    expectProjectId(error, "image-1");
    expect((error as Error).message).toMatch(message);
  });

  test.each<[string, FakeApiOptions]>([
    ["a failed poll", { projectStatus: 500 }],
    ["a complete project without downloads", { statuses: ["complete"], downloads: () => [] }],
  ])("%s", async (_, options) => {
    const api = fakeApi(options);
    expectProjectId(await rejection(generate(api)), "image-1");
  });

  test("a network error on a poll", async () => {
    const api = fakeApi();
    const fetch = failingFetch(api, isPoll, () => new TypeError("read ECONNRESET"));
    expectProjectId(await rejection(generate(api, api.client({ fetch }))), "image-1");
  });

  test("a download URL that isn't HTTPS, without echoing it", async () => {
    const api = fakeApi({
      statuses: ["complete"],
      downloads: (url) => [{ url: url.replace("https:", "http:"), expires_at: "2099-01-01" }],
    });
    const error = await rejection(generate(api));
    expectProjectId(error, "image-1");
    expectNoSecret(error, "SIGNED_1");
  });
});

describe("onProjectCreated", () => {
  test("is awaited before create returns, with the project kind", async () => {
    const api = fakeApi();
    const called = latch();
    const save = latch();
    const seen: unknown[] = [];
    let created = false;
    const client = api.client({
      onProjectCreated: (project) => {
        seen.push(project);
        called.release();
        return save.promise;
      },
    });
    const run = client.create("text-to-video", { end_seconds: 5, style: { prompt: "Waves" } });
    run.then(() => (created = true));
    await called.promise;
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
    expect(seen).toEqual([{ id: "video-1", kind: "video" }]);
    expect(created).toBe(false);
    save.release();
    expect(await run).toBe("video-1");
  });

  test.each([
    [
      "throws",
      () => {
        throw new Error("database down");
      },
    ],
    ["rejects", () => Promise.reject(new Error("database down"))],
  ])("a callback that %s names the project", async (_, onProjectCreated) => {
    const api = fakeApi();
    const error = await rejection(
      api.client({ onProjectCreated }).create("ai-image-generator", body)
    );
    expectProjectId(error, "image-1");
  });

  test("a callback that never settles names the project at timeoutMs", async () => {
    const api = fakeApi();
    const client = api.client({ timeoutMs: 1000, onProjectCreated: () => new Promise(() => {}) });
    const { error, elapsed } = await underFakeTime(() => client.create("ai-image-generator", body));
    expectProjectId(error, "image-1");
    expect(elapsed).toBeLessThan(1200);
  });
});

test("a formatMessage that throws still names the project", async () => {
  const api = fakeApi({ statuses: ["error"] });
  const client = api.client({
    formatMessage: () => {
      throw new Error("translation missing");
    },
  });
  expectProjectId(await rejection(generate(api, client)), "image-1");
});
