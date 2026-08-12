import { test, expect, openApp } from './helpers.js';

test.describe('アクセシビリティ', () => {
    test('E-A1: ページのピンチズームを禁止しない', async ({ page }) => {
        await openApp(page);
        const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
        expect(viewport).not.toContain('user-scalable=no');
        expect(viewport).not.toContain('maximum-scale=1');
    });

    test('E-A2: 履歴モーダルはフォーカス移動・Escape・フォーカス復元に対応する', async ({ page }) => {
        await openApp(page);
        await page.locator('[data-testid="open-history-btn"]').focus();
        await page.locator('[data-testid="open-history-btn"]').click();
        await expect(page.locator('[data-testid="close-history-btn"]')).toBeFocused();

        await page.keyboard.press('Escape');
        await expect(page.locator('[data-testid="history-modal"]')).toBeHidden();
        await expect(page.locator('[data-testid="open-history-btn"]')).toBeFocused();
    });

    test('E-A3: トーストを支援技術へ通知する', async ({ page }) => {
        await openApp(page);
        await page.evaluate(() => window.PrintPhoto.showToast('完了しました'));
        const toast = page.getByRole('status');
        await expect(toast).toHaveText('完了しました');
        await expect(toast).toHaveAttribute('aria-live', 'polite');
    });

    test('E-A4: 履歴画像をキーボードで選択できる', async ({ page }) => {
        await openApp(page);
        await page.locator('[data-testid="image-input"]').setInputFiles('tests/e2e/test-assets/transparent-sample.png');
        await page.locator('[data-testid="open-history-btn"]').click();
        const selectButton = page.getByRole('button', { name: '履歴画像を使用' }).first();
        await selectButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-testid="history-modal"]')).toBeHidden();
    });

    test('E-A5: 撮影者と場所には出力崩れ防止の文字数上限がある', async ({ page }) => {
        await openApp(page);
        await expect(page.locator('[data-testid="photographer-input"]')).toHaveAttribute('maxlength', '40');
        await expect(page.locator('#input-location')).toHaveAttribute('maxlength', '80');
    });

    test('E-A6: 履歴削除ボタンはタッチ端末とキーボードで視認できる', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openApp(page);
        await page.locator('[data-testid="image-input"]').setInputFiles('tests/e2e/test-assets/transparent-sample.png');
        await page.locator('[data-testid="open-history-btn"]').click();

        const deleteButton = page.getByRole('button', { name: '削除' }).first();
        await expect(deleteButton).toHaveCSS('opacity', '1');
        await deleteButton.focus();
        await expect(deleteButton).toBeFocused();
        await expect(deleteButton).toHaveCSS('opacity', '1');
    });
});
