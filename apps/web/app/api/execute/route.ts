import { executePlan } from "@mh/agent";
import { getSession, saveSession } from "../../../lib/sessionStore";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    planId?: string;
  };

  if (!body.sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session?.plan) {
    return Response.json({ error: "confirmed plan not found" }, { status: 404 });
  }

  if (body.planId && body.planId !== session.plan.id) {
    return Response.json({ error: "planId does not match session plan" }, { status: 409 });
  }

  const result = await executePlan({
    sessionId: body.sessionId,
    plan: session.plan,
    now: new Date().toISOString()
  });

  const merged = {
    ...result,
    messages: session.messages,
    toolTraces: result.toolTraces
  };

  saveSession(merged);
  return Response.json(merged);
}
