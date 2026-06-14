# PrintPhoto 要件仕様書

## 1. 概要

| 項目 | 内容 |
|---|---|
| **サービス名** | PrintPhoto |
| **ハッシュタグ** | `#PrintPhoto` |
| **概要** | ブラウザ上でカメラ映像と透過PNG画像をリアルタイム合成し、フレーム付き画像を生成・保存・共有できるローカル完結型の静的ページ |
| **配置場所** | `particleAnimation/print-photo/` |
| **サーバー役割** | 静的サイト配信のみ。画像処理・保存は一切行わない |
| **ターゲット** | VRChatユーザーなど、アルファチャンネル付き透過画像を現実世界の風景と合成したい人 |

---

## 2. デザイン仕様

既存の**ポートフォリオページ**・**おはついDB**と統一したデザイン言語を使用

| 項目 | 値 |
|---|---|
| フォント | `M PLUS Rounded 1c`, `Hiragino Kaku Gothic ProN`, `Meiryo`, sans-serif |
| 背景色 | `#141414`（暗色） |
| テキスト色 | `#ffffff` |
| アクセント色 | `rgba(220, 53, 69, ...)`（赤系） |
| UIスタイル | ガラスカード風（`rgba(255,255,255,0.06)`背景 + `rgba(255,255,255,0.12)`枠線 + `border-radius`） |
| Favicon | 既存と同じ🍫SVGアイコン |
| Font Awesome | 6.5.1 CDN |

---

## 3. フレーム構成仕様

参考画像（`VRChat_2026-05-07_23-47-09.229_2048x1440.png`）の解析結果を踏襲

| 項目 | 値 |
|---|---|
| **フレーム全体サイズ** | 2048 × 1440 px（アスペクト比 64:45） |
| **合成エリア（カメラ映像）** | 1920 × 1080 px（アスペクト比 **16:9**） |
| **上余白** | 69 px（全体高さの **4.8%**） |
| **下余白（テキストエリア含む）** | 291 px（全体高さの **20.2%**） |
| **左右余白** | 各 64 px（全体幅の **3.1%**） |
| **合成エリア配置** | フレーム内で上寄り |

### フレーム内テキスト配置
| 位置 | 内容 | 入力形式 |
|---|---|---|
| **下部中央** | タイトル | 手入力テキスト |
| **下部中央（タイトル下）** | コメント | 手入力テキスト（複数行可） |
| **左下** | 撮影者 | 手入力テキスト |
| **右下** | 日付 + 撮影場所 | 日付:自動（手動変更可）、場所:位置情報/手入力 |

---

## 4. 機能要件

### 4.1 画像入力・透過処理

| 項目 | 仕様 |
|---|---|
| **入力方法** | `<input type="file" accept="image/*">` でファイル選択 |
| **デフォルト入力形式** | **アルファチャンネル付きPNG**（透過PNG）。JPEG等の非透過画像はアルファ値0の領域が黒で塗りつぶされて表示される |
| **色選択** | なし。クロマキー処理は廃止し、入力画像が持つアルファチャンネルをそのまま利用する |
| **調整パラメータ** | なし（透過処理に関するスライダーは削除） |
| **処理方式** | 読み込んだ画像をそのままCanvasに描画し、HTML5 Canvas 2D APIの標準合成（`globalCompositeOperation = 'source-over'`）でカメラ映像に重ねる。ピクセル単位の自前処理は実施しない（ローカル完結） |
| **サムネイルキャッシュ** | `IndexedDB` で過去に読み込んだ画像のサムネイル（DataURL/Blob）を保存。上限**10件**。手動削除可能 |

### 4.2 カメラ合成ビュー

| 項目 | 仕様 |
|---|---|
| **カメラ起動** | `getUserMedia` API。スマホなら外カメラ（`facingMode: 'environment'`）を優先 |
| **レイアウト** | 白フレーム内にカメラ映像（背景）＋ 透過画像（前景）を重ねる |
| **画像操作** | **ドラッグ**で移動、**ピンチ（マルチタッチ）**で拡縮可能 |
| **露光調整** | カメラ映像に対して明るさ/コントラスト調整スライダーを配置 |
| **色温度調整** | 透過画像に対して色温度スライダー(-100〜+100)を配置。+で暖色、-で寒色(CSS filter hue-rotate 方式) |
| **合成エリア** | 16:9で固定、フレーム内上寄り配置 |

### 4.3 テキスト入力（撮影後画面）

