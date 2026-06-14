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
 * カメラ映像の代わりに、テスト用 canvas からの captureStream を MediaStream として返す。
 * これにより videoWidth/videoHeight/track が有効になり、撮影フローが実機と同様に動作する。
 */
export function installApiMocks() {
    return `
        if (!navigator.mediaDevices) {
            navigator.mediaDevices = {};
        }
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            // 制約チェックを通すため、すべての制約を満たす track を作成
            const c = document.createElement('canvas');
            const w = (constraints && constraints.video && constraints.video.width && constraints.video.width.ideal) || 1920;
            const h = (constraints && constraints.video && constraints.video.height && constraints.video.height.ideal) || 1080;
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            // 単色 (緑系) で塗り、カメラ映像の代わりに使う
            ctx.fillStyle = '#3a8a3a';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '48px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('MOCK CAM', c.width / 2, c.height / 2);
            const stream = c.captureStream(15);
            // captureStream の track に facingMode / width / height を settings として持たせる
            try {
                const track = stream.getVideoTracks()[0];
                if (track) {
                    const settings = {
                        width: w,
                        height: h,
                        frameRate: 15,
                        deviceId: 'mock-device',
                    };
                    // facingMode は facingMode が要求されていれば設定
                    if (constraints?.video?.facingMode) {
                        const fm = constraints.video.facingMode;
                        settings.facingMode = typeof fm === 'string' ? fm : (fm.ideal || fm.exact || 'environment');
                    }
                    Object.defineProperty(track, 'getSettings', {
                        value: () => settings,
                        configurable: true,
                    });
                }
            } catch (e) {
                // ignore
            }
            window.__mockCameraCanvas = c;
            return stream;
        };
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
 * 撮影 → CAPTURED 状態。内部キャンバス (2048x1440) が生成されていることを確認。
 * 表示は HTML 構造（白額縁・黒絵エリア・テキスト）がそのまま使われる。
 */
export async function takePicture(page) {
    await page.click('[data-testid="shutter-btn"]');
    await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('再撮影');
    await expect(page.locator('#photo-frame')).toHaveClass(/pp-captured/);
    // 内部キャンバスが 2048x1440 で生成されるのを待つ
    await page.waitForFunction(() => {
        const s = window.PrintPhoto && window.PrintPhoto.getState && window.PrintPhoto.getState();
        if (!s) return false;
        const c = s.getInternalResultCanvas && s.getInternalResultCanvas();
        return c && c.width === 2048 && c.height === 1440;
    }, { timeout: 5000 });
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
 * 撮影後 (CAPTURED) のスライダー操作で renderResultThumbnail 内の ctx.filter を観測する。
 * 内部キャンバスは document.createElement('canvas') で生成されるため、それをフックする。
 */
export async function captureResultFilterOnAdjust(page, sliderId, value) {
    return await page.evaluate(async ({ sliderId, value }) => {
        const slider = document.getElementById(sliderId);
        if (!slider) throw new Error('Slider not found: ' + sliderId);
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
                            observed.push({ filter: this.filter, w: el.width, h: el.height });
                            return origDI(...args);
                        };
                    }
                    return ctx;
                };
            }
            return el;
        };
        try {
            slider.value = String(value);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            // 縮小版 + rAF での最終版の両方が走るのを待つ
            await new Promise(r => setTimeout(r, 200));
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
