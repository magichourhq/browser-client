const MAX_TIMER_MS = 2_147_483_647;

export type TimeoutSignal = {
  signal: AbortSignal;
  clear: () => void;
};

function timeoutError(): DOMException {
  return new DOMException("The operation timed out.", "TimeoutError");
}

export function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function isTimeoutReason(reason: unknown): boolean {
  try {
    return (reason as { name?: unknown } | null | undefined)?.name === "TimeoutError";
  } catch {
    return false;
  }
}

/** Replaces `AbortSignal.timeout` and `AbortSignal.any`, which older browsers lack. */
export function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal): TimeoutSignal {
  const controller = new AbortController();
  function abortFromParent() {
    clear();
    // Caller abort reasons can hold sensitive values, so only the timeout type is kept.
    controller.abort(isTimeoutReason(parent?.reason) ? timeoutError() : undefined);
  }
  function abortFromTimeout() {
    clear();
    controller.abort(timeoutError());
  }
  function clear() {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abortFromParent);
  }
  const timer = setTimeout(abortFromTimeout, Math.min(timeoutMs, MAX_TIMER_MS));
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
