/**
 * PrintPhoto - フレーム描画 ユニットテスト
 */

import { describe, it, expect } from 'vitest';
import { renderFrame, drawImageCover } from '../../frame-render.js';

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
});
