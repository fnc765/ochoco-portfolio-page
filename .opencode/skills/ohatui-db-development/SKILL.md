---
name: ohatui-db-development
description: おはついDB (ohatsui/) および おはついDB フロントエンド (particleAnimation/ohatui-db/) の開発スキル。Cloudflare Pages Functions + D1 + R2 の API 実装、FixTweet API 連携、wrangler dev でのローカル開発、migrations、collector スクリプト、headless-admin.mjs による動作確認まで含む。
---

# おはついDB 開発スキル

## このスキルが有効なケース

- `/api/collect`, `/api/fetch-tweet`, `/api/refresh-today`, `/api/tweets`, `/api/check-today`, `/api/image/:id` のいずれかを修正・追加するとき
- D1 スキーマを変更するとき (migrations/ 追加)
- FixTweet API のフィールドマッピングが変わったとき
- R2 画像キャッシュの挙動を調査・修正するとき
- `ohatsui/collector/` のスクリプト (upload_images.py, import-archive.js) を触るとき
- `particleAnimation/ohatui-db/` および `admin/` のフロントエンドを修正するとき
- IFTTT Webhook からのデータ受信形式が変わったとき

## プロジェクト構成

```
ohatsui/                                 # バックエンド（Cloudflare Pages Functions）
├── functions/api/
│   ├── collect.js                       # POST: IFTTT Webhook 受信
│   ├── fetch-tweet.js                   # GET: FixTweet API 経由ツイート取得
│   ├── refresh-today.js                 # GET: エンゲージメント更新（cron 1時間毎）
│   ├── check-today.js                   # GET: 今日の登録状況チェック
│   ├── tweets.js                        # GET: ツイート一覧（D1 から取得）
│   └── image/[id].js                    # GET: 画像配信（R2 + Twitter フォールバック）
├── collector/                           # 画像一括アップロード等
│   ├── upload_images.py                 # D1 画像URL取得 → Twitter → R2
│   ├── import-archive.js                # X アーカイブ → D1 一括インポート
│   └── requirements.txt                 # pillow, boto3, requests
├── migrations/                          # D1 マイグレーション（番号付き .sql）
├── schema.sql                           # メインビルド用スキーマ
├── test/                                # 手書き Node テスト
│   ├── smoke-fxtwitter.js               # FixTweet API スモークテスト
│   ├── test-parse-logic.js              # fetch-tweet のパースロジック単体検証
│   ├── headless-admin.mjs               # /admin ページの Playwright 検証
│   └── headless-admin-test.mjs
└── wrangler.toml                        # ローカル開発設定

particleAnimation/ohatui-db/             # フロントエンド（おはついDB メイン画面）
├── index.html
├── mock-data.js                         # 開発用モックデータ
├── script.js
└── style.css

particleAnimation/ohatui-db/admin/       # 管理画面
├── index.html
└── ...
```

## Cloudflare Pages Functions のルール

### 1. エントリポイント
- 各ファイルは `export async function onRequestGet|onRequestPost({ request, env, ... })` を export する
- パスは `ohatsui/functions/api/<path>.js` → 本番では `<pages-url>/api/<path>` でアクセス可能
- 動的パラメータは `[id].js` のような bracket記法 → リクエストは `params.id` で受け取る

### 2. 環境変数・バインディング
| 名前 | 種類 | 用途 |
|---|---|---|
| `env.DB` | D1 binding | tweets テーブル |
| `env.IMAGES` | R2 binding | 画像キャッシュ（`images/small/{tweet_id}.jpg`） |
| `env.COLLECT_SECRET` | Secret (string) | IFTTT Webhook 認証 |

**重要:** D1/R2 バインディングは `wrangler.toml` には書かず、デプロイワークフロー（`.github/workflows/deploy-cloudflare-pages.yml`）が自動設定する。wrangler.toml に書くのはローカル開発用の最小設定。

### 3. 認証パターン（COLLECT_SECRET）

`refresh-today.js` 等、定数時間比較を使う:

