import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // mode "test" → .env.test.local (local Supabase) overrides .env.local (hosted project)
    env: loadEnv("test", process.cwd(), ""),
    testTimeout: 20000,
    fileParallelism: false,
  },
});
