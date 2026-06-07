/**
 * PrintPhoto - フレーム合成/Canvas出力モジュール
 */

const DEFAULT_FRAME_W = 2048;
const DEFAULT_FRAME_H = 1440;
const PHOTO_X = 64;
const PHOTO_Y = 69;
const PHOTO_W = 1920;
const PHOTO_H = 1080;
const TEXT_AREA_TOP = PHOTO_Y + PHOTO_H; // 1149
const MARGIN_X = 48;
const MARGIN_BOTTOM = 36;

/**
 * object-fit: cover と同じ挙動で Canvas に画像を描画する
 * ソース画像の中央を切り取り、デスティネーション矩形にフィットさせる
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement | HTMLVideoElement | HTMLImageElement} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dw
 * @param {number} dh
 */
export function drawImageCover(ctx, img, dx, dy, dw, dh) {
    let imgW = img.videoWidth || img.naturalWidth || img.width;
    let imgH = img.videoHeight || img.naturalHeight || img.height;

    // video 要素の場合、videoWidth/videoHeight が 0 になることがあるので
    // getVideoTracks().getSettings() からもサイズを取得する
    if ((!imgW || !imgH) && img.srcObject && img.srcObject.getVideoTracks) {
        try {
            const tracks = img.srcObject.getVideoTracks();
            if (tracks.length > 0) {
                const settings = tracks[0].getSettings();
                if (settings.width && settings.height) {
                    imgW = settings.width;
                    imgH = settings.height;
                }
            }
        } catch (e) {
            // フォールバック：無視して次へ
        }
    }

    if (!imgW || !imgH) {
        console.warn('[drawImageCover] 画像サイズが取得できないため fill で描画します', img);
        ctx.drawImage(img, dx, dy, dw, dh);
        return;
    }

    const destAspect = dw / dh;
    const srcAspect = imgW / imgH;

    let sx, sy, sw, sh;
    if (srcAspect > destAspect) {
        // 画像が相対的に横長 → 横を切り取る
        sh = imgH;
        sw = imgH * destAspect;
        sx = (imgW - sw) / 2;
        sy = 0;
    } else {
        // 画像が相対的に縦長 → 縦を切り取る
        sw = imgW;
        sh = imgW / destAspect;
        sx = 0;
        sy = (imgH - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * フレーム付き合成画像を描画する
 * @param {Object} opts
 * @param {HTMLCanvasElement | HTMLVideoElement} opts.background - カメラ映像または背景Canvas
 * @param {HTMLCanvasElement} [opts.overlay] - 透過済み画像Canvas
 * @param {{x:number,y:number,scale:number}} [opts.overlayTransform] - オーバーレイ変形
 * @param {string} [opts.title] - タイトル
 * @param {string} [opts.comment] - コメント
 * @param {string} [opts.photographer] - 撮影者
 * @param {string} [opts.date] - 日付
 * @param {string} [opts.location] - 撮影場所
 * @param {number} [opts.brightness] - 明るさ（50-150）
 * @param {number} [opts.contrast] - コントラスト（50-150）
 * @param {number} [opts.saturation] - 彩度（50-150）
 * @param {number} [opts.outputWidth] - 出力幅（デフォルト2048）
 * @param {number} [opts.outputHeight] - 出力高さ（デフォルト1440）
 * @returns {HTMLCanvasElement}
 */
export function renderFrame(opts) {
    const W = opts.outputWidth || DEFAULT_FRAME_W;
    const H = opts.outputHeight || DEFAULT_FRAME_H;
    const scale = W / DEFAULT_FRAME_W;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. 白フレーム背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // 2. 合成エリア（黒背景）
    const px = Math.round(PHOTO_X * scale);
    const py = Math.round(PHOTO_Y * scale);
    const pw = Math.round(PHOTO_W * scale);
    const ph = Math.round(PHOTO_H * scale);

    ctx.fillStyle = '#000000';
    ctx.fillRect(px, py, pw, ph);

    // 3. カメラ映像を描画（object-fit: cover と同じ中央トリミング）
    if (opts.background) {
        drawImageCover(ctx, opts.background, px, py, pw, ph);
    }

    // 4. 透過画像を変形して重ねる（明るさ・コントラスト調整を適用）
    if (opts.overlay && opts.overlayTransform) {
        ctx.save();

        // 合成エリアにクリップしてはみ出しを防ぐ
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();

        const tf = opts.overlayTransform;
        const ox = opts.overlay.width;
        const oy = opts.overlay.height;

        // フルサイズ画像を合成エリアにフィットするベーススケール
        const baseScale = Math.min(pw / ox, ph / oy);

        // overlayCanvas の CSS 表示サイズ（プレビュー座標系 → 合成エリア座標系の変換に必要）
        const cssW = opts.overlayCssWidth || pw;
        const cssH = opts.overlayCssHeight || ph;

        // プレビューでの CSS 移動量を合成エリア座標系に変換
        const translateX = tf.x * pw / cssW;
        const translateY = tf.y * ph / cssH;

        ctx.translate(px + translateX, py + translateY);
        ctx.scale(tf.scale * baseScale, tf.scale * baseScale);

        const b = opts.brightness ?? 100;
        const c = opts.contrast ?? 100;
        const s = opts.saturation ?? 100;
        if (b !== 100 || c !== 100 || s !== 100) {
            ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
        }

        ctx.drawImage(opts.overlay, 0, 0);
        ctx.restore();
    }

    // 5. テキスト描画
    drawFrameText(ctx, opts, scale, W, H);

    return canvas;
}

function drawFrameText(ctx, opts, scale, W, H) {
    const fontFamily = "'M PLUS Rounded 1c', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'bottom';

    const textAreaY = Math.round(TEXT_AREA_TOP * scale);
    const marginX = Math.round(MARGIN_X * scale);
    const marginBottom = Math.round(MARGIN_BOTTOM * scale);
    const centerX = W / 2;
    const bottomY = H - marginBottom;

    // タイトル（下部中央）
    if (opts.title) {
        const maxTitleW = W - marginX * 2;
        const titleSize = fitFontSize(ctx, opts.title, maxTitleW, Math.round(72 * scale), fontFamily);
        ctx.font = `700 ${titleSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(opts.title, centerX, bottomY - Math.round(50 * scale));
    }

    // コメント
    if (opts.comment) {
        const maxCommentW = W - marginX * 2;
        const commentSize = fitFontSize(ctx, opts.comment, maxCommentW, Math.round(40 * scale), fontFamily);
        ctx.font = `400 ${commentSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        const commentY = opts.title
            ? bottomY - Math.round(50 * scale) - Math.round(8 * scale)
            : bottomY - Math.round(30 * scale);
        const lines = wrapText(ctx, opts.comment, maxCommentW);
        lines.forEach((line, i) => {
            const lineY = commentY - (lines.length - 1 - i) * (commentSize * 1.3);
            ctx.fillText(line, centerX, lineY);
        });
    }

    // 撮影者（左下）
    if (opts.photographer) {
        const metaSize = Math.round(28 * scale);
        ctx.font = `400 ${metaSize}px ${fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillText(`撮影者: ${opts.photographer}`, marginX, bottomY);
    }

    // 日付・場所（右下）
    let rightText = '';
    if (opts.date) rightText += opts.date;
    if (opts.location) {
        rightText += (rightText ? '  ' : '') + opts.location;
    }
    if (rightText) {
        const metaSize = Math.round(28 * scale);
        ctx.font = `400 ${metaSize}px ${fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(rightText, W - marginX, bottomY);
    }
}

function fitFontSize(ctx, text, maxWidth, maxSize, fontFamily) {
    let size = maxSize;
    ctx.font = `700 ${size}px ${fontFamily}`;
    while (ctx.measureText(text).width > maxWidth && size > 10) {
        size -= 2;
        ctx.font = `700 ${size}px ${fontFamily}`;
    }
    return size;
}

function wrapText(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
        const words = para.split('');
        let currentLine = '';
        for (const ch of words) {
            const testLine = currentLine + ch;
            if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = ch;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
    }
    return lines.length ? lines : [text];
}

// エイリアス
const W = DEFAULT_FRAME_W;
const H = DEFAULT_FRAME_H;
