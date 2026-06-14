---
name: vitest-unit-testing
description: vitest によるユニットテスト作成スキル。jsdom + Canvas mock (tests/setup.js) の使い方、MockCanvasRenderingContext2D の制約 (filter/transform は反映されない)、IndexedDB フェイク、パターン別のテストコード雛形 (Canvas, 純粋関数, 非同期, IndexedDB)、e2e との使い分けを含む。
---

# vitest ユニットテスト スキル

## このスキルが有効なケース

- `particleAnimation/print-photo/tests/unit/` に新しいテストファイルを追加するとき
- Canvas API に依存するロジック（chroma-key, frame-render 等）のテストを書くとき
- IndexedDB をモックしてテストするとき
- 純粋関数 (date utils, location utils, storage utils 等) のテストを書くとき
- テストの「何をユニットで」「何をe2eで」検証するか判断するとき

## プロジェクト構成

```
particleAnimation/print-photo/
├── vitest.config.js           # environment: 'jsdom', setupFiles, exclude e2e
├── tests/
│   ├── setup.js               # MockCanvasElement, MockCanvasRenderingContext2D, FakeIDB
│   ├── unit/                  # ユニットテスト
│   │   ├── chroma-key.test.js
│   │   ├── frame-render.test.js
│   │   ├── debug-log.test.js
│   │   ├── location.test.js
│   │   └── storage.test.js
│   └── e2e/                   # Playwright (別スキル: print-photo-e2e)
└── package.json
```

## vitest.config.js

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        exclude: ['tests/e2e/**', 'node_modules/**'],
    },
});
```

- `globals: true` で `describe` / `it` / `expect` を import なしで使える
- `setupFiles: ['./tests/setup.js']` でモックを自動ロード
- e2e は `exclude` で除外（`npm test` には含めない、`npm run e2e` で実行）

## 実行コマンド

```bash
# ユニットテスト
npm test

# watch モード
npm run test:watch

# カバレッジ
npm run test:coverage
```

## ユニット vs e2e の判断基準

| 検証内容 | ユニット | e2e |
|---|---|---|
| 関数のロジック境界値・例外パス | ◎ | △ |
| モジュール間の結合 | △ | ◎ |
| 実 DOM イベント・CSS 適用 | n/a | ◎ |
| Canvas ピクセル変換 | △ (mock は文字列のみ検証) | ◎ (実 Chromium) |
| カメラ API | × (mock 不可) | ◎ |
| IndexedDB 永続化 | ○ (FakeIDB で) | ◎ |
| localStorage 読み書き | ◎ | ○ |
| ネットワークリクエスト | △ (fetch モック) | ◎ |
| 実行速度 | 100ms〜数秒/ファイル | 数秒〜数十秒/テスト |

**原則: ロジックはユニットで、結合はe2eで。** Canvas の `ctx.filter` 組み立てはユニット（mock は文字列を保持する）、スライダー操作による実際の反映はe2e（実 Chromium でピクセル変換）。

## tests/setup.js の制約

### MockCanvasRenderingContext2D

jsdom には Canvas API が無いため、完全な mock を `tests/setup.js` で定義している。**ピクセル変換は実装されていない**ため、Canvas 描画結果そのものは検証できない。代わりに:

- **drawImage は単純なコピー**（filter/transform/composite 反映なし）
- **ctx.filter は文字列として保持**されるだけで描画に影響しない
- **ctx.translate / scale / save / restore は no-op**

```js
// 描画フックで ctx.filter 文字列を観測するパターン
const captured = { filterDuringDraw: null };
const overlay = document.createElement('canvas');
const ctx = overlay.getContext('2d');
const origDI = ctx.drawImage.bind(ctx);
ctx.drawImage = function (...args) {
    if (captured.filterDuringDraw === null) {
        captured.filterDuringDraw = this.filter;  // ← 文字列を捕捉
    }
    return origDI(...args);
};
// ... 描画呼び出し ...
expect(captured.filterDuringDraw).toContain('hue-rotate(90deg)');
```

これは `frame-render.test.js` の U-T1〜U-T8 で実際に使われているパターン。

### MockCanvasElement.toBlob / toDataURL

常に同じダミー値を返す:

```js
toBlob(callback, type, quality) { callback(new Blob(['mock'], { type: type || 'image/png' })); }
toDataURL(type) { return 'data:image/png;base64,mock'; }
```

「`toDataURL` が呼べる」「Blob が生成される」のような API 互換性検証はできるが、内容が正しいかは検証できない。

### IndexedDB (FakeIDB)

`tests/setup.js` 内の `FakeIDBObjectStore` / `FakeIDBTransaction` / `FakeIDBDatabase` で IndexedDB を模倣。**グローバルで1つの DB インスタンスが共有される**（テスト間でデータが残る）:

```js
beforeEach(() => {
    global.indexedDB._reset();  // テスト毎にリセット
});
```

`storage.test.js` で実際に利用されている。

### document.createElement の限定実装

```js
global.document.createElement = (tag) => {
    if (tag === 'canvas') return new MockCanvasElement(100, 100);
    return {};
};
```

`'canvas'` 以外（`'div'`, `'button'` 等）は空オブジェクトを返す。`document.createElement('div')` してもHTMLElement にはならないので注意。

## テストパターン雛形

### 1. 純粋関数のテスト

```js
import { describe, it, expect } from 'vitest';

