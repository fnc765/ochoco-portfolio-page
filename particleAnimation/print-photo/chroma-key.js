/**
 * PrintPhoto - クロマキー/透過処理モジュール
 * フェーズ2
 */

/**
 * 画像を読み込んでOffscreenCanvasに描画する
 * @param {string} src - DataURL または URL
 * @returns {Promise<HTMLCanvasElement>}
 */
export function loadImageToCanvas(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * クロマキー透過処理
 * @param {HTMLCanvasElement} sourceCanvas - 元画像Canvas
 * @param {{r:number,g:number,b:number}} targetColor - 透過対象色
 * @param {number} threshold - 閾値 (0-100)
 * @param {number} feather - エッジ柔らかさ (0-20)
 * @param {number} smoothing - スムージング回数 (0-3)
 * @returns {HTMLCanvasElement} 透過済みCanvas
 */
export function applyChromaKey(sourceCanvas, targetColor, threshold = 30, feather = 3, smoothing = 0) {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outCtx = output.getContext('2d');
    outCtx.drawImage(sourceCanvas, 0, 0);

    const imgData = outCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const tNorm = (threshold / 100) * 441.67; // sqrt(255^2 * 3) ≈ 441.67 の割合
    const fNorm = (feather / 100) * 441.67;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const dist = Math.sqrt(
            (r - targetColor.r) ** 2 +
            (g - targetColor.g) ** 2 +
            (b - targetColor.b) ** 2
        );

        let alpha = 255;
        if (dist < tNorm) {
            alpha = 0;
        } else if (dist < tNorm + fNorm && fNorm > 0) {
            const ratio = (dist - tNorm) / fNorm;
            alpha = Math.round(255 * ratio);
        }

        data[i + 3] = alpha;
    }

    // 簡易スムージング（軽量ボックスブラー、透過エッジのみ）
    if (smoothing > 0) {
        smoothEdges(data, width, height, smoothing);
    }

    outCtx.putImageData(imgData, 0, 0);
    return output;
}

/**
 * 透過エッジの簡易スムージング
 */
function smoothEdges(data, width, height, passes) {
    const size = data.length;
    const w4 = width * 4;

    for (let p = 0; p < passes; p++) {
        const copy = new Uint8ClampedArray(data);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const a = copy[idx + 3];
                // 完全透過または完全不透過のピクセルはスキップ
                if (a === 0 || a === 255) continue;

                let sumA = 0, sumR = 0, sumG = 0, sumB = 0, count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIdx = ((y + dy) * width + (x + dx)) * 4;
                        sumR += copy[nIdx];
                        sumG += copy[nIdx + 1];
                        sumB += copy[nIdx + 2];
                        sumA += copy[nIdx + 3];
                        count++;
                    }
                }
                data[idx] = sumR / count;
                data[idx + 1] = sumG / count;
                data[idx + 2] = sumB / count;
                data[idx + 3] = sumA / count;
            }
        }
    }
}

/**
 * Canvas上の座標から色をピックアップ
 * @param {HTMLCanvasElement} canvas
 * @param {number} x - 0〜1 の正規化座標、またはピクセル座標
 * @param {number} y
 * @param {boolean} normalized - true の場合 x,y は 0〜1
 * @returns {{r:number,g:number,b:number,a:number} | null}
 */
export function pickColor(canvas, x, y, normalized = true) {
    const ctx = canvas.getContext('2d');
    const px = normalized ? Math.floor(x * canvas.width) : Math.floor(x);
    const py = normalized ? Math.floor(y * canvas.height) : Math.floor(y);

    if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) {
        return null;
    }

    const imgData = ctx.getImageData(px, py, 1, 1);
    const d = imgData.data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
}

/**
 * プレビュー用に縮小したクロマキー処理（高速）
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{r:number,g:number,b:number}} targetColor
 * @param {number} threshold
 * @param {number} feather
 * @param {number} maxDimension - 長辺の最大ピクセル数（デフォルト512）
 * @returns {HTMLCanvasElement}
 */
export function applyChromaKeyPreview(sourceCanvas, targetColor, threshold = 30, feather = 3, maxDimension = 512) {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    const small = document.createElement('canvas');
    small.width = dstW;
    small.height = dstH;
    const sCtx = small.getContext('2d');
    sCtx.drawImage(sourceCanvas, 0, 0, dstW, dstH);

    return applyChromaKey(small, targetColor, threshold, feather, 0);
}

// =====================================
// ユーティリティ
// =====================================

export function hexToRgb(hex) {
    const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return { r: 0, g: 255, b: 0 };
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
    };
}

export function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function rgbToString({ r, g, b }) {
    return `rgb(${r}, ${g}, ${b})`;
}
