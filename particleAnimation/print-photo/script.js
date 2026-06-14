/**
 * PrintPhoto - メインスクリプト (1ページUI)
 *
 * 透過PNG画像を読み込み、カメラ映像とリアルタイム合成してフレーム付き
 * 写真を生成・保存・共有する。1ページ構成 (3画面遷移なし) で、シャッター
 * ボタンの状態機械 (IDLE/STARTING/LIVE/CAPTURED/ERROR) がカメラ起動・撮影・
 * 再撮影を制御する。プレビュー枠は sticky 追従。
 */

import {
    startCamera,
    stopCamera,
    setActiveStream,
} from './camera.js';

import { renderFrame } from './frame-render.js';

import {
    getCurrentPosition,
    reverseGeocode,
} from './location.js';

import {
    saveThumbnail,
    loadThumbnail,
    getAllThumbnails,
    deleteThumbnail,
} from './storage.js';

/**
 * 画像を読み込んでCanvasに描画する
 * @param {string} src - DataURL または URL
 * @returns {Promise<HTMLCanvasElement>}
 */
function loadImageToCanvas(src) {
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

// =====================================
// DOM 要素
// =====================================
const loader = document.getElementById('loader');
const content = document.getElementById('content');

const imageInput = document.getElementById('image-input');
const openHistoryBtn = document.getElementById('open-history-btn');
const historyModal = document.getElementById('history-modal');
const closeHistoryBtn = document.getElementById('btn-close-history');
const thumbnailGrid = document.getElementById('thumbnail-grid');

const photoFrame = document.getElementById('photo-frame');
const placeholder = document.getElementById('placeholder');
const btnShutter = document.getElementById('btn-shutter');
const shutterLabel = document.getElementById('shutter-label');
const shutterIcon = document.getElementById('shutter-icon');
const adjustTile = document.getElementById('adjust-tile');

let videoElement = document.getElementById('camera-video');
const overlayCanvas = document.getElementById('overlay-canvas');
const frameContent = document.getElementById('frame-content');

const brightnessSlider = document.getElementById('brightness-slider');
const contrastSlider = document.getElementById('contrast-slider');
const temperatureSlider = document.getElementById('temperature-slider');

const inputTitle = document.getElementById('input-title');
const inputPhotographer = document.getElementById('input-photographer');
const inputDate = document.getElementById('input-date');
const inputLocation = document.getElementById('input-location');

const locationWarningModal = document.getElementById('location-warning-modal');
const btnCancelWarning = document.getElementById('btn-cancel-warning');
const btnRemoveLocation = document.getElementById('btn-remove-location');
const btnContinueWarning = document.getElementById('btn-continue-warning');

const resultCanvas = document.getElementById('result-canvas');
const btnShare = document.getElementById('btn-share');
const btnSavePng = document.getElementById('btn-save-png');

const httpsWarning = document.getElementById('https-warning');
const cameraPermissionGuide = document.getElementById('camera-permission-guide');
const cameraPermissionText = document.getElementById('camera-permission-text');

// =====================================
// シャッターボタン状態機械
// =====================================
const SHUTTER_STATE = {
    IDLE:     { label: 'カメラを起動', icon: 'fa-power-off',  disabled: false },
    STARTING: { label: '起動中…',      icon: 'fa-spinner',    disabled: true  },
    LIVE:     { label: '撮影',         icon: 'fa-camera',     disabled: false },
    CAPTURED: { label: '再撮影',       icon: 'fa-rotate-left',disabled: false },
    ERROR:    { label: 'カメラを起動', icon: 'fa-power-off',  disabled: false },
};

let shutterState = 'IDLE';
let isCaptured = false;
let isImageReady = false;

function setShutterState(next) {
    const cfg = SHUTTER_STATE[next];
    if (!cfg) return;
    shutterState = next;
    shutterLabel.textContent = cfg.label;
    shutterIcon.className = 'fas ' + cfg.icon;
    btnShutter.disabled = cfg.disabled;
    photoFrame.classList.toggle('pp-captured', next === 'CAPTURED');
    photoFrame.classList.toggle('pp-live', next === 'LIVE' || next === 'STARTING');
    placeholder.classList.toggle('hidden', isImageReady || next === 'LIVE' || next === 'STARTING' || next === 'CAPTURED');
    // 撮影後のみ最終アクションを有効化
    const canFinalize = next === 'CAPTURED';
    btnShare.disabled = !canFinalize;
    btnSavePng.disabled = !canFinalize;
}

// =====================================
// 状態
// =====================================
const FA_ICON_USER = '\uF007';
const FA_ICON_CALENDAR = '\uF133';
const FA_ICON_LOCATION = '\uF3C5';
const FA_FONT = '"Font Awesome 6 Free"';
const FA_FONT_WEIGHT = '900';

function formatDateMMDDYYYY(value) {
    if (!value) return '';
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return value;
    return `${m[2]}/${m[3]}/${m[1]}`;
}

let selectedImageDataUrl = null;
let overlayImageCanvas = null; // 透過済み画像

// オーバーレイ変形状態
const overlayTransform = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.2;
const MAX_SCALE = 3.0;

// ドラッグ・ピンチ状態
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let transformStart = { x: 0, y: 0 };
let pinchStartDist = 0;
let pinchStartScale = 1;

// カメラ状態
let cameraPermissionState = 'prompt';
let isCameraActive = false;
let cameraRequestId = 0;

const CAMERA_REQUEST_TIMEOUT_MS = 10000;
const CAMERA_READY_TIMEOUT_MS = 4000;
const ADJUST_OPEN_KEY = 'pp_adjust_open';

// =====================================
// ユーティリティ
// =====================================
function isLoopbackHost(hostname) {
    return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function isSecureDeviceContext() {
    return window.isSecureContext || window.location.protocol === 'https:' || isLoopbackHost(window.location.hostname);
}

function createCameraError(name, message) {
    const err = new Error(message);
    err.name = name;
    return err;
}

function invalidateCameraRequest() {
    cameraRequestId += 1;
}

function getVideoTrackCount(video) {
    return video?.srcObject?.getVideoTracks?.().length ?? 0;
}

function hasRenderableVideoFrame(video) {
    return !!video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

function getCameraPreflightMessage() {
    const inAppBrowser = detectInAppBrowser();
    if (inAppBrowser) {
        return '【' + inAppBrowser + '】アプリ内ブラウザではカメラ機能が使用できません。Safari または Chrome の「本体」でこのページを開いてください。（アプリ内の「⋯」メニューから「ブラウザで開く」を選んでください）';
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return 'お使いのブラウザはカメラ機能に対応していません。Safari / Chrome / Edge をお試しください。';
    }
    if (!isSecureDeviceContext()) {
        return 'カメラを使うにはHTTPS接続が必要です。現在: ' + window.location.protocol + '//' + window.location.host;
    }
    if (!isCameraAllowedByPolicy()) {
        return 'このサイトのHTTPヘッダー（Permissions-Policy）でカメラがブロックされている可能性があります。サーバー設定を確認してください。';
    }
    return null;
}

async function waitForVideoReady(videoElement, timeoutMs = CAMERA_READY_TIMEOUT_MS) {
    if (!videoElement?.srcObject) return false;
    if (hasRenderableVideoFrame(videoElement) || getVideoTrackCount(videoElement) === 0) return true;

    return new Promise((resolve) => {
        let settled = false;
        let timeoutId = null;
        const finish = (ready) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(eventName => {
                videoElement.removeEventListener(eventName, onReady);
            });
            resolve(ready);
        };
        const onReady = () => {
            if (hasRenderableVideoFrame(videoElement) || getVideoTrackCount(videoElement) === 0) {
                finish(true);
            }
        };
        ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(eventName => {
            videoElement.addEventListener(eventName, onReady);
        });
        timeoutId = setTimeout(() => {
            finish(hasRenderableVideoFrame(videoElement) || getVideoTrackCount(videoElement) === 0);
        }, timeoutMs);
    });
}

async function startCameraSession() {
    hideCameraGuide();

    const requestId = ++cameraRequestId;
    addDebugLog('camera-start-request', { requestId });

    const streamPromise = startCamera(videoElement);
    streamPromise.then((stream) => {
        if (requestId !== cameraRequestId) {
            if (stream?.getTracks) stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        }
    }).catch(() => {});

    let timeoutId = null;
    try {
        const stream = await Promise.race([
            streamPromise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(createCameraError('TimeoutError', 'ブラウザがカメラ要求を無視しました（Permissions-Policy、アプリ内ブラウザ、またはグローバル設定の可能性）'));
                }, CAMERA_REQUEST_TIMEOUT_MS);
            }),
        ]);

        clearTimeout(timeoutId);

        if (requestId !== cameraRequestId) {
            if (stream?.getTracks) stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
            throw createCameraError('AbortError', 'camera request superseded');
        }

        onCameraSuccess(stream);

        const ready = await waitForVideoReady(videoElement);
        if (requestId !== cameraRequestId) {
            return false;
        }

        if (!ready) {
            stopCameraInternal(true);
            throw createCameraError('NotReadableError', 'カメラ映像の準備が完了しませんでした。');
        }

        addDebugLog('camera-start-ready', {
            requestId,
            readyState: videoElement.readyState,
            videoSize: { w: videoElement.videoWidth, h: videoElement.videoHeight },
            trackCount: getVideoTrackCount(videoElement),
        });
        return true;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * カメラストリームを停止し、videoElement を解放する。
 * 撮影成功時は resetElement=true で video 要素を再作成（iOS Safari 安定性のため）。
 */
