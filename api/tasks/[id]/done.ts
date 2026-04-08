export const config = { runtime: "edge" };

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const API_SECRET = process.env.API_SECRET;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateEnv(): Response | null {
  if (!NOTION_API_KEY || !API_SECRET) {
    const missing = [
      !NOTION_API_KEY && "NOTION_API_KEY",
      !API_SECRET && "API_SECRET",
    ]
      .filter(Boolean)
      .join(", ");
    console.error(`Missing required environment variables: ${missing}`);
    return Response.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  return null;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export default async function handler(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const envError = validateEnv();
  if (envError) return envError;

  // Authentication — always enforced
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${API_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  if (req.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  // Validate :id is a proper UUID to prevent passing arbitrary strings to Notion
  const id = params?.id ?? new URL(req.url).pathname.split("/").at(-2) ?? "";
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid task ID format" }, { status: 400 });
  }

  let body: { done?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.done !== "boolean") {
    return Response.json(
      { error: "Body must contain { \"done\": boolean }" },
      { status: 400 }
    );
  }

  let notionRes: Response;
  try {
    notionRes = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          Done: { checkbox: body.done },
        },
      }),
    });
  } catch (err) {
    console.error("Notion fetch failed:", err);
    return Response.json({ error: "Failed to reach Notion API" }, { status: 502 });
  }

  if (!notionRes.ok) {
    const detail = await notionRes.text();
    console.error("Notion API error:", notionRes.status, detail);
    return Response.json(
      { error: "Notion API error", status: notionRes.status },
      { status: 500 }
    );
  }

  return Response.json({ success: true }, { headers: CORS_HEADERS });
}
