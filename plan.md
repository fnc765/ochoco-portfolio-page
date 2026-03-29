# おはついDB R2画像キャッシュ 実装計画

## 前提・設計決定事項

| 項目 | 決定 |
|------|------|
| ストレージ | Cloudflare R2 (`ohatui-images` バケット) |
| 画像サイズ | 小サムネのみ (150×150 JPEG) |
| 取得タイミング | 収集時に即保存 + 初回アクセス時フォールバック |
| 既存データ移行 | アクセス時順次取得 + Xアーカイブからローカル Python スクリプトで一括アップロード |
| 背景タイル | R2キャッシュから配信 |
| バケット名 | `ohatui-images` |
| Worker配置 | 既存 Pages Functions に `/api/image/[id].js` を追加 |
| エラー時 | タイプ別プレースホルダー画像を返す |
| アーカイブ移行 | Python スクリプト（`collector/upload_images.py`） |

---

## Step 1: R2バケット作成 & バインディング設定

**対象ファイル:**
- `ohatsui/wrangler.toml` — R2バインディング追加
- `.github/workflows/deploy-ohatui-preview.yml` — R2バケット作成 & Pages バインディング設定

**変更内容:**
- `wrangler.toml` にR2バインディング追加（コメント形式、デプロイ時に自動設定）
- デプロイワークフローに以下を追加:
  1. `ohatui-images` R2バケットの存在チェック & 作成（Cloudflare API）
  2. Pages プロジェクトに R2 バインディング (`IMAGES`) を設定
  3. 既存の D1 バインディング設定と同じ PATCH リクエストに R2 を追加

---

## Step 2: 画像配信 API エンドポイント作成

**新規ファイル:**
- `ohatsui/functions/api/image/[id].js`

**処理フロー:**
```
GET /api/image/<tweet_id>
  1. R2 から `thumbnails/{tweet_id}.jpg` を取得
  2. 存在する場合 → 画像を返す（Cache-Control: public, max-age=86400）
  3. 存在しない場合 →
     a. D1 から該当ツイートの `image_url` を取得
     b. image_url が null → タイプ別プレースホルダー画像を返す
     c. image_url あり → Twitter から画像取得
     d. 150×150 にリサイズ（※後述）
     e. R2 に保存
     f. 画像をレスポンスとして返す
```

**リサイズについて:**
- Cloudflare Workers 内ではネイティブの画像リサイズが難しい（Image Resizing は有料）
- **方針**: Twitter の画像URL にクエリパラメータ `?format=jpg&name=small` を付けて小サイズ取得（Twitter CDN側でリサイズ済み、~150px幅）
- もしくは `pbs.twimg.com` の URL を `_small` suffix に変換