撮影後に合成結果をプレビューしつつ、テキスト入力画面に遷移

| 項目 | 入力形式 | 備考 |
|---|---|---|
| **タイトル** | 手入力（1行） | |
| **コメント** | 手入力（複数行） | |
| **撮影者** | 手入力 | `localStorage` で前回値を保存 |
| **日付** | 自動（YYYY-MM-DD形式） | 手動変更も可能 |
| **撮影場所** | ①「位置情報を取得」ボタン → Geolocation API で現在地取得<br>② **OpenStreetMap Nominatim** で逆ジオコーディング → 近くの候補一覧を表示<br>③ 候補から選択、または手入力も可能 | |

### 4.4 撮影場所ワーニング

- 撮影場所が入力されている状態で「保存」または「共有」しようとした際に、**毎回**モーダル/トーストで警告を表示
- 例: 「撮影場所が記録されています。公開してよろしいですか？」
- 「このまま進む / 場所を削除して進む / キャンセル」の選択肢を持たせる

### 4.5 生成・出力

| 項目 | 仕様 |
|---|---|
| **生成** | Canvasでフレーム＋カメラ映像＋透過画像＋テキストを合成し、画像データとして出力 |
| **出力フォーマット** | PNG（品質優先）または JPEG（サイズ優先、選択可） |
| **保存** | `a[download]` 属性でローカルダウンロード |
| **共有** | ① **Web Share API** (`navigator.share({ files: [blob] })`) — 対応端末ではOS共有シート経由でX等へ画像付き共有<br>② **クリップボードコピー** — 画像をコピーしてX等に貼り付け<br>③ **X Intent** (`https://x.com/intent/post`) — テキスト＋ハッシュタグを事前入力、画像は手動添付 |
| **ハッシュタグ自動付与** | `#PrintPhoto` + 任意タグ（ユーザー設定可能） |

### 4.6 ローカルストレージ活用

| 項目 | 方式 |
|---|---|
| **テキスト系状態** | `localStorage` で保存（撮影者、タイトル、コメント、場所等） |
| **画像サムネイルキャッシュ** | `IndexedDB` で過去に読み込んだ画像のサムネイル（DataURL/Blob）を保存 |
| **キャッシュ上限** | **最近10件** |
| **手動削除** | サムネイル一覧から個別削除可能 |
| **キャッシュ利用フロー** | 次回起動時にサムネイル一覧を表示 → 選択 → ファイルピッカーを開き、ユーザーが同じファイルを再選択（ブラウザのセキュリティ制約を回避） |

---

## 5. 画面遷移・フロー

```
[トップ画面]
  ↓ 画像選択 or サムネイルから選択
[カメラ合成ビュー]
  ↓ カメラ起動、透過画像合成、位置調整、露光調整
  ↓ 「撮影」ボタン
[プレビュー＆テキスト入力画面]
  ↓ タイトル/コメント/撮影者/場所 入力
  ↓ 「保存」または「共有」ボタン
    → 場所入力時: ワーニングモーダル表示
    → 保存: ローカルダウンロード
    → 共有: Web Share API → フォールバック → X Intent / クリップボード
```

---

## 6. 技術スタック

| 層 | 技術 |
|---|---|
| **フロントエンド** | HTML5, CSS3, JavaScript（Vanilla） |
| **画像処理** | HTML5 Canvas 2D API（透過PNG合成。クロマキー処理はなし） |
| **カメラ** | `getUserMedia` API |
| **位置情報** | Geolocation API + OpenStreetMap Nominatim |
| **ストレージ** | `localStorage`（テキスト）, `IndexedDB`（画像Blob） |
| **共有** | Web Share API + Clipboard API + X Web Intent |

---

## 7. 注意事項・制約

- **ブラウザセキュリティ**: ファイルの実際のパスは取得できないため、画像は `IndexedDB` へのサムネイル保存 + 再選択フローで対応
- **Web Share API**: iOS Safari / Android Chrome 等、対応ブラウザで画像付き共有が可能。未対応環境はフォールバック
- **HTTPS必須**: `getUserMedia` と `Geolocation` は HTTPS 環境でないと動作しない。Cloudflare Pages 配信を前提とする
- **Nominatim利用ポリシー**: 1秒あたり1リクエスト程度のレート制限あり。実用上問題なし

---

## 8. ディレクトリ構成（想定）

