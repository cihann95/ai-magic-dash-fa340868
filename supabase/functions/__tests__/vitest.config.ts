import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "supabase/functions/__tests__/**/*.test.ts",
      "supabase/functions/blitz-*/__tests__/**/*.test.ts",
    ],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
});
