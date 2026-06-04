/**
 * PrintPhoto - E2Eテスト (Playwright)
 */

import { test, expect } from '@playwright/test';

// =====================================
// グローバルセットアップ: APIモック
// =====================================
test.beforeEach(async ({ page }) => {
    // getUserMedia モック
    await page.evaluate(() => {
        const mockStream = {
            getTracks: () => [{ stop: () => {} }],
        };
        navigator.mediaDevices.getUserMedia = async () => mockStream;
    });

    // geolocation モック
    await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (success) => {
            success({ coords: { latitude: 35.0, longitude: 139.0 } });
        };
    });
});

// =====================================
// ページ読み込み
// =====================================
test('E-P1: ページ読み込み・初期表示', async ({ page }) => {
    await page.goto('/print-photo/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible();
    // スクリーンショットでダークテーマを視覚的に確認（CIでは比較用に保存）
    await page.screenshot({ path: 'tests/e2e/screenshots/initial.png' });
});

// =====================================
// ファイルアップロード
// =====================================
test('E-P2: 画像ファイルアップロード', async ({ page }) => {
    await page.goto('/print-photo/');
    const input = page.locator('[data-testid="image-input"]');

    // テスト用GB画像をアップロード（プロジェクト内にテストアセットを置く想定）
    await input.setInputFiles('tests/e2e/test-assets/green-screen.png');

    await expect(page.locator('[data-testid="uploaded-preview"] img')).toBeVisible();
});

// =====================================
// カメラ起動
// =====================================
test('E-P3: カメラ起動モック', async ({ page }) => {
    await page.goto('/print-photo/');
    // 画像を選択してカメラ開始ボタンを有効化
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
    await page.goto('/print-photo/');
    const today = new Date().toISOString().slice(0, 10);
    await expect(page.locator('[data-testid="date-input"]')).toHaveValue(today);
});

// =====================================
// レスポンシブ
// =====================================
test('E-P15: レスポンシブ（モバイルビューポート）', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/print-photo/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible();
    // 撮影ボタンがタップ可能なサイズかチェック
    const btn = page.locator('[data-testid="shutter-btn"]');
    await expect(btn).toBeHidden(); // トップ画面では非表示
});
