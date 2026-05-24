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
      "@mh/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@mh/data": new URL("./packages/data/src/index.ts", import.meta.url).pathname,
      "@mh/tools": new URL("./packages/tools/src/index.ts", import.meta.url).pathname,
      "@mh/llm": new URL("./packages/llm/src/index.ts", import.meta.url).pathname,
      "@mh/agent": new URL("./packages/agent/src/index.ts", import.meta.url).pathname
    }
  }
});
