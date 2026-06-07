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
// 撮影後デバッグログ確認
// =====================================
test('E-P10: 撮影後デバッグログが表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="image-input"]');
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');

    // 画像処理が完了するまで待機
    await page.waitForTimeout(500);

    await page.click('[data-testid="camera-start-btn"]');
    await expect(page.locator('#screen-compose')).toBeVisible();

    // カメラ映像が準備できるまで待機（モックでも readyState >= 2 になるのを待つ）
    await page.waitForTimeout(500);

    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('#screen-preview')).toBeVisible();

    // デバッグパネルが表示される
    const debugPanel = page.locator('#debug-panel');
    await expect(debugPanel).toBeVisible();

    // スクリーンショットを撮影して視覚的に確認
    await page.screenshot({ path: 'tests/e2e/test-results/debug-panel-visible.png', fullPage: true });

    // デバッグログに takePicture の内容が含まれる
    const debugLog = page.locator('#debug-log');
    await expect(debugLog).toHaveValue(/takePicture/);
});

test('E-P16: デプロイ後のURLでデバッグログが表示される', async ({ page }) => {
    await page.goto('https://ochoco-portfolio.pages.dev/print-photo/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="image-input"]');
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');

    // 画像処理が完了するまで待機
    await page.waitForTimeout(500);

    await page.click('[data-testid="camera-start-btn"]');
    await expect(page.locator('#screen-compose')).toBeVisible();

    // カメラ映像が準備できるまで待機
    await page.waitForTimeout(500);

    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('#screen-preview')).toBeVisible();

    // デバッグパネルが表示される
    const debugPanel = page.locator('#debug-panel');
    await expect(debugPanel).toBeVisible();

    // スクリーンショットを撮影して視覚的に確認
    await page.screenshot({ path: 'tests/e2e/test-results/deploy-debug-panel.png', fullPage: true });

    // デバッグログに takePicture の内容が含まれる
    const debugLog = page.locator('#debug-log');
    await expect(debugLog).toHaveValue(/takePicture/);
});

test('E-P17: カメラ未対応時はトップ画面のままガイドを表示', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="image-input"]');
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');

    await page.evaluate(() => {
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: undefined,
        });
    });

    await page.click('[data-testid="camera-start-btn"]');

    await expect(page.locator('#screen-top')).toBeVisible();
    await expect(page.locator('#camera-permission-guide')).toContainText('カメラ機能に対応していません');
});

test('E-P18: プレビューから戻るとカメラプレビューを再開する', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="image-input"]');
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');
    await page.waitForTimeout(500);

    await page.click('[data-testid="camera-start-btn"]');
    await expect(page.locator('#screen-compose')).toBeVisible();

    await page.waitForTimeout(500);
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('#screen-preview')).toBeVisible();

    await page.click('#btn-back-compose');
    await expect(page.locator('#screen-compose')).toBeVisible();

    const hasStream = await page.evaluate(() => {
        return !!document.getElementById('camera-video')?.srcObject;
    });
    expect(hasStream).toBe(true);
});

// =====================================
// テキスト入力・プレビュー
// =====================================
test('E-P9: 日付自動入力', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });

    // ブラウザ内の日付と一致させる（タイムゾーン差対策）
    const browserToday = await page.evaluate(() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    });
    await expect(page.locator('[data-testid="date-input"]')).toHaveValue(browserToday);
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