```
particleAnimation/
├── print-photo/
│   ├── index.html      # メインページ（合成ビュー + 入力画面）
│   ├── style.css       # スタイル（既存デザイン統一）
│   ├── script.js       # メインロジック
│   ├── camera.js       # カメラ制御モジュール
│   ├── frame-render.js # フレーム合成/Canvas出力モジュール
│   ├── storage.js      # localStorage/IndexedDB管理モジュール
│   └── location.js     # 位置情報/逆ジオコーディングモジュール
```

---

## 9. 実装フェーズ

1. **フェーズ1**: 基盤構築（HTML/CSSレイアウト、フレーム描画、透過PNG画像読み込み）
2. **フェーズ2**: カメラ合成（getUserMedia、レイヤー重ね合わせ、ドラッグ/ピンチ/拡縮）
3. **フェーズ3**: 露光・色温度調整（brightness / contrast / temperature スライダー）
4. **フェーズ4**: テキスト入力・フレーム描画（撮影後画面、テキスト合成）
5. **フェーズ5**: 保存/共有機能（ダウンロード、Web Share、X Intent、クリップボード）
6. **フェーズ6**: 位置情報・ローカルストレージ（Nominatim、IndexedDBキャッシュ）
7. **フェーズ7**: ポートフォリオ連携（トップページからのリンク追加）

> **注**: 旧版にあった「クロマキー透過実装」フェーズは廃止した。入力画像はアルファ付き透過PNGに統一し、ピクセル単位の色キー処理は実施しない。

---

## 10. テスト計画（自動テストのみ）

### 10.1 テスト方針

| 項目 | 方針 |
|---|---|
| **テスト種別** | **自動テストのみ**。ユニットテスト（Vitest）+ E2Eテスト（Playwright） |
| **ユニットテスト** | 純粋関数（クロマキー計算、フレーム座標計算、ストレージ操作、APIパース等）をNode.js環境でテスト |
| **E2Eテスト** | Playwrightで実ブラウザ（Chromium）を自動操作し、ファイルアップロード・Canvas描画・ボタンクリック・画面遷移を検証 |
| **ブラウザモック** | `getUserMedia`・`Geolocation`・`navigator.share`・`navigator.clipboard` はテスト時にモックまたはスタブで代替 |
| **CI実行** | GitHub Actions で `push` / `pull_request` 時に自動実行 |

### 10.2 テスト環境・ツール

| ツール | 用途 | 備考 |
|---|---|---|
| **Vitest** | ユニットテストランナー | Jest互換、ESM対応、Watchモード高速 |
| **jsdom** | ユニットテスト用ブラウザ環境 | DOM操作、`localStorage` モック |
| **canvas** | Node.js用Canvas実装（`node-canvas`） | Canvas 2D APIのピクセル操作テストに使用 |
| **Playwright** | E2Eテスト | Chromium/Firefox/WebKitの自動操作。ファイルアップロード、スクリーンショット比較、ダウンロード検証 |
| **@playwright/test** | Playwrightテストランナー | 上記に同じ |
| **msw** | APIモック（オプション） | Nominatim APIのレスポンスをモック |

### 10.3 テストディレクトリ構成

```
print-photo/
├── tests/
│   ├── unit/              # Vitest ユニットテスト
│   │   ├── frame-render.test.js
│   │   ├── storage.test.js
│   │   └── location.test.js
│   └── e2e/               # Playwright E2Eテスト
│       ├── print-photo.spec.js
│       ├── exposure.spec.js
│       ├── temperature.spec.js
│       ├── text-input.spec.js
│       ├── save-share.spec.js
│       └── title-font.spec.js
├── vitest.config.js       # Vitest設定
├── playwright.config.js   # Playwright設定
└── package.json           # devDependencies: vitest, jsdom, canvas, @playwright/test
```

### 10.4 ユニットテスト項目（Vitest）

> 旧版の `chroma-key.test.js` セクション（U-C1〜U-C6）はクロマキー処理廃止に伴い削除した。透過PNGを直接Canvasに読み込む方式になったため、ピクセル単位の色キー計算ロジックは存在しない。

#### frame-render.test.js
| ID | テストケース | 入力 | 期待結果 |
|---|---|---|---|
| U-F1 | フレーム座標計算 | キャンバス幅2048 | 合成エリア left=64, top=69, w=1920, h=1080 |
| U-F2 | テキスト位置計算 | フレームサイズ2048x1440 | 撮影者=(left+margin, bottom-textHeight)、日付=(right-textWidth, bottom-textHeight) |
| U-F3 | 長文タイトル抑制 | 50文字のタイトル | 最大幅を超えた場合にフォントサイズ縮小または文字数カットが発生 |
| U-F4 | Canvas出力サイズ | — | 生成されたBlobの画像サイズが2048x1440（設定値に準拠） |

