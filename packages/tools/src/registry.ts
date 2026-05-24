import type { z } from "zod";
import { normalizeToolError } from "./errors";

export type ToolContext = {
  toolCallId?: string;
  startedAt?: string;
};

export type AppTool<I, O> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  handler: (input: I, context: ToolContext) => Promise<O> | O;
  invoke: (input: unknown, context?: ToolContext) => Promise<O>;
};

export function createAppTool<I, O>(definition: Omit<AppTool<I, O>, "invoke">): AppTool<I, O> {
  return {
    ...definition,
    async invoke(input: unknown, context: ToolContext = {}) {
      try {
        const parsedInput = definition.inputSchema.parse(input);
        const output = await definition.handler(parsedInput, context);
        return definition.outputSchema.parse(output);
      } catch (error) {
        throw normalizeToolError(error);
      }
    }
  };
}

export class ToolRegistry {
  private tools = new Map<string, AppTool<unknown, unknown>>();

  register<I, O>(tool: AppTool<I, O>) {
    this.tools.set(tool.name, tool as AppTool<unknown, unknown>);
    return this;
  }

  get(name: string): AppTool<unknown, unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool;
  }

  list() {
    return [...this.tools.values()];
  }
}
