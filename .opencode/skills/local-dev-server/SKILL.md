---
name: local-dev-server
description: このリポジトリのローカル開発サーバー起動方法。フロントエンド (http-server), Cloudflare Functions (wrangler pages dev), Playwright e2e サーバー, Python バックエンドの起動パターン、ポート衝突回避、ブラウザ・curl での動作確認、COLLECT_SECRET の渡し方を整理したスキル。
---

# ローカル開発サーバー スキル

## このスキルが有効なケース

- フロントエンド（`particleAnimation/` 配下）のローカル動作確認
- おはついDB API（`ohatsui/functions/api/`）のローカル動作確認
- Playwright e2e テスト用のサーバー起動
- 画像アップロード等の Python バックエンド実行
- ポート衝突・エラー時のトラブルシューティング

## 3 つのサーバー構成

| 用途 | サーバー | ポート | コマンド |
|---|---|---|---|
| フロントエンド単体 | `http-server` | 8080 | `npx http-server particleAnimation/ -p 8080` |
| Playwright e2e | `http-server` | 8080 | `npx playwright test` (webServer 自動起動) |
| Cloudflare Functions | `wrangler pages dev` | 8788 | `cd ohatsui && npx wrangler pages dev . --d1=DB --r2=IMAGES` |

**Playwright と フロントエンド手動確認は ポート 8080 を共有**。Playwright 実行中は別ターミナルで `http-server` を立てない。

## フロントエンド単体

### 起動

```bash
# プロジェクトルート or サブディレクトリで
npx http-server particleAnimation/ -p 8080

# -s でサイレント（リクエストログを抑制）
npx http-server particleAnimation/ -p 8080 -s
```

### アクセス URL

```
http://localhost:8080/                          # ポートフォリオ トップ
http://localhost:8080/print-photo/             # PrintPhoto
http://localhost:8080/ohatui-db/                # おはついDB メイン
http://localhost:8080/ohatui-db/admin/          # おはついDB 管理
```

### バックグラウンド起動

```bash
# nohup で起動してログをファイルに
nohup npx http-server particleAnimation/ -p 8080 > /tmp/http-server.log 2>&1 &

# 終了
pkill -f "http-server.*8080"
```

### Python 代替（python3 が入っていれば依存少）

```bash
cd particleAnimation
python3 -m http.server 8080
```

## Playwright e2e サーバー

`playwright.config.js` で webServer 自動起動が設定されている:

```js
webServer: {
    command: 'npx http-server ./ -p 8080 -s',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
}
```

ローカル実行時 (`process.env.CI` 未設定) は既存サーバーがあれば再利用。CI では自動起動。

```bash
# そのまま実行（サーバー自動起動・終了）
npx playwright test

# 特定のテストのみ
npx playwright test temperature -g "E-T2"
```

## Cloudflare Functions (wrangler pages dev)

### 起動

```bash
cd ohatsui
npx wrangler pages dev . --d1=DB --r2=IMAGES
# → http://localhost:8788 で公開
```

D1 はローカルで SQLite に自動保存（`.wrangler/state/v3/d1/` 配下）。
R2 はローカルエミュレーション（MinIO 風、`:8788` の binding 経由）。

### 環境変数の渡し方

`.dev.vars` ファイルを使う（`.dev.vars` は gitignore 推奨）:

```bash
# ohatsui/.dev.vars
COLLECT_SECRET=local-dev-secret-xxxx
```

`wrangler pages dev` が自動で読み込む。

シェル変数で渡す:

```bash
COLLECT_SECRET=local-dev-secret-xxxx npx wrangler pages dev . --d1=DB --r2=IMAGES
```

### API 動作確認

別ターミナルで:

```bash
# 認証不要 API
curl -s http://localhost:8788/api/tweets | jq

# 認証必要 API
curl -s -H "Authorization: Bearer $COLLECT_SECRET" \
  http://localhost:8788/api/refresh-today | jq

# FixTweet 経由ツイート取得
curl -s "http://localhost:8788/api/fetch-tweet?url=https://x.com/ochoco0215/status/2033698551092617246" | jq
```

### ローカル D1 のマイグレーション

