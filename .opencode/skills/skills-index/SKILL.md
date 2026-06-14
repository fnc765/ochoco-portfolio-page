---
name: skills-index
description: このリポジトリ (.opencode/skills/) で利用可能な全スキルの一覧と、それぞれの使い分け。新機能の実装・バグ修正・テスト追加などのタスクが来たとき、どのスキルを参照すべきかの判断ガイド。
---

# スキル一覧

このリポジトリには以下のスキルがあります。タスクに応じて適切なスキルを参照してください。

## タスク別ロードマップ

| タスク | 使うスキル |
|---|---|
| **PrintPhoto** に新スライダー/機能を追加 | `print-photo-e2e` + `vitest-unit-testing` |
| **おはついDB API** を修正・追加 | `ohatui-db-development` + `github-actions-deployment` |
| **おはついDB フロントエンド** を修正 | `ohatui-db-development` + `local-dev-server` |
| **D1 スキーマ** を変更 | `ohatui-db-development` |
| **GitHub Actions ワークフロー** を追加・修正 | `github-actions-deployment` |
| **新しい cron ワークフロー** を追加 | `github-actions-deployment` |
| **ユニットテスト** を追加 | `vitest-unit-testing` |
| **e2e テスト** を追加 | `print-photo-e2e` |
| **デプロイ後の動作検証** | `local-dev-server` + `github-actions-deployment` |
| **スマホで動作確認** するための準備 | `local-dev-server`（キャッシュ対策セクション） |
| **新メンバーへの引き継ぎ** | 全スキル |

## スキル一覧

### 1. `print-photo-e2e`
- **対象**: `particleAnimation/print-photo/` の Playwright e2e テスト
- **内容**: 共通ヘルパー (`tests/e2e/helpers.js`)、`ctx.filter` キャプチャパターン、命名規則、トラブルシューティング
- **よく使う場面**: PrintPhoto に新機能を実装した直後の動作検証

### 2. `ohatui-db-development`
- **対象**: `ohatsui/` (Cloudflare Functions + D1 + R2) + `particleAnimation/ohatui-db/` (フロント)
- **内容**: API 開発パターン、FixTweet API 連携、wrangler dev、migrations、collector、headless-admin
- **よく使う場面**: `/api/collect` や `/api/fetch-tweet` 等の修正

### 3. `github-actions-deployment`
- **対象**: `.github/workflows/` の全ワークフロー
- **内容**: Cloudflare API 連携、cron (UTC/JST) 計算、Discord 通知、post-deploy 検証
- **よく使う場面**: 新しい定期実行ジョブや CI ジョブを追加

### 4. `vitest-unit-testing`
- **対象**: `particleAnimation/print-photo/tests/unit/` の vitest テスト
- **内容**: jsdom + Canvas mock (setup.js) の使い方、IndexedDB フェイク、テストパターン
- **よく使う場面**: 新しいモジュールにユニットテストを追加

### 5. `local-dev-server`
- **対象**: 開発時のサーバー起動全般
- **内容**: http-server, wrangler pages dev, Playwright webServer, Python バックエンド
- **よく使う場面**: ローカルで動作確認したい時全般

## スキルの探し方

エージェントは以下の場合に該当スキルをロードしてください:

1. ユーザーから PrintPhoto / おはついDB / API / デプロイ / テスト / ローカル開発 関連の依頼が来た
2. コード中のパスや設定を見て、関連スキルを判断する
3. スキルの description に「いつ使うか」が明示されているので、タスク内容と照合

## スキルを追加するとき

新しいスキルは `.opencode/skills/<skill-name>/SKILL.md` に作成してください。
- 1スキル = 1ディレクトリ
- YAML frontmatter に `name` と `description` を含める
- `description` には「いつこのスキルを使うか」を具体的に書く
- 本文は Markdown、見出しは `##` `###` で構造化
- コードブロックはコピペ可能な完全形を心がける
