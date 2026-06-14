/**
 * PrintPhoto - テキスト入力フォーム E2Eテスト
 *
 * 1ページUIでは撮影前後で常時表示。タイトル・撮影者・日付・場所の入力が
 * プレビュー枠の frame-text-layer に即時反映され、localStorage へ保存される。
 */

import { test, expect, selectAndCapture, openApp } from './helpers.js';

test.describe('テキスト入力フォーム', () => {
    test('E-TX1: 撮影前でもフォームにタイトル・撮影者・日付・場所が入力できる', async ({ page }) => {
        await openApp(page);
        await page.locator('[data-testid="title-input"]').fill('テストタイトル');
        await page.locator('[data-testid="photographer-input"]').fill('おちょこ');
        await page.locator('#input-location').fill('東京');

        await expect(page.locator('[data-testid="title-input"]')).toHaveValue('テストタイトル');
        await expect(page.locator('[data-testid="photographer-input"]')).toHaveValue('おちょこ');
        await expect(page.locator('#input-location')).toHaveValue('東京');
    });

    test('E-TX2: 入力したテキストが frame-text-layer に反映される', async ({ page }) => {
        await selectAndCapture(page);
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

    test('E-TX3: localStorage にフォーム状態が保存される', async ({ page }) => {
        await openApp(page);
        await page.locator('[data-testid="title-input"]').fill('SaveState');
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('pp_state'));
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored);
        expect(parsed.title).toBe('SaveState');
    });

    test('E-TX4: ページリロード時に localStorage の値がプレビュー枠 (frame-text-layer) に反映される', async ({ page }) => {
        // 1回目: テキストを入力して localStorage に保存
        await openApp(page);
        await page.locator('[data-testid="title-input"]').fill('保存タイトル');
        await page.locator('[data-testid="photographer-input"]').fill('保存撮影者');
        await page.locator('#input-location').fill('保存場所');
        await page.locator('[data-testid="date-input"]').fill('2025-01-15');
        await page.waitForTimeout(200);

        // 2回目: ページを再読み込みして、プレビュー DOM に localStorage の値が反映されることを確認
        await page.reload();
        await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

        const title = await page.evaluate(() => document.getElementById('frame-title').textContent);
        const photographer = await page.evaluate(() =>
            document.querySelector('#frame-photographer .meta-text').textContent
        );
        const dateText = await page.evaluate(() =>
            document.querySelector('#frame-date-location .meta-date-text').textContent
        );
        const locText = await page.evaluate(() =>
            document.querySelector('#frame-date-location .meta-loc-text').textContent
        );
        const photographerVisible = await page.evaluate(() =>
            document.getElementById('frame-photographer').style.display !== 'none'
        );
        const dateLocVisible = await page.evaluate(() =>
            document.getElementById('frame-date-location').style.display !== 'none'
        );

        expect(title).toBe('保存タイトル');
        expect(photographer).toBe('保存撮影者');
        expect(locText).toBe('保存場所');
        expect(photographerVisible).toBe(true);
        expect(dateLocVisible).toBe(true);
        // 日付は MMDDYYYY 形式で表示される
        expect(dateText).toMatch(/01\/15\/2025/);
    });
});
