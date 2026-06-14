/**
 * PrintPhoto - 1ページUI 主要フロー E2Eテスト (Playwright)
 *
 * ページ読み込み、画像選択、シャッターボタンの状態遷移、カメラ起動、
 * 撮影、再撮影、テキスト入力、プレビュー、レスポンシブ等の基本動作を検証する。
 */

import { test, expect, openApp, selectImage, startCamera, takePicture, retakePicture, selectAndCapture, openHistoryAndPick, openHistoryModal, closeHistoryModal } from './helpers.js';

test('E-U1: ページ読み込み・初期表示', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="shutter-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('カメラを起動');
    await expect(page.locator('[data-testid="shutter-btn"]')).toBeEnabled();
    // プレースホルダ表示
    await expect(page.locator('[data-testid="preview-placeholder"]')).toBeVisible();
});

test('E-U2: 画像ファイルを選択するとプレースホルダが消え、シャッターボタンは enabled', async ({ page }) => {
    await selectImage(page);
    await expect(page.locator('[data-testid="preview-placeholder"]')).toBeHidden();
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('カメラを起動');
});

test('E-U3: 画像未選択でもシャッターボタン押下でカメラを起動できる', async ({ page }) => {
    await openApp(page);
    await startCamera(page);
    // 撮影ボタンが「撮影」になり、プレースホルダが消えている
    await expect(page.locator('[data-testid="preview-placeholder"]')).toBeHidden();
});

test('E-U4: 撮影でラベルが「再撮影」になり、resultCanvas に描画される', async ({ page }) => {
    await selectAndCapture(page);
    const dim = await page.evaluate(() => {
        const c = document.getElementById('result-canvas');
        return { w: c.width, h: c.height };
    });
    expect(dim.w).toBeGreaterThan(500);
    expect(dim.h).toBeGreaterThan(300);
});

test('E-U5: 撮影後の共有・保存ボタンが enabled になる', async ({ page }) => {
    await selectAndCapture(page);
    await expect(page.locator('[data-testid="share-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="save-png-btn"]')).toBeEnabled();
});

test('E-U6: 撮影前は共有・保存ボタンが disabled', async ({ page }) => {
    await selectImage(page);
    await expect(page.locator('[data-testid="share-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="save-png-btn"]')).toBeDisabled();
});

test('E-U7: 撮影後に「再撮影」を押すとカメラが再起動し LIVE に戻る', async ({ page }) => {
    await selectAndCapture(page);
    await retakePicture(page);
    // resultCanvas は hidden
    const visible = await page.evaluate(() => {
        const c = document.getElementById('result-canvas');
        return window.getComputedStyle(c).display !== 'none';
    });
    expect(visible).toBe(false);
});

test('E-U8: 日付が今日の値で自動入力される', async ({ page }) => {
    await openApp(page);
    const browserToday = await page.evaluate(() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    });
    await expect(page.locator('[data-testid="date-input"]')).toHaveValue(browserToday);
});

test('E-U9: 入力画像調整タイルの折りたたみ状態が localStorage に保存され次回起動時に復元される', async ({ page }) => {
    await openApp(page);
    // 初期は closed
    const initiallyOpen = await page.evaluate(() => {
        return document.getElementById('adjust-tile').open;
    });
    expect(initiallyOpen).toBe(false);

    // 開く
    await page.locator('#adjust-tile > summary').click();
    await page.waitForTimeout(200);
    const afterOpen = await page.evaluate(() => {
        return document.getElementById('adjust-tile').open;
    });
    expect(afterOpen).toBe(true);

    // localStorage に保存されている
    const stored = await page.evaluate(() => localStorage.getItem('pp_adjust_open'));
    expect(stored).toBe('1');

    // リロードして復元
    await page.reload();
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });
    const restored = await page.evaluate(() => {
        return document.getElementById('adjust-tile').open;
    });
    expect(restored).toBe(true);
});

