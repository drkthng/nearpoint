/**
 * "Close app". Browsers only let a script close some windows (an installed app on Android may refuse),
 * so if the page is still visible two frames later, show how to close it instead. Data is already saved.
 */
export const CLOSE_HINT =
  "This phone does not let nearpoint close itself. Swipe up from the bottom edge (or press Home), then swipe nearpoint away in Recent apps. Everything is already saved.";

export function closeApp(showHint: (text: string) => void): void {
  try {
    window.close();
  } catch {
    /* not allowed */
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (document.visibilityState === "visible") showHint(CLOSE_HINT);
    }),
  );
}
