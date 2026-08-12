/**
 * PrintPhoto - ローカルストレージ ユニットテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    saveThumbnail,
    loadThumbnail,
    deleteThumbnail,
    getAllThumbnails,
} from '../../storage.js';

describe('storage', () => {
    beforeEach(() => {
        // グローバルFakeDBをリセット
        if (global.indexedDB._reset) global.indexedDB._reset();
    });

    it('U-S1〜S4: 保存・読み込み', async () => {
        const blob = new Blob(['test'], { type: 'image/png' });
        const id = await saveThumbnail(blob);
        expect(id).toBeTruthy();

        const loaded = await loadThumbnail(id);
        expect(loaded).not.toBeNull();
    });

    it('U-S7: 履歴表示用画像とは別に高解像度の再利用画像を保持する', async () => {
        const previewDataUrl = 'data:image/png;base64,preview';
        const sourceDataUrl = 'data:image/png;base64,full-resolution-source';
        const id = await saveThumbnail(previewDataUrl, sourceDataUrl);

        const loaded = await loadThumbnail(id);
        const [record] = await getAllThumbnails();

        expect(loaded).toBe(sourceDataUrl);
        expect(record.dataUrl).toBe(previewDataUrl);
    });

    it('U-S6: 削除', async () => {
        const blob = new Blob(['test'], { type: 'image/png' });
        const id = await saveThumbnail(blob);
        await deleteThumbnail(id);
        const loaded = await loadThumbnail(id);
        expect(loaded).toBeNull();
    });

    it('U-S5: キャッシュ上限（10件超過で古いもの削除）', async () => {
        const ids = [];
        for (let i = 0; i < 12; i++) {
            const blob = new Blob([`test${i}`], { type: 'image/png' });
            const id = await saveThumbnail(blob);
            ids.push(id);
            // タイムスタンプをずらす
            await new Promise(r => setTimeout(r, 10));
        }

        const thumbs = await getAllThumbnails();
        expect(thumbs).toHaveLength(10);
        const remainingIds = thumbs.map(thumb => thumb.id);
        expect(remainingIds).toEqual(expect.arrayContaining(ids.slice(-10)));
        expect(remainingIds).not.toContain(ids[0]);
        expect(remainingIds).not.toContain(ids[1]);
    });
});