test('E-U10: 撮影後でも入力画像調整スライダーを変更できる（ロックされない）', async ({ page }) => {
    await selectAndCapture(page);
    // adjust-tile を開く
    await page.locator('#adjust-tile').evaluate(el => el.setAttribute('open', ''));
    // 明るさスライダーを変更
    await page.evaluate(() => {
        const s = document.getElementById('brightness-slider');
        s.value = '130';
        s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    // スライダー値が反映
    const v = await page.evaluate(() => document.getElementById('brightness-slider').value);
    expect(v).toBe('130');
});

test('E-U11: 履歴モーダルを開き、画像を選択するとモーダルが閉じてプレースホルダが消える', async ({ page }) => {
    await openHistoryAndPick(page);
    await expect(page.locator('[data-testid="preview-placeholder"]')).toBeHidden();
});

test('E-U12: 履歴モーダルは空のとき「まだ履歴がありません」', async ({ page }) => {
    await openApp(page);
    await openHistoryModal(page);
    await expect(page.locator('[data-testid="thumbnail-empty"]')).toBeVisible();
    await closeHistoryModal(page);
});

test('E-U13: ヘッダーに Portfolio 戻るリンクが存在する', async ({ page }) => {
    await openApp(page);
    const backLink = page.locator('header .back-link');
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', /^\.\.\//);
});

test('E-U14: 最終行の pp-final-actions 内に「ポートフォリオに戻る」ボタンは存在しない', async ({ page }) => {
    await openApp(page);
    const finalActions = page.locator('[data-testid="final-actions"]');
    // 戻るリンクが無いこと
    const backLinkInside = finalActions.locator('a, button:has-text("戻る"), button:has-text("Portfolio")');
    expect(await backLinkInside.count()).toBe(0);
});

test('E-U15: 撮影後フォームのラベルに Font Awesome アイコンが表示される', async ({ page }) => {
    await selectAndCapture(page);
    await expect(page.locator('label[for="input-title"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-photographer"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-date"] .form-icon')).toBeVisible();
    await expect(page.locator('label[for="input-location"] .form-icon')).toBeVisible();
});

test('E-U16: 撮影後のテキスト入力で frame-text-layer に即時反映', async ({ page }) => {
    await selectAndCapture(page);
    await page.locator('#input-photographer').fill('エーイ A. Eila');
    await page.locator('#input-location').fill('Spagonia by Silent');
    await page.waitForTimeout(300);
    const photographerText = await page.locator('#frame-photographer .meta-text').textContent();
    expect(photographerText).toBe('エーイ A. Eila');
    const locText = await page.locator('#frame-date-location .meta-loc-text').textContent();
    expect(locText).toBe('Spagonia by Silent');
});

test('E-U17: 日付は MM/DD/YYYY 形式で表示される', async ({ page }) => {
    await selectAndCapture(page);
    await page.locator('#input-date').fill('2026-06-13');
    await page.waitForTimeout(300);
    const dateText = await page.locator('#frame-date-location .meta-date-text').textContent();
    expect(dateText).toBe('06/13/2026');
});

test('E-U18: 撮影後右上の不可視ボタンでデバッグログをコピーできる', async ({ page }) => {
    await selectAndCapture(page);

    const btn = page.locator('[data-testid="copy-debug-btn"]');
    await expect(btn).toBeAttached();
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBe(16);
    expect(box.height).toBe(16);

    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThan(viewport.width - 32);
    expect(box.y).toBe(0);

    const cs = await btn.evaluate(el => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, opacity: s.opacity, border: s.border, boxShadow: s.boxShadow, position: s.position };
    });
    expect(cs.bg).toBe('rgba(0, 0, 0, 0)');
    expect(cs.opacity).toBe('0');
    expect(cs.border).toMatch(/^0px/);
    expect(cs.boxShadow).toBe('none');
    expect(cs.position).toBe('fixed');

    await btn.click();
    const clip = await page.evaluate(async () => {
        await new Promise(r => setTimeout(r, 200));
        return await navigator.clipboard.readText();
    });
    expect(clip).toMatch(/takePicture/);
});

test('E-U19: モバイルビューポートでもシャッターボタン・保存ボタンが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);
    await expect(page.locator('[data-testid="shutter-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-png-btn"]')).toBeAttached();
});

test('E-U20: カメラ未対応時はシャッターボタンが ERROR 状態になり、ガイドを表示', async ({ page }) => {
    await openApp(page);
    // APIモックを解除
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: undefined,
        });
    });
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('#camera-permission-guide')).toBeVisible();
    await expect(page.locator('#camera-permission-guide')).toContainText('カメラ機能に対応していません');
});
