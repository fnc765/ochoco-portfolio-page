import { describe, expect, it } from 'vitest';
import { getContainedSize, validateImageFile } from '../../image-utils.js';

describe('history image sizing', () => {
    it('U-I1: 大きな画像を縦横比を保って上限内へ縮小する', () => {
        expect(getContainedSize(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
        expect(getContainedSize(2000, 4000, 1024)).toEqual({ width: 512, height: 1024 });
    });

    it('U-I2: 上限内の画像は拡大しない', () => {
        expect(getContainedSize(640, 480, 1024)).toEqual({ width: 640, height: 480 });
    });

    it('U-I3: 対応画像形式だけを受け付ける', () => {
        expect(validateImageFile(new File(['png'], 'avatar.png', { type: 'image/png' })).valid).toBe(true);
        expect(validateImageFile(new File(['svg'], 'avatar.svg', { type: 'image/svg+xml' }))).toEqual({
            valid: false,
            message: 'PNG・JPEG・WebP画像を選択してください',
        });
    });

    it('U-I4: 25MBを超える画像を拒否する', () => {
        const oversized = { type: 'image/png', size: 25 * 1024 * 1024 + 1 };
        expect(validateImageFile(oversized)).toEqual({
            valid: false,
            message: '画像サイズは25MB以下にしてください',
        });
    });
});
