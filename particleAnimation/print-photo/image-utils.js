/**
 * 縦横比を保ったまま、指定した最大辺に収まるサイズを返す。
 */
export function getContainedSize(width, height, maxDimension) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new TypeError('画像サイズが不正です');
    }
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024;

/**
 * ファイル選択のaccept属性を迂回した入力も含め、形式とサイズを検証する。
 */
export function validateImageFile(file) {
    if (!file || !SUPPORTED_IMAGE_TYPES.has(file.type)) {
        return { valid: false, message: 'PNG・JPEG・WebP画像を選択してください' };
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
        return { valid: false, message: '画像サイズは25MB以下にしてください' };
    }
    return { valid: true, message: '' };
}

/**
 * 履歴用に透過を保持した縮小PNG Data URLを作成する。
 */
export function createHistoryImageDataUrl(sourceCanvas, maxDimension = 1024) {
    const { width, height } = getContainedSize(sourceCanvas.width, sourceCanvas.height, maxDimension);
    if (width === sourceCanvas.width && height === sourceCanvas.height) {
        return sourceCanvas.toDataURL('image/png');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(sourceCanvas, 0, 0, width, height);
    return canvas.toDataURL('image/png');
}
