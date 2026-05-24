import { runPlanning } from "@mh/agent";
import { saveSession } from "../../../lib/sessionStore";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    message?: string;
  };

  if (!body.message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const result = await runPlanning({
    sessionId: body.sessionId,
    userMessage: body.message,
    now: new Date().toISOString()
  });

  saveSession(result);
  return Response.json(result);
}
