/**
 * PrintPhoto - 保存・共有・コピー E2Eテスト
 *
 * 撮影後の保存 (PNG ダウンロード)、共有 (Web Share API / X Intent)、
 * クリップボードコピーの動作を検証する。
 */

import { test, expect, openApp, uploadAndOpenCompose, takePictureAndOpenPreview } from './helpers.js';

test.describe('保存・共有・コピー', () => {
    test('E-S1: PNG 保存ボタンクリックでダウンロードが発火する', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);

        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.click('#btn-save-png');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/PrintPhoto_.*\.png$/);
    });

    test('E-S2: コピー (Clipboard API) ボタンクリックで例外なく処理される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);

        // Clipboard API をモック
        await page.evaluate(() => {
            const writes = [];
            if (!navigator.clipboard) {
                Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
            }
            navigator.clipboard.write = async (items) => {
                writes.push({ count: items.length });
            };
            navigator.clipboard.writeText = async (text) => {
                writes.push({ text });
            };
            window.__clipboardWrites = writes;
        });
        await page.click('#btn-copy');
        await page.waitForTimeout(500);
        const writes = await page.evaluate(() => window.__clipboardWrites || []);
        // コピーが発火している（DataURL or image のいずれか）
        expect(writes.length).toBeGreaterThan(0);
    });

    test('E-S3: 共有ボタンクリックで navigator.share or X Intent のフォールバックが動作する', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);

        // Web Share API をモック
        await page.evaluate(() => {
            window.__shareCalled = null;
            navigator.canShare = () => false; // フォールバックさせる
            navigator.share = async (data) => {
                window.__shareCalled = data;
            };
        });
        const popupPromise = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
        await page.click('[data-testid="share-btn"]');
        const popup = await popupPromise;
        if (popup) {
            // X Intent の URL になっていることを確認
            expect(popup.url()).toContain('x.com/intent/post');
        } else {
            // もしくは同じタブ遷移
            const url = page.url();
            expect(url).toContain('x.com/intent/post');
        }
    });
});

test.describe('位置情報警告', () => {
    test('E-LW1: 場所が空のときは警告モーダルを出さずに直接保存される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);
        await page.locator('#input-location').fill('');
        // ダウンロードイベント
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.click('#btn-save-png');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.png$/);
    });

    test('E-LW2: 場所が入力済みのときは警告モーダルを表示する', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);
        await page.locator('#input-location').fill('東京');
        await page.waitForTimeout(200);
        await page.click('#btn-save-png');
        await expect(page.locator('[data-testid="location-warning-modal"]')).toBeVisible();
    });

    test('E-LW3: 警告モーダルで「場所を削除して進む」を選ぶと location が空になる', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);
        await page.locator('#input-location').fill('東京');
        await page.click('#btn-save-png');
        await expect(page.locator('[data-testid="location-warning-modal"]')).toBeVisible();
        await page.click('#btn-remove-location');
        await expect(page.locator('[data-testid="location-warning-modal"]')).toBeHidden();
        const location = await page.locator('#input-location').inputValue();
        expect(location).toBe('');
    });
});