function stopCameraInternal(resetElement = false) {
    invalidateCameraRequest();
    addDebugLog('stopCameraInternal', {
        before: {
            resetElement,
            srcObject: !!videoElement.srcObject,
            isCameraActive,
        },
    });

    try {
        if (videoElement.srcObject) {
            videoElement.pause();
            videoElement.srcObject.getTracks().forEach(track => {
                try {
                    track.enabled = false;
                    track.stop();
                } catch (e) {
                    addDebugLog('track-stop-error', { label: track.label, error: e.message });
                }
            });
            videoElement.srcObject = null;
        }
        videoElement.removeAttribute('src');
        videoElement.load();
        stopCamera();
        isCameraActive = false;

        if (resetElement) {
            const parent = videoElement.parentNode;
            if (parent && parent.contains(videoElement)) {
                const nextSibling = videoElement.nextSibling;
                const oldId = videoElement.id;
                const oldClass = videoElement.className;
                parent.removeChild(videoElement);
                const newVideo = document.createElement('video');
                newVideo.id = oldId;
                newVideo.className = oldClass;
                newVideo.autoplay = true;
                newVideo.playsInline = true;
                newVideo.muted = true;
                newVideo.setAttribute('webkit-playsinline', '');
                if (nextSibling) {
                    parent.insertBefore(newVideo, nextSibling);
                } else {
                    parent.appendChild(newVideo);
                }
                videoElement = newVideo;
            }
        }
    } catch (e) {
        addDebugLog('stopCameraInternal-error', { message: e.message, stack: e.stack });
    }
}

