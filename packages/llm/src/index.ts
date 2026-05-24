export type ParsedGoalHint = {
  scenario: "family" | "friends" | "unknown";
};

export class FakeLLMClient {
  async parseGoal(message: string): Promise<ParsedGoalHint> {
    if (message.includes("老婆") || message.includes("孩子")) {
      return { scenario: "family" };
    }

    if (message.includes("朋友") || message.includes("4") || message.includes("四")) {
      return { scenario: "friends" };
    }

    return { scenario: "unknown" };
  }
}

export function createChatModel() {
  return new FakeLLMClient();
}
