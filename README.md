# ochoco-portfolio-page

おちょこのポートフォリオサイト兼「おはついDB」アプリケーション。

**公開URL:** [https://fnchoco.com/](https://fnchoco.com/)

---

## 概要

このリポジトリは、おちょこのポートフォリオページと、毎日の「おはちょこ」「こんちょこ」「こんばんちょこ」ツイート（おはつい）を収集・閲覧する「おはついDB」のソースコードを管理しています。

- **ポートフォリオ**: Canvas パーティクルアニメーション背景の自己紹介ページ
- **おはついDB**: Twitter(X) のおはつい投稿を自動収集し、日別・統計・ギャラリーで閲覧できるアプリ

---

## ディレクトリ構成

```
ochoco-portfolio-page/
├── particleAnimation/          # フロントエンド（デプロイ対象）
│   ├── index.html              # ポートフォリオトップページ
│   ├── script.js / style.css   # メインのJS/CSS
│   ├── images/                 # 画像素材（profile, background等）
│   └── ohatui-db/              # おはついDBアプリ
│       ├── index.html          # おはついDBメイン画面
│       └── admin/index.html    # おはついDB管理画面（手動登録）
│
├── ohatsui/                    # バックエンドAPI（Cloudflare Pages Functions）
│   ├── functions/api/          # APIエンドポイント
│   │   ├── tweets.js           # ツイート一覧取得
│   │   ├── collect.js          # ツイート収集・保存
│   │   ├── fetch-tweet.js      # FixTweet API経由でツイート取得
│   │   ├── refresh-today.js    # 今日のツイート自動更新
│   │   └── image/[id].js       # R2サムネイル配信 + フォールバック
│   ├── collector/              # 画像一括アップロードスクリプト等
│   ├── schema.sql              # D1データベーススキーマ
│   └── wrangler.toml           # ローカル開発用設定
│
├── .github/workflows/           # CI/CD（GitHub Actions）
│   ├── deploy-cloudflare-pages.yml   # 自動デプロイ
│   ├── refresh-today-tweets.yml      # 1時間ごと自動更新
│   └── check-ohatsui-today.yml       # 日次整合性チェック
│
├── archive/                     # Twitterアーカイブデータ
├── plan.md                      # R2画像キャッシュ実装計画
├── plan.auto-update.md          # 自動更新機能実装計画
└── README.md                    # このファイル
```

---

## 技術スタック

| カテゴリ | 使用技術 |
|---------|---------|
| フロントエンド | HTML / CSS / JavaScript（Vanilla）|
| バックエンド | Cloudflare Pages Functions |
| データベース | Cloudflare D1 (`ohatui-tweets`) |
| オブジェクトストレージ | Cloudflare R2 (`ohatui-images`) |
| 外部API | FixTweet API (`api.fxtwitter.com`) |
| CI/CD | GitHub Actions |

---

## デプロイフロー

本プロジェクトは **Cloudflare Pages**（プロジェクト名: `ochoco-portfolio`）に自動デプロイされます。

`.github/workflows/deploy-cloudflare-pages.yml` の流れ：

1. `ohatsui/functions/` を `particleAnimation/functions/` にコピー
2. D1データベース + R2バケットの自動作成・バインディング設定
3. `particleAnimation/` ディレクトリを Cloudflare Pages にデプロイ

**トリガー**: `main` ブランチへの push、または手動実行 (`workflow_dispatch`)

---

## APIエンドポイント

| メソッド | エンドポイント | 説明 |
|---------|-------------|------|
| GET | `/api/tweets` | 全ツイート一覧を取得（D1から） |
| POST | `/api/collect` | ツイートを収集・D1に保存（認証要） |
| GET | `/api/fetch-tweet?url=...` | FixTweet API経由でツイート詳細を取得 |
| GET | `/api/refresh-today` | 今日のツイートのいいね/RT数を更新 |
| GET | `/api/image/<tweet_id>` | R2サムネイル配信。未キャッシュ時はTwitterから取得→R2保存 |
| GET | `/api/check-today` | 今日のツイート存在確認 |

---

## 自動更新（GitHub Actions Cron）

フロントエンドの自動更新に加え、サーバー側で確実にデータを更新するための cron ジョブがあります。

- **スケジュール**: JST 6:00〜23:00 の毎時00分（UTC 21:00〜14:00）
- **実行内容**: `GET /api/refresh-today` を呼び出し、いいね数・RT数を更新
- **手動実行**: `workflow_dispatch` で可能

---

## おはついDB について

「おはついDB」は、おちょこの毎日の「おはちょこ」「こんちょこ」「こんばんちょこ」ツイートを自動収集・蓄積し、以下の機能で閲覧できるアプリケーションです。

- **今日のおはつい**: 今日のツイートとエンゲージメント（いいね/RT）表示
- **去年の今日**: 過去同日のおはついを振り返り
- **統計**: 累計投稿数、いいね数、人気投稿ランキング
- **ギャラリー**: 画像付きツイートのサムネイル閲覧
- **管理画面**: 手動でのツイート登録・管理

画像は Cloudflare R2 にキャッシュされ、配信時は `/api/image/<id>` 経由で高速に表示されます。

---

## ライセンス

このプロジェクトは [MIT License](./particleAnimation/LICENSE) のもとで公開されています。

---

## 備考

- ローカル開発時は `ohatsui/` ディレクトリで `wrangler pages dev . --d1=DB --r2=IMAGES` を実行してください。
- D1 / R2 の本番バインディングは GitHub Actions 経由で Cloudflare API に自動設定されます。
