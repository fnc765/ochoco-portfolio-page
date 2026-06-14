---
name: print-photo-e2e
description: PrintPhoto プロジェクト (particleAnimation/print-photo/) の e2eテストを追加・修正・実行するためのスキル。Playwright + http-server での実機Chromium検証、共通ヘルパー (tests/e2e/helpers.js) の使い方、ctx.filter のキャプチャ方法、ユニットテストと e2e の使い分け、コミット前チェックリストを含む。
---

# PrintPhoto E2Eテスト スキル

## このスキルが有効なケース

- 新しいスライダーやコントロールを実装したとき
- 撮影フロー（カメラ起動 → 撮影 → プレビュー → 保存・共有）の挙動が変わったとき
- カメラモックを使った画面遷移テストを書きたいとき
- スマホで「動かない」と報告された機能を実機Chromiumで切り分けたいとき
- 既存e2eテストを保守・追加・リファクタしたいとき

## プロジェクト構造 (テスト関連)

```
particleAnimation/print-photo/
├── tests/
│   ├── setup.js              # vitest 用 jsdom + Canvas mock
│   ├── unit/                 # ユニットテスト (vitest, jsdom)
│   │   ├── frame-render.test.js
│   │   ├── debug-log.test.js
│   │   ├── location.test.js
│   │   └── storage.test.js
│   └── e2e/                  # e2eテスト (Playwright, real Chromium)
│       ├── helpers.js        # 共通ヘルパー (★まずこれを読む)
│       ├── print-photo.spec.js
│       ├── temperature.spec.js
│       ├── exposure.spec.js
│       ├── text-input.spec.js
│       ├── save-share.spec.js
│       ├── title-font.spec.js
│       ├── test-assets/
│       │   └── transparent-sample.png
│       └── test-results/     # スクリーンショット・trace出力先
├── playwright.config.js      # baseURL=http://localhost:8080, chromium
├── vitest.config.js          # jsdom, exclude=tests/e2e/**
├── package.json              # scripts: test, e2e, serve
└── index.html, script.js, frame-render.js, camera.js, ...
```

> **注**: 旧版にあった `chroma-key.test.js`（ユニット）と `exposure-chromakey.spec.js` / `text-color.spec.js`（e2e）、`green-screen.png` はクロマキー処理廃止に伴い削除した。入力画像はアルファ付き透過PNG (`transparent-sample.png`) に統一されている。

## ユニットテストとe2eの使い分け

| 観点 | ユニット (vitest) | e2e (Playwright) |
|---|---|---|
| 実行速度 | ◎ 数百ms | △ 数秒/件 |
| 環境 | jsdom (Canvas は mock) | 実 Chromium |
| 検証できる粒度 | 関数・モジュール単位のロジック | DOM の存在・実イベント・描画結果 |
| canvas.filter の組み立て | 文字列観測 (mock はピクセル変換をスキップ) | 実描画でピクセル変換 |
| カメラAPI | mock不可 | `getUserMedia = () => new MediaStream()` でモック |
| セッション跨ぎ (`localStorage`) | 直接 `localStorage.getItem` | `page.evaluate(() => localStorage.getItem(...))` |
| スクリーンショット | n/a | `page.screenshot({ path: ... })` |
| 向いているケース | ロジックの境界値・例外パス | フロー全体・UI 統合・ビジュアル回帰 |

**原則: ロジックはユニットで、結合はe2eで。** 例えば「`renderFrame` が `hue-rotate(90deg)` を組み立てる」はユニットで、
「スライダーを操作して撮影後の `resultCanvas` に色温度が反映される」はe2eで検証する。

## 共通ヘルパー (tests/e2e/helpers.js)

ヘルパーを利用するには:

```js
import { test, expect, openApp, uploadAndOpenCompose, takePictureAndOpenPreview, setSliderValue, captureFilterOnDraw, captureRenderFrameFilters, snapshotSlider } from './helpers.js';
```

### 提供する関数

| 関数 | 用途 |
|---|---|
| `installApiMocks()` | init script 文字列。`context.addInitScript` で `getUserMedia` と `geolocation` をモック |
| `test` (fixture) | beforeEach で自動的に API モックを仕込む Playwright test |
| `openApp(page)` | `page.goto('/')` + メイン画面表示待機 |
| `uploadAndOpenCompose(page)` | 画像アップロード → カメラ起動 → 合成画面遷移 |
| `takePictureAndOpenPreview(page)` | シャッター押下 → プレビュー画面遷移 |
| `setSliderValue(page, id, value)` | input type=range の値変更 + input イベント発火 |
| `captureFilterOnDraw(page, sliderId, value)` | **overlay-canvas の `ctx.drawImage` 呼出時点の `ctx.filter` を配列で取得** |
| `captureRenderFrameFilters(page, sliderId, value)` | `document.createElement('canvas')` をフックして **renderFrame 内部の `ctx.filter` を取得** |
| `snapshotSlider(page, id)` | スライダーの `{ value, min, max }` を取得 |

### APIモックの自動適用

`helpers.js` の `test` fixture は `context.addInitScript` で `getUserMedia` と `geolocation` をモックする。
`import { test } from './helpers.js'` するだけで OK（`@playwright/test` からの生 `test` を使わない）。

## 最重要パターン: ctx.filter のキャプチャ

**`script.js` の `redrawOverlayCanvas` は drawImage 後に `ctx.filter = 'none'` に戻す**ため、
`page.evaluate(() => overlay.getContext('2d').filter)` だけだと常に `'none'` を観測してしまう。

