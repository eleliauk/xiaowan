import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLLMClient,
  DeepSeekLLMClient,
  FakeLLMClient,
  LLMConfigurationError,
  LLMOutputParseError,
  loadLLMConfig,
  MiniMaxLLMClient
} from "../index";

describe("LLM provider configuration", () => {
  it("uses the fake provider in auto mode when credentials are missing", () => {
    const config = loadLLMConfig({});
    const client = createLLMClient({ env: {} });

    expect(config).toMatchObject({
      requestedProvider: "auto",
      provider: "fake"
    });
    expect(client).toBeInstanceOf(FakeLLMClient);
  });

  it("requires an API key when MiniMax is explicitly requested", () => {
    expect(() => loadLLMConfig({ LLM_PROVIDER: "minimax" })).toThrow(LLMConfigurationError);
  });

  it("requires an API key when DeepSeek is explicitly requested", () => {
    expect(() => loadLLMConfig({ LLM_PROVIDER: "deepseek" })).toThrow(LLMConfigurationError);
  });

  it("prefers DeepSeek in auto mode when only DeepSeek credentials are present", () => {
    const config = loadLLMConfig({
      DEEPSEEK_API_KEY: "sk-deepseek"
    });
    const client = createLLMClient({
      env: {
        DEEPSEEK_API_KEY: "sk-deepseek"
      },
      model: {
        async create() {
          return { content: "{}" };
        }
      }
    });

    expect(config).toMatchObject({
      requestedProvider: "auto",
      provider: "deepseek",
      apiKey: "sk-deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      thinkingType: "enabled",
      reasoningEffort: "high"
    });
    expect(client).toBeInstanceOf(DeepSeekLLMClient);
  });

  it("loads DeepSeek explicit provider settings from env", () => {
    const config = loadLLMConfig({
      LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-deepseek",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com/beta",
      DEEPSEEK_MODEL: "deepseek-v4-pro",
      DEEPSEEK_THINKING: "disabled",
      DEEPSEEK_REASONING_EFFORT: "max",
      LLM_TIMEOUT_MS: "8000",
      LLM_MAX_RETRIES: "0",
      LLM_MAX_TOKENS: "2048"
    });

    expect(config).toMatchObject({
      requestedProvider: "deepseek",
      provider: "deepseek",
      apiKey: "sk-deepseek",
      baseUrl: "https://api.deepseek.com/beta",
      model: "deepseek-v4-pro",
      thinkingType: "disabled",
      reasoningEffort: "max",
      timeoutMs: 8000,
      maxRetries: 0,
      maxTokens: 2048
    });
  });

  it("loads monorepo root .env.local when the web app starts from apps/web", () => {
    const originalCwd = process.cwd();
    const originalEnv = {
      LLM_PROVIDER: process.env.LLM_PROVIDER,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
      MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
      MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL,
      MINIMAX_MODEL: process.env.MINIMAX_MODEL
    };
    const workspace = mkdtempSync(join(tmpdir(), "mh-llm-env-"));
    const webDir = join(workspace, "apps", "web");

    try {
      mkdirSync(webDir, { recursive: true });
      writeFileSync(join(workspace, "pnpm-workspace.yaml"), "packages: []\n");
      writeFileSync(
        join(workspace, ".env.local"),
        ["LLM_PROVIDER=deepseek", "DEEPSEEK_API_KEY=sk-root-deepseek", "DEEPSEEK_MODEL=deepseek-v4-pro"].join("\n")
      );
      for (const key of Object.keys(originalEnv)) {
        delete process.env[key];
      }
      process.chdir(webDir);

      expect(loadLLMConfig()).toMatchObject({
        requestedProvider: "deepseek",
        provider: "deepseek",
        apiKey: "sk-root-deepseek",
        model: "deepseek-v4-pro"
      });
    } finally {
      process.chdir(originalCwd);
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("accepts the current migrated DeepSeek setup when the key is still named MINIMAX_API_KEY", () => {
    const config = loadLLMConfig({
      LLM_PROVIDER: "deepseek",
      MINIMAX_API_KEY: "sk-legacy-deepseek",
      MINIMAX_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_MODEL: "deepseek-v4-pro"
    });

    expect(config).toMatchObject({
      requestedProvider: "deepseek",
      provider: "deepseek",
      apiKey: "sk-legacy-deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro"
    });
  });

  it("loads MiniMax defaults and numeric limits from env", () => {
    const config = loadLLMConfig({
      LLM_PROVIDER: "minimax",
      MINIMAX_API_KEY: "sk-test",
      LLM_TIMEOUT_MS: "5000",
      LLM_MAX_RETRIES: "2"
    });

    expect(config).toMatchObject({
      requestedProvider: "minimax",
      provider: "minimax",
      apiKey: "sk-test",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M2.7",
      timeoutMs: 5000,
      maxRetries: 2,
      maxTokens: 4096
    });
  });
});

describe("DeepSeek LLM client", () => {
  it("sends native tool-calling requests through the OpenAI-compatible SDK adapter", async () => {
    const requests: unknown[] = [];
    const client = new DeepSeekLLMClient(
      {
        requestedProvider: "deepseek",
        provider: "deepseek",
        apiKey: "sk-deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        timeoutMs: 5000,
        maxRetries: 0,
        maxTokens: 2048,
        thinkingType: "enabled",
        reasoningEffort: "high"
      },
      {
        async create(input) {
          requests.push(input);
          return {
            content: "",
            toolCalls: [
              {
                id: "call_1",
                name: "searchNearbyActivities",
                input: { scenario: "family", tags: ["child_friendly"], radiusKm: 5 },
                argumentsJson: '{"scenario":"family","tags":["child_friendly"],"radiusKm":5}'
              }
            ],
            finishReason: "tool_calls",
            reasoningContent: "model considered nearby family options"
          };
        }
      }
    );

    const turn = await client.chatWithTools({
      messages: [
        { role: "system", content: "Use tools." },
        { role: "user", content: "今天下午和老婆孩子出去玩" }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "searchNearbyActivities",
            description: "Search local activities.",
            parameters: {
              type: "object",
              properties: {
                scenario: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                radiusKm: { type: "number" }
              },
              required: ["scenario"]
            }
          }
        }
      ]
    });
    expect(turn.toolCalls).toEqual([
      expect.objectContaining({
        id: "call_1",
        name: "searchNearbyActivities",
        input: { scenario: "family", tags: ["child_friendly"], radiusKm: 5 }
      })
    ]);
    expect(turn.reasoningContent).toBe("model considered nearby family options");
    expect(requests[0]).toMatchObject({
      model: "deepseek-v4-pro",
      messages: [
        { role: "system", content: "Use tools." },
        { role: "user", content: "今天下午和老婆孩子出去玩" }
      ],
      tools: [expect.objectContaining({ type: "function" })],
      tool_choice: "auto",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      stream: false
    });
  });

  it("passes DeepSeek reasoning_content back on later ReAct turns", async () => {
    const requests: unknown[] = [];
    const client = new DeepSeekLLMClient(
      {
        requestedProvider: "deepseek",
        provider: "deepseek",
        apiKey: "sk-deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        timeoutMs: 5000,
        maxRetries: 0,
        maxTokens: 2048,
        thinkingType: "enabled",
        reasoningEffort: "high"
      },
      {
        async create(input) {
          requests.push(input);
          return { content: '{"status":"ready"}', toolCalls: [], finishReason: "stop" };
        }
      }
    );

    await client.chatWithTools({
      messages: [
        { role: "system", content: "Use tools." },
        { role: "user", content: "安排下午" },
        {
          role: "assistant",
          content: "",
          reasoningContent: "private provider reasoning token",
          toolCalls: [
            {
              id: "call_1",
              name: "getUserProfile",
              input: { userId: "xiaoming" },
              argumentsJson: '{"userId":"xiaoming"}'
            }
          ]
        },
        { role: "tool", toolCallId: "call_1", name: "getUserProfile", content: '{"ok":true}' }
      ],
      tools: []
    });

    expect(requests[0]).toMatchObject({
      messages: [
        { role: "system" },
        { role: "user" },
        {
          role: "assistant",
          reasoning_content: "private provider reasoning token",
          tool_calls: [expect.objectContaining({ id: "call_1" })]
        },
        { role: "tool", tool_call_id: "call_1" }
      ]
    });
  });
});

describe("MiniMax LLM client", () => {
  it("parses JSON goal hints returned by an OpenAI-compatible chat model", async () => {
    const client = new MiniMaxLLMClient(
      {
        requestedProvider: "minimax",
        provider: "minimax",
        apiKey: "sk-test",
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M2.7",
        timeoutMs: 5000,
        maxRetries: 0,
        maxTokens: 1600
      },
      {
        async invoke() {
          return {
            content:
              '<think>{"draft":"not final"}</think>\n```json\n{"scenario":"friends","childAge":null,"partySize":4,"startWindow":"afternoon","durationHours":{"min":4,"max":6},"preferences":"social, photo","constraints":"party_size_4","confidence":0.82}\n```'
          };
        }
      }
    );

    await expect(client.parseGoal({ message: "下午四个朋友出去玩" })).resolves.toMatchObject({
      provider: "minimax",
      scenario: "friends",
      partySize: 4,
      confidence: 0.82,
      preferences: ["social", "photo"],
      constraints: ["party_size_4"]
    });
  });

  it("rejects malformed model output before it reaches the graph", async () => {
    const client = new MiniMaxLLMClient(
      {
        requestedProvider: "minimax",
        provider: "minimax",
        apiKey: "sk-test",
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M2.7",
        timeoutMs: 5000,
        maxRetries: 0,
        maxTokens: 1600
      },
      {
        async invoke() {
          return { content: "not json" };
        }
      }
    );

    await expect(client.parseGoal({ message: "下午安排一下" })).rejects.toBeInstanceOf(LLMOutputParseError);
  });

  it("parses planned tool calls returned by the chat model", async () => {
    const client = new MiniMaxLLMClient(
      {
        requestedProvider: "minimax",
        provider: "minimax",
        apiKey: "sk-test",
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M2.7",
        timeoutMs: 5000,
        maxRetries: 0,
        maxTokens: 1600
      },
      {
        async invoke() {
          return {
            content: JSON.stringify({
              calls: [
                {
                  id: "search",
                  toolName: "searchNearbyActivities",
                  input: { scenario: "family", tags: ["child_friendly"], radiusKm: 5 },
                  reason: "查亲子活动"
                },
                {
                  id: "check",
                  toolName: "checkActivityAvailability",
                  input: { activityId: "kid-pottery", partySize: 3, time: "14:30" }
                }
              ],
              rationaleSummary: "先查活动再校验"
            })
          };
        }
      }
    );

    const result = await client.planToolCalls({
      goal: {
        rawText: "下午亲子",
        scenario: "family",
        date: "2026-05-24",
        startWindow: "afternoon",
        durationHours: { min: 4, max: 6 },
        origin: { label: "家", lat: 39.996, lng: 116.48 },
        party: [],
        preferences: [],
        constraints: []
      },
      toolTraces: [],
      availableTools: [{ name: "searchNearbyActivities", description: "Search activities" }]
    });

    expect(result.calls).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "search", toolName: "searchNearbyActivities" })])
    );
  });

  it("parses a complete Plan JSON returned by the chat model", async () => {
    const planJson = {
      id: "llm-plan-family-pottery",
      title: "LLM 生成：陶艺 + 轻食亲子半日",
      scenario: "family",
      summary: "根据工具结果安排陶艺和轻食。",
      totalDurationMinutes: 290,
      estimatedBudgetCny: 620,
      confidence: 0.88,
      timeline: [
        {
          id: "travel",
          type: "travel",
          title: "从家出发",
          startTime: "14:00",
          endTime: "14:25",
          durationMinutes: 25,
          notes: ["短途"],
          evidence: []
        },
        {
          id: "activity",
          type: "activity",
          title: "亲子陶艺",
          placeName: "小手作陶艺亲子馆",
          startTime: "14:30",
          endTime: "16:00",
          durationMinutes: 90,
          notes: ["有名额"],
          evidence: []
        },
        {
          id: "meal",
          type: "meal",
          title: "轻食晚餐",
          placeName: "青禾轻食 Bistro",
          startTime: "17:30",
          endTime: "18:30",
          durationMinutes: 60,
          notes: ["有 3 人桌"],
          evidence: []
        }
      ],
      requiredActions: [
        {
          id: "book",
          type: "book_activity",
          status: "pending",
          toolName: "bookActivity",
          optional: false,
          input: { activityId: "kid-pottery", partySize: 3, time: "14:30", contactName: "小明" }
        },
        {
          id: "reserve",
          type: "reserve_restaurant",
          status: "pending",
          toolName: "reserveRestaurant",
          optional: false,
          input: { restaurantId: "qinghe-bistro", partySize: 3, time: "17:30", contactName: "小明" }
        }
      ],
      alternatives: [],
      risks: []
    };
    const client = new MiniMaxLLMClient(
      {
        requestedProvider: "minimax",
        provider: "minimax",
        apiKey: "sk-test",
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M2.7",
        timeoutMs: 5000,
        maxRetries: 0,
        maxTokens: 1600
      },
      {
        async invoke() {
          return { content: JSON.stringify(planJson) };
        }
      }
    );

    await expect(
      client.composePlan({
        goal: {
          rawText: "下午亲子",
          scenario: "family",
          date: "2026-05-24",
          startWindow: "afternoon",
          durationHours: { min: 4, max: 6 },
          origin: { label: "家", lat: 39.996, lng: 116.48 },
          party: [],
          preferences: [],
          constraints: []
        },
        toolTraces: []
      })
    ).resolves.toMatchObject({
      id: "llm-plan-family-pottery",
      title: "LLM 生成：陶艺 + 轻食亲子半日"
    });
  });
});
