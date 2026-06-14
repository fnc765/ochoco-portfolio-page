/**
 * PrintPhoto - 主要フロー E2Eテスト (Playwright)
 *
 * ページ読み込み、画像アップロード、カメラ起動、撮影、テキスト入力、
 * レスポンシブ等の基本動作を検証する。
 */

import { test, expect, openApp, uploadAndOpenCompose, takePictureAndOpenPreview } from './helpers.js';

test('E-P1: ページ読み込み・初期表示', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#screen-top')).toBeVisible();
    await expect(page.locator('[data-testid="image-input"]')).toBeAttached();
    await expect(page.locator('[data-testid="camera-start-btn"]')).toBeDisabled();
});

test('E-P2: 画像ファイルアップロードで camera-start-btn が有効化される', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-testid="image-input"]').setInputFiles('tests/e2e/test-assets/green-screen.png');
    await expect(page.locator('[data-testid="uploaded-preview"] img')).toBeVisible();
    await expect(page.locator('[data-testid="camera-start-btn"]')).toBeEnabled();
});

test('E-P3: カメラ起動で合成画面に遷移する', async ({ page }) => {
    await uploadAndOpenCompose(page);
    // 合成画面のパーツが存在することを確認
    await expect(page.locator('#frame-content')).toBeVisible();
    await expect(page.locator('#overlay-canvas')).toBeAttached();
    await expect(page.locator('[data-testid="threshold-slider"]')).toBeAttached();
    await expect(page.locator('[data-testid="shutter-btn"]')).toBeEnabled();
});

test('E-P4: 撮影でプレビュー画面に遷移し resultCanvas に描画される', async ({ page }) => {
    await uploadAndOpenCompose(page);
    await page.waitForTimeout(500);
    await takePictureAndOpenPreview(page);
    // プレビュー画面の構成要素
    await expect(page.locator('[data-testid="preview-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="title-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="photographer-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="date-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="share-btn"]')).toBeVisible();
    // resultCanvas が意味のあるサイズにリサイズされている
    const dim = await page.evaluate(() => {
        const c = document.getElementById('result-canvas');
        return { w: c.width, h: c.height };
    });
    expect(dim.w).toBeGreaterThan(500);
    expect(dim.h).toBeGreaterThan(300);
});

test('E-P9: 日付が今日の値で自動入力される', async ({ page }) => {
    await openApp(page);
    const browserToday = await page.evaluate(() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    });
    await expect(page.locator('[data-testid="date-input"]')).toHaveValue(browserToday);
});

test('E-P10: 撮影後画面右上の不可視ボタンでデバッグログをコピーできる', async ({ page }) => {
    await uploadAndOpenCompose(page);
    await page.waitForTimeout(500);
    await takePictureAndOpenPreview(page);

    // 不可視ボタンはビューポート右上に 16x16 のヒット領域を持つ
    const btn = page.locator('[data-testid="copy-debug-btn"]');
    await expect(btn).toBeAttached();
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBe(16);
    expect(box.height).toBe(16);

    // 画面右上に配置されている
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThan(viewport.width - 32);
    expect(box.y).toBe(0);

    // 完全に透明で見えない
    const cs = await btn.evaluate(el => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, opacity: s.opacity, border: s.border, boxShadow: s.boxShadow, fontSize: s.fontSize, lineHeight: s.lineHeight, position: s.position };
    });
    expect(cs.bg).toBe('rgba(0, 0, 0, 0)');
    expect(cs.opacity).toBe('0');
    expect(cs.border).toMatch(/^0px/);
    expect(cs.boxShadow).toBe('none');
    expect(cs.position).toBe('fixed');

    // 実タップでクリップボードへコピーされる
    await btn.click();
    const clip = await page.evaluate(async () => {
        await new Promise(r => setTimeout(r, 200));
        return await navigator.clipboard.readText();
    });
    expect(clip).toMatch(/takePicture/);
});

test('E-P15: モバイルビューポートでトップ画面にシャッターボタンが表示されない', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);
    const btn = page.locator('[data-testid="shutter-btn"]');
    await expect(btn).toBeHidden();
});

test('E-P16: デプロイ後のURLでもデバッグログをコピーできる', async ({ page }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(process.env.PLAYWRIGHT_BASE_URL || ''),
        'デプロイURLテストは本番デプロイが必要なためローカルCIでは skip');
    await page.goto('https://ochoco-portfolio.pages.dev/print-photo/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="image-input"]').setInputFiles('tests/e2e/test-assets/green-screen.png');
    await page.waitForTimeout(500);
    await page.click('[data-testid="camera-start-btn"]');
    await expect(page.locator('#screen-compose')).toBeVisible();
    await page.waitForTimeout(500);
    await takePictureAndOpenPreview(page);
    await page.locator('[data-testid="copy-debug-btn"]').click();
    const clip = await page.evaluate(async () => {
        await new Promise(r => setTimeout(r, 200));
        return await navigator.clipboard.readText();
    });
    expect(clip).toMatch(/takePicture/);
});

test('E-P17: カメラ未対応時はトップ画面のままガイドを表示', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-testid="image-input"]').setInputFiles('tests/e2e/test-assets/green-screen.png');
    // APIモックを解除
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
    await uploadAndOpenCompose(page);
    await page.waitForTimeout(500);
    await takePictureAndOpenPreview(page);
    await page.click('#btn-back-compose');
    await expect(page.locator('#screen-compose')).toBeVisible();
    const hasStream = await page.evaluate(() => !!document.getElementById('camera-video')?.srcObject);
    expect(hasStream).toBe(true);
});

test('E-P19: 戻るボタンでトップ画面に戻れる', async ({ page }) => {
    await uploadAndOpenCompose(page);
    await page.click('#btn-back-top');
    await expect(page.locator('#screen-top')).toBeVisible();
});

test('E-P20: 撮影後フォームのラベルに Font Awesome アイコンが表示される', async ({ page }) => {
    await uploadAndOpenCompose(page);
    await page.waitForTimeout(500);
    await takePictureAndOpenPreview(page);

    await expect(page.locator('label[for="input-title"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-comment"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-photographer"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-date"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-location"] .form-icon')).toBeVisible();
});

test('E-P21: プレビュー画面ではフレーム内メタアイコンは非表示、入力値は保持される', async ({ page }) => {
    await uploadAndOpenCompose(page);
    await page.waitForTimeout(500);
    await takePictureAndOpenPreview(page);

    await page.locator('#input-photographer').fill('エーイ A. Eila');
    await page.locator('#input-location').fill('Spagonia by Silent');
    await page.waitForTimeout(300);

    const faUserVisible = await page.locator('#frame-photographer .fa-user').isVisible();
    const faCalendarVisible = await page.locator('#frame-date-location .fa-calendar').isVisible();
    const faLocVisible = await page.locator('#frame-date-location .fa-location-dot').isVisible();
    expect(faUserVisible).toBe(false);
    expect(faCalendarVisible).toBe(false);
    expect(faLocVisible).toBe(false);

    const photographerText = await page.locator('#frame-photographer .meta-text').textContent();
    expect(photographerText).toBe('エーイ A. Eila');
    const locText = await page.locator('#frame-date-location .meta-loc-text').textContent();
    expect(locText).toBe('Spagonia by Silent');
});