代わりに `ctx.drawImage` 自体をフックして **呼出時点の `this.filter` を捕捉**する:

```js
const filters = await page.evaluate(async () => {
    const overlay = document.getElementById('overlay-canvas');
    const ctx = overlay.getContext('2d');
    const observed = [];
    const origDI = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (...args) {
        observed.push(this.filter);   // ← 呼出時点の this.filter
        return origDI(...args);
    };
    // ここでスライダー操作など
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    ctx.drawImage = origDI;
    return observed;
});
// 例: filters = ['hue-rotate(90deg)', 'hue-rotate(90deg)', ...]
expect(filters.some(f => f.includes('hue-rotate(90deg)'))).toBe(true);
```

ヘルパーの `captureFilterOnDraw` / `captureRenderFrameFilters` がこのパターンをラップしている。

## テスト命名規則

- ファイル名: `<feature>.spec.js` (`print-photo.spec.js`, `temperature.spec.js` …)
- テスト名: `E-<2文字ID>-<連番>: <検証内容の日本語>`
  - E-P*: 主要フロー (Print-photo)
  - E-T*: 色温度 (Temperature)
  - E-E*: 露光 (Exposure)
  - E-TX*: テキスト入力 (TeXt)
  - E-S*: 保存・共有 (Save/Share)
  - E-LW*: 位置情報警告 (Location Warning)

## 新しいe2eテストを書く手順

1. **対象機能のスライダー / ボタンが `data-testid` を持っているか確認**。持っていなければ `index.html` に追加。
2. **`tests/e2e/<feature>.spec.js` を新規作成**し、ヘルパーから必要な関数を import。
3. **`test.describe` でグルーピング**（任意、関連テストをまとめたい場合）。
4. **基本は `uploadAndOpenCompose` から始める**。合成画面を起点とするテストが多い。
5. **アサーションは Playwright の `expect` を使う**。Canvas ピクセル検証は `page.evaluate` 内で集計。
6. **視覚的回帰用にスクリーンショット保存**（任意）。`page.screenshot({ path: 'tests/e2e/test-results/<name>.png' })`。

## 実行コマンド

```bash
# ユニットテスト
npm test

# e2eテスト（全件）
npm run e2e
# または
npx playwright test

# e2eテスト（特定ファイルのみ）
npx playwright test temperature

# e2eテスト（特定テストID）
npx playwright test -g "E-T2"

# e2eテスト（headed モード・UI）
npx playwright test --ui
```

## トラブルシューティング

### 「クリックできない / element intercepts pointer events」

`<input type="file">` が `upload-preview` を覆っている場合、`.click({ force: true })` を使うか、
`page.locator('[data-testid="uploaded-preview"] img')` のように内側要素を直接クリックする。

### 「ctx.filter が常に 'none'」

drawImage 後の `ctx.filter` は描画後 `'none'` に戻されるのが正常。
`captureFilterOnDraw` ヘルパー（`ctx.drawImage` をフックする方式）を使う。

### 「スマホで動作しない」

1. `index.html` の `?v=N` を上げて commit & push（ブラウザキャッシュ回避）
2. スマホで `updateExposure` のデバッグログが出ているか確認（`script.js:765` の `addDebugLog`）
3. 該当機能の e2e テストを書いて実機 Chromium で切り分け

### 「テストが遅い」

- e2e テストは1ファイル 5〜8件 / 30〜60秒 が目安
- 並列度を増やす: `playwright.config.js` の `workers: undefined`（既定でCPU数まで並列）
- 視覚的回帰テストを絞り込む（必要なスライダー値の組合せのみ）

## ユニットテスト側の約束事 (参考)

ユニットテストで `frame-render.js` の `ctx.filter` を観測するときも同様のフックを使う:

```js
// frame-render.test.js の U-T2 など
const captured = { filterDuringOverlayDraw: null };
const originalCreate = document.createElement.bind(document);
document.createElement = (tag) => {
    const el = originalCreate(tag);
    if (tag === 'canvas') {
        const origGet = el.getContext.bind(el);
        el.getContext = (type) => {
            const ctx = origGet(type);
            if (type === '2d') {
                const origDI = ctx.drawImage.bind(ctx);
                ctx.drawImage = function (...args) {
                    if (args[0] === overlay && captured.filterDuringOverlayDraw === null) {
                        captured.filterDuringOverlayDraw = this.filter;
                    }
                    return origDI(...args);
                };
            }
            return ctx;
        };
    }
    return el;
};
```

`MockCanvasRenderingContext2D.drawImage` は `ctx.filter` を反映しない（mockはピクセル変換をスキップ）ため、
**文字列のアセンブリ** を直接検証する。`drawImage` フックで `this.filter` を観測して `hue-rotate(90deg)` の有無を確認する。

## コミット前チェックリスト

- [ ] `npm test` でユニット32件パス
- [ ] `npx playwright test` でe2e全件パス（CIではE-P16など外部URL依存はskip）
- [ ] 新規スライダー/ボタンに `data-testid` 付与
- [ ] 新規テストはヘルパー (`helpers.js`) を使う
- [ ] 視覚的回帰スクリーンショットは `tests/e2e/test-results/` 配下に出力
- [ ] `index.html` の `?v=N` を変更した場合、スマホでのキャッシュ無効化を意識
- [ ] コミットメッセージは `feat/fix/refactor/test(print-photo): ...` の prefix
