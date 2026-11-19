const MAX_TIMER_MS = 2_147_483_647;

export type TimeoutSignal = {
  signal: AbortSignal;
  clear: () => void;
};

/** Replaces `AbortSignal.timeout` and `AbortSignal.any`, which older browsers lack. */
export function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal): TimeoutSignal {
  const controller = new AbortController();
  const abortFromParent = () => {
    clear();
    controller.abort(parent?.reason);
  };
  const timer = setTimeout(
    () => {
      clear();
      controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
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
