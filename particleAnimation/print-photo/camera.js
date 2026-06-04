/**
 * PrintPhoto - カメラ制御モジュール
 * フェーズ3
 */

let activeStream = null;

/**
 * カメラを起動する
 * @param {HTMLVideoElement} videoElement
 * @returns {Promise<MediaStream>}
 */
export async function startCamera(videoElement) {
    // HTTPSチェック
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('HTTPS_REQUIRED');
    }

    const constraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        },
        audio: false,
    };

    // 外カメラがない場合やPCの場合は fallback
    try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
            // facingMode を外して再試行
            activeStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
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
 * @param {HTMLVideoElement} videoElement
 * @param {number} brightness - 50〜150
 * @param {number} contrast - 50〜150
 */
export function setExposure(videoElement, brightness = 100, contrast = 100) {
    videoElement.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
}

/**
 * 現在のストリームを取得（撮影時に使用）
 * @returns {MediaStream | null}
 */
export function getActiveStream() {
    return activeStream;
}

/**
 * Video要素の現在フレームをCanvasに描画
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 */
export function captureVideoFrame(video, canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}
