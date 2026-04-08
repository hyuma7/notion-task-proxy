export const config = { runtime: "edge" };

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const API_SECRET = process.env.API_SECRET;

// Fail fast if required environment variables are missing
function validateEnv(): Response | null {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID || !API_SECRET) {
    const missing = [
      !NOTION_API_KEY && "NOTION_API_KEY",
      !NOTION_DATABASE_ID && "NOTION_DATABASE_ID",
      !API_SECRET && "API_SECRET",
    ]
      .filter(Boolean)
      .join(", ");
    console.error(`Missing required environment variables: ${missing}`);
    return Response.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }
  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Task {
  id: string;
  name: string;
  estimated_minutes: number | null;
  scheduled_date: string | null;
  done: boolean;
  url: string | null;
}

export function parsePage(page: any): Task | null {
  try {
    const props = page.properties;
    const titleList = props.Memo?.title ?? [];
    const name = titleList[0]?.plain_text ?? "Untitled";
    const estimated_minutes = props["時間（分）"]?.number ?? null;
    const dateStart = props["実施日"]?.date?.start ?? null;
    const scheduled_date = dateStart ? dateStart.slice(0, 10) : null;
    const done = props.Done?.checkbox ?? false;
    if (!UUID_RE.test(page.id)) return null;
    return {
      id: page.id,
      name,
      estimated_minutes,
      scheduled_date,
      done,
      url: page.url ?? null,
    };
  } catch {
    return null;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Validate environment variables — API_SECRET is required
  const envError = validateEnv();
  if (envError) return envError;

  // Authentication — always enforced
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${API_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const includeDone = url.searchParams.get("include_done") === "true";
  const dateParam = url.searchParams.get("date");

  // Validate date format if provided
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return Response.json(
      { error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const filterConditions: object[] = [
    { property: "分類", select: { equals: "タスク" } },
  ];
  if (!includeDone) {
    filterConditions.push({ property: "Done", checkbox: { equals: false } });
  }

  let notionRes: Response;
  try {
    notionRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: { and: filterConditions },
          sorts: [{ property: "実施日", direction: "ascending" }],
        }),
      }
    );
  } catch (err) {
    console.error("Notion fetch failed:", err);
    return Response.json({ error: "Failed to reach Notion API" }, { status: 502 });
  }

  if (!notionRes.ok) {
    const detail = await notionRes.text();
    // Log full detail server-side; never expose to client
    console.error("Notion API error:", notionRes.status, detail);
    return Response.json(
      { error: "Notion API error", status: notionRes.status },
      { status: 500 }
    );
  }

  const data = await notionRes.json();
  const tasks = (data.results as any[])
    .map(parsePage)
    .filter(Boolean)
    .filter((t: Task) => {
      if (!dateParam) return true;
      return t.scheduled_date === null || t.scheduled_date === dateParam;
    });

  return Response.json(
    { tasks, count: tasks.length },
    { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}