// デバッグログ蓄積
const debugLogs = [];
let gitCommitHash = 'unknown';

function addDebugLog(label, data) {
    const ts = new Date().toISOString();
    const hash = gitCommitHash || 'unknown';
    try {
        const entry = `[${hash}] [${ts}] [${label}] ${JSON.stringify(data, null, 2)}`;
        debugLogs.push(entry);
        console.log(entry);
    } catch (e) {
        console.error(`[${hash}] [${ts}] [addDebugLog-error]`, e, { label, data });
    }
}

async function copyDebugLogs() {
    if (debugLogs.length === 0) {
        showToast('ログがありません');
        return;
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showToast('このブラウザではコピーできません');
        return;
    }
    try {
        await navigator.clipboard.writeText(debugLogs.join('\n'));
        showToast('デバッグログをコピーしました');
    } catch (e) {
        showToast('コピーに失敗しました');
    }
}

// =====================================
// 初期化
// =====================================
function init() {
    addDebugLog('init-start', { ua: navigator.userAgent.slice(0, 80) });
    try {
        setTimeout(() => {
            try {
                loader.style.opacity = '0';
                setTimeout(() => {
                    try {
                        loader.style.display = 'none';
                        content.style.display = 'flex';
                        content.classList.add('fade-in-up');
                    } catch (e) {
                        addDebugLog('init-loader-error', { message: e.message });
                    }
                }, 500);
            } catch (e) {
                addDebugLog('init-opacity-error', { message: e.message });
            }
        }, 800);

        inputDate.value = getTodayStr();
        restoreFormState();
        restoreThumbnails();
        checkEnvironment();
        restoreAdjustState();
        bindEvents();
        loadGitCommit();
        setShutterState('IDLE');
        addDebugLog('init-complete', {});
    } catch (e) {
        addDebugLog('init-error', { message: e.message, stack: e.stack });
        console.error('[PrintPhoto] init error:', e);
    }
}

// =====================================
// Git コミットハッシュ表示
// =====================================
async function loadGitCommit() {
    try {
        const response = await fetch('version.json');
        if (!response.ok) return;
        const data = await response.json();
        gitCommitHash = data.commit || 'unknown';
        const el = document.getElementById('git-commit');
        if (el && data.commit) {
            el.textContent = `commit: ${data.commit}`;
        }
    } catch (e) {
        // ignore
    }
}

