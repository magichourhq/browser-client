import { inspect } from "node:util";
import { expect, vi } from "vitest";
import { MagicHourError } from "../../src/index.js";
import type { Api, Call } from "./fake-api.js";

/** The error a call rejects with. Fails the test if the call succeeds. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to reject");
}

/** Creates an image project and waits for it, like a caller would. */
export async function generate(api: Api, client = api.client()) {
  const id = await client.create("ai-image-generator", {
    image_count: 1,
    style: { prompt: "Mug" },
  });
  return client.wait(id, "image");
}

/** Asserts the error names the accepted project, so the caller can resume instead of paying again. */
export function expectProjectId(error: unknown, projectId: string) {
  expect(error).toBeInstanceOf(MagicHourError);
  expect((error as MagicHourError).projectId).toBe(projectId);
  expect((error as Error).message).toContain(projectId);
}

/** Asserts a submission whose outcome is unknown: no project ID, and a warning not to resubmit. */
export function expectAcceptanceUnknown(error: unknown) {
  expect(error).toBeInstanceOf(MagicHourError);
  expect((error as MagicHourError).projectId).toBeUndefined();
  expect((error as Error).message).toMatch(/Acceptance is unknown/);
}

/** Asserts the secret appears nowhere a caller or a log could see it, causes included. */
export function expectNoSecret(error: unknown, secret: string) {
  expect(inspect(error, { depth: 10 })).not.toContain(secret);
  for (
    let e: unknown = error, depth = 0;
    e && depth < 10;
    e = (e as { cause?: unknown }).cause, depth++
  ) {
    expect(String((e as Error).message ?? e)).not.toContain(secret);
    expect(String((e as Error).stack ?? "")).not.toContain(secret);
  }
}

/** Runs a call to completion under fake timers and reports the virtual time it took. */
export async function underFakeTime(start: () => Promise<unknown>, step = 5) {
  vi.useFakeTimers();
  const began = Date.now();
  let settled = false;
  const outcome = start().then(
    (value): { value?: unknown; error?: unknown } => ({ value }),
    (error: unknown) => ({ error })
  );
  outcome.finally(() => (settled = true));
  for (let i = 0; i < 200_000 && !settled; i++) await vi.advanceTimersByTimeAsync(step);
  expect(settled).toBe(true);
  return { ...(await outcome), elapsed: Date.now() - began };
}

/** A fetch that throws `error` for matching requests and sends the rest to the fake. */
export function failingFetch(
  api: Api,
  match: (call: Call) => boolean,
  error: (request: Request) => Error
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (match({ url: request.url, method: request.method } as Call)) throw error(request);
    return api.fetch(input, init);
  };
}

/** A promise and the function that resolves it. */
export function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}
