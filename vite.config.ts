import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./", // relative paths so the build works on GitHub Pages or any static host
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
