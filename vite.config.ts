import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { serviceWorkerSource } from "./src/pwa/sw-source";

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** After the build, writes dist/sw.js pre-caching every built file; the version is a hash of their contents. */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "nearpoint-service-worker",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((p) => relative(outDir, p).split(sep).join("/"))
        .filter((f) => f !== "sw.js")
        .sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest("hex").slice(0, 12);
      writeFileSync(join(outDir, "sw.js"), serviceWorkerSource(files, version));
    },
  };
}

export default defineConfig({
  base: "./", // relative paths so the build works on GitHub Pages or any static host
  plugins: [serviceWorker()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        debug: fileURLToPath(new URL("./debug.html", import.meta.url)),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
