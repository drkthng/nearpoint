import { describe, expect, it } from "vitest";
import { requestPersistence } from "./persist";

describe("requestPersistence", () => {
  it("unsupported when missing", async () => {
    expect(await requestPersistence(undefined)).toBe("unsupported");
    expect(await requestPersistence({})).toBe("unsupported");
    expect(await requestPersistence({ storage: {} })).toBe("unsupported");
  });
  it("persisted when already persisted", async () => {
    const nav = { storage: { persisted: async () => true, persist: async () => false } };
    expect(await requestPersistence(nav)).toBe("persisted");
  });
  it("granted and denied", async () => {
    expect(await requestPersistence({ storage: { persisted: async () => false, persist: async () => true } })).toBe("granted");
    expect(await requestPersistence({ storage: { persist: async () => false } })).toBe("denied");
  });
  it("denied when persist throws", async () => {
    const nav = { storage: { persisted: async () => false, persist: async () => { throw new Error("x"); } } };
    expect(await requestPersistence(nav)).toBe("denied");
  });
});
