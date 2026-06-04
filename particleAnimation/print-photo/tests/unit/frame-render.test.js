/**
 * PrintPhoto - フレーム描画 ユニットテスト
 */

import { describe, it, expect } from 'vitest';
import { renderFrame } from '../../frame-render.js';

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
});
