export type Route = "start" | "calibrate" | "train" | "history" | "data";
const ROUTES: readonly Route[] = ["start", "calibrate", "train", "history", "data"];

function split(hash: string): [string, string] {
  const h = hash.replace(/^#\/?/, "");
  const i = h.indexOf("?");
  return i < 0 ? [h, ""] : [h.slice(0, i), h.slice(i + 1)];
}

/** Hash → route; unknown or empty → "start". Accepts "#x" and "#/x"; ignores "?query". */
export function parseRoute(hash: string): Route {
  const [name] = split(hash);
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "start";
}

/** The part after "?" in the hash, e.g. "#train?quick=1". */
export function routeQuery(hash: string): URLSearchParams {
  return new URLSearchParams(split(hash)[1]);
}

export function backupFileName(isoDate: string): string {
  return `nearpoint-backup-${isoDate.slice(0, 10)}.json`;
}

/** Whole days (floor) from one ISO timestamp to another. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}
