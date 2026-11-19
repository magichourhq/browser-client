const MAX_TIMER_MS = 2_147_483_647;

export type TimeoutSignal = {
  signal: AbortSignal;
  clear: () => void;
};

const timeoutError = () => new DOMException("The operation timed out.", "TimeoutError");

export const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The operation was aborted.", "AbortError");

/** Replaces `AbortSignal.timeout` and `AbortSignal.any`, which older browsers lack. */
export function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal): TimeoutSignal {
  const controller = new AbortController();
  const abortFromParent = () => {
    clear();
    // Caller abort reasons can hold sensitive values, so only the timeout type is kept.
    controller.abort(parent?.reason?.name === "TimeoutError" ? timeoutError() : undefined);
  };
  const timer = setTimeout(
    () => {
      clear();
      controller.abort(timeoutError());
    },
    Math.min(timeoutMs, MAX_TIMER_MS)
  );
  function clear() {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abortFromParent);
  }
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  return { signal: controller.signal, clear };
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).then(() => signal.removeEventListener("abort", abort));
  });
}
