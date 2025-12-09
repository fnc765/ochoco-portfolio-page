# おちょこ - Portfolio Website

bikyu83.comを参考にしたシンプルで洗練されたポートフォリオサイトです。

## 🌟 特徴

- **モダンなデザイン**: ダークテーマとパーティクルエフェクト
- **レスポンシブ対応**: モバイル、タブレット、デスクトップに完全対応
- **アクセシビリティ**: ARIA属性とキーボードナビゲーション対応
- **パフォーマンス最適化**: 軽量で高速な読み込み
- **SEO対応**: メタタグとOGP設定済み

## 🛠️ 技術スタック

- **HTML5**: セマンティックマークアップ
- **CSS3**: Flexbox、アニメーション、レスポンシブデザイン
- **Vanilla JavaScript**: ES6構文
- **tsParticles**: パーティクルエフェクト（CDN）
- **Google Fonts**: M PLUS Rounded 1c
- **Font Awesome**: アイコン

## 📁 プロジェクト構造

```
html+css+js/
├── index.html              # メインHTMLファイル
├── css/
│   └── style.css          # スタイルシート
├── js/
│   └── main.js            # JavaScript
├── images/
│   ├── background.png     # 背景画像
│   └── profile.png        # プロフィール画像
├── README.md              # このファイル
├── 実装計画.md             # 実装計画書
├── Phase1_実装レポート.md  # Phase 1レポート
├── Phase2_実装レポート.md  # Phase 2レポート
└── Phase3_実装レポート.md  # Phase 3レポート
```

## 🚀 セットアップ

### 1. ファイルの配置

プロジェクトフォルダに必要な画像を配置してください：

- `images/background.png` - 背景画像（推奨: 1920×1080以上）
- `images/profile.png` - プロフィール画像（推奨: 500×500以上、正方形）

### 2. カスタマイズ

`index.html` を編集して、以下を自分の情報に変更してください：

- **ページタイトル** (6行目): `おちょこ - Portfolio`
- **メタディスクリプション** (9行目)
- **OGP URL** (16, 23行目): `https://yourwebsite.com/`
- **ソーシャルリンク** (72-87行目): 各SNSのURL

### 3. 表示方法

#### 方法A: 直接ブラウザで開く
```
index.html をダブルクリック
```

#### 方法B: ローカルサーバーを起動（推奨）
```bash
# Pythonがインストールされている場合
cd html+css+js
python -m http.server 8000

# ブラウザで http://localhost:8000 を開く
```

## 🎨 カスタマイズガイド

### パーティクル設定を変更

`js/main.js` の `initParticles()` 関数内で設定を変更できます：

```javascript
particles: {
    number: {
        value: 50,  // パーティクルの数（30-80推奨）
    },
    color: {
        value: "#ffffff"  // 色を変更
    },
    move: {
        speed: 1.3,  // 移動速度（0.5-3.0推奨）
    }
}
```

### 配色を変更

`css/style.css` で以下の色を変更できます：

- **背景色**: `background-color: #141414;` (15行目)
- **ボタン背景**: `rgba(255, 255, 255, 0.1)` (188行目)
- **テキスト色**: `color: #fff;` (14行目)

## 📱 対応ブラウザ

| ブラウザ | バージョン | 対応状況 |
|---------|-----------|---------|
| Chrome | 90+ | ✅ 完全対応 |
| Firefox | 88+ | ✅ 完全対応 |
| Safari | 14+ | ✅ 完全対応 |
| Edge | 90+ | ✅ 完全対応 |
| IE11 | - | ❌ 未対応 |

## ♿ アクセシビリティ

- **ARIA属性**: スクリーンリーダー対応
- **キーボードナビゲーション**: Tabキーでフォーカス移動
- **フォーカスインジケーター**: フォーカス時に視覚的なフィードバック
- **セマンティックHTML**: 適切なHTML5タグを使用
- **Escキー**: ローディング画面をスキップ（開発用）

## 🔧 デプロイ

### Cloudflare Pagesへのデプロイ

1. GitHubリポジトリにプッシュ
2. Cloudflare Pagesでプロジェクトを作成
3. ビルド設定:
   - ビルドコマンド: なし
   - ビルド出力ディレクトリ: `html+css+js`
4. デプロイ

### その他のホスティング

- Netlify
- Vercel
- GitHub Pages
- Firebase Hosting

どのサービスでも、`html+css+js` フォルダの内容をそのままデプロイできます。

## 📦 本番環境への最適化

### 1. 画像の最適化

- **WebP形式**: より小さいファイルサイズ
- **圧縮**: TinyPNG、ImageOptimなどを使用
- **適切なサイズ**: 必要以上に大きい画像を避ける

### 2. CSS/JSの最小化

本番環境では以下のツールで最小化を推奨：

```bash
# CSSの最小化
npx cssnano css/style.css css/style.min.css

# JavaScriptの最小化
npx terser js/main.js -o js/main.min.js
```

最小化後、`index.html` でファイルパスを変更してください。

### 3. CDNの最適化

本番環境では、CDNからローカルファイルへの切り替えを検討：

- Google Fonts → ローカルフォントファイル
- Font Awesome → ローカルファイル
- tsParticles → ローカルファイル

これによりオフライン対応と読み込み速度が向上します。

## 📝 favicon の作成

favicon用の画像を用意して、以下のサイズで生成してください：

- `favicon.ico` (16×16, 32×32)
- `favicon-16x16.png` (16×16)
- `favicon-32x32.png` (32×32)
- `apple-touch-icon.png` (180×180)

推奨ツール:
- [Favicon.io](https://favicon.io/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

## 🐛 トラブルシューティング

### パーティクルが表示されない

**原因**: CDNが読み込まれていない

**解決策**:
1. インターネット接続を確認
2. ブラウザの開発者ツール（F12）でエラー確認
3. CDN URLが正しいか確認

### ボタンがクリックできない

**原因**: `pointer-events: none` が設定されていない

**解決策**:
`css/style.css` の70行目を確認：
```css
#particles-js {
    pointer-events: none; /* この行が必要 */
}
```

### 画像が表示されない

**原因**: 画像ファイルが配置されていない

**解決策**:
1. `images/` フォルダに画像があるか確認
2. ファイル名が `background.png` と `profile.png` か確認
3. 大文字小文字を確認

## 📚 参考資料

- [実装計画.md](実装計画.md) - 実装計画の詳細
- [Phase1_実装レポート.md](Phase1_実装レポート.md) - Phase 1の実装内容
- [Phase2_実装レポート.md](Phase2_実装レポート.md) - Phase 2の実装内容
- [Phase3_実装レポート.md](Phase3_実装レポート.md) - Phase 3の実装内容
- [bikyu83.com](https://bikyu83.com/) - 参考サイト
- [tsParticles](https://particles.js.org/) - パーティクルライブラリ

## 📄 ライセンス

このプロジェクトは学習目的で作成されました。ご自由にカスタマイズしてお使いください。

## 🙏 謝辞

- [bikyu83.com](https://bikyu83.com/) - デザインの参考
- [tsParticles](https://particles.js.org/) - パーティクルエフェクト
- [Google Fonts](https://fonts.google.com/) - M PLUS Rounded 1c
- [Font Awesome](https://fontawesome.com/) - アイコン

---

**作成日**: 2025-12-09
**バージョン**: 1.0.0 (Phase 3完了)