```bash
# マイグレーションファイルをローカル D1 に適用
npx wrangler d1 execute ohatui-tweets --local \
  --file=ohatsui/migrations/001_add_sonota_type.sql

# インライン SQL
npx wrangler d1 execute ohatui-tweets --local \
  --command="SELECT * FROM tweets LIMIT 5;"

# 本番 D1 への直接実行は別途確認（デプロイ WF ではやらない）
npx wrangler d1 execute ohatui-tweets --remote \
  --file=ohatsui/migrations/001_add_sonota_type.sql
```

### トラブルシューティング

| エラー | 対処 |
|---|---|
| `Binding DB not found` | `--d1=DB` オプションを付ける |
| `IMAGES binding not configured` | `--r2=IMAGES` を付ける |
| ポート 8788 が使用中 | `lsof -i :8788` で確認、kill |
| D1 の状態がおかしい | `rm -rf .wrangler/state` で初期化（**要注意: データ消える**） |
| R2 のデータが消えた | 同上（ローカル R2 も消える） |

## Python バックエンド

`ohatsui/collector/upload_images.py` 等は Cloudflare API を直接叩くので、サーバーは不要。

```bash
# 依存インストール
pip install -r ohatsui/collector/requirements.txt

# 環境変数で認証情報を渡す
CF_ACCOUNT_ID=xxx \
CF_API_TOKEN=xxx \
CF_D1_DATABASE_ID=xxx \
CF_R2_ACCESS_KEY_ID=xxx \
CF_R2_SECRET_ACCESS_KEY=xxx \
  python ohatsui/collector/upload_images.py
```

詳細は `ohatsui/collector/upload_images.py` の冒頭コメント参照。

## カメラ・位置情報のテスト時の注意

カメラ・位置情報を要する機能（PrintPhoto の合成、`/admin` の手動登録）は**実機または Playwright の API モック**でしか検証できない:

### 実機で確認

- **HTTPS 必須** (`localhost` / `127.0.0.1` は例外)
- スマホのブラウザで `https://<LAN-IP>:8080/` を開いて確認
- 証明書警告が出る場合は `chrome://flags/#unsafely-treat-insecure-origin-as-secure` で開発モードにする

### Playwright で確認

`tests/e2e/helpers.js` の `installApiMocks()` で `getUserMedia` / `geolocation` をモック:

```js
import { installApiMocks } from './helpers.js';

test.beforeEach(async ({ context }) => {
    await context.addInitScript({ content: installApiMocks() });
});
```

モック内容:

```js
navigator.mediaDevices.getUserMedia = async () => new MediaStream();
navigator.geolocation.getCurrentPosition = (success) => {
    success({ coords: { latitude: 35.0, longitude: 139.0 } });
};
```

## ポート使用状況の確認

```bash
# 使用中のポートを確認
ss -tlnp 2>/dev/null | grep -E ':(8080|8788)'
# or
lsof -i :8080 -i :8788

# プロセスを kill
kill <PID>
# or まとめて
pkill -f "http-server.*8080"
pkill -f "wrangler"
```

## フロントのキャッシュ問題

CSS/JS のバージョン番号を更新して commit & push する:

```html
<!-- particleAnimation/print-photo/index.html -->
<link rel="stylesheet" href="style.css?v=4">
<script type="module" src="script.js?v=4"></script>
```

スマホで動作確認する手順:

1. `?v=N` を上げる
2. commit & push
3. スマホで **強制リロード** (Cmd+Shift+R / ハード再読み込み)
4. デバッグログパネル（PrintPhoto の `画面2` タブ）で挙動確認

## 動作確認のチェックリスト

機能追加・修正後に:

- [ ] `npx http-server particleAnimation/ -p 8080 -s` で起動できる
- [ ] ブラウザで該当ページを開いてエラーなし（Console タブ確認）
- [ ] スマホ実機でも `?v=N` 上げて確認
- [ ] API 変更時は `wrangler pages dev` で `curl` 確認
- [ ] `npm test`（ユニット）と `npm run e2e`（Playwright）両方がパス
- [ ] 変更したワークフローの `workflow_dispatch` で手動実行確認

## よく使うワンライナー

```bash
# フロント + API 同時起動
npx http-server particleAnimation/ -p 8080 -s &
cd ohatsui && npx wrangler pages dev . --d1=DB --r2=IMAGES

# ログ確認
tail -f /tmp/http-server.log

# ポート強制解放
sudo fuser -k 8080/tcp
sudo fuser -k 8788/tcp
```