```js
async function timingSafeCompare(token, secret) {
    const enc = new TextEncoder();
    const [hashA, hashB] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(token)),
        crypto.subtle.digest('SHA-256', enc.encode(secret)),
    ]);
    return crypto.subtle.timingSafeEqual(hashA, hashB);
}
```

通常の `===` 比較はタイミング攻撃に脆弱。新しい認証ロジックを書く場合はこのパターンを使う。

### 4. レスポンス
- 成功: `Response.json(data)` （自動で `Content-Type: application/json`）
- エラー: `Response.json({ error: '...' }, { status: 4xx/5xx })`
- キャッシュヘッダ: 必要なら `headers: { 'Cache-Control': 'public, max-age=300' }` を付ける

## FixTweet API 連携

`fetch-tweet.js`, `refresh-today.js`, `image/[id].js` 等で使う共通パターン:

```
URL: https://api.fxtwitter.com/i/status/{tweet_id}
User-Agent: bot
cf: { cacheTtl: 0 }  // Cloudflare キャッシュ無効化
```

**フィールドマッピング**（FixTweet のレスポンスは揺れが大きい）:

```js
// 全ての候補を ?? でフォールバック
const likeCount    = tweet.likes     ?? tweet.like_count     ?? tweet.favorites ?? 0;
const retweetCount = tweet.retweets  ?? tweet.retweet_count  ?? tweet.reposts   ?? 0;

// created_at: ISO 8601 に正規化
let createdAt = tweet.created_at ?? null;
if (!createdAt && tweet.created_timestamp) {
    createdAt = new Date(tweet.created_timestamp * 1000).toISOString();
}
```

FixTweet のフィールドが変わるたびに `ohatsui/test/smoke-fxtwitter.js` で実 API レスポンスを取得して確認 → `fetch-tweet.js` の `parseTweetFields` を更新。

## D1 マイグレーション

### スキーマ

```sql
CREATE TABLE IF NOT EXISTS tweets (
    id           TEXT PRIMARY KEY,       -- X の tweet ID (文字列)
    tweet_id     TEXT UNIQUE NOT NULL,
    text         TEXT NOT NULL,
    created_at   TEXT NOT NULL,          -- ISO 8601 UTC
    image_url    TEXT,                   -- pbs.twimg.com/...
    like_count   INTEGER NOT NULL DEFAULT 0,
    retweet_count INTEGER NOT NULL DEFAULT 0,
    type         TEXT NOT NULL DEFAULT 'ohachoco'
                 CHECK(type IN ('ohachoco', 'konchoco', 'konbanchoco', 'sonota'))
);
CREATE INDEX IF NOT EXISTS idx_created_at ON tweets(created_at);
CREATE INDEX IF NOT EXISTS idx_type ON tweets(type);
```

### マイグレーション追加手順

1. `ohatsui/migrations/NNN_<description>.sql` を作成（番号は3桁ゼロパディング）
2. `ohatsui/schema.sql` にも反映（メインビルド用）
3. ローカル `wrangler pages dev` で確認:
   ```bash
   npx wrangler d1 execute ohatui-tweets --local --file=ohatsui/migrations/NNN_xxx.sql
   ```
4. **本番反映は `wrangler d1 execute` で行う**（デプロイワークフローには含めない。スキーマ変更は明示的に手動実行）

## ローカル開発

### wrangler dev 起動

```bash
cd ohatsui
npx wrangler pages dev . --d1=DB --r2=IMAGES
# → http://localhost:8788 で公開
```

D1 はローカルで SQLite ファイルに自動保存される。`.wrangler/state/` 配下。

### エンドポイント動作確認

```bash
# ツイート一覧
curl http://localhost:8788/api/tweets | jq

# ツイート取得（FixTweet 経由）
curl 'http://localhost:8788/api/fetch-tweet?url=https://x.com/ochoco0215/status/2033342224906489994' | jq

# 認証付き（COLLECT_SECRET が必要）
curl -H "Authorization: Bearer $COLLECT_SECRET" http://localhost:8788/api/refresh-today | jq
```

