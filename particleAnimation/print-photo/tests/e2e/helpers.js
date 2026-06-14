/**
 * PrintPhoto - E2Eテスト共通ヘルパー
 *
 * 各e2eテストファイルから import して使用する。
 * - 画面遷移、画像アップロード、カメラ起動モック、スライダー操作、
 *   描画中の ctx.filter キャプチャなどを共通化する。
 */

import { test as base, expect } from '@playwright/test';

export const TEST_IMAGE = 'tests/e2e/test-assets/green-screen.png';

/**
 * navigator.mediaDevices.getUserMedia と geolocation をモックする init script。
 * beforeEach で context.addInitScript(installApiMocks) として使う。
 */
export function installApiMocks() {
    return `
        if (!navigator.mediaDevices) {
            navigator.mediaDevices = {};
        }
        navigator.mediaDevices.getUserMedia = async () => new MediaStream();
        navigator.geolocation.getCurrentPosition = (success) => {
            success({ coords: { latitude: 35.0, longitude: 139.0 } });
        };
    `;
}

/**
 * テスト用 fixture: ページを開くだけでカメラ・位置情報モックが有効な状態になる。
 * 利用例: test('foo', async ({ page }) => { ... });
 */
export const test = base.extend({
    context: async ({ context }, use) => {
        await context.addInitScript({ content: installApiMocks() });
        await use(context);
    },
});

export { expect };

// =====================================
// ナビゲーション
// =====================================

/**
 * ページを開いてローディング完了まで待機
 */
export async function openApp(page) {
    await page.goto('/');
    await expect(page.locator('[data-testid="main-view"]')).toBeVisible({ timeout: 10000 });
}

/**
 * 画像アップロード → カメラ起動 → 合成画面遷移
 */
export async function uploadAndOpenCompose(page) {
    await openApp(page);
    await page.locator('[data-testid="image-input"]').setInputFiles(TEST_IMAGE);
    await page.waitForTimeout(800);
    await page.click('[data-testid="camera-start-btn"]');
    await expect(page.locator('#screen-compose')).toBeVisible();
    await page.waitForTimeout(400);
}

/**
 * 合成画面 → 撮影 → プレビュー画面遷移
 */
export async function takePictureAndOpenPreview(page) {
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('#screen-preview')).toBeVisible();
    await page.waitForTimeout(400);
}

// =====================================
// スライダー操作
// =====================================

/**
 * スライダー値を変更して input イベント発火
 * @param {import('@playwright/test').Page} page
 * @param {string} id - sliderのid
 * @param {string|number} value
 */
export async function setSliderValue(page, id, value) {
    await page.evaluate(({ id, value }) => {
        const el = document.getElementById(id);
        if (!el) throw new Error('Slider not found: ' + id);
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { id, value });
}

/**
 * overlay-canvas の ctx.drawImage 呼出時点の ctx.filter を観測して返す。
 * 副作用としてスライダーを動かして再描画させる。
 * @param {import('@playwright/test').Page} page
 * @param {string} sliderId
 * @param {string|number} value
 * @returns {Promise<string[]>} 観測された ctx.filter の配列
 */
export async function captureFilterOnDraw(page, sliderId, value) {
    return await page.evaluate(async ({ sliderId, value }) => {
        const slider = document.getElementById(sliderId);
        if (!slider) throw new Error('Slider not found: ' + sliderId);
        const overlay = document.getElementById('overlay-canvas');
        if (!overlay) throw new Error('overlay-canvas not found');
        const ctx = overlay.getContext('2d');
        const observed = [];
        const origDI = ctx.drawImage.bind(ctx);
        ctx.drawImage = function (...args) {
            observed.push(this.filter);
            return origDI(...args);
        };
        slider.value = String(value);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
        ctx.drawImage = origDI;
        return observed;
    }, { sliderId, value });
}

/**
 * renderFrame が出力する canvas の drawImage 呼出時点の ctx.filter を観測して返す。
 * スライダー操作 → 撮影 の一連の流れの中で、renderFrame 内部の hue-rotate 等を
 * 検証する目的で使用する。
 * @param {import('@playwright/test').Page} page
 * @param {string} sliderId
 * @param {string|number} value
 * @returns {Promise<{filter: string, argsCount: number}[]>}
 */
export async function captureRenderFrameFilters(page, sliderId, value) {
    return await page.evaluate(async ({ sliderId, value }) => {
        const slider = document.getElementById(sliderId);
        if (slider) {
            slider.value = String(value);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
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
        try {
            document.getElementById('btn-shutter').click();
            await new Promise(r => setTimeout(r, 800));
        } finally {
            document.createElement = origCreate;
        }
        return observed;
    }, { sliderId, value });
}

// =====================================
// よく使うアサーション
// =====================================

/**
 * スライダーの現在値と属性をスナップショット
 */
export async function snapshotSlider(page, id) {
    return await page.evaluate((id) => {
        const s = document.getElementById(id);
        if (!s) return null;
        return { value: s.value, min: s.min, max: s.max };
    }, id);
}
