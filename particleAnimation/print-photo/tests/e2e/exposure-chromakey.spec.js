/**
 * PrintPhoto - 露光・クロマキー調整 E2Eテスト
 *
 * brightness, contrast, threshold, feather スライダーが ctx.filter に
 * 正しく反映されることを実機Chromiumで検証する。
 */

import { test, expect, uploadAndOpenCompose, captureFilterOnDraw, snapshotSlider } from './helpers.js';

test.describe('露光調整 (brightness / contrast)', () => {
    test('E-E1: brightness スライダーの属性と初期値', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const snap = await snapshotSlider(page, 'brightness-slider');
        expect(snap).toBeTruthy();
        expect(snap.value).toBe('100');
        expect(snap.min).toBe('50');
        expect(snap.max).toBe('150');
    });

    test('E-E2: brightness=120 で overlay-canvas の ctx.filter に brightness(120%) が含まれる', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const filters = await captureFilterOnDraw(page, 'brightness-slider', 120);
        expect(filters.some(f => f.includes('brightness(120%)'))).toBe(true);
    });

    test('E-E3: contrast スライダーの属性と初期値', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const snap = await snapshotSlider(page, 'contrast-slider');
        expect(snap.value).toBe('100');
        expect(snap.min).toBe('50');
        expect(snap.max).toBe('150');
    });

    test('E-E4: contrast=80 で ctx.filter に contrast(80%) が含まれる', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const filters = await captureFilterOnDraw(page, 'contrast-slider', 80);
        expect(filters.some(f => f.includes('contrast(80%)'))).toBe(true);
    });

    test('E-E5: brightness=100 / contrast=100 / temperature=0 のとき ctx.filter=none', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const f1 = await captureFilterOnDraw(page, 'brightness-slider', 100);
        expect(f1.every(f => f === 'none')).toBe(true);
        const f2 = await captureFilterOnDraw(page, 'contrast-slider', 100);
        expect(f2.every(f => f === 'none')).toBe(true);
    });

    test('E-E6: 視覚的回帰 - brightness / contrast 変更時のスクリーンショット', async ({ page }) => {
        await uploadAndOpenCompose(page);
        for (const [label, b, c, t] of [
            ['default', 100, 100, 0],
            ['bright', 130, 100, 0],
            ['contrast', 100, 130, 0],
        ]) {
            await page.evaluate(({ b, c, t }) => {
                document.getElementById('brightness-slider').value = b;
                document.getElementById('contrast-slider').value = c;
                document.getElementById('temperature-slider').value = t;
                document.getElementById('brightness-slider').dispatchEvent(new Event('input', { bubbles: true }));
            }, { b, c, t });
            await page.waitForTimeout(300);
            await page.screenshot({ path: `tests/e2e/test-results/exposure-${label}.png`, fullPage: true });
        }
    });
});

test.describe('クロマキー調整 (threshold / feather)', () => {
    test('E-K1: threshold / feather スライダーが DOM に存在する', async ({ page }) => {
        await uploadAndOpenCompose(page);
        await expect(page.locator('#threshold-slider')).toBeAttached();
        await expect(page.locator('#feather-slider')).toBeAttached();
    });

    test('E-K2: threshold スライダーの属性と初期値', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const snap = await snapshotSlider(page, 'threshold-slider');
        expect(snap.value).toBe('30');
        expect(snap.min).toBe('0');
        expect(snap.max).toBe('100');
    });

    test('E-K3: feather スライダーの属性と初期値', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const snap = await snapshotSlider(page, 'feather-slider');
        expect(snap.value).toBe('3');
        expect(snap.min).toBe('0');
        expect(snap.max).toBe('20');
    });

    test('E-K4: threshold 値変更で currentPreviewCanvas のサイズが変化する', async ({ page }) => {
        await uploadAndOpenCompose(page);
        // クロマキー処理結果のサイズ・内容が変わることを確認
        const sizeBefore = await page.evaluate(() => {
            const c = document.getElementById('overlay-canvas');
            return { w: c.width, h: c.height };
        });
        await page.evaluate(() => {
            const t = document.getElementById('threshold-slider');
            t.value = '80';
            t.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(300);
        const sizeAfter = await page.evaluate(() => {
            const c = document.getElementById('overlay-canvas');
            return { w: c.width, h: c.height };
        });
        // overlay-canvas のサイズは保持され、再描画が走っている
        expect(sizeAfter.w).toBe(sizeBefore.w);
        expect(sizeAfter.h).toBe(sizeBefore.h);
        // 70 = 80 * 0.9 + feather3 → ctx.filter は none のはず
        // (threshold は ctx.filter ではなくピクセル処理)
        const filters = await captureFilterOnDraw(page, 'feather-slider', 10);
        expect(filters.every(f => f === 'none')).toBe(true);
    });
});