// =====================================
// 環境チェック
// =====================================
function checkEnvironment() {
    const isSecure = isSecureDeviceContext();
    if (!isSecure) {
        httpsWarning.style.display = 'block';
        httpsWarning.querySelector('p').innerHTML =
            '<i class="fas fa-lock" aria-hidden="true"></i> ' +
            'カメラを使うには<strong>HTTPS</strong>接続が必要です。<br>' +
            '現在: ' + window.location.protocol + '//' + window.location.host;
    } else {
        httpsWarning.style.display = 'none';
    }

    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'camera' })
            .then((status) => {
                cameraPermissionState = status.state;
                status.onchange = () => {
                    cameraPermissionState = status.state;
                    if (status.state === 'granted') {
                        hideCameraGuide();
                    }
                };
            })
            .catch(() => {
                cameraPermissionState = 'unknown';
            });
    }
}

function showCameraGuide(message) {
    cameraPermissionGuide.style.display = 'block';
    cameraPermissionText.textContent = message;
}

function hideCameraGuide() {
    cameraPermissionGuide.style.display = 'none';
}

// =====================================
// 入力画像調整 折りたたみ状態
// =====================================
function restoreAdjustState() {
    try {
        if (localStorage.getItem(ADJUST_OPEN_KEY) === '1') {
            adjustTile.setAttribute('open', '');
        }
    } catch (e) {
        // ignore
    }
}

// =====================================
// イベントバインディング
// =====================================
function bindEvents() {
    imageInput.addEventListener('change', handleFileSelect);
    openHistoryBtn.addEventListener('click', openHistoryModal);
    closeHistoryBtn.addEventListener('click', closeHistoryModal);
    historyModal.querySelector('.modal-overlay').addEventListener('click', closeHistoryModal);

    btnShutter.addEventListener('click', handleShutterClick);

    adjustTile.addEventListener('toggle', () => {
        try {
            localStorage.setItem(ADJUST_OPEN_KEY, adjustTile.open ? '1' : '0');
        } catch (e) {
            // ignore
        }
    });

    // メタ入力 → プレビュー再描画 + 撮影後ならresultCanvas再描画
    [inputTitle, inputPhotographer, inputDate, inputLocation].forEach(el => {
        el.addEventListener('input', () => {
            saveFormState();
            syncFrameTextLayer();
            if (isCaptured) {
                renderResultFromState();
            }
        });
    });

    // 露光/色温度調整（撮影後も有効）
    brightnessSlider.addEventListener('input', onExposureInput);
    contrastSlider.addEventListener('input', onExposureInput);
    temperatureSlider.addEventListener('input', onExposureInput);

    // ドラッグ・ピンチ
    overlayCanvas.addEventListener('pointerdown', handlePointerDown);
    overlayCanvas.addEventListener('pointermove', handlePointerMove);
    overlayCanvas.addEventListener('pointerup', handlePointerUp);
    overlayCanvas.addEventListener('pointercancel', handlePointerUp);

    overlayCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    overlayCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    overlayCanvas.addEventListener('touchend', handleTouchEnd);

    // ワーニング
    btnCancelWarning.addEventListener('click', hideLocationWarning);
    btnRemoveLocation.addEventListener('click', () => {
        inputLocation.value = '';
        saveFormState();
        hideLocationWarning();
        proceedWithAction();
    });
    btnContinueWarning.addEventListener('click', () => {
        hideLocationWarning();
        proceedWithAction();
    });

    btnSavePng.addEventListener('click', () => handleActionWithWarning('save'));
    btnShare.addEventListener('click', () => handleActionWithWarning('share'));

    // 位置情報
    document.getElementById('btn-get-location').addEventListener('click', handleGetLocation);

    // デバッグログコピー
    const btnCopyDebug = document.getElementById('btn-copy-debug');
    if (btnCopyDebug) {
        btnCopyDebug.addEventListener('click', () => {
            void copyDebugLogs();
        });
    }

    // ページ非表示でカメラ停止
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isCameraActive) {
            stopCameraInternal();
            addDebugLog('visibilitychange', { action: 'stop-camera', reason: 'page-hidden' });
        }
    });
    window.addEventListener('pagehide', () => {
        if (isCameraActive) {
            stopCameraInternal();
        }
    });
}

