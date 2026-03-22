# 今日のおはつい 自動更新機能 — 実装計画

## 概要

「今日のおはつい」ツイートのいいね数・RT数を1時間ごとにXから再取得してD1を更新し、
ブラウザ表示も自動で最新化する。

## 現状の仕組み

- ツイート登録時に `collect.js` 内の `fetchTweetFromFxTwitter()` で FixTweet API からデータ取得
- FixTweet API は無料・APIキー不要で `like_count`, `retweet_count` を返す
- フロントエンドは `DOMContentLoaded` で1回だけ `/api/tweets` を取得して描画
- 自動更新の仕組みは**一切なし**

## 変更対象ファイル

1. **`ohatsui/functions/api/refresh-today.js`** — 新規作成（バックエンドAPI）
2. **`ohatsui/script.js`** — フロントエンド自動更新ロジック追加

## 実装内容

### 1. 新規API: `GET /api/refresh-today`

今日のおはついツイートの最新エンゲージメントをXから取得し、D1を更新して返す。

**処理フロー:**
1. D1から今日の日付のツイートを取得（`created_at` が今日のもの）
2. 各ツイートについて FixTweet API (`api.fxtwitter.com`) で最新データを取得
   - `collect.js` と同じ `fetchTweetFromFxTwitter()` パターンを再利用
3. `like_count`, `retweet_count` を D1 で UPDATE
4. 更新後のツイートデータをレスポンスとして返す

**認証:** 不要（読み取り＋エンゲージメント更新のみ、GETリクエスト）

**レスポンス例:**
```json
{
  "updated": [
    {
      "id": "2032988351293526350",
      "tweet_id": "2032988351293526350",
      "text": "おはちょこ～🍫！",
      "created_at": "2026-03-22T01:12:00.000Z",
      "image_url": "https://pbs.twimg.com/media/...",
      "like_count": 25,
      "retweet_count": 3,
      "type": "ohachoco"
    }
  ],
  "refreshed_at": "2026-03-22T10:00:00.000Z"
}
```

**今日のツイートがない場合:**
```json
{ "updated": [], "refreshed_at": "..." }
```

### 2. フロントエンド: 1時間ごとの自動更新

**`refreshToday()` 関数:**
1. `GET /api/refresh-today` を呼び出し（Xからの最新データ取得＋D1更新がサーバー側で実行される）
2. レスポンスの更新済みツイートデータでローカルの `tweets` / `tweetsByDate` を差分更新
3. `renderToday()` で「今日のおはつい」セクションのみ再描画

**タイマー管理（Page Visibility API）:**
- タブがアクティブな間: `setInterval` で1時間ごとに `refreshToday()` 実行
- タブが非表示になったら: タイマー停止（無駄なAPI呼び出し防止）
- タブに戻った時: 前回更新から1時間以上経過していたら即時更新 → タイマー再開

## 動作フロー

```
ページ読み込み
  ↓
DOMContentLoaded → loadTweets() → initData() → renderToday() + 他セクション描画
  ↓
startAutoUpdate() でタイマー開始（1時間間隔）
  ↓
[1時間後] refreshToday()
  → GET /api/refresh-today
    → D1 から今日のツイート取得
    → FixTweet API で各ツイートの最新 like_count / retweet_count 取得
    → D1 を UPDATE
    → 更新済みデータを返す
  → ローカルデータを差分更新
  → renderToday() のみ再描画
  ↓
[タブ非表示] stopAutoUpdate() でタイマー停止
  ↓
[タブ復帰] 経過チェック → 必要なら即時 refreshToday() → startAutoUpdate() で再開
```

## 変更しないもの

- `/api/tweets` — 変更不要
- `/api/collect` — 変更不要（FixTweet パターンを参考にするが、コード共有はしない）
- 他のセクション（去年の今日、統計、ギャラリー等）— 更新対象外
- `mock-data.js` — 変更不要

## 実装ステップ

1. ✅ `ohatsui/functions/api/refresh-today.js` を新規作成
   - D1から今日のツイート（JST基準）を取得
   - FixTweet APIで最新エンゲージメント取得
   - D1のlike_count/retweet_countをUPDATE
   - 更新済みデータを返す
2. ✅ `.github/workflows/refresh-today-tweets.yml` を新規作成
   - GitHub Actions cron で JST 6:00〜23:00 の毎時00分に実行
   - `GET /api/refresh-today` を呼び出してD1を更新
   - ページを開いていなくてもサーバー側で自動更新される
3. `ohatsui/script.js` に `refreshToday()` 関数を追加（フロントエンド側、任意）
   - `/api/refresh-today` を呼び出し → ローカルデータ更新 → renderToday()
4. `ohatsui/script.js` に自動更新タイマー管理を追加（フロントエンド側、任意）
   - `startAutoUpdate()` / `stopAutoUpdate()` / `visibilitychange` リスナー
5. `DOMContentLoaded` の最後で `startAutoUpdate()` を呼び出す（フロントエンド側、任意）

## サーバー側定期実行（GitHub Actions cron）

フロントエンドの `setInterval` はブラウザを開いている時だけ動作するため、
サーバー側で確実にデータを更新する仕組みとして GitHub Actions cron を採用。

- **スケジュール:** JST 6:00〜23:00 の毎時00分（UTC 21:00〜14:00）
- **実行内容:** `curl` で `GET /api/refresh-today` を呼び出し
- **手動実行:** `workflow_dispatch` で手動トリガーも可能
- **コスト:** GitHub Actions 無料枠内（月2,000分）で十分収まる
