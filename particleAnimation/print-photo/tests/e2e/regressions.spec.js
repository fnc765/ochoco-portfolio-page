import { test, expect, openApp, selectAndCapture, startCamera } from './helpers.js';

function resultCanvasDataUrl(page) {
    return page.evaluate(() => window.PrintPhoto.getState().getInternalResultCanvas().toDataURL());
}

test.describe('回帰テスト', () => {
    test('E-R1: 場所を削除して進むと保存用キャンバスからも場所が消える', async ({ page }) => {
        await selectAndCapture(page);
        await page.locator('#input-location').fill('東京都千代田区');
        await page.waitForTimeout(100);
        const before = await resultCanvasDataUrl(page);

        await page.click('[data-testid="save-png-btn"]');
        const downloadPromise = page.waitForEvent('download');
        await page.click('#btn-remove-location');
        await downloadPromise;

        await expect.poll(() => resultCanvasDataUrl(page)).not.toBe(before);
        await expect(page.locator('#input-location')).toHaveValue('');
    });

    test('E-R2: 撮影後のドラッグが保存用キャンバスへ反映される', async ({ page }) => {
        await selectAndCapture(page, 'tests/e2e/test-assets/transparent-sample.png');
        const before = await resultCanvasDataUrl(page);

        await page.locator('#overlay-canvas').evaluate(canvas => {
            canvas.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                pointerId: 1,
                pointerType: 'mouse',
                clientX: 20,
                clientY: 20,
            }));
            canvas.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                pointerId: 1,
                pointerType: 'mouse',
                clientX: 80,
                clientY: 55,
            }));
            canvas.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                pointerId: 1,
                pointerType: 'mouse',
            }));
        });

        await expect.poll(() => resultCanvasDataUrl(page)).not.toBe(before);
    });

    test('E-R2b: 撮影後のピンチが保存用キャンバスへ反映される', async ({ page }) => {
        await selectAndCapture(page, 'tests/e2e/test-assets/transparent-sample.png');
        const before = await resultCanvasDataUrl(page);

        await page.locator('#overlay-canvas').evaluate(canvas => {
            const dispatchTouches = (type, touches) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperty(event, 'touches', { value: touches });
                canvas.dispatchEvent(event);
            };
            dispatchTouches('touchstart', [
                { clientX: 50, clientY: 50 },
                { clientX: 150, clientY: 50 },
            ]);
            dispatchTouches('touchmove', [
                { clientX: 20, clientY: 50 },
                { clientX: 180, clientY: 50 },
            ]);
            dispatchTouches('touchend', []);
        });

        await expect.poll(() => resultCanvasDataUrl(page)).not.toBe(before);
    });

    test('E-R3: ネイティブ共有のキャンセル時はX Intentを開かない', async ({ page }) => {
        await selectAndCapture(page);
        await page.evaluate(() => {
            window.__xIntentOpenCount = 0;
            navigator.canShare = () => true;
            navigator.share = async () => {
                throw new DOMException('cancelled', 'AbortError');
            };
            window.open = () => {
                window.__xIntentOpenCount += 1;
                return null;
            };
        });

        await page.click('[data-testid="share-btn"]');
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => window.__xIntentOpenCount)).toBe(0);
    });

    test('E-R4: localStorage書き込み失敗時も入力プレビューを更新する', async ({ page }) => {
        await page.addInitScript(() => {
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                if (key === 'pp_state') throw new DOMException('blocked', 'QuotaExceededError');
                return original.call(this, key, value);
            };
        });
        await openApp(page);

        await page.locator('[data-testid="title-input"]').fill('保存できなくても表示');
        await expect(page.locator('#frame-title')).toHaveText('保存できなくても表示');
    });

    test('E-R5: 履歴には最大1024pxの縮小画像を保存する', async ({ page }) => {
        await openApp(page);
        await page.evaluate(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 2048;
            canvas.height = 1200;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#00aa66';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const transfer = new DataTransfer();
            transfer.items.add(new File([blob], 'large.png', { type: 'image/png' }));
            const input = document.getElementById('image-input');
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const dimensions = await page.evaluate(async () => {
            const record = await new Promise((resolve, reject) => {
                const request = indexedDB.open('PrintPhotoDB', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction('thumbnails', 'readonly');
                    const cursor = tx.objectStore('thumbnails').index('createdAt').openCursor(null, 'prev');
                    cursor.onerror = () => reject(cursor.error);
                    cursor.onsuccess = event => resolve(event.target.result?.value || null);
                };
            });
            if (!record) return null;
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = record.dataUrl;
            });
            return { width: image.naturalWidth, height: image.naturalHeight };
        });

        expect(dimensions).not.toBeNull();
        expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(1024);
    });

    test('E-R5b: 履歴から再選択しても高解像度の入力画像を使用する', async ({ page }) => {
        await openApp(page);
        await page.evaluate(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 2048;
            canvas.height = 1200;
            canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const transfer = new DataTransfer();
            transfer.items.add(new File([blob], 'large.png', { type: 'image/png' }));
            const input = document.getElementById('image-input');
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForFunction(async () => {
            return new Promise(resolve => {
                const request = indexedDB.open('PrintPhotoDB', 1);
                request.onsuccess = () => {
                    const db = request.result;
                    const cursor = db.transaction('thumbnails', 'readonly')
                        .objectStore('thumbnails').openCursor();
                    cursor.onsuccess = event => {
                        db.close();
                        resolve(Boolean(event.target.result?.value?.sourceDataUrl));
                    };
                    cursor.onerror = () => { db.close(); resolve(false); };
                };
                request.onerror = () => resolve(false);
            });
        });

        await page.locator('[data-testid="open-history-btn"]').click();
        await page.locator('.thumbnail-select').first().click();
        await expect(page.locator('[data-testid="history-modal"]')).toBeHidden();

        const selectedDimensions = await page.evaluate(async () => {
            const image = new Image();
            image.src = window.PrintPhoto.getState().selectedImageDataUrl;
            await image.decode();
            return { width: image.naturalWidth, height: image.naturalHeight };
        });
        expect(selectedDimensions).toEqual({ width: 2048, height: 1200 });
    });

    test('E-R6: LIVE中にページが非表示になると再起動可能な状態へ戻る', async ({ page }) => {
        await openApp(page);
        await startCamera(page);
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        await expect(page.locator('[data-testid="shutter-btn"]')).toContainText('カメラを起動');
        expect(await page.evaluate(() => window.PrintPhoto.getState().shutterState)).toBe('IDLE');
    });

    test('E-R7: CanvasからBlobを生成できない場合は共有処理を中止する', async ({ page }) => {
        await selectAndCapture(page);
        await page.evaluate(() => {
            window.__nativeShareCount = 0;
            window.__xIntentOpenCount = 0;
            navigator.canShare = () => true;
            navigator.share = async () => { window.__nativeShareCount += 1; };
            window.open = () => { window.__xIntentOpenCount += 1; return null; };
            window.PrintPhoto.getState().getInternalResultCanvas().toBlob = callback => callback(null);
        });

        await page.click('[data-testid="share-btn"]');
        await expect(page.getByRole('status')).toHaveText('画像の共有準備に失敗しました');
        expect(await page.evaluate(() => ({
            native: window.__nativeShareCount,
            x: window.__xIntentOpenCount,
        }))).toEqual({ native: 0, x: 0 });
    });
});