// =====================================
// アプリ内ブラウザ検出
// =====================================
function detectInAppBrowser() {
    const ua = navigator.userAgent || '';
    const standAlone = navigator.standalone;
    if (/Line\//i.test(ua)) return 'LINE';
    if (/Instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV/i.test(ua)) return 'Facebook';
    if (/Twitter/i.test(ua)) return 'Twitter/X';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
    if (isIOS && !isSafari && !standAlone) {
        return 'アプリ内';
    }
    return null;
}

function isCameraAllowedByPolicy() {
    if (document.featurePolicy && document.featurePolicy.allowsFeature) {
        try { return document.featurePolicy.allowsFeature('camera'); } catch (e) { return true; }
    }
    if (document.permissionsPolicy && document.permissionsPolicy.allowsFeature) {
        try { return document.permissionsPolicy.allowsFeature('camera'); } catch (e) { return true; }
    }
    return true;
}

function onCameraSuccess(stream) {
    setActiveStream(stream);
    isCameraActive = true;
    hideCameraGuide();
    addDebugLog('camera-success', {
        readyState: videoElement.readyState,
        trackCount: stream?.getVideoTracks?.().length ?? 0,
    });
}

function onCameraError(err) {
    console.error('[PrintPhoto] Camera error:', err.name, err.message);
    isCameraActive = false;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    if (err.name === 'NotAllowedError') {
        let guide = '';
        if (isIOS) {
            guide = '【iOS】カメラへのアクセスが拒否されました。iPhoneの「設定」→「Safari」→「カメラ」→このサイトを「許可」に変更してください。変更後はSafariのタブを閉じて再度開いてください。';
        } else if (isAndroid) {
            guide = '【Android】カメラへのアクセスが拒否されました。Chromeのメニュー(︙)→「設定」→「サイトの設定」→「カメラ」でこのサイトを許可してください。';
        } else {
            guide = 'カメラへのアクセスが拒否されました。アドレスバー横のカメラアイコンをクリックして許可してください。';
        }
        showCameraGuide(guide);
    } else if (err.name === 'NotFoundError') {
        showCameraGuide('カメラが見つかりません。別のデバイスでお試しください。');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        showCameraGuide('カメラが他のアプリで使用中です。他のアプリを閉じてから再試行してください。');
    } else if (err.name === 'TimeoutError') {
        let guide = 'カメラの要求がブラウザに無視されました。以下を確認してください：\n';
        guide += '1. このページを「Safari」または「Chrome」の本体で開いているか（LINEやInstagram内のブラウザでは動作しません）\n';
        guide += '2. サーバーのHTTPヘッダー（Permissions-Policy）でカメラがブロックされていないか\n';
        guide += '3. iOSの「設定」→「Safari」→「カメラ」が全てのサイトで「拒否」になっていないか';
        showCameraGuide(guide);
    } else {
        showCameraGuide('カメラの起動に失敗しました（' + err.name + '）。ページを再読み込みしてお試しください。');
    }
}

// =====================================
// 露光調整
// =====================================
function onExposureInput() {
    redrawOverlayCanvas();
    if (isCaptured) {
        renderResultFromState();
    }
}

function redrawOverlayCanvas() {
    if (!overlayImageCanvas) {
        const ctx = overlayCanvas.getContext('2d');
        overlayCanvas.width = frameContent?.offsetWidth || overlayCanvas.width || 1;
        overlayCanvas.height = frameContent?.offsetHeight || overlayCanvas.height || 1;
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        applyOverlayTransform();
        return;
    }

    const cssW = frameContent ? frameContent.offsetWidth : overlayImageCanvas.width;
    const cssH = frameContent ? frameContent.offsetHeight : overlayImageCanvas.height;

    const ctx = overlayCanvas.getContext('2d');
    overlayCanvas.width = cssW;
    overlayCanvas.height = cssH;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const brightness = parseInt(brightnessSlider.value, 10);
    const contrast = parseInt(contrastSlider.value, 10);
    const temperature = parseInt(temperatureSlider.value, 10);

    if (brightness !== 100 || contrast !== 100 || temperature !== 0) {
        const filterParts = [];
        if (brightness !== 100) filterParts.push(`brightness(${brightness}%)`);
        if (contrast !== 100) filterParts.push(`contrast(${contrast}%)`);
        if (temperature !== 0) filterParts.push(`hue-rotate(${temperature * 0.9}deg)`);
        ctx.filter = filterParts.join(' ');
    }

    const fitScale = Math.min(cssW / overlayImageCanvas.width, cssH / overlayImageCanvas.height);
    ctx.drawImage(overlayImageCanvas, 0, 0, overlayImageCanvas.width * fitScale, overlayImageCanvas.height * fitScale);

    ctx.filter = 'none';
    applyOverlayTransform();
}

// =====================================
// 画像選択（ファイル / 履歴共通）
// =====================================
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        await applyImage(ev.target.result, true);
    };
    reader.readAsDataURL(file);
}

