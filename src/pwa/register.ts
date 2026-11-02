/**
 * Service-worker registration (production builds only). An update is installed in the background
 * and only activated when the user taps "Reload" outside a running session, so code never changes
 * under a training session or test.
 */
export function registerServiceWorker(onUpdate: (activate: () => void) => void): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // First install: the page is already the current version; do not reload.
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  const register = (): void => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => {
        const offer = (w: ServiceWorker | null): void => {
          if (w && navigator.serviceWorker.controller) onUpdate(() => w.postMessage("skip-waiting"));
        };
        offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed") offer(w);
          });
        });
      })
      .catch(() => undefined);
  };
  // Register after load so the first visit's downloads are not slowed; boot may run after load already.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
