import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Unit tests only — e2e specs (Playwright) live under e2e/ and must not
    // be collected by vitest.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