async function applyImage(dataUrl, saveHistory) {
    try {
        selectedImageDataUrl = dataUrl;
        isImageReady = true;
        overlayImageCanvas = await loadImageToCanvas(dataUrl);
        redrawOverlayCanvas();
        showToast('透過画像を読み込みました');

        if (saveHistory) {
            try {
                await saveThumbnail(dataUrl);
                await restoreThumbnails();
            } catch (e) {
                console.warn('History save failed:', e);
            }
        }

        if (shutterState === 'IDLE' || shutterState === 'ERROR') {
            setShutterState('IDLE');
        } else if (shutterState === 'CAPTURED') {
            setShutterState('IDLE');
            isCaptured = false;
            resultCanvas.width = 0;
            resultCanvas.height = 0;
        }
    } catch (err) {
        console.error('Image load failed:', err);
        showToast('画像の読み込みに失敗しました');
    }
}

// =====================================
// オーバーレイ変形適用
// =====================================
function applyOverlayTransform() {
    overlayCanvas.style.transform = `translate(${overlayTransform.x}px, ${overlayTransform.y}px) scale(${overlayTransform.scale})`;
    overlayCanvas.style.transformOrigin = '0 0';
}

// =====================================
// ドラッグ・ピンチ
// =====================================
function handlePointerDown(e) {
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    transformStart = { x: overlayTransform.x, y: overlayTransform.y };
    overlayCanvas.setPointerCapture(e.pointerId);
}

function handlePointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    overlayTransform.x = transformStart.x + dx;
    overlayTransform.y = transformStart.y + dy;
    applyOverlayTransform();
}

function handlePointerUp() {
    isDragging = false;
}

function handleTouchStart(e) {
    if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        pinchStartScale = overlayTransform.scale;
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (pinchStartDist > 0) {
            const newScale = pinchStartScale * (dist / pinchStartDist);
            overlayTransform.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
            applyOverlayTransform();
        }
    }
}

function handleTouchEnd(e) {
    if (e.touches.length < 2) {
        pinchStartDist = 0;
    }
}

// =====================================
// シャッターボタン click
// =====================================
function handleShutterClick() {
    if (shutterState === 'IDLE' || shutterState === 'ERROR') {
        void startCameraFromShutter();
    } else if (shutterState === 'LIVE') {
        void takePicture();
    } else if (shutterState === 'CAPTURED') {
        void retakePicture();
    }
}

async function startCameraFromShutter() {
    setShutterState('STARTING');
    const preflightMessage = getCameraPreflightMessage();
    if (preflightMessage) {
        showCameraGuide(preflightMessage);
        setShutterState('ERROR');
        return;
    }
    try {
        await startCameraSession();
        setShutterState('LIVE');
    } catch (err) {
        if (err.name !== 'AbortError') onCameraError(err);
        setShutterState('ERROR');
    }
}

async function takePicture() {
    if (!videoElement.srcObject) {
        showToast('カメラが起動していません');
        return;
    }
    const videoReady = await waitForVideoReady(videoElement);
    if (!videoReady) {
        showToast('カメラの準備が完了してから再度お試しください');
        return;
    }

    try {
        const overlayCssWidth = frameContent ? frameContent.offsetWidth : overlayCanvas.width;
        const overlayCssHeight = frameContent ? frameContent.offsetHeight : overlayCanvas.height;
        const bgDisplayW = videoElement.clientWidth || (frameContent ? frameContent.offsetWidth : 0);
        const bgDisplayH = videoElement.clientHeight || (frameContent ? frameContent.offsetHeight : 0);

        addDebugLog('takePicture-start', {
            isPortrait: window.innerHeight > window.innerWidth,
            videoReadyState: videoElement.readyState,
            videoSize: { w: videoElement.videoWidth, h: videoElement.videoHeight },
            frameContent: { w: bgDisplayW, h: bgDisplayH },
            overlaySize: overlayImageCanvas ? { w: overlayImageCanvas.width, h: overlayImageCanvas.height } : null,
        });

        const metaSize = Math.round(28);
        if (document.fonts && document.fonts.load) {
            try {
                await document.fonts.load(`${FA_FONT_WEIGHT} ${metaSize}px ${FA_FONT}`);
            } catch (e) { /* noop */ }
        }

        const frameCanvas = renderFrame({
            background: hasRenderableVideoFrame(videoElement) ? videoElement : null,
            backgroundDisplayWidth: bgDisplayW,
            backgroundDisplayHeight: bgDisplayH,
            overlay: overlayImageCanvas,
            overlayTransform: overlayTransform,
            overlayCssWidth: overlayCssWidth,
            overlayCssHeight: overlayCssHeight,
            title: inputTitle.value,
            photographer: inputPhotographer.value,
            date: inputDate.value,
            location: inputLocation.value,
            brightness: parseInt(brightnessSlider.value, 10),
            contrast: parseInt(contrastSlider.value, 10),
            saturation: 100,
            temperature: parseInt(temperatureSlider.value, 10),
        });

        resultCanvas.width = frameCanvas.width;
        resultCanvas.height = frameCanvas.height;
        resultCanvas.getContext('2d').drawImage(frameCanvas, 0, 0);
        isCaptured = true;
        syncFrameTextLayer();
        stopCameraInternal(true);
        setShutterState('CAPTURED');
        addDebugLog('takePicture-complete', { resultCanvas: { w: resultCanvas.width, h: resultCanvas.height } });
    } catch (err) {
        addDebugLog('takePicture-error', { message: err.message, stack: err.stack });
        showToast('撮影中にエラーが発生しました');
        console.error('[PrintPhoto] takePicture error:', err);
    }
}

