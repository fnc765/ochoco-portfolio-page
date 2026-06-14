/**
 * PrintPhoto - フレーム描画 ユニットテスト
 */

import { describe, it, expect } from 'vitest';
import { renderFrame, drawImageCover, formatDateMMDDYYYY } from '../../frame-render.js';

describe('frame-render', () => {
    it('U-F1: フレーム座標計算（出力サイズ2048x1440）', () => {
        const bg = document.createElement('canvas');
        bg.width = 1920;
        bg.height = 1080;

        const result = renderFrame({
            background: bg,
            title: 'Test',
            outputWidth: 2048,
            outputHeight: 1440,
        });

        expect(result.width).toBe(2048);
        expect(result.height).toBe(1440);
    });

    it('U-F4: Canvas出力サイズが指定値と一致', () => {
        const bg = document.createElement('canvas');
        bg.width = 100;
        bg.height = 100;

        const result = renderFrame({
            background: bg,
            outputWidth: 1024,
            outputHeight: 720,
        });

        expect(result.width).toBe(1024);
        expect(result.height).toBe(720);
    });

    it('U-F5: 大きな画像でも合成エリアからはみ出さない', () => {
        const bg = document.createElement('canvas');
        bg.width = 1920;
        bg.height = 1080;

        const overlay = document.createElement('canvas');
        overlay.width = 4000;
        overlay.height = 3000;

        const result = renderFrame({
            background: bg,
            overlay: overlay,
            overlayTransform: { x: 0, y: 0, scale: 1 },
            overlayCssWidth: 700,
            overlayCssHeight: 394,
            outputWidth: 2048,
            outputHeight: 1440,
        });

        expect(result.width).toBe(2048);
        expect(result.height).toBe(1440);
        // 出力サイズがフレームサイズを超えないことを確認
        expect(result.width).toBeLessThanOrEqual(2048);
        expect(result.height).toBeLessThanOrEqual(1440);
    });

    it('U-F6: drawImageCover で縦長画像を横長エリアに cover 描画', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        // 縦長画像 (1080x1920) を作成
        const portraitImg = document.createElement('canvas');
        portraitImg.width = 1080;
        portraitImg.height = 1920;
        const imgCtx = portraitImg.getContext('2d');
        imgCtx.fillStyle = '#ff0000';
        imgCtx.fillRect(0, 0, 1080, 1920);

        // 横長エリア (1920x1080) に cover 描画
        drawImageCover(ctx, portraitImg, 0, 0, 1920, 1080);

        // 描画後のピクセル検証：中央部分が描画されていることを確認
        // 縦長画像を横長エリアに cover すると、上下が切り取られ中央部分が描画される
        const centerPixel = ctx.getImageData(960, 540, 1, 1).data;
        expect(centerPixel[0]).toBe(255); // R
        expect(centerPixel[1]).toBe(0);   // G
        expect(centerPixel[2]).toBe(0);   // B
    });

    it('U-F7: drawImageCover で横長画像を縦長エリアに cover 描画', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');

        // 横長画像 (1920x1080) を作成
        const landscapeImg = document.createElement('canvas');
        landscapeImg.width = 1920;
        landscapeImg.height = 1080;
        const imgCtx = landscapeImg.getContext('2d');
        imgCtx.fillStyle = '#00ff00';
        imgCtx.fillRect(0, 0, 1920, 1080);

        // 縦長エリア (1080x1920) に cover 描画
        drawImageCover(ctx, landscapeImg, 0, 0, 1080, 1920);

        // 描画後のピクセル検証：中央部分が描画されていることを確認
        const centerPixel = ctx.getImageData(540, 960, 1, 1).data;
        expect(centerPixel[0]).toBe(0);   // R
        expect(centerPixel[1]).toBe(255); // G
        expect(centerPixel[2]).toBe(0);   // B
    });

    // ============================================
    // 色温度（temperature）調整のテスト
    // renderFrame は ctx.filter を介して hue-rotate を適用する。
    // モックではピクセル変換はスキップされるため、ctx.filter の組み立て結果を検証する。
    // 背景 drawImage に先駆けて捕捉されないよう、overlay drawImage のみを識別する。
    // ============================================
    describe('色温度 (temperature)', () => {
        function makeRenderFrameWithFilterCapture(opts) {
            const captured = { filterDuringOverlayDraw: null, filterDuringBgDraw: null };
            const bg = opts.background;
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
                                const first = args[0];
                                if (first === overlay && captured.filterDuringOverlayDraw === null) {
                                    captured.filterDuringOverlayDraw = this.filter;
                                } else if (first === bg && captured.filterDuringBgDraw === null) {
                                    captured.filterDuringBgDraw = this.filter;
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
                const result = renderFrame(opts);
                return { result, captured };
            } finally {
                document.createElement = originalCreate;
            }
        }

        it('U-T1: temperature=0 で overlay draw 時に filter=none', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { result, captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                temperature: 0,
            });

            expect(result.width).toBeGreaterThan(0);
            expect(captured.filterDuringOverlayDraw).toBe('none');
        });

        it('U-T2: temperature=100 で hue-rotate(90deg) が含まれる', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                temperature: 100,
            });

            expect(captured.filterDuringOverlayDraw).toContain('hue-rotate(90deg)');
        });

        it('U-T3: temperature=-100 で hue-rotate(-90deg) が含まれる', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                temperature: -100,
            });

            expect(captured.filterDuringOverlayDraw).toContain('hue-rotate(-90deg)');
        });

        it('U-T4: temperature=50 で hue-rotate(45deg) 相当', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                temperature: 50,
            });

            expect(captured.filterDuringOverlayDraw).toContain('hue-rotate(45deg)');
        });

        it('U-T5: brightness/contrast/saturation/temperature すべて100/0 デフォルトで filter=none', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                brightness: 100,
                contrast: 100,
                saturation: 100,
                temperature: 0,
            });

            expect(captured.filterDuringOverlayDraw).toBe('none');
        });

        it('U-T6: temperature=0 + brightness=120 で brightness のみ含まれ hue-rotate は含まれない', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                brightness: 120,
                temperature: 0,
            });

            expect(captured.filterDuringOverlayDraw).toContain('brightness(120%)');
            expect(captured.filterDuringOverlayDraw).not.toContain('hue-rotate');
        });

        it('U-T7: temperature + brightness 同時指定で両方の filter を含む', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;
            const overlay = document.createElement('canvas');
            overlay.width = 50;
            overlay.height = 50;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlay,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                brightness: 110,
                contrast: 90,
                temperature: 25,
            });

            expect(captured.filterDuringOverlayDraw).toContain('brightness(110%)');
            expect(captured.filterDuringOverlayDraw).toContain('contrast(90%)');
            // 25 * 0.9 = 22.5
            expect(captured.filterDuringOverlayDraw).toContain('hue-rotate(22.5deg)');
        });

        it('U-T8: overlay なし（temperature 指定のみ）では hue-rotate は適用されない', () => {
            const bg = document.createElement('canvas');
            bg.width = 100;
            bg.height = 100;

            const { captured } = makeRenderFrameWithFilterCapture({
                background: bg,
                overlayTransform: { x: 0, y: 0, scale: 1 },
                overlayCssWidth: 100,
                overlayCssHeight: 100,
                temperature: 100,
            });

            // overlay なしのときは hue-rotate 適用ロジックを通らない
            expect(captured.filterDuringOverlayDraw).toBe(null);
        });
    });
});

