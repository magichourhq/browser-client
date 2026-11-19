const MAX_TIMER_MS = 2_147_483_647;

export type TimeoutSignal = {
  signal: AbortSignal;
  clear: () => void;
};

export function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/** Replaces `AbortSignal.timeout` and `AbortSignal.any`, which older browsers lack. */
export function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal): TimeoutSignal {
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
  // Like AbortSignal.timeout, the deadline alone must not keep a Node process running.
  (timer as { unref?: () => void }).unref?.();
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