async function retakePicture() {
    isCaptured = false;
    setShutterState('STARTING');
    const preflightMessage = getCameraPreflightMessage();
    if (preflightMessage) {
        showCameraGuide(preflightMessage);
        setShutterState('ERROR');
        return;
    }
    try {
        await startCameraSession();
        setShutterState('LIVE');
    } catch (err) {
        if (err.name !== 'AbortError') onCameraError(err);
        setShutterState('ERROR');
    }
}

// =====================================
// 撮影後の resultCanvas 再描画
// =====================================
function renderResultFromState() {
    if (!isCaptured) return;
    const overlayCssWidth = frameContent ? frameContent.offsetWidth : overlayCanvas.width;
    const overlayCssHeight = frameContent ? frameContent.offsetHeight : overlayCanvas.height;
    const frameCanvas = renderFrame({
        background: null,
        overlay: overlayImageCanvas,
        overlayTransform: overlayTransform,
        overlayCssWidth: overlayCssWidth,
        overlayCssHeight: overlayCssHeight,
        title: inputTitle.value,
        photographer: inputPhotographer.value,
        date: inputDate.value,
        location: inputLocation.value,
        brightness: parseInt(brightnessSlider.value, 10),
        contrast: parseInt(contrastSlider.value, 10),
        saturation: 100,
        temperature: parseInt(temperatureSlider.value, 10),
    });
    const ctx = resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    ctx.drawImage(frameCanvas, 0, 0);
}

// =====================================
// フレームテキストレイヤー同期
// =====================================
function syncFrameTextLayer() {
    document.getElementById('frame-title').textContent = inputTitle.value;
    const photographerEl = document.getElementById('frame-photographer');
    photographerEl.querySelector('.meta-text').textContent = inputPhotographer.value;
    photographerEl.style.display = inputPhotographer.value ? '' : 'none';
    const dateLocEl = document.getElementById('frame-date-location');
    dateLocEl.querySelector('.meta-date-text').textContent = formatDateMMDDYYYY(inputDate.value);
    dateLocEl.querySelector('.meta-loc-text').textContent = inputLocation.value;
    dateLocEl.style.display = (inputDate.value || inputLocation.value) ? '' : 'none';
}

// =====================================
// 日付ユーティリティ
// =====================================
function getTodayStr() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// =====================================
// ローカルストレージ（テキスト系）
// =====================================
const STORAGE_KEY = 'pp_state';

function saveFormState() {
    const state = {
        title: inputTitle.value,
        photographer: inputPhotographer.value,
        date: inputDate.value,
        location: inputLocation.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreFormState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state.title) inputTitle.value = state.title;
        if (state.photographer) inputPhotographer.value = state.photographer;
        if (state.date) inputDate.value = state.date;
        if (state.location) inputLocation.value = state.location;
    } catch (e) {
        console.warn('Failed to restore form state:', e);
    }
}

// =====================================
// 履歴モーダル
// =====================================
function openHistoryModal() {
    restoreThumbnails();
    historyModal.style.display = 'flex';
}

function closeHistoryModal() {
    historyModal.style.display = 'none';
}

// =====================================
// ワーニングモーダル
// =====================================
let pendingAction = null;

function handleActionWithWarning(action) {
    pendingAction = action;
    if (inputLocation.value.trim()) {
        showLocationWarning();
    } else {
        proceedWithAction();
    }
}

function showLocationWarning() {
    locationWarningModal.style.display = 'flex';
}

function hideLocationWarning() {
    locationWarningModal.style.display = 'none';
}

function proceedWithAction() {
    switch (pendingAction) {
        case 'save': savePng(); break;
        case 'share': shareImage(); break;
    }
    pendingAction = null;
}

