// A paid create request is sent exactly once. When it fails and the API did not clearly reject
// it, the error says acceptance is unknown so the caller checks before paying again.
import { describe, expect, test } from "vitest";
import { MagicHourError } from "../src/index.js";
import { fakeApi, type FakeApiOptions, isCreate } from "./setup/fake-api.js";
import { expectAcceptanceUnknown, generate, rejection, underFakeTime } from "./setup/helpers.js";

describe("create", () => {
  test("a 4xx is a rejection that keeps its status", async () => {
    const api = fakeApi({ createStatus: 429 });
    const error = await rejection(generate(api));
    expect(api.creates()).toHaveLength(1);
    expect(error).toBeInstanceOf(MagicHourError);
    expect((error as MagicHourError).status).toBe(429);
    expect((error as MagicHourError).projectId).toBeUndefined();
    expect((error as Error).message).not.toMatch(/Acceptance is unknown/);
  });

  test.each([408, 500])("HTTP %i leaves acceptance unknown", async (status) => {
    const api = fakeApi({ createStatus: status });
    const error = await rejection(generate(api));
    expect(api.creates()).toHaveLength(1);
    expectAcceptanceUnknown(error);
  });

  test.each<[string, FakeApiOptions]>([
    ["a dropped connection", { createNetworkError: true }],
    ["a body that breaks partway", { breakBody: isCreate }],
  ])("%s leaves acceptance unknown", async (_, options) => {
    const api = fakeApi(options);
    const error = await rejection(generate(api));
    expect(api.creates()).toHaveLength(1);
    expectAcceptanceUnknown(error);
  });

  test("a body that stalls leaves acceptance unknown at timeoutMs", async () => {
    const api = fakeApi({ stallBody: isCreate });
    const { error, elapsed } = await underFakeTime(() =>
      generate(api, api.client({ timeoutMs: 1000 }))
    );
    expect(api.creates()).toHaveLength(1);
    expectAcceptanceUnknown(error);
    expect(elapsed).toBeLessThan(1200);
  });

  // Following a redirect would send the paid request again.
  test("a redirect is not followed and leaves acceptance unknown", async () => {
    const api = fakeApi({ redirect: isCreate });
    const error = await rejection(generate(api));
    expect(api.creates()).toHaveLength(1);
    expect(api.creates()[0].redirect).toBe("error");
    expectAcceptanceUnknown(error);
  });

  test.each([
    ["no project ID", {}],
    ["a blank project ID", { id: "  " }],
  ])("a response with %s fails without saving or polling", async (_, body) => {
    const api = fakeApi({ createResponse: () => Response.json(body) });
    const saved: unknown[] = [];
    const error = await rejection(
      generate(api, api.client({ onProjectCreated: (project) => void saved.push(project) }))
    );
    expect(error).toBeInstanceOf(MagicHourError);
    expect((error as MagicHourError).projectId).toBeUndefined();
    expect((error as Error).message).toMatch(/check account history/i);
    expect(saved).toEqual([]);
    expect(api.polls()).toHaveLength(0);
  });
});