### フロントエンド（/admin）の動作確認

```bash
# 別ターミナルで
npx http-server particleAnimation/ -p 8080
# → http://localhost:8080/ohatui-db/admin/ で /admin 画面
# API URL は本番を向いているので、ローカル API に向けたい場合は admin/index.html のAPI URLを書き換える
```

`ohatsui/test/headless-admin.mjs` を参考に Playwright で `/admin` のフローを自動検証できる。

## テスト

`ohatsui/test/` のスクリプトは**vitest/playwrightの枠組みに依存しない、シンプルな Node スクリプト**として書かれている。 CI では `.github/workflows/deploy-cloudflare-pages.yml` の `Smoke test - FixTweet API` ステップで `node ohatsui/test/smoke-fxtwitter.js` を実行。

### 新規テストスクリプト追加手順

1. `ohatsui/test/<feature>-<target>.js` を作成（shebang `#!/usr/bin/env node`、コメント「使い方」必須）
2. 終了コード `0 = 成功 / 1 = 失敗` を守る
3. CI で回したいものは `deploy-cloudflare-pages.yml` の適切なステップから呼ぶ
4. テストデータを実 API レスポンスから取る場合は `smoke-fxtwitter.js` のパターンを参考

### パースロジックの単体検証

`fetch-tweet.js` のロジックは `test/test-parse-logic.js` でモックレスポンスを使って検証する。
**注意: `test/test-parse-logic.js` 内の関数定義は `fetch-tweet.js` と重複している**。
これは `fetch-tweet.js` が Pages Functions 用 (ESM, no exports for testing) のため。
ロジックを変更したら**両方を必ず更新**する。

## R2 画像キャッシュ

- バケット名: `ohatui-images`
- キー: `images/small/{tweet_id}.jpg`
- 配信元: `/api/image/{tweet_id}`（`image/[id].js`）

### 配信ロジック

1. R2 にキャッシュがあれば返す
2. なければ Twitter から取得 → small サイズ (680px) に変換 → R2 に保存 → 返す
3. 画像がないツイートにはタイプ別プレースホルダー SVG を返す

### SSRF 対策

`ALLOWED_IMAGE_HOSTS = new Set(['pbs.twimg.com', 'ton.twimg.com'])` で外部URLを検証。
`https:` のみ許可。新しい画像ホストを扱う場合はここに追加。

## collector スクリプト

### upload_images.py

- `--archive`: X アーカイブのメディアフォルダから直接アップロード
- `--import-archive`: D1 登録 + R2 画像アップロードを一度に

### import-archive.js

- X アーカイブの `data/tweets.js` 等をパース → D1 に INSERT
- 画像URLは `pbs.twimg.com` の `?name=orig` を保持

### Secrets 必要

| Secret | 用途 |
|---|---|
| `CF_API_TOKEN` | Cloudflare API |
| `CF_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CF_D1_DATABASE_ID` | D1 データベース ID |
| `CF_R2_ACCESS_KEY_ID` | R2 S3 互換 API |
| `CF_R2_SECRET_ACCESS_KEY` | R2 S3 互換 API |

`upload_images.py` の `argparse` を確認し、用途別に必須 Secret を切り替える。

## コミット前チェックリスト

- [ ] 関連API（`fetch-tweet.js` / `refresh-today.js` / `image/[id].js`）を変更した場合、`ohatsui/test/test-parse-logic.js` も同期更新
- [ ] D1 スキーマ変更時: `ohatsui/schema.sql` と `ohatsui/migrations/NNN_*.sql` の両方更新
- [ ] 新しい認証パターンは `timingSafeCompare` を使用（`===` 比較は不可）
- [ ] 外部 URL を取り扱う場合は `ALLOWED_IMAGE_HOSTS` 等で allowlist 検証
- [ ] `wrangler pages dev` でローカル動作確認
- [ ] `ohatsui/test/smoke-fxtwitter.js` を実行してパースエラーなし
- [ ] コミットメッセージ: `feat/fix/refactor(ohatsui): ...` の prefix
