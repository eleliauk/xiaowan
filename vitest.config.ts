import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    env: {
      LLM_PROVIDER: "deepseek"
    }
  },
  resolve: {
    alias: {
      "@mh/core/agent": new URL("./packages/core/src/agent/index.ts", import.meta.url).pathname,
      "@mh/core/llm": new URL("./packages/core/src/llm/index.ts", import.meta.url).pathname,
      "@mh/core/tools": new URL("./packages/core/src/tools/index.ts", import.meta.url).pathname,
      "@mh/core/data": new URL("./packages/core/src/data/index.ts", import.meta.url).pathname,
      "@mh/core/shared": new URL("./packages/core/src/shared/index.ts", import.meta.url).pathname
    }
  }
});
