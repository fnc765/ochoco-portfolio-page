/**
 * PrintPhoto - E2Eテスト (Playwright)
 */

import { test, expect } from '@playwright/test';

// =====================================
// グローバルセットアップ: APIモック
// =====================================
test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
        if (!navigator.mediaDevices) {
            navigator.mediaDevices = {};
        }
        navigator.mediaDevices.getUserMedia = async () => new MediaStream();

        navigator.geolocation.getCurrentPosition = (success) => {
            success({ coords: { latitude: 35.0, longitude: 139.0 } });
        };
    });
});

// =====================================
// ページ読み込み
// =====================================
test('E-P1: ページ読み込み・初期表示', async ({ page }) => {
    await page.goto('/');
    // ローディング後にメイン画面が表示されるまで待機
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });
});

// =====================================
// ファイルアップロード
// =====================================
test('E-P2: 画像ファイルアップロード', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="image-input"]');
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');

    await expect(page.locator('[data-testid="uploaded-preview"] img')).toBeVisible();
});

// =====================================
// カメラ起動
// =====================================
test('E-P3: カメラ起動モック', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="image-input"]');
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');

    await page.click('[data-testid="camera-start-btn"]');
    // 合成画面に遷移
    await expect(page.locator('#screen-compose')).toBeVisible();
});

// =====================================
// テキスト入力・プレビュー
// =====================================
test('E-P9: 日付自動入力', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const today = new Date().toISOString().slice(0, 10);
    await expect(page.locator('[data-testid="date-input"]')).toHaveValue(today);
});

// =====================================
// レスポンシブ
// =====================================
test('E-P15: レスポンシブ（モバイルビューポート）', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const btn = page.locator('[data-testid="shutter-btn"]');
    await expect(btn).toBeHidden(); // トップ画面では非表示
});
