import type { ToolError } from "@mh/core/shared";
import { ToolErrorSchema } from "@mh/core/shared";
import { ZodError } from "zod";

export class ToolExecutionError extends Error implements ToolError {
  code: ToolError["code"];
  recoverable: boolean;
  suggestedFallback?: string;

  constructor(error: ToolError) {
    super(error.message);
    this.name = "ToolExecutionError";
    this.code = error.code;
    this.recoverable = error.recoverable;
    this.suggestedFallback = error.suggestedFallback;
  }
}

export function isToolExecutionError(error: unknown): error is ToolExecutionError {
  return error instanceof ToolExecutionError;
}

export function normalizeToolError(error: unknown): ToolExecutionError {
  if (isToolExecutionError(error)) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ToolExecutionError({
      code: "VALIDATION_ERROR",
      message: error.issues.map((issue) => issue.message).join("; "),
      recoverable: false
    });
  }

  const parsed = ToolErrorSchema.safeParse(error);
  if (parsed.success) {
    return new ToolExecutionError(parsed.data);
  }

  return new ToolExecutionError({
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Unknown tool failure",
    recoverable: false
  });
}
