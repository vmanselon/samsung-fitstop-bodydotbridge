import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  enabled: boolean;
  timeoutMs: number;
  warningMs: number;
  onTimeout: () => void;
}

export function useInactivityTimeout({ enabled, timeoutMs, warningMs, onTimeout }: Options) {
  const [remainingMs, setRemainingMs] = useState(timeoutMs);
  const deadline = useRef(Date.now() + timeoutMs);
  const timedOut = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const reset = useCallback(() => {
    timedOut.current = false;
    deadline.current = Date.now() + timeoutMs;
    setRemainingMs(timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      setRemainingMs(timeoutMs);
      return;
    }

    reset();
    const update = () => {
      const remaining = Math.max(0, deadline.current - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && !timedOut.current) {
        timedOut.current = true;
        onTimeoutRef.current();
      }
    };
    const interval = window.setInterval(update, 250);
    const events: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "keydown"];
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));

    return () => {
      window.clearInterval(interval);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [enabled, reset, timeoutMs]);

  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    showWarning: enabled && remainingMs <= warningMs,
  };
}
