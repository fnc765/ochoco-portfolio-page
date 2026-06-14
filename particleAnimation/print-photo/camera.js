/**
 * PrintPhoto - カメラ制御モジュール
 */

let activeStream = null;

function isLoopbackHost(hostname) {
    return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

/**
 * カメラを起動する
 * @param {HTMLVideoElement} videoElement
 * @returns {Promise<MediaStream>}
 */
export async function startCamera(videoElement) {
    // HTTPSチェックは行うが、エラーとしてスローせず警告のみにする
    // （getUserMedia が呼べない場合はブラウザが自動で拒否する）
    const isSecure = window.isSecureContext || window.location.protocol === 'https:' || isLoopbackHost(window.location.hostname);
    if (!isSecure) {
        console.warn('[PrintPhoto] getUserMedia requires HTTPS. Current:', window.location.protocol);
    }

    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }

    const constraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        },
        audio: false,
    };

    try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
            // 1回目: facingMode を外してリトライ
            try {
                activeStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
            } catch (err2) {
                // 2回目: video 制約なしでリトライ (環境カメラ制約を満たす track がない場合)
                if (err2.name === 'OverconstrainedError' || err2.name === 'NotFoundError') {
                    activeStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false,
                    });
                } else {
                    throw err2;
                }
            }
        } else {
            throw err;
        }
    }

    videoElement.srcObject = activeStream;
    videoElement.onloadedmetadata = () => {
        videoElement.play().catch(() => {});
    };

    return activeStream;
}

/**
 * カメラストリームを停止する
 */
export function stopCamera() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

/**
 * カメラ映像の露光を調整（CSS filter）
 * @deprecated 現在はオーバーレイ画像（入力画像）にのみ明るさ・コントラストを適用し、
 * カメラ映像には適用しない設計となっているため、この関数は未使用です。
 * @param {HTMLVideoElement} videoElement
 * @param {number} brightness - 50〜150
 * @param {number} contrast - 50〜150
 * @param {number} saturation - 50〜150
 */
export function setExposure(videoElement, brightness = 100, contrast = 100, saturation = 100) {
    videoElement.style.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
}

/**
 * 露光調整用のCSS filter文字列を取得（Canvas合成用）
 * @deprecated 同上。現在の設計では入力画像のみに適用するため未使用。
 * @param {number} brightness
 * @param {number} contrast
 * @param {number} saturation
 * @returns {string}
 */
export function getExposureFilter(brightness = 100, contrast = 100, saturation = 100) {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
}

/**
 * 現在のストリームを取得
 * @returns {MediaStream | null}
 */
export function getActiveStream() {
    return activeStream;
}

/**
 * 外部から取得したストリームを activeStream として登録する
 * （script.js 側で直接 getUserMedia した場合の同期用）
 * @param {MediaStream | null} stream
 */
export function setActiveStream(stream) {
    activeStream = stream;
}
