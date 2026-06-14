/**
 * PrintPhoto - E2Eテスト共通ヘルパー
 *
 * 1ページUI構成 (2026-06) に対応。シャッターボタンの状態機械
 * (IDLE / STARTING / LIVE / CAPTURED / ERROR) と画像選択・履歴モーダル・
 * プレビュー枠(#photo-frame)に対する操作を共通化する。
 */

import { test as base, expect } from '@playwright/test';

export const TEST_IMAGE = 'tests/e2e/test-assets/green-screen.png';

/**
 * navigator.mediaDevices.getUserMedia と geolocation をモックする init script。
 * beforeEach で context.addInitScript(installApiMocks) として使う。
 *
 * getUserMedia は空のMediaStreamを返すモック。videoWidth/Height は getSettings()
 * がないので 0 になるが、本テストではカメラ映像の drawImage までは検証しない。
 * 撮影時の挙動は takePicture ヘルパー内で waitForVideoReady が ready 判定を通すため、
 * 「カメラ停止→再起動」の遷移を主眼に検証する。
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
 * クリップボード読み書き権限も付与する。
 */
export const test = base.extend({
    context: async ({ context }, use) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
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
    await expect(page.locator('[data-testid="shutter-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('カメラを起動');
}

// =====================================
// 画像選択
// =====================================

/**
 * 画像ファイルを選択する（カメラは起動しない）
 */
export async function selectImage(page, assetPath = TEST_IMAGE) {
    await openApp(page);
    await page.locator('[data-testid="image-input"]').setInputFiles(assetPath);
    await expect(page.locator('[data-testid="preview-placeholder"]')).toBeHidden();
    // シャッターボタンは enabled のまま
    await expect(page.locator('[data-testid="shutter-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('カメラを起動');
}

/**
 * 履歴モーダルを開いて画像を選択する
 */
export async function openHistoryAndPick(page, assetPath = TEST_IMAGE) {
    await openApp(page);
    // まず1度画像を選んで履歴に保存
    await page.locator('[data-testid="image-input"]').setInputFiles(assetPath);
    await page.waitForTimeout(300);
    await openHistoryModal(page);
    const item = page.locator('.thumbnail-item').first();
    await item.click();
    await expect(page.locator('[data-testid="history-modal"]')).toBeHidden();
}

export async function openHistoryModal(page) {
    await page.click('[data-testid="open-history-btn"]');
    await expect(page.locator('[data-testid="history-modal"]')).toBeVisible();
}

export async function closeHistoryModal(page) {
    await page.click('[data-testid="close-history-btn"]');
    await expect(page.locator('[data-testid="history-modal"]')).toBeHidden();
}

// =====================================
// シャッターボタン 状態遷移
// =====================================

/**
 * シャッターボタン押下 → カメラ起動 (LIVE 状態)
 */
export async function startCamera(page) {
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('撮影');
    await expect(page.locator('#photo-frame')).toHaveClass(/pp-live/);
}

/**
 * 撮影 → CAPTURED 状態 (resultCanvas 表示)
 */
export async function takePicture(page) {
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('再撮影');
    await expect(page.locator('#photo-frame')).toHaveClass(/pp-captured/);
    // resultCanvas に意味のあるサイズが設定されている
    await page.waitForFunction(() => {
        const c = document.getElementById('result-canvas');
        return c && c.width > 0 && c.height > 0;
    });
}

/**
 * 再撮影 → STARTING → LIVE
 */
export async function retakePicture(page) {
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('撮影');
    await expect(page.locator('#photo-frame')).toHaveClass(/pp-live/);
}

/**
 * 画像選択 → カメラ起動 → 撮影 まで一気に進める
 */
export async function selectAndCapture(page, assetPath = TEST_IMAGE) {
    await selectImage(page, assetPath);
    await startCamera(page);
    await takePicture(page);
}

// =====================================
// スライダー操作
// =====================================

/**
 * スライダー値を変更して input イベント発火
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
 * 撮影ボタン押下による renderFrame 呼び出しにフックする。
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

/**
 * 撮影後 (CAPTURED) の resultCanvas 再描画 ctx.filter を観測する。
 * スライダー操作で renderResultFromState が走る際の filter を検証する。
 */
export async function captureResultFilterOnAdjust(page, sliderId, value) {
    return await page.evaluate(async ({ sliderId, value }) => {
        const slider = document.getElementById(sliderId);
        if (!slider) throw new Error('Slider not found: ' + sliderId);
        const resultCanvas = document.getElementById('result-canvas');
        if (!resultCanvas) throw new Error('result-canvas not found');
        const ctx = resultCanvas.getContext('2d');
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
