import { useCallback, useEffect, useRef } from "react";

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function useAutosaveQueue({ enabled = true, debounceMs = 380, onSave }) {
  const onSaveRef = useRef(onSave);
  const timerRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingPayloadRef = useRef(null);
  const pendingVersionRef = useRef(0);
  const savedVersionRef = useRef(0);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const hasPending = useCallback(() => {
    if (!enabled) return false;
    return !!timerRef.current || inFlightRef.current || pendingVersionRef.current !== savedVersionRef.current;
  }, [enabled]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
    pendingPayloadRef.current = null;
    pendingVersionRef.current = savedVersionRef.current;
  }, []);

  const runOne = useCallback(async () => {
    if (!enabled) return true;
    if (inFlightRef.current) return true;
    const version = pendingVersionRef.current;
    if (version === savedVersionRef.current) return true;
    const payload = pendingPayloadRef.current;

    inFlightRef.current = true;
    let ok = true;
    try {
      const result = await Promise.resolve(
        onSaveRef.current?.(payload, {
          version,
          isStale: () => pendingVersionRef.current !== version,
        }),
      );
      ok = result !== false;
    } catch {
      ok = false;
    } finally {
      inFlightRef.current = false;
    }

    if (ok) {
      savedVersionRef.current = version;
    }
    return ok;
  }, [enabled]);

  const schedule = useCallback(
    (payload) => {
      if (!enabled) return;
      pendingPayloadRef.current = payload;
      pendingVersionRef.current += 1;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(async () => {
        timerRef.current = 0;
        const ok = await runOne();
        if (!ok) return;
        if (pendingVersionRef.current !== savedVersionRef.current && !timerRef.current && !inFlightRef.current) {
          timerRef.current = window.setTimeout(async () => {
            timerRef.current = 0;
            await runOne();
          }, debounceMs);
        }
      }, debounceMs);
    },
    [debounceMs, enabled, runOne],
  );

  const flush = useCallback(async () => {
    if (!enabled) return true;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
    while (inFlightRef.current) {
      await sleep(24);
    }
    return runOne();
  }, [enabled, runOne]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && hasPending()) {
        void flush();
      }
    };
    const onBeforeUnload = () => {
      if (hasPending()) {
        void flush();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, flush, hasPending]);

  useEffect(() => () => cancel(), [cancel]);

  return {
    schedule,
    flush,
    cancel,
    hasPending,
  };
}
