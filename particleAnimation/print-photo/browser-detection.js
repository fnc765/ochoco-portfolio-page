/**
 * 明示的に識別できるアプリ内ブラウザだけを検出する。
 * iOSのChrome/Edge/Firefox等を「Safariではない」という理由だけで除外しない。
 * @param {string} userAgent
 * @param {boolean} standalone
 * @returns {string|null}
 */
export function detectInAppBrowser(userAgent = '', standalone = false) {
    if (/Line\//i.test(userAgent)) return 'LINE';
    if (/Instagram/i.test(userAgent)) return 'Instagram';
    if (/FBAN|FBAV/i.test(userAgent)) return 'Facebook';
    if (/Twitter/i.test(userAgent)) return 'Twitter/X';

    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isKnownIOSBrowser = /Safari|CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    if (isIOS && !isKnownIOSBrowser && !standalone) return 'アプリ内';
    return null;
}
