const MAX_TIMER_MS = 2_147_483_647;

export type TimeoutSignal = {
  signal: AbortSignal;
  clear: () => void;
};

export function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/** Replaces `AbortSignal.timeout` and `AbortSignal.any`, which older browsers lack. */
/**
 * `keepAlive: false` lets a Node process exit while the deadline is pending. Only use it for
 * signals the caller manages; an internal deadline must stay referenced so it can fire and
 * deliver its error (for example, a project ID while a save callback hangs).
 */
export function createTimeoutSignal(
  timeoutMs: number,
  parent?: AbortSignal,
  { keepAlive = true }: { keepAlive?: boolean } = {}
): TimeoutSignal {
  const controller = new AbortController();
  function abortFromParent() {
    clear();
    // Caller abort reasons can hold sensitive values, so they are not forwarded.
    controller.abort();
  }
  function abortFromTimeout() {
    clear();
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
  }
  function clear() {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abortFromParent);
  }
  const timer = setTimeout(abortFromTimeout, Math.min(timeoutMs, MAX_TIMER_MS));
  if (!keepAlive) (timer as { unref?: () => void }).unref?.();
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  return { signal: controller.signal, clear };
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    function abort() {
      reject(abortError(signal));
    }
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).then(() => signal.removeEventListener("abort", abort));
  });
}

/** Waits `ms`, or rejects as soon as `signal` aborts. Clears its timer either way. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    function abort() {
      clearTimeout(timer);
      reject(abortError(signal));
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