// =====================================
// 保存（PNGダウンロード）
// =====================================
function savePng() {
    if (!resultCanvas.width) {
        showToast('保存する画像がありません');
        return;
    }
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const filename = `PrintPhoto_${ts}.png`;
    downloadCanvas(resultCanvas, filename);
    showToast('画像を保存しました');
}

function downloadCanvas(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// =====================================
// 共有
// =====================================
async function shareImage() {
    if (!resultCanvas.width) {
        showToast('共有する画像がありません');
        return;
    }
    const blob = await new Promise(resolve => resultCanvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'PrintPhoto.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: inputTitle.value || 'PrintPhoto',
                text: getShareText(),
            });
            showToast('共有しました');
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
            }
        }
    }
    openXIntent();
}

function openXIntent() {
    const text = encodeURIComponent(getShareText());
    const url = `https://x.com/intent/post?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Xの投稿画面を開きました');
}

function getShareText() {
    const parts = [];
    if (inputTitle.value) parts.push(inputTitle.value);
    const tags = ['#PrintPhoto'];
    try {
        const custom = localStorage.getItem('pp_custom_tags');
        if (custom) tags.push(...custom.split(/\s+/).filter(t => t.startsWith('#')));
    } catch (e) {}
    parts.push(tags.join(' '));
    parts.push(window.location.href);
    return parts.join('\n');
}

// =====================================
// 位置情報
// =====================================
async function handleGetLocation() {
    if (!isSecureDeviceContext()) {
        showToast('位置情報を使うにはHTTPS接続が必要です');
        return;
    }
    const suggestionsEl = document.getElementById('location-suggestions');
    suggestionsEl.innerHTML = '<div class="location-suggestion-item">読み込み中...</div>';
    suggestionsEl.classList.add('active');
    try {
        const pos = await getCurrentPosition();
        const results = await reverseGeocode(pos.lat, pos.lon);
        renderLocationSuggestions(results);
    } catch (err) {
        console.error('Location error:', err);
        if (err.code === 1) {
            showToast('位置情報の取得が許可されていません');
        } else {
            showToast('位置情報の取得に失敗しました');
        }
        suggestionsEl.classList.remove('active');
    }
}

function renderLocationSuggestions(results) {
    const el = document.getElementById('location-suggestions');
    if (!results || results.length === 0) {
        el.innerHTML = '<div class="location-suggestion-item">候補が見つかりませんでした</div>';
        el.classList.add('active');
        return;
    }
    el.innerHTML = results.map(r =>
        `<div class="location-suggestion-item" data-name="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>`
    ).join('');
    el.classList.add('active');
    el.querySelectorAll('.location-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            inputLocation.value = item.dataset.name;
            saveFormState();
            syncFrameTextLayer();
            if (isCaptured) renderResultFromState();
            el.classList.remove('active');
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =====================================
// サムネイル管理
// =====================================
async function restoreThumbnails() {
    try {
        const thumbs = await getAllThumbnails();
        renderThumbnails(thumbs);
    } catch (err) {
        console.warn('Failed to restore thumbnails:', err);
    }
}

function renderThumbnails(thumbs) {
    if (!thumbs || thumbs.length === 0) {
        thumbnailGrid.innerHTML = '<p class="empty-text" data-testid="thumbnail-empty">まだ履歴がありません</p>';
        return;
    }
    thumbnailGrid.innerHTML = thumbs.map(t => `
        <div class="thumbnail-item" data-id="${t.id}">
            <img src="${t.dataUrl}" alt="履歴画像" loading="lazy">
            <button class="thumbnail-delete" data-id="${t.id}" aria-label="削除">×</button>
        </div>
    `).join('');

    thumbnailGrid.querySelectorAll('.thumbnail-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            try {
                await deleteThumbnail(id);
                await restoreThumbnails();
            } catch (err) {
                console.error('Delete thumbnail failed:', err);
            }
        });
    });

    thumbnailGrid.querySelectorAll('.thumbnail-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            try {
                const dataUrl = await loadThumbnail(id);
                if (!dataUrl) {
                    showToast('履歴画像の読み込みに失敗しました');
                    return;
                }
                await applyImage(dataUrl, false);
                closeHistoryModal();
            } catch (err) {
                console.error('Load from history failed:', err);
                showToast('履歴からの読み込みに失敗しました');
            }
        });
    });
}

// =====================================
// トースト
// =====================================
function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// =====================================
// スタート
// =====================================
document.addEventListener('DOMContentLoaded', init);

// グローバルに公開
window.PrintPhoto = {
    showToast,
    copyDebugLogs,
    debugLogs,
    addDebugLog,
    getState: () => ({
        shutterState,
        isCaptured,
        isImageReady,
        selectedImageDataUrl,
    }),
};
