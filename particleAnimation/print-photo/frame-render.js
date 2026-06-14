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
export function drawImageCover(ctx, img, dx, dy, dw, dh, displayW, displayH) {
    let imgW = img.videoWidth || img.naturalWidth || img.width;
    let imgH = img.videoHeight || img.naturalHeight || img.height;
    let settingsW = null;
    let settingsH = null;

    // video 要素の場合、getSettings() からもサイズを取得
    if (img.srcObject && img.srcObject.getVideoTracks) {
        try {
            const tracks = img.srcObject.getVideoTracks();
            if (tracks.length > 0) {
                const settings = tracks[0].getSettings();
                settingsW = settings.width;
                settingsH = settings.height;
            }
        } catch (e) {
            // フォールバック：無視
        }
    }

    // videoWidth/videoHeight が 0 の場合は getSettings() をフォールバック
    if ((!imgW || !imgH) && settingsW && settingsH) {
        imgW = settingsW;
        imgH = settingsH;
    }

    // デバイスの向きと videoWidth/videoHeight の整合性を確認
    // 縦持ち(portrait)なのに videoWidth > videoHeight → 回転前の値を返している可能性
    const isPortrait = window.innerHeight > window.innerWidth;
    const videoAspect = (imgW && imgH) ? imgW / imgH : 0;
    const settingsAspect = (settingsW && settingsH) ? settingsW / settingsH : 0;

    if (isPortrait && videoAspect > 1) {
        // 縦持ちなのに横長判定 → getSettings() が縦長ならそちらを使う
        if (settingsAspect && settingsAspect < 1) {
            imgW = settingsW;
            imgH = settingsH;
        } else {
            // 両方横長ならスワップして縦長に矯正
            [imgW, imgH] = [imgH, imgW];
        }
    } else if (!isPortrait && videoAspect < 1) {
        // 横持ちなのに縦長判定 → getSettings() が横長ならそちらを使う
        if (settingsAspect && settingsAspect > 1) {
            imgW = settingsW;
            imgH = settingsH;
        } else {
            // 両方縦長ならスワップして横長に矯正
            [imgW, imgH] = [imgH, imgW];
        }
    }

    if (!imgW || !imgH) {
        console.warn('[drawImageCover] 画像サイズが取得できないため fill で描画', img);
        ctx.drawImage(img, dx, dy, dw, dh);
        return;
    }

    // CSS object-fit: cover と同じ計算
    // displayW/displayH があれば CSS 表示サイズを優先（プレビューと一致させる）
    const destAspect = (displayW || dw) / (displayH || dh);
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

    console.log('[drawImageCover]', {
        imgW, imgH, srcAspect, destAspect,
        isPortrait, videoAspect, settingsAspect,
        sx, sy, sw, sh, dx, dy, dw, dh,
    });

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * フレーム付き合成画像を描画する
 * @param {Object} opts
 * @param {HTMLCanvasElement | HTMLVideoElement} opts.background - カメラ映像または背景Canvas
 * @param {HTMLCanvasElement} [opts.overlay] - 透過済み画像Canvas
 * @param {{x:number,y:number,scale:number}} [opts.overlayTransform] - オーバーレイ変形
 * @param {string} [opts.title] - タイトル
 * @param {string} [opts.photographer] - 撮影者
 * @param {string} [opts.date] - 日付
 * @param {string} [opts.location] - 撮影場所
 * @param {number} [opts.brightness] - 明るさ（50-150）
 * @param {number} [opts.contrast] - コントラスト（50-150）
 * @param {number} [opts.saturation] - 彩度（50-150）
 * @param {number} [opts.temperature] - 色温度（-100〜+100、+で暖色/-で寒色）
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
        drawImageCover(
            ctx, opts.background, px, py, pw, ph,
            opts.backgroundDisplayWidth, opts.backgroundDisplayHeight
        );
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
        const t = opts.temperature ?? 0;
        if (b !== 100 || c !== 100 || s !== 100 || t !== 0) {
            const filterParts = [];
            if (b !== 100) filterParts.push(`brightness(${b}%)`);
            if (c !== 100) filterParts.push(`contrast(${c}%)`);
            if (s !== 100) filterParts.push(`saturate(${s}%)`);
            if (t !== 0) filterParts.push(`hue-rotate(${t * 0.9}deg)`);
            ctx.filter = filterParts.join(' ');
        }

        ctx.drawImage(opts.overlay, 0, 0);
        ctx.restore();
    }

    // 5. テキスト描画
    drawFrameText(ctx, opts, scale, W, H);

    return canvas;
}

