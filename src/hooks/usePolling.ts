import { useEffect, useRef, useState } from "react";

/**
 * Polls `fn` every `intervalMs` until it returns true (done) or `timeoutMs`
 * elapses. Used for per-file resume intake progress until a decision appears.
 */
export function usePolling<T>(
  fn: () => Promise<T | null>,
  isDone: (result: T) => boolean,
  intervalMs = 5000,
  timeoutMs = 120_000,
  enabled = true
): { data: T | null; loading: boolean; error: string | null; reset: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    const run = async () => {
      try {
        const result = await fnRef.current();
        if (cancelled) return;
        if (result != null && isDone(result)) {
          setData(result);
          setLoading(false);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          setError("Timed out waiting for the result.");
          setLoading(false);
          return;
        }
        timer = setTimeout(run, intervalMs);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Polling failed.");
        setLoading(false);
      }
    };

    setLoading(true);
    setError(null);
    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs, timeoutMs, isDone, tick]);

  const reset = () => {
    setData(null);
    setLoading(true);
    setError(null);
    setTick((t) => t + 1);
  };

  return { data, loading, error, reset };
}