import { tool } from "langchain";
import { normalizeToolError } from "./errors";
import type { AppTool } from "./registry";

export function toLangChainTool<I, O>(appTool: AppTool<I, O>) {
  return tool(
    async (input, runtime) => {
      try {
        const meta = runtime as { tool_call_id?: string; toolCall?: { id?: string } };
        return await appTool.invoke(input, {
          toolCallId: meta.tool_call_id ?? meta.toolCall?.id,
          startedAt: new Date().toISOString()
        });
      } catch (error) {
        throw normalizeToolError(error);
      }
    },
    {
      name: appTool.name,
      description: appTool.description,
      schema: appTool.inputSchema
    }
  );
}