#### storage.test.js
| ID | テストケース | 操作 | 期待結果 |
|---|---|---|---|
| U-S1 | localStorage書き込み | `saveTextState({photographer:'Test'})` | localStorage.getItem('pp_state') にJSON文字列が保存される |
| U-S2 | localStorage読み込み | `loadTextState()` | 保存したオブジェクトが復元される |
| U-S3 | IndexedDB書き込み | `saveThumbnail(id, blob)` | IndexedDBにBlobが保存される |
| U-S4 | IndexedDB読み込み | `loadThumbnail(id)` | 保存したBlobが取得できる |
| U-S5 | キャッシュ上限（10件） | 11件目を保存 | 最古の1件が自動削除され、10件が保持される |
| U-S6 | サムネイル削除 | `deleteThumbnail(id)` | 該当IDのデータが削除される |

#### location.test.js
| ID | テストケース | 入力 | 期待結果 |
|---|---|---|---|
| U-L1 | Nominatimパース | mock JSONレスポンス | 候補オブジェクト配列 {name, address} が正しく抽出される |
| U-L2 | 空レスポンス | `[]` | 空配列を返し、エラーにならない |
| U-L3 | ネットワークエラー | fetch throws | rejectされ、呼び出し元でcatch可能 |

### 10.5 E2Eテスト項目（Playwright）

#### グローバルセットアップ（`playwright.config.js`）
- テストサーバー: `http-server ./`（ポート自動選択）
- ブラウザ: Chromium（デスクトップ + モバイルビューポート 375x812）
- モック: `navigator.mediaDevices.getUserMedia` → ダミーVideoStream、`navigator.geolocation.getCurrentPosition` → 固定緯度経度

#### print-photo.spec.js
| ID | テストケース | 手順（自動） | 期待結果（自動検証） |
|---|---|---|---|
| E-P1 | ページ読み込み・初期表示 | `page.goto('/')` | ローディング後、`data-testid="main-view"` が表示される。スクリーンショット比較でダークテーマ確認 |
| E-P2 | 透過PNG画像ファイルアップロード | `input[type=file].setInputFiles('test-assets/transparent-sample.png')` | `data-testid="uploaded-preview"` に画像が表示される。`camera-start-btn` が有効化される |
| E-P3 | カメラ起動で合成画面に遷移 | `page.click('[data-testid=camera-start-btn]')` | 合成画面が表示され、`#frame-content` / `#overlay-canvas` / `#shutter-btn` が有効状態で表示される |
| E-P4 | 撮影でプレビュー画面に遷移 | `page.click('[data-testid=shutter-btn]')` | プレビュー画面 `#preview-view` が表示され、`#result-canvas` に意味のあるサイズで描画される |
| E-P9 | 日付自動入力 | `page.goto('/')` → 撮影画面へ | `data-testid=date-input` の値が `new Date().toISOString().slice(0,10)` と一致 |
| E-P10 | 撮影後画面右上の不可視ボタンでデバッグログコピー | `page.click('[data-testid=copy-debug-btn]')` | クリップボードに `[hash] [ts] [takePicture-...] ...` 形式のログがコピーされる。ボタンは16x16の固定ヒット領域・完全透明 |
| E-P15 | レスポンシブ（モバイルビューポート） | `page.setViewportSize({width:375, height:812})` → リロード | レイアウトが崩れず、撮影ボタン等がタップ可能なサイズであることをスクリーンショットで検証 |
| E-P16 | デプロイ後のURLでもデバッグログをコピーできる | `page.goto('https://ochoco-portfolio.pages.dev/print-photo/')` → 撮影 → コピー | ローカルCIでは skip。デプロイ環境でのみ実行 |
| E-P17 | カメラ未対応時はトップ画面のままガイドを表示 | `Object.defineProperty(navigator, 'mediaDevices', { value: undefined })` | `#screen-top` のまま `#camera-permission-guide` に「カメラ機能に対応していません」表示 |
| E-P18 | プレビューから戻るとカメラプレビューを再開する | 撮影 → `#btn-back-compose` クリック | `#screen-compose` 表示後 `camera-video.srcObject` が再設定されている |
| E-P19 | 戻るボタンでトップ画面に戻れる | 合成画面 → `#btn-back-top` | `#screen-top` が表示される |
| E-P20 | 撮影後フォームのラベルに Font Awesome アイコンが表示される | 撮影後 | タイトル/撮影者/日付/場所の `<label>` 内に `.form-icon` が表示される |
| E-P21 | プレビュー画面ではフレーム内メタアイコンは非表示、入力値は保持される | 撮影後、フォーム入力300ms待機 | `#frame-photographer .fa-user` 等が `isVisible() === false`、テキストは保持 |
| E-P22 | 日付は MM/DD/YYYY 形式で表示される | `#input-date` に `2026-06-13` 入力 | `#frame-date-location .meta-date-text` の `textContent` が `06/13/2026` |

