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
    beforeEach(async () => {
        // テスト前に全削除
        const thumbs = await getAllThumbnails();
        for (const t of thumbs) {
            await deleteThumbnail(t.id);
        }
    });

    it('U-S1〜S4: 保存・読み込み', async () => {
        const blob = new Blob(['test'], { type: 'image/png' });
        const id = await saveThumbnail(blob);
        expect(id).toBeTruthy();

        const loaded = await loadThumbnail(id);
        expect(loaded).not.toBeNull();
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
        expect(thumbs.length).toBeLessThanOrEqual(10);
    });
});