const FA_ICON_USER = '\uF007';
const FA_ICON_CALENDAR = '\uF133';
const FA_ICON_LOCATION = '\uF3C5';
const FA_FONT = '"Font Awesome 6 Free"';
const FA_FONT_WEIGHT = '900';
const META_ICON_COLOR = '#666666';

function formatDateMMDDYYYY(value) {
    if (!value) return '';
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return value;
    return `${m[2]}/${m[3]}/${m[1]}`;
}

export { formatDateMMDDYYYY };

function drawFrameText(ctx, opts, scale, W, H) {
    const fontFamily = "'Noto Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'bottom';

    const textAreaY = Math.round(TEXT_AREA_TOP * scale);
    const marginX = Math.round(MARGIN_X * scale);
    const marginBottom = Math.round(MARGIN_BOTTOM * scale);
    const centerX = W / 2;
    const bottomY = H - marginBottom;

    // タイトル（下部中央、font-style: oblique 18deg）
    if (opts.title) {
        const maxTitleW = W - marginX * 2;
        const titleSize = fitTitleFontSize(ctx, opts.title, maxTitleW, Math.round(72 * scale), fontFamily);
        ctx.font = `400 ${titleSize}px ${fontFamily}`;
        const titleX = centerX;
        const titleY = bottomY - Math.round(50 * scale);
        ctx.save();
        ctx.translate(titleX, titleY);
        ctx.transform(1, 0, -Math.tan(18 * Math.PI / 180), 1, 0, 0);
        ctx.textAlign = 'center';
        ctx.fillText(opts.title, 0, 0);
        ctx.restore();
    }

    // 撮影者（左下：ラベル → アイコン → 名前）
    if (opts.photographer) {
        const metaSize = Math.round(28 * scale);
        const gap = Math.round(6 * scale);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        let x = marginX;
        ctx.font = `400 ${metaSize}px ${fontFamily}`;
        ctx.fillStyle = '#000000';
        const label = '撮影者:';
        ctx.fillText(label, x, bottomY);
        x += ctx.measureText(label).width + gap;
        ctx.font = `${FA_FONT_WEIGHT} ${metaSize}px ${FA_FONT}, ${fontFamily}`;
        ctx.fillStyle = META_ICON_COLOR;
        ctx.fillText(FA_ICON_USER, x, bottomY);
        x += ctx.measureText(FA_ICON_USER).width + gap;
        ctx.font = `400 ${metaSize}px ${fontFamily}`;
        ctx.fillStyle = '#000000';
        ctx.fillText(opts.photographer, x, bottomY);
    }

    // 日付・場所（右下：アイコン + 値 + アイコン + 値）
    const hasDate = !!opts.date;
    const hasLoc = !!opts.location;
    if (hasDate || hasLoc) {
        const metaSize = Math.round(28 * scale);
        const gap = Math.round(6 * scale);

        const segs = [];
        if (hasDate) segs.push({ icon: FA_ICON_CALENDAR, text: formatDateMMDDYYYY(opts.date) });
        if (hasLoc) segs.push({ icon: FA_ICON_LOCATION, text: opts.location });

        ctx.textBaseline = 'bottom';
        const widths = segs.map(seg => {
            ctx.font = `${FA_FONT_WEIGHT} ${metaSize}px ${FA_FONT}, ${fontFamily}`;
            const iconW = ctx.measureText(seg.icon).width;
            ctx.font = `400 ${metaSize}px ${fontFamily}`;
            const textW = ctx.measureText(seg.text).width;
            return iconW + gap + textW;
        });
        const totalW = widths.reduce((a, b) => a + b, 0) + gap * (segs.length - 1);

        let x = W - marginX - totalW;
        segs.forEach((seg, i) => {
            ctx.font = `${FA_FONT_WEIGHT} ${metaSize}px ${FA_FONT}, ${fontFamily}`;
            ctx.fillStyle = META_ICON_COLOR;
            ctx.fillText(seg.icon, x, bottomY);
            x += ctx.measureText(seg.icon).width + gap;
            ctx.font = `400 ${metaSize}px ${fontFamily}`;
            ctx.fillStyle = '#000000';
            ctx.fillText(seg.text, x, bottomY);
            x += ctx.measureText(seg.text).width + gap;
        });
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

function fitTitleFontSize(ctx, text, maxWidth, maxSize, fontFamily) {
    let size = maxSize;
    ctx.font = `400 ${size}px ${fontFamily}`;
    while (ctx.measureText(text).width > maxWidth && size > 10) {
        size -= 2;
        ctx.font = `400 ${size}px ${fontFamily}`;
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