describe('ユーティリティ関数', () => {
    it('U-U1: 関数が期待値を返す', () => {
        expect(myFunc('input')).toBe('expected output');
    });

    it('U-U2: 境界値', () => {
        expect(myFunc(0)).toBe(0);
        expect(myFunc(-1)).toBe(null);
    });

    it('U-U3: 例外パス', () => {
        expect(() => myFunc(null)).toThrow('invalid input');
    });
});
```

### 2. Canvas 系（ctx.filter 観測パターン）

```js
import { describe, it, expect } from 'vitest';
import { renderFrame } from '../../frame-render.js';

describe('frame-render', () => {
    function captureFilter(opts) {
        const captured = { filterDuringDraw: null };
        const overlay = opts.overlay;

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
                            if (args[0] === overlay && captured.filterDuringDraw === null) {
                                captured.filterDuringDraw = this.filter;
                            }
                            return origDI(...args);
                        };
                    }
                    return ctx;
                };
            }
            return el;
        };

        try {
            renderFrame(opts);
        } finally {
            document.createElement = originalCreate;
        }
        return captured;
    }

    it('U-F1: デフォルト filter は none', () => {
        const bg = document.createElement('canvas');
        bg.width = 100; bg.height = 100;
        const overlay = document.createElement('canvas');
        overlay.width = 50; overlay.height = 50;

        const c = captureFilter({
            background: bg,
            overlay,
            overlayTransform: { x: 0, y: 0, scale: 1 },
            overlayCssWidth: 100,
            overlayCssHeight: 100,
            temperature: 0,
        });
        expect(c.filterDuringDraw).toBe('none');
    });
});
```

**注意:** 背景→overlay の順で drawImage が呼ばれるので、最初の drawImage には `filter: 'none'`、2 回目以降に overlay への drawImage の `filter` が入る。最初の発火を overlay 以外で取り逃がすのを防ぐため、`args[0] === overlay` の比較を入れる。

### 3. 非同期 / IndexedDB テスト

```js
import { describe, it, expect, beforeEach } from 'vitest';

describe('storage', () => {
    beforeEach(() => {
        global.indexedDB._reset();  // 必ずリセット
    });

    it('U-S1: データを保存して取得できる', async () => {
        const id = await saveThumbnail('data:image/png;base64,test');
        expect(id).toBeTruthy();
        const data = await loadThumbnail(id);
        expect(data).toBe('data:image/png;base64,test');
    });

    it('U-S2: 存在しないキーは undefined', async () => {
        const data = await loadThumbnail('not-exists');
        expect(data).toBeUndefined();
    });
});
```

`storage.js` のように Promise ベースの API を扱う場合、`async/await` で素直に書ける。`FakeIDBObjectStore.put` 等のレスポンスは同期的に `onsuccess` を呼ぶので、await で resolve される。

### 4. global.fetch モック

```js
import { describe, it, expect, vi } from 'vitest';

describe('API client', () => {
    it('U-A1: fetch 結果をパースする', async () => {
        const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ id: '123', text: 'hello' }),
        });

        const result = await fetchTweet('https://x.com/.../123');
        expect(result.id).toBe('123');
        expect(mockFetch).toHaveBeenCalledOnce();

        mockFetch.mockRestore();
    });
});
```

## 命名規則

- ファイル名: `<module>.test.js`（`chroma-key.test.js`, `frame-render.test.js`）
- テスト名: `U-<2文字ID>-<連番>: <検証内容の日本語>`
  - U-F*: frame-render
  - U-C*: chroma-key
  - U-D*: debug-log
  - U-L*: location
  - U-S*: storage
  - U-T*: temperature（frame-render 内）

## トラブルシューティング

### 「`document.createElement` is not a function」

setup.js で `global.document` を上書きしているが、プロパティが欠けている可能性。`document.createElement` を含む全プロパティを確認。

### 「`canvas.getContext('2d')` が null」

`MockCanvasElement` は `getContext('2d')` のみ実装。それ以外のコンテキストは null。

### 「`ctx.filter` を変更しても描画に反映されない」

**正常な挙動**。mock は `ctx.filter` を文字列として保持するだけで描画変換は行わない。検証は `drawImage` フックで文字列を捕捉する。

### 「IndexedDB テストが状態を引きずる」

`beforeEach` で `global.indexedDB._reset()` を呼ぶ。

### 「`indexedDB` is not defined」

setup.js 末尾の `global.indexedDB = { ... }` 定義。`global.indexedDB._reset` も含めて確認。

## コミット前チェックリスト

- [ ] `npm test` で全テストパス
- [ ] 新規モジュールのテストには `data-testid` 不要（純粋関数が中心）
- [ ] IndexedDB テストは `beforeEach` で `_reset()`
- [ ] Canvas 描画結果ではなく `ctx.filter` 文字列の観測で検証
- [ ] 非同期テストは `async/await` で書く
- [ ] テスト名: `U-<2文字ID>-<連番>: <日本語説明>`
- [ ] コミットメッセージ: `test(print-photo): ...` の prefix
