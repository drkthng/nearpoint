import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CACHE_PREFIX, serviceWorkerSource } from "./sw-source";

describe("serviceWorkerSource", () => {
  const src = serviceWorkerSource(["index.html", "./assets/main-abc.js", "/assets/main-abc.js", "sw.js", "manifest.webmanifest"], "v1-abc");

  it("pre-caches every built file once, never itself", () => {
    const files = JSON.parse(src.match(/const FILES = (\[.*\]);/)![1]) as string[];
    expect(files).toEqual(["assets/main-abc.js", "index.html", "manifest.webmanifest"]);
  });

  it("versions the cache and deletes older ones; no skipWaiting on install", () => {
    expect(src).toContain(`const CACHE = "${CACHE_PREFIX}v1-abc"`);
    expect(src).toContain("caches.delete");
    const install = src.slice(src.indexOf('"install"'), src.indexOf('"activate"'));
    expect(install).not.toContain("skipWaiting");
  });

  it("only handles same-origin GET requests (no network calls elsewhere)", () => {
    expect(src).toContain('req.method !== "GET"');
    expect(src).toContain("url.origin !== self.location.origin");
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("is syntactically valid JavaScript", () => {
    expect(() => new Function(src)).not.toThrow();
  });

  it("rejects bad input", () => {
    expect(() => serviceWorkerSource(["a.js"], "v1")).toThrow();
    expect(() => serviceWorkerSource(["index.html"], "v 1")).toThrow();
  });
});

describe("web app manifest", () => {
  const m = JSON.parse(readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
  it("meets Chrome's install criteria", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("./");
    expect(["fullscreen", "standalone", "minimal-ui"]).toContain(m.display);
    const sizes = (m.icons as { sizes: string; type: string }[]).filter((i) => i.type === "image/png").map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.orientation).toBe("landscape");
  });
  it("icons exist", () => {
    for (const i of m.icons as { src: string }[]) {
      expect(() => readFileSync(new URL(`../../public/${i.src}`, import.meta.url))).not.toThrow();
    }
  });
});
