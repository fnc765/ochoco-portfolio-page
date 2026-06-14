/**
 * PrintPhoto - 色温度調整 E2Eテスト
 *
 * スライダー操作が overlay-canvas の描画時 ctx.filter に反映され、
 * 撮影後の renderFrame 内部で hue-rotate が適用されることを実機Chromiumで検証する。
 *
 * 注意: script.js の redrawOverlayCanvas は drawImage 後に ctx.filter = 'none' に戻す。
 * したがって描画完了後の ctx.filter は 'none' で正常。検証は drawImage 呼出時点の
 * ctx.filter をフックして取得する。
 */

import { test, expect, uploadAndOpenCompose, captureFilterOnDraw, captureRenderFrameFilters, snapshotSlider } from './helpers.js';

test.describe('色温度 (temperature) スライダー', () => {
    test('E-T1: スライダーが DOM に存在し初期値 0', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const slider = page.locator('#temperature-slider');
        await expect(slider).toBeAttached();
        const snap = await snapshotSlider(page, 'temperature-slider');
        expect(snap.value).toBe('0');
        expect(snap.min).toBe('-100');
        expect(snap.max).toBe('100');
    });

    test('E-T2: 値変更で overlay-canvas の drawImage 呼出時に hue-rotate が適用される', async ({ page }) => {
        await uploadAndOpenCompose(page);

        const f100 = await captureFilterOnDraw(page, 'temperature-slider', 100);
        expect(f100.some(f => f.includes('hue-rotate(90deg)'))).toBe(true);

        const fNeg = await captureFilterOnDraw(page, 'temperature-slider', -100);
        expect(fNeg.some(f => f.includes('hue-rotate(-90deg)'))).toBe(true);

        const f0 = await captureFilterOnDraw(page, 'temperature-slider', 0);
        expect(f0.every(f => f === 'none')).toBe(true);
    });

    test('E-T3: 中間値 50 で hue-rotate(45deg) が反映される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const filters = await captureFilterOnDraw(page, 'temperature-slider', 50);
        expect(filters.some(f => f.includes('hue-rotate(45deg)'))).toBe(true);
    });

    test('E-T4: brightness/contrast と組み合わせても filter が組み立てられる', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const result = await page.evaluate(async () => {
            const b = document.getElementById('brightness-slider');
            const c = document.getElementById('contrast-slider');
            const t = document.getElementById('temperature-slider');
            b.value = '120';
            c.value = '90';
            t.value = '25';
            b.dispatchEvent(new Event('input', { bubbles: true }));
            c.dispatchEvent(new Event('input', { bubbles: true }));
            t.dispatchEvent(new Event('input', { bubbles: true }));

            const overlay = document.getElementById('overlay-canvas');
            const ctx = overlay.getContext('2d');
            const observed = [];
            const origDI = ctx.drawImage.bind(ctx);
            ctx.drawImage = function (...args) {
                observed.push(this.filter);
                return origDI(...args);
            };
            t.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 0));
            ctx.drawImage = origDI;
            return observed;
        });
        const lastFilter = result[result.length - 1];
        expect(lastFilter).toContain('brightness(120%)');
        expect(lastFilter).toContain('contrast(90%)');
        expect(lastFilter).toContain('hue-rotate(22.5deg)');
    });

    test('E-T5: renderFrame 内部で hue-rotate を含む filter が描画される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const observed = await captureRenderFrameFilters(page, 'temperature-slider', 100);
        const withHue = observed.filter(o => typeof o.filter === 'string' && o.filter.includes('hue-rotate(90deg)'));
        expect(withHue.length).toBeGreaterThan(0);
    });

    test('E-T6: 視覚的回帰チェック - 色温度 0 / +100 / -100 のスクリーンショット', async ({ page }) => {
        await uploadAndOpenCompose(page);
        for (const [label, value] of [['0', '0'], ['plus100', '100'], ['minus100', '-100']]) {
            await page.evaluate((v) => {
                const t = document.getElementById('temperature-slider');
                t.value = v;
                t.dispatchEvent(new Event('input', { bubbles: true }));
            }, value);
            await page.waitForTimeout(300);
            await page.screenshot({ path: `tests/e2e/test-results/temperature-${label}.png`, fullPage: true });
        }
    });
});
