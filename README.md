# Notion Task Proxy

Notion MCP が Database Query API のプロパティフィルタに非対応であることを回避するための軽量プロキシ API。

Vercel Edge Functions で動作し、`分類=タスク` かつ `Done=false` でフィルタされたタスク一覧を返す。

---

## エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/tasks` | 未完了タスク一覧取得 |
| `PATCH` | `/api/tasks/:id/done` | タスクの完了状態を更新 |

### GET /api/tasks

#### クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `include_done` | boolean | `false` | 完了済みタスクを含めるか |
| `date` | string (YYYY-MM-DD) | なし | 指定日 or 日付未設定のタスクのみ返す |

#### リクエスト例

```
GET /api/tasks
GET /api/tasks?date=2026-04-05
GET /api/tasks?include_done=true
```

#### レスポンス (200 OK)

```json
{
  "tasks": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "週次レポート作成",
      "estimated_minutes": 60,
      "scheduled_date": "2026-04-05",
      "done": false,
      "url": "https://www.notion.so/xxxxxxxx"
    }
  ],
  "count": 1
}
```

### PATCH /api/tasks/:id/done

#### リクエストボディ

```json
{ "done": true }
```

#### レスポンス (200 OK)

```json
{ "success": true }
```

---

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/hyuma7/notion-task-proxy.git
cd notion-task-proxy
npm install
```

### 2. 環境変数を設定

`.env.local.example` をコピーして `.env.local` を作成する。

```bash
cp .env.local.example .env.local
```

| 変数名 | 説明 | 必須 |
|---|---|---|
| `NOTION_API_KEY` | Notion Integration のシークレットキー | 必須 |
| `NOTION_DATABASE_ID` | Post IT データベースの ID | 必須 |
| `API_SECRET` | エンドポイント保護用の共有シークレット | **必須** |
| `ALLOWED_ORIGIN` | CORS を許可するオリジン（例: `https://claude.ai`） | 任意 |

> **注意**: `API_SECRET` は必須です。未設定の場合はサーバーが 500 を返し、リクエストを処理しません。
> 生成例: `openssl rand -hex 32`

### 3. ローカル開発

```bash
npm run dev
```

### 4. Vercel にデプロイ

```bash
npm run deploy
```

デプロイ後、Vercel Dashboard で環境変数を設定してください。

---

## セキュリティ設計

| 対策 | 実装内容 |
|---|---|
| **API_SECRET 必須化** | 未設定時は 500 を返し、認証なしでの公開を防止 |
| **認証の常時強制** | `API_SECRET` の有無に関わらず Bearer トークン検証を常に実施 |
| **UUID バリデーション** | `:id` パラメータが UUID 形式でない場合は 400 を返す |
| **エラー詳細の隠蔽** | Notion API のエラー詳細はサーバーログにのみ出力し、クライアントに返さない |
| **CORS 制限** | `ALLOWED_ORIGIN` 環境変数で許可オリジンを明示的に制限（未設定時は全拒否） |
| **Notion API キーの隠蔽** | 環境変数に格納し、クライアントには非公開 |

---

## Claude からの利用方法

```javascript
const res = await fetch("https://your-deployment.vercel.app/api/tasks?date=2026-04-05", {
  headers: { "Authorization": "Bearer YOUR_API_SECRET" }
});
const { tasks } = await res.json();
```

または Claude Code のプロンプトで:

> `https://your-deployment.vercel.app/api/tasks` から今日の未完了タスクを取得してください

---

## ディレクトリ構成

```
notion-task-proxy/
├── api/
│   ├── tasks.ts              # GET /api/tasks
│   └── tasks/
│       └── [id]/
│           └── done.ts       # PATCH /api/tasks/:id/done
├── .env.local.example        # 環境変数テンプレート
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```
