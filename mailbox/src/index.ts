import { Env } from "./types";
export { MailboxDurableObject } from "./mailbox_do";

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        { status: "ok", service: "gamenote-mailbox" },
        { headers: CORS_HEADERS }
      );
    }

    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return Response.json(
        { error: "Unauthorized: Missing or invalid Authorization header" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const token = auth.slice(7).trim();
    if (!token) {
      return Response.json(
        { error: "Unauthorized: Empty Bearer token" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    try {
      const groupId = await hashToken(token);
      const doId = env.MAILBOX_DO.idFromName(groupId);
      const stub = env.MAILBOX_DO.get(doId);

      return await stub.fetch(request);
    } catch (err: any) {
      return Response.json(
        { error: err?.message || "Worker routing error" },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
};
