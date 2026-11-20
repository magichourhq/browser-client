// Polling, aborts and deadlines.
import { execFileSync } from "node:child_process";
import { describe, expect, test, vi } from "vitest";
import { fakeApi, isPoll } from "./setup/fake-api.js";
import { expectProjectId, generate, rejection, underFakeTime } from "./setup/helpers.js";

function runScript(name: string): string {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", new URL(`./setup/${name}`, import.meta.url).pathname],
    { encoding: "utf8", timeout: 20_000 }
  ).trim();
}

describe("settings", () => {
  test("invalid timing settings throw in the constructor", () => {
    const api = fakeApi();
    expect(() => api.client({ pollIntervalMs: -1 })).toThrow(/poll interval/);
    expect(() => api.client({ pollIntervalMs: Infinity })).toThrow(/poll interval/);
    expect(() => api.client({ timeoutMs: 0 })).toThrow(/timeout/);
    expect(() => api.client({ timeoutMs: NaN })).toThrow(/timeout/);
  });

  test("polls every 2 seconds by default", async () => {
    const api = fakeApi({ statuses: ["rendering", "rendering", "complete"] });
    vi.useFakeTimers();
    const run = generate(api, api.client({ pollIntervalMs: undefined }));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.polls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(api.polls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.polls()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    await run;
  });

  test("times out after 10 minutes by default, naming the project", async () => {
    const api = fakeApi({ statuses: ["rendering"] });
    const { error, elapsed } = await underFakeTime(
      () => generate(api, api.client({ pollIntervalMs: 30_000 })),
      500
    );
    expectProjectId(error, "image-1");
    expect(elapsed).toBeGreaterThanOrEqual(600_000);
    expect(elapsed).toBeLessThan(601_000);
  });
});

describe("aborts and deadlines", () => {
  test("aborting between polls settles at once and leaves no timer", async () => {
    const api = fakeApi({ statuses: ["rendering"] });
    const controller = new AbortController();
    const client = api.client({ pollIntervalMs: 60_000 });
    const { error, elapsed } = await underFakeTime(async () => {
      const id = await client.create("ai-image-generator", {
        image_count: 1,
        style: { prompt: "Mug" },
      });
      setTimeout(() => controller.abort(), 100);
      return client.wait(id, "image", controller.signal);
    });
    expectProjectId(error, "image-1");
    expect(elapsed).toBeLessThan(1000);
    expect(api.polls()).toHaveLength(1);
    // A leftover timer would keep a Node process running.
    expect(vi.getTimerCount()).toBe(0);
  });

  test("aborting during a poll settles at once, naming the project", async () => {
    const api = fakeApi({ hold: isPoll });
    const controller = new AbortController();
    const client = api.client();
    const id = await client.create("ai-image-generator", {
      image_count: 1,
      style: { prompt: "Mug" },
    });
    const waiting = client.wait(id, "image", controller.signal);
    while (!api.polls().length) await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    expectProjectId(await rejection(waiting), "image-1");
  });

  // Fake timers can't show these: a real Node process exits once nothing keeps it alive.
  test("in Node, a callback that never settles still delivers the project ID", () => {
    expect(runScript("hanging-callback.ts")).toBe("projectId=image-1");
  }, 30_000);

  test("in Node, client.signal() and finished calls don't keep the process alive", () => {
    expect(runScript("clean-exit.ts")).toBe("done");
  }, 30_000);
});
