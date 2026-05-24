import { zodToJsonSchema } from "zod-to-json-schema";
import type { AppTool } from "./registry";

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function cleanJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {}, additionalProperties: false };
  }

  const { $schema: _schema, ...rest } = schema as Record<string, unknown>;
  return rest;
}

export function toOpenAIToolDefinition(tool: AppTool<unknown, unknown>): OpenAIToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: cleanJsonSchema(zodToJsonSchema(tool.inputSchema))
    }
  };
}