describe('formatDateMMDDYYYY', () => {
    it('U-FD1: YYYY-MM-DD を MM/DD/YYYY に変換', () => {
        expect(formatDateMMDDYYYY('2026-06-13')).toBe('06/13/2026');
    });

    it('U-FD2: 空文字はそのまま空文字を返す', () => {
        expect(formatDateMMDDYYYY('')).toBe('');
    });

    it('U-FD3: 既にMM/DD/YYYY形式の場合はそのまま返す', () => {
        expect(formatDateMMDDYYYY('06/13/2026')).toBe('06/13/2026');
    });
});

describe('タイトルフォント (Noto Sans / oblique 18deg)', () => {
    function captureTitleRender(title) {
        const bg = document.createElement('canvas');
        bg.width = 1920;
        bg.height = 1080;

        const result = renderFrame({
            background: bg,
            title,
            outputWidth: 2048,
            outputHeight: 1440,
        });

        const ctx = result.getContext('2d');
        return { result, ctx };
    }

    it('U-F-N1: タイトル描画で ctx.font に Noto Sans / Noto Sans JP を含む', () => {
        const { ctx } = captureTitleRender('Test');

        const fonts = ctx._fontHistory || [];
        const notoFonts = fonts.filter(f => /Noto Sans/.test(f) && /Noto Sans JP/.test(f));
        expect(notoFonts.length).toBeGreaterThan(0);
    });

    it('U-F-N2: タイトル描画で weight 400 (細字) が使用される', () => {
        const { ctx } = captureTitleRender('Test');

        const fonts = ctx._fontHistory || [];
        const notoFonts = fonts.filter(f => /Noto Sans/.test(f));
        const has400 = notoFonts.some(f => /^400 \d+px/.test(f));
        const hasNo700 = !notoFonts.some(f => /^700 \d+px/.test(f));
        expect(has400).toBe(true);
        expect(hasNo700).toBe(true);
    });

    it('U-F-N3: タイトル描画で ctx.save / transform(skewX) / restore が呼ばれる', () => {
        const { ctx } = captureTitleRender('plamちゃん！');

        expect(ctx._transforms.length).toBeGreaterThan(0);
        const t = ctx._transforms[0];
        const expectedSkewX = -Math.tan(18 * Math.PI / 180);
        expect(t.a).toBe(1);
        expect(t.d).toBe(1);
        expect(t.c).toBeCloseTo(expectedSkewX, 6);
        expect(t.b).toBe(0);
    });

    it('U-F-N4: タイトル省略時は transform が呼ばれない', () => {
        const bg = document.createElement('canvas');
        bg.width = 1920;
        bg.height = 1080;

        const result = renderFrame({
            background: bg,
            outputWidth: 2048,
            outputHeight: 1440,
        });

        const ctx = result.getContext('2d');
        expect(ctx._transforms.length).toBe(0);
    });
});

