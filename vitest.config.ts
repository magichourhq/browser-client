import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup/no-network.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      reporter: ["text"],
      // Set to what the suite reaches. The rest is defensive code and the message catalog.
      thresholds: { statements: 89, branches: 87, functions: 92, lines: 94 },
    },
  },
});
