/**
 * Screen Wake Lock for the duration of a session or test. The browser releases the lock whenever the
 * page is hidden, so it is requested again when the page becomes visible. Optional: every failure is ignored.
 * Returns a function that releases the lock and stops re-requesting.
 */
export function keepScreenOn(): () => void {
  let lock: { release(): Promise<void> } | null = null;
  let active = true;
  const request = (): void => {
    try {
      void navigator.wakeLock
        ?.request("screen")
        .then((s) => {
          if (active) lock = s;
          else void s.release().catch(() => undefined);
        })
        .catch(() => undefined);
    } catch {
      /* not supported */
    }
  };
  const onVisible = (): void => {
    if (document.visibilityState === "visible") request();
  };
  request();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", onVisible);
    try {
      void lock?.release().catch(() => undefined);
    } catch {
      /* ignored */
    }
    lock = null;
  };
}