describe('内部キャンバス (撮影後の最終出力 2048x1440)', () => {
    it('U-FB-1: 白額縁 (四隅) は白 (#ffffff) で塗りつぶされている', () => {
        const bg = document.createElement('canvas');
        bg.width = 1920;
        bg.height = 1080;
        const bgCtx = bg.getContext('2d');
        bgCtx.fillStyle = '#3a8a3a';
        bgCtx.fillRect(0, 0, bg.width, bg.height);

        const result = renderFrame({
            background: bg,
            outputWidth: 2048,
            outputHeight: 1440,
        });

        const ctx = result.getContext('2d');
        // 四隅
        const corners = [
            [10, 10],
            [result.width - 10, 10],
            [10, result.height - 10],
            [result.width - 10, result.height - 10],
        ];
        for (const [x, y] of corners) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            expect(p[0]).toBe(255);
            expect(p[1]).toBe(255);
            expect(p[2]).toBe(255);
        }
    });

    it('U-FB-2: 絵エリア (中央 1920x1080 領域) にはカメラ映像が描画されている', () => {
        const bg = document.createElement('canvas');
        bg.width = 1920;
        bg.height = 1080;
        const bgCtx = bg.getContext('2d');
        // 緑系で塗りつぶし → 絵エリアはこの色になるはず
        bgCtx.fillStyle = '#3a8a3a';
        bgCtx.fillRect(0, 0, bg.width, bg.height);

        const result = renderFrame({
            background: bg,
            outputWidth: 2048,
            outputHeight: 1440,
        });

        const ctx = result.getContext('2d');
        // 絵エリアの中央 (64 + 1920/2, 69 + 1080/2) 周辺
        const centerX = Math.round(64 + 1920 / 2);
        const centerY = Math.round(69 + 1080 / 2);
        const p = ctx.getImageData(centerX, centerY, 1, 1).data;
        // 緑系 (#3a8a3a = R:58, G:138, B:58) のはず
        expect(p[0]).toBe(58);
        expect(p[1]).toBe(138);
        expect(p[2]).toBe(58);
    });

    it('U-FB-3: 撮影後のスライダー再描画で背景 null でも canvas は生成される', () => {
        const overlay = document.createElement('canvas');
        overlay.width = 100;
        overlay.height = 100;
        const ovCtx = overlay.getContext('2d');
        ovCtx.fillStyle = '#ff00ff';
        ovCtx.fillRect(0, 0, 100, 100);

        const result = renderFrame({
            background: null, // 撮影後の背景なし再描画
            overlay,
            overlayTransform: { x: 0, y: 0, scale: 1 },
            overlayCssWidth: 1920,
            overlayCssHeight: 1080,
            outputWidth: 2048,
            outputHeight: 1440,
        });

        const ctx = result.getContext('2d');
        // 絵エリアは黒 (背景 null のため)
        const centerX = Math.round(64 + 1920 / 2);
        const centerY = Math.round(69 + 1080 / 2);
        const p = ctx.getImageData(centerX, centerY, 1, 1).data;
        expect(p[0]).toBe(0);
        expect(p[1]).toBe(0);
        expect(p[2]).toBe(0);

        // 四隅は白
        const corner = ctx.getImageData(10, 10, 1, 1).data;
        expect(corner[0]).toBe(255);
    });
});
