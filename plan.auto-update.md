# 今日のおはつい 自動更新機能 — 実装計画

## 概要

「今日のおはつい」セクションを1時間ごとに自動更新する。
ページ全体のリロードではなく、APIから最新データを取得し、今日のおはついセクションのみ差分更新する。

## 現状の仕組み

- `DOMContentLoaded` 時に `loadTweets()` → `initData()` → `renderToday()` を1回だけ実行
- データは `tweets`, `tweetsByDate`, `milestones` などのモジュールスコープ変数に保持
- `/api/tweets` はサーバー側5分キャッシュ（`max-age=300`）
- 自動更新の仕組みは**一切なし**

## 変更対象ファイル

- `ohatsui/script.js` — フロントエンドのみ（1ファイル）

## 実装内容

### 1. 今日のおはつい専用の更新関数 `refreshToday()` を追加

```js
async function refreshToday() {
    try {
        const res = await fetch('/api/tweets', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response');

        // データを再初期化
        initData(data);
        filteredTweets = [...tweets];

        // 今日のおはついセクションのみ再描画
        renderToday();

        console.log(`[ohatsui] 今日のおはつい自動更新完了 (${new Date().toLocaleTimeString('ja-JP')})`);
    } catch (e) {
        console.warn('[ohatsui] 自動更新失敗:', e.message);
        // 失敗しても既存表示を維持（何もしない）
    }
}
```

**ポイント:**
- `cache: 'no-cache'` でブラウザキャッシュをバイパスし、サーバーに再検証を要求
- `initData()` でデータ全体を再構築（milestones等の整合性を保つため）
- 描画は `renderToday()` のみ実行（他セクションは更新不要）
- エラー時は静かに失敗し、既存の表示を維持

### 2. DOMContentLoaded 内で `setInterval` を設定

```js
// 今日のおはつい自動更新（1時間ごと）
setInterval(refreshToday, 60 * 60 * 1000);
```

**配置場所:** `DOMContentLoaded` コールバックの最後（イベントリスナー設定後）

### 3. ページ可視性に応じた制御（Page Visibility API）

タブが非アクティブの間はポーリングを停止し、タブに戻った時に即座に更新する。

```js
let autoUpdateTimer = null;
let lastRefreshTime = Date.now();
const AUTO_UPDATE_INTERVAL = 60 * 60 * 1000; // 1時間

function startAutoUpdate() {
    stopAutoUpdate();
    autoUpdateTimer = setInterval(refreshToday, AUTO_UPDATE_INTERVAL);
}

function stopAutoUpdate() {
    if (autoUpdateTimer) {
        clearInterval(autoUpdateTimer);
        autoUpdateTimer = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoUpdate();
    } else {
        // タブ復帰時、前回更新から1時間以上経過していたら即時更新
        if (Date.now() - lastRefreshTime >= AUTO_UPDATE_INTERVAL) {
            refreshToday();
        }
        startAutoUpdate();
    }
});
```

**理由:**
- バックグラウンドタブでの無駄なAPIリクエストを防止
- タブ復帰時に経過時間チェック → 必要なら即時更新で「開いたら最新」を保証

## 変更しないもの

- バックエンドAPI（`/api/tweets`）— 変更不要
- 他のセクション（去年の今日、統計、ギャラリー等）— 更新対象外
- `mock-data.js` — 変更不要

## 動作フロー

```
ページ読み込み
  ↓
DOMContentLoaded → loadTweets() → initData() → renderToday() + 他セクション描画
  ↓
startAutoUpdate() でタイマー開始（1時間間隔）
  ↓
[1時間後] refreshToday()
  → /api/tweets (cache: no-cache)
  → initData(data)
  → renderToday() のみ再描画
  → lastRefreshTime 更新
  ↓
[タブ非表示] stopAutoUpdate() でタイマー停止
  ↓
[タブ復帰] 経過チェック → 必要なら即時 refreshToday() → startAutoUpdate() で再開
```

## 実装ステップ

1. `refreshToday()` 関数を `loadTweets()` の近くに追加
2. 自動更新管理変数・関数（`startAutoUpdate`, `stopAutoUpdate`）を追加
3. `visibilitychange` イベントリスナーを追加
4. `DOMContentLoaded` の最後で `startAutoUpdate()` を呼び出す
