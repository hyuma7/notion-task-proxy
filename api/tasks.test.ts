import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parsePage, Task } from "./tasks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Record<string, any> = {}): any {
  return {
    id: "12345678-1234-1234-1234-123456789abc",
    url: "https://notion.so/test-page",
    properties: {
      Memo: { title: [{ plain_text: "Test Task" }] },
      "時間（分）": { number: 30 },
      実施日: { date: { start: "2026-04-08" } },
      Done: { checkbox: false },
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// parsePage
// ---------------------------------------------------------------------------

describe("parsePage", () => {
  it("valid page を正しくパースする", () => {
    const task = parsePage(makePage());
    expect(task).toEqual<Task>({
      id: "12345678-1234-1234-1234-123456789abc",
      name: "Test Task",
      estimated_minutes: 30,
      scheduled_date: "2026-04-08",
      done: false,
      url: "https://notion.so/test-page",
    });
  });

  it("Done=true のページを正しくパースする", () => {
    const task = parsePage(makePage({ Done: { checkbox: true } }));
    expect(task?.done).toBe(true);
  });

  it("時間（分）が null のときは estimated_minutes=null", () => {
    const task = parsePage(makePage({ "時間（分）": { number: null } }));
    expect(task?.estimated_minutes).toBeNull();
  });

  it("実施日がないときは scheduled_date=null", () => {
    const task = parsePage(makePage({ 実施日: { date: null } }));
    expect(task?.scheduled_date).toBeNull();
  });

  it("実施日が datetime でも日付部分 (YYYY-MM-DD) だけ返す", () => {
    const task = parsePage(
      makePage({ 実施日: { date: { start: "2026-04-08T09:00:00.000+09:00" } } })
    );
    expect(task?.scheduled_date).toBe("2026-04-08");
  });

  it("Memo が空リストのときは name='Untitled'", () => {
    const task = parsePage(makePage({ Memo: { title: [] } }));
    expect(task?.name).toBe("Untitled");
  });

  it("無効な UUID のページは null を返す", () => {
    const page = makePage();
    page.id = "not-a-valid-uuid";
    expect(parsePage(page)).toBeNull();
  });

  it("properties が undefined のときは null を返す", () => {
    expect(parsePage({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handler — フィルタロジック (fetch をモック)
// ---------------------------------------------------------------------------

async function callHandler(
  params: Record<string, string>,
  notionResults: any[],
  secret = "test-secret"
): Promise<Response> {
  // モジュールを動的にインポートしてハンドラを取得
  const mod = await import("./tasks");

  // fetch をモック
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: notionResults }),
    text: async () => "",
  } as unknown as Response);

  vi.stubGlobal("fetch", mockFetch);

  const qs = new URLSearchParams(params).toString();
  const req = new Request(`https://example.com/api/tasks?${qs}`, {
    headers: {
      authorization: `Bearer ${secret}`,
    },
  });

  return mod.default(req);
}

describe("handler — フィルタ", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("date 未指定 → 全タスクを返す", async () => {
    const pages = [
      makePage({ 実施日: { date: { start: "2026-04-07" } } }),
      makePage({ 実施日: { date: { start: "2026-04-08" } } }),
      makePage({ 実施日: { date: null } }),
    ];
    const res = await callHandler({}, pages);
    const body = await res.json() as { tasks: Task[]; count: number };
    expect(body.count).toBe(3);
  });

  it("date 指定 → 該当日付 と scheduled_date=null のみ返す", async () => {
    const pages = [
      makePage({ 実施日: { date: { start: "2026-04-07" } } }), // 除外
      makePage({ 実施日: { date: { start: "2026-04-08" } } }), // 含む
      makePage({ 実施日: { date: null } }),                     // 含む (null)
    ];
    const res = await callHandler({ date: "2026-04-08" }, pages);
    const body = await res.json() as { tasks: Task[]; count: number };
    expect(body.count).toBe(2);
    expect(body.tasks.every((t) => t.scheduled_date === "2026-04-08" || t.scheduled_date === null)).toBe(true);
  });

  it("date 指定 → 別日付のタスクは除外される", async () => {
    const pages = [
      makePage({ 実施日: { date: { start: "2026-04-06" } } }),
      makePage({ 実施日: { date: { start: "2026-04-07" } } }),
    ];
    const res = await callHandler({ date: "2026-04-08" }, pages);
    const body = await res.json() as { tasks: Task[]; count: number };
    expect(body.count).toBe(0);
  });

  it("無効な日付フォーマット → 400 を返す", async () => {
    const res = await callHandler({ date: "2026/04/08" }, []);
    expect(res.status).toBe(400);
  });

  it("認証ヘッダーが不正 → 401 を返す", async () => {
    const pages = [makePage()];
    const res = await callHandler({}, pages, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("include_done=true → Done タスクも含む (Notion 側フィルタはモックのため全件返却)", async () => {
    const pages = [
      makePage({ Done: { checkbox: true } }),
      makePage({ Done: { checkbox: false } }),
    ];
    const res = await callHandler({ include_done: "true" }, pages);
    const body = await res.json() as { tasks: Task[]; count: number };
    expect(body.count).toBe(2);
  });

  it("parsePage が null を返すページはレスポンスから除外される", async () => {
    const validPage = makePage();
    const invalidPage = { ...makePage(), id: "not-a-uuid" }; // UUID 不正
    const res = await callHandler({}, [validPage, invalidPage]);
    const body = await res.json() as { tasks: Task[]; count: number };
    expect(body.count).toBe(1);
    expect(body.tasks[0].id).toBe(validPage.id);
  });
});