### 10.6 エッジケース・異常系（自動テスト）

| ID | ケース | 自動テスト方法 | 期待動作 |
|---|---|---|---|
| AE1 | カメラパーミッション拒否 | `mockGetUserMedia(() => throw new NotAllowedError())` | エラートースト `data-testid="camera-error"` が表示される |
| AE2 | Geolocation拒否 | `mockGeolocation(() => throw new PermissionDeniedError())` | エラーメッセージ表示、手動入力フォームが有効のまま |
| AE3 | Nominatimタイムアウト | `page.route(...)` で5秒遅延 → abort | ローディング表示後、エラーメッセージ。手動入力可能 |
| AE4 | IndexedDB未対応 | `page.evaluate(() => delete window.indexedDB)` | `localStorage` フォールバック動作。コンソールエラーなしでページがクラッシュしない |
| AE5 | 大容量画像（4K） | 4000x3000 のテスト画像をアップロード | エラーモーダルまたは自動リサイズ処理が走る。ページがフリーズしない |
| AE6 | オフライン | `page.setOffline(true)` | 位置情報取得ボタンクリック時にネットワークエラー。手動入力可 |

### 10.7 CI/CD自動実行（GitHub Actions）

`.github/workflows/test-print-photo.yml` にて以下を自動実行：

```yaml
# 概要
on: [push, pull_request]
jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx vitest run --coverage
  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npx playwright test
```

### 10.8 パフォーマンス・品質基準（自動計測）

| 項目 | 基準 | 計測方法 |
|---|---|---|
| **ページ読み込み** | First Contentful Paint < 2秒 | Playwright `page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0].startTime)` |
| **合成リアルタイム性** | スライダー操作後、プレビュー更新まで < 100ms | Playwright でスライダー操作 → `waitForTimeout(0)` → Canvas特定座標のピクセル変化をポーリング |
| **最終画像出力サイズ** | 2048×1440 px | ダウンロードしたBlobをNode.js `Image` でサイズ検証（E2Eテスト内） |
| **メモリリーク** | 10回連続合成後もヒープ増加 < 20% | Playwright `page.evaluate(() => performance.memory.usedJSHeapSize)` の差分検証 |

### 10.9 テストスケジュール（実装と並行・自動化）

| フェーズ | 実装期間（想定） | 自動テスト対応 | 備考 |
|---|---|---|---|
| フェーズ1 | 1日 | Vitest: U-F1 〜 U-F3 / Playwright: E-P1, E-P2, E-P15 | レイアウトテストはスクリーンショット比較。透過PNG読み込みのみ |
| フェーズ2 | 1.5日 | Playwright: E-P3, E-P5, E-P6, AE1 | getUserMediaモック必須。クロマキー処理廃止によりU-C*は削除済み |
| フェーズ3 | 1日 | Playwright: E-E* (exposure), E-T* (temperature) | brightness / contrast / temperature スライダー |
| フェーズ4 | 1日 | Playwright: E-P7 〜 E-P10, E-TX* / Vitest: U-F4 | テキスト合成のE2Eはピクセル変化で検証 |
| フェーズ5 | 1日 | Playwright: E-P11, E-P14, AE5 | ダウンロードイベント検証、Intent URL検証 |
| フェーズ6 | 1.5日 | Playwright: E-P12, E-P13, AE2 〜 AE4, AE6 / Vitest: U-S1 〜 U-S6, U-L1 〜 U-L3 | ストレージはユニットテストで網羅 |
| フェーズ7 | 0.5日 | Playwright: E-P15（レスポンシブ再確認） | リンク遷移確認 |
| **CI統合** | — | GitHub Actions設定 | 全pushで自動実行 |

---

*作成日: 2026-06-04*
