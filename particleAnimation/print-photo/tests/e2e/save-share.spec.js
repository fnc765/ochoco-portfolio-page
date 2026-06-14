/**
 * PrintPhoto - 保存・共有 E2Eテスト
 *
 * 撮影後の保存 (PNG ダウンロード)、共有 (Web Share API / X Intent)、
 * 場所警告の動作を検証する。
 */

import { test, expect, selectAndCapture } from './helpers.js';

test.describe('保存', () => {
    test('E-S1: PNG 保存ボタンクリックでダウンロードが発火する', async ({ page }) => {
        await selectAndCapture(page);
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.click('[data-testid="save-png-btn"]');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/PrintPhoto_.*\.png$/);
    });
});

test.describe('共有', () => {
    test('E-S3: 共有ボタンクリックで navigator.share or X Intent のフォールバックが動作する', async ({ page }) => {
        await selectAndCapture(page);
        // Web Share API をモック（canShare=false でフォールバックさせる）
        await page.evaluate(() => {
            navigator.canShare = () => false;
            window.__shareCalled = null;
            navigator.share = async (data) => {
                window.__shareCalled = data;
            };
        });
        const popupPromise = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
        await page.click('[data-testid="share-btn"]');
        const popup = await popupPromise;
        if (popup) {
            expect(popup.url()).toContain('x.com/intent/post');
        } else {
            const url = page.url();
            expect(url).toContain('x.com/intent/post');
        }
    });

    test('E-S4: Web Share API 対応時は navigator.share が呼ばれる', async ({ page }) => {
        await selectAndCapture(page);
        await page.evaluate(() => {
            window.__shareCalled = null;
            navigator.canShare = () => true;
            navigator.share = async (data) => {
                window.__shareCalled = data;
            };
        });
        await page.click('[data-testid="share-btn"]');
        await page.waitForTimeout(300);
        const called = await page.evaluate(() => window.__shareCalled);
        expect(called).not.toBeNull();
        expect(called.files).toBeDefined();
        expect(called.files.length).toBe(1);
    });
});

test.describe('位置情報警告', () => {
    test('E-LW1: 場所が空のときは警告モーダルを出さずに直接保存される', async ({ page }) => {
        await selectAndCapture(page);
        await page.locator('#input-location').fill('');
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.click('[data-testid="save-png-btn"]');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.png$/);
    });

    test('E-LW2: 場所が入力済みのときは警告モーダルを表示する', async ({ page }) => {
        await selectAndCapture(page);
        await page.locator('#input-location').fill('東京');
        await page.waitForTimeout(200);
        await page.click('[data-testid="save-png-btn"]');
        await expect(page.locator('[data-testid="location-warning-modal"]')).toBeVisible();
    });

    test('E-LW3: 警告モーダルで「場所を削除して進む」を選ぶと location が空になり保存される', async ({ page }) => {
        await selectAndCapture(page);
        await page.locator('#input-location').fill('東京');
        await page.click('[data-testid="save-png-btn"]');
        await expect(page.locator('[data-testid="location-warning-modal"]')).toBeVisible();
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.click('#btn-remove-location');
        await expect(page.locator('[data-testid="location-warning-modal"]')).toBeHidden();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.png$/);
        const location = await page.locator('#input-location').inputValue();
        expect(location).toBe('');
    });
});