**プレースホルダー:**
- タイプ別の色付きSVGを動的生成して返す
  - ohachoco: オレンジ系 (#ffb74d)
  - konchoco: グリーン系 (#81c784)
  - konbanchoco: パープル系 (#9575cd)

---

## Step 3: 収集時の画像キャッシュ（collect.js 修正）

**対象ファイル:**
- `ohatsui/functions/api/collect.js`

**変更内容:**
- D1 保存成功後、`image_url` がある場合は非同期で R2 にサムネイルを保存
- `env.IMAGES` (R2バインディング) を使用
- Twitter画像を fetch → R2 に `thumbnails/{tweetId}.jpg` として put
- R2保存の失敗は collect 全体の失敗にしない（ベストエフォート）
- `ctx.waitUntil()` で非同期処理（レスポンスを先に返す）

```js
// collect.js の変更イメージ
if (image_url && env.IMAGES) {
    ctx.waitUntil(cacheImageToR2(env.IMAGES, tweetId, image_url));
}
```

---

## Step 4: フロントエンド修正（画像URLをR2経由に変更）

**対象ファイル:**
- `ohatsui/script.js`

**変更内容:**

1. **画像URLヘルパー関数追加:**
```js
function getThumbnailUrl(tweet) {
    if (!tweet.image_url) return null;
    return `/api/image/${tweet.id}`;
}
```

2. **以下の箇所で `t.image_url` を `getThumbnailUrl(t)` に変更:**
   - `initTileBackground()` (L108) — 背景タイル画像
   - `renderToday()` (L161) — 今日のおはつい画像
   - `renderOnThisDay()` (L221) — 去年の今日画像
   - `renderGallery()` (L562) — ギャラリーサムネイル
   - `renderFunTweet()` (L518) — おたのしみ画像
   - `openModal()` (L598) — モーダル画像

3. **画像の有無判定:**
   - `t.image_url` が null のツイートは引き続き画像なしとして扱う
   - `image_url` がある場合のみ `/api/image/{id}` を使用

4. **onerror ハンドリング:**
   - `<img>` に `onerror` を追加し、プレースホルダーへのフォールバック

---

## Step 5: Python 一括アップロードスクリプト

**新規ファイル:**
- `ohatsui/collector/upload_images.py`

**機能:**
1. Cloudflare D1 API から全ツイート取得（`image_url` が NULL でないもの）
2. 各ツイートの `image_url` から画像を取得
3. 150×150 にリサイズ（Pillow ライブラリ使用）
4. R2 に `thumbnails/{tweet_id}.jpg` として PUT（Cloudflare S3互換API or REST API）
5. 進捗表示、リトライ、レート制限対応

**実行方法:**
```bash
pip install pillow boto3  # (R2はS3互換なので boto3 使用)
CF_R2_ACCESS_KEY_ID=xxx CF_R2_SECRET_ACCESS_KEY=xxx CF_ACCOUNT_ID=xxx \
  python upload_images.py
```

**Xアーカイブからのアップロード対応:**
- オプション: `--archive /path/to/twitter-data/` を指定すると、アーカイブ内の画像ファイルを直接読み込み
- Xアーカイブにはメディアフォルダ (`data/tweets_media/`) が含まれるため、そこから画像を取得可能

---

## Step 6: デプロイワークフロー更新

**対象ファイル:**
- `.github/workflows/deploy-ohatui-preview.yml`

**変更内容:**
1. R2 バケット `ohatui-images` の作成ステップ追加
2. Pages プロジェクトへの R2 バインディング (`IMAGES`) 設定
3. 既存の D1 バインディング PATCH に R2 を追加統合
4. Post-deploy validation に `/api/image/` エンドポイントのテスト追加（プレースホルダー返却確認）

---

## 実装順序と依存関係

```
Step 1: R2バケット & バインディング設定
  ↓
Step 2: /api/image/[id].js 作成  ←  Step 1 完了必須（env.IMAGES バインディング）
  ↓
Step 3: collect.js 修正          ←  Step 1 完了必須（env.IMAGES バインディング）
  ↓  (Step 2, 3 は並行可能)
Step 4: フロントエンド修正        ←  Step 2 完了必須（APIエンドポイント存在）
  ↓
Step 5: Python スクリプト         ←  Step 1 完了必須（R2バケット存在）、独立して先に作成可能
  ↓
Step 6: デプロイワークフロー更新   ←  全ステップ完了後に統合テスト
```

---

## ファイル変更一覧

| ファイル | 種類 | 概要 |
|---------|------|------|
| `ohatsui/wrangler.toml` | 編集 | R2バインディングコメント追加 |
| `ohatsui/functions/api/image/[id].js` | **新規** | 画像配信API（R2→フォールバック取得→プレースホルダー） |
| `ohatsui/functions/api/collect.js` | 編集 | 収集時にR2へサムネイル保存追加 |
| `ohatsui/script.js` | 編集 | 画像URLを `/api/image/{id}` 経由に変更 |
| `ohatsui/collector/upload_images.py` | **新規** | ローカル実行の一括画像アップロードスクリプト |
| `.github/workflows/deploy-ohatui-preview.yml` | 編集 | R2バケット作成・バインディング設定追加 |
