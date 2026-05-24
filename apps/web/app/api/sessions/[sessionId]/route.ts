import { getSession } from "../../../../lib/sessionStore";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);

  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  return Response.json(session);
}
