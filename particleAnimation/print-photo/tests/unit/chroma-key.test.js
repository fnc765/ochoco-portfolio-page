/**
 * PrintPhoto - クロマキー ユニットテスト
 */

import { describe, it, expect } from 'vitest';
import {
    applyChromaKey,
    pickColor,
    hexToRgb,
    rgbToHex,
} from '../../chroma-key.js';

describe('chroma-key', () => {
    // ヘルパー: 指定色のテスト画像Canvasを作成
    function createColorCanvas(r, g, b, w = 10, h = 10) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(0, 0, w, h);
        return canvas;
    }

    it('U-C1: デフォルト緑透過', () => {
        const canvas = createColorCanvas(0, 255, 0);
        const result = applyChromaKey(canvas, { r: 0, g: 255, b: 0 }, 30, 0);
        const ctx = result.getContext('2d');
        const imgData = ctx.getImageData(0, 0, 1, 1);
        expect(imgData.data[3]).toBe(0); // アルファ = 0（完全透過）
    });

    it('U-C2: 非緑色不透過', () => {
        const canvas = createColorCanvas(255, 0, 0);
        const result = applyChromaKey(canvas, { r: 0, g: 255, b: 0 }, 30, 0);
        const ctx = result.getContext('2d');
        const imgData = ctx.getImageData(0, 0, 1, 1);
        expect(imgData.data[3]).toBe(255); // アルファ = 255（不透過）
    });

    it('U-C3: 閾値境界（近い色は透過、遠い色は不透過）', () => {
        // 緑に近い色: (0, 240, 0)
        const canvas = createColorCanvas(0, 240, 0);
        const result = applyChromaKey(canvas, { r: 0, g: 255, b: 0 }, 30, 0);
        const ctx = result.getContext('2d');
        const imgData = ctx.getImageData(0, 0, 1, 1);
        // 距離 sqrt(0^2 + 15^2 + 0^2) = 15。閾値30% => 30/100 * 441.67 ≈ 132.5。15 < 132.5 なので透過
        expect(imgData.data[3]).toBe(0);
    });

    it('U-C5: 色ピックアップ', () => {
        const canvas = createColorCanvas(128, 64, 32);
        const color = pickColor(canvas, 0.5, 0.5, true);
        expect(color).not.toBeNull();
        expect(color.r).toBe(128);
        expect(color.g).toBe(64);
        expect(color.b).toBe(32);
    });

    it('U-C6: 白背景透過', () => {
        const canvas = createColorCanvas(255, 255, 255);
        const result = applyChromaKey(canvas, { r: 255, g: 255, b: 255 }, 30, 0);
        const ctx = result.getContext('2d');
        const imgData = ctx.getImageData(0, 0, 1, 1);
        expect(imgData.data[3]).toBe(0);
    });

    it('hexToRgb', () => {
        expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
        expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('rgbToHex', () => {
        expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
        expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    });
});
