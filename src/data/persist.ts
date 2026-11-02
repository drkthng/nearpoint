type StorageLike = { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };

/** Ask the browser not to evict site data. Touches no globals at import time. */
export async function requestPersistence(
  nav: { storage?: StorageLike } | undefined = globalThis.navigator,
): Promise<"persisted" | "granted" | "denied" | "unsupported"> {
  const storage = nav?.storage;
  if (!storage || typeof storage.persist !== "function") return "unsupported";
  try {
    if (typeof storage.persisted === "function" && (await storage.persisted())) return "persisted";
    return (await storage.persist()) ? "granted" : "denied";
  } catch {
    return "denied";
  }
}
