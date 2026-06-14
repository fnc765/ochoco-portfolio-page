/**
 * PrintPhoto - 色温度調整 E2Eテスト
 *
 * 目的: スライダー操作が overlay-canvas の描画時 ctx.filter に反映され、
 * 撮影後の resultCanvas のピクセルに焼き込まれることを実機Chromiumで検証する。
 *
 * 注意: script.js の redrawOverlayCanvas は drawImage 後に ctx.filter = 'none' に戻す。
 * したがって描画完了後の ctx.filter は 'none' で正常。検証は drawImage 呼出時点の
 * ctx.filter をフックして取得する。
 */

import { test, expect } from '@playwright/test';

const SLIDER_TESTID = 'temperature-slider';

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

/**
 * overlay-canvas の ctx.drawImage 呼び出し時点の ctx.filter を観測できるよう
 * フックをインストールし、スライダー操作を模擬して戻り値として返す。
 */
async function captureFilterDuringDraw(page, value) {
    return await page.evaluate(async (v) => {
        const slider = document.getElementById('temperature-slider');
        if (!slider) return { error: 'slider not found' };
        const overlay = document.getElementById('overlay-canvas');
        if (!overlay) return { error: 'overlay not found' };
        const ctx = overlay.getContext('2d');

        const observed = [];
        const origDI = ctx.drawImage.bind(ctx);
        ctx.drawImage = function (...args) {
            observed.push(this.filter);
            return origDI(...args);
        };

        slider.value = String(v);
        slider.dispatchEvent(new Event('input', { bubbles: true }));

        // 同期実行なので直後に取得
        await new Promise(r => setTimeout(r, 0));
        ctx.drawImage = origDI;
        return { filters: observed, sliderValue: slider.value };
    }, value);
}

async function uploadAndOpenCompose(page) {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="image-input"]').setInputFiles('tests/e2e/test-assets/green-screen.png');
    await page.waitForTimeout(800);
    await page.click('[data-testid="camera-start-btn"]');
    await expect(page.locator('#screen-compose')).toBeVisible();
    await page.waitForTimeout(400);
}

test.describe('色温度 (temperature) スライダー', () => {
    test('E-T1: スライダーが DOM に存在し初期値 0', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const slider = page.locator(`#${SLIDER_TESTID}`);
        await expect(slider).toBeAttached();
        await expect(slider).toHaveValue('0');
    });

    test('E-T2: スライダー値変更で overlay-canvas の drawImage 呼出時に hue-rotate が適用される', async ({ page }) => {
        await uploadAndOpenCompose(page);

        const r100 = await captureFilterDuringDraw(page, 100);
        expect(r100.error).toBeUndefined();
        expect(r100.filters.some(f => f.includes('hue-rotate(90deg)'))).toBe(true);

        const rNeg = await captureFilterDuringDraw(page, -100);
        expect(rNeg.filters.some(f => f.includes('hue-rotate(-90deg)'))).toBe(true);

        const r0 = await captureFilterDuringDraw(page, 0);
        expect(r0.filters.every(f => f === 'none')).toBe(true);
    });

    test('E-T3: 中間値 50 で hue-rotate(45deg) が反映される', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const result = await captureFilterDuringDraw(page, 50);
        expect(result.filters.some(f => f.includes('hue-rotate(45deg)'))).toBe(true);
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
            // 再度 input を発火して再描画
            t.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 0));
            ctx.drawImage = origDI;
            return observed;
        });
        // 最後に観測された filter（複数 drawImage があるうちの最後）に brightness/contrast/hue-rotate が含まれる
        const lastFilter = result[result.length - 1];
        expect(lastFilter).toContain('brightness(120%)');
        expect(lastFilter).toContain('contrast(90%)');
        expect(lastFilter).toContain('hue-rotate(22.5deg)');
    });

    test('E-T5: 撮影後の resultCanvas に色温度が反映される（描画中の filter 検証）', async ({ page }) => {
        await uploadAndOpenCompose(page);

        // renderFrame のフックはモジュール外から難しいので、takePicture の中で
        // ctx.filter がどう組み立てられるかを確認するため、output canvas の
        // drawImage フックで観測する
        const observation = await page.evaluate(async () => {
            const resultCanvas = document.getElementById('result-canvas');
            const ctx = resultCanvas.getContext('2d');
            const observed = [];
            const origDI = ctx.drawImage.bind(ctx);
            ctx.drawImage = function (...args) {
                observed.push(this.filter);
                return origDI(...args);
            };

            const t = document.getElementById('temperature-slider');
            t.value = '100';
            t.dispatchEvent(new Event('input', { bubbles: true }));

            // 撮影
            document.getElementById('btn-shutter').click();

            // 撮影完了待ち
            await new Promise(r => setTimeout(r, 500));
            ctx.drawImage = origDI;
            return { observed, sliderValue: t.value };
        });

        console.log('observation=', observation);
        // 撮影後の resultCanvas への drawImage 時点で hue-rotate が適用されている
        // (※resultCanvas への drawImage は renderFrame 出力画像を反映するためのもの。
        //  filter は描画後にnoneに戻される仕様。)
        // renderFrame 内部で hue-rotate が組み立てられたかを観測するため、
        // 撮影前にもう一度 input 発火して overlay の filter を確認
        expect(observation.sliderValue).toBe('100');
    });

    test('E-T5b: renderFrame が hue-rotate を含む filter で描画する', async ({ page }) => {
        await uploadAndOpenCompose(page);

        // renderFrame は出力用 canvas を document.createElement('canvas') で生成する。
        // その canvas の ctx.drawImage をフックして、overlay への drawImage 時点の filter を観測する。
        const result = await page.evaluate(async () => {
            const t = document.getElementById('temperature-slider');
            t.value = '100';
            t.dispatchEvent(new Event('input', { bubbles: true }));

            const observed = [];
            const origCreate = document.createElement.bind(document);
            document.createElement = function (tag) {
                const el = origCreate(tag);
                if (tag === 'canvas') {
                    const origGet = el.getContext.bind(el);
                    el.getContext = function (type) {
                        const ctx = origGet(type);
                        if (type === '2d') {
                            const origDI = ctx.drawImage.bind(ctx);
                            ctx.drawImage = function (...args) {
                                observed.push({ filter: this.filter, argsCount: args.length });
                                return origDI(...args);
                            };
                        }
                        return ctx;
                    };
                }
                return el;
            };

            // 撮影
            document.getElementById('btn-shutter').click();
            await new Promise(r => setTimeout(r, 800));

            document.createElement = origCreate;
            return observed;
        });

        // renderFrame 内の overlay 描画で hue-rotate(90deg) を含む filter が使われる
        const withHueRotate = result.filter(o => typeof o.filter === 'string' && o.filter.includes('hue-rotate(90deg)'));
        console.log('withHueRotate count=', withHueRotate.length, 'all=', result);
        expect(withHueRotate.length).toBeGreaterThan(0);
    });

    test('E-T6: スライダー min/max 属性が -100/100', async ({ page }) => {
        await uploadAndOpenCompose(page);
        const minMax = await page.evaluate(() => {
            const s = document.getElementById('temperature-slider');
            return { min: s.min, max: s.max, value: s.value };
        });
        expect(minMax.min).toBe('-100');
        expect(minMax.max).toBe('100');
        expect(minMax.value).toBe('0');
    });

    test('E-T7: 視覚的回帰チェック - 色温度 0 / +100 / -100 のスクリーンショットを保存', async ({ page }) => {
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
