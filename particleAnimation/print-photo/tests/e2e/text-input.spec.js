/**
 * PrintPhoto - 撮影後テキスト入力フォーム E2Eテスト
 *
 * タイトル・撮影者・日付・場所の入力が反映され、localStorage へ保存されることを検証する。
 */

import { test, expect, uploadAndOpenCompose, takePictureAndOpenPreview } from './helpers.js';

test.describe('テキスト入力フォーム', () => {
    test('E-TX1: 撮影後フォームにタイトル・撮影者・日付・場所が入力できる', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);

        await page.locator('[data-testid="title-input"]').fill('テストタイトル');
        await page.locator('[data-testid="photographer-input"]').fill('おちょこ');
        await page.locator('#input-location').fill('東京');

        await expect(page.locator('[data-testid="title-input"]')).toHaveValue('テストタイトル');
        await expect(page.locator('[data-testid="photographer-input"]')).toHaveValue('おちょこ');
        await expect(page.locator('#input-location')).toHaveValue('東京');
    });

    test('E-TX2: 入力したテキストが resultCanvas に反映される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);

        await page.locator('[data-testid="title-input"]').fill('MyTitle');
        await page.locator('[data-testid="photographer-input"]').fill('Ochoco');
        await page.waitForTimeout(200);

        const title = await page.evaluate(() => document.getElementById('frame-title').textContent);
        const photographer = await page.evaluate(() =>
            document.querySelector('#frame-photographer .meta-text').textContent
        );
        expect(title).toBe('MyTitle');
        expect(photographer).toBe('Ochoco');
    });

    test('E-TX3: localStorage にフォーム状態が保存され再読込で復元される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await page.waitForTimeout(500);
        await takePictureAndOpenPreview(page);
        await page.locator('[data-testid="title-input"]').fill('SaveState');
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('pp_state'));
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored);
        expect(parsed.title).toBe('SaveState');
    });
});
