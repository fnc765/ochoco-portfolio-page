/**
 * PrintPhoto - メインスクリプト (フェーズ1+2+3: 基盤 + クロマキー + カメラ合成)
 */

import {
    loadImageToCanvas,
    applyChromaKey,
    applyChromaKeyPreview,
    pickColor,
    rgbToHex,
    hasTransparency,
} from './chroma-key.js';

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

// =====================================
// DOM 要素
// =====================================
const loader = document.getElementById('loader');
const content = document.getElementById('content');

const screens = {
    top: document.getElementById('screen-top'),
    compose: document.getElementById('screen-compose'),
    preview: document.getElementById('screen-preview'),
};

const imageInput = document.getElementById('image-input');
const uploadPreview = document.getElementById('upload-preview');
const cameraStartBtn = document.getElementById('camera-start-btn');
const httpsWarning = document.getElementById('https-warning');
const cameraPermissionGuide = document.getElementById('camera-permission-guide');
const cameraPermissionText = document.getElementById('camera-permission-text');

const btnBackTop = document.getElementById('btn-back-top');
const btnBackCompose = document.getElementById('btn-back-compose');
const btnShutter = document.getElementById('btn-shutter');

const videoElement = document.getElementById('camera-video');
const overlayCanvas = document.getElementById('overlay-canvas');
const frameContent = document.getElementById('frame-content');

const thresholdSlider = document.getElementById('threshold-slider');
const featherSlider = document.getElementById('feather-slider');
const brightnessSlider = document.getElementById('brightness-slider');
const contrastSlider = document.getElementById('contrast-slider');
const colorDot = document.getElementById('color-dot');
const colorValue = document.querySelector('.color-value');

const inputTitle = document.getElementById('input-title');
const inputComment = document.getElementById('input-comment');
const inputPhotographer = document.getElementById('input-photographer');
const inputDate = document.getElementById('input-date');
const inputLocation = document.getElementById('input-location');

const locationWarningModal = document.getElementById('location-warning-modal');
const btnCancelWarning = document.getElementById('btn-cancel-warning');
const btnRemoveLocation = document.getElementById('btn-remove-location');
const btnContinueWarning = document.getElementById('btn-continue-warning');

const resultCanvas = document.getElementById('result-canvas');
const previewFrame = document.getElementById('preview-frame');

// =====================================
// 状態
// =====================================
let currentScreen = 'top';
let selectedImageFile = null;
let selectedImageDataUrl = null;
let originalImageCanvas = null;
let processedImageCanvas = null;
let currentPreviewCanvas = null;
let targetColor = { r: 0, g: 255, b: 0 };

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
let cameraPermissionState = 'prompt'; // 'granted' | 'denied' | 'prompt' | 'unknown'
let isCameraActive = false;

/**
 * カメラストリームを確実に停止し、videoElement も解放する
 */
function stopCameraInternal() {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    stopCamera(); // camera.js 側の activeStream も停止
    isCameraActive = false;
}

// デバッグログ蓄積
const debugLogs = [];

function addDebugLog(label, data) {
    const entry = `[${label}] ${JSON.stringify(data, null, 2)}`;
    debugLogs.push(entry);
    console.log(entry);
    renderDebugLog();
}

function renderDebugLog() {
    const el = document.getElementById('debug-log');
    if (el) {
        el.value = debugLogs.join('\n');
    }
}

function copyDebugLogs() {
    if (debugLogs.length === 0) {
        showToast('ログがありません');
        return;
    }
    const text = debugLogs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast('デバッグログをコピーしました');
    }).catch(() => {
        showToast('コピーに失敗しました');
    });
}

// =====================================
// 初期化
// =====================================
function init() {
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            content.style.display = 'flex';
            content.classList.add('fade-in-up');
        }, 500);
    }, 800);

    inputDate.value = getTodayStr();
    restoreFormState();
    restoreThumbnails();
    checkEnvironment();
    bindEvents();
    loadGitCommit();
}

// =====================================
// Git コミットハッシュ表示
// =====================================
async function loadGitCommit() {
    try {
        const response = await fetch('version.json');
        if (!response.ok) return;
        const data = await response.json();
        const el = document.getElementById('git-commit');
        if (el && data.commit) {
            el.textContent = `commit: ${data.commit}`;
        }
    } catch (e) {
        // ローカル開発時やファイル不在時は静かに無視
    }
}

// =====================================
// 環境チェック（HTTPS / カメラ権限）
// =====================================
function checkEnvironment() {
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) {
        httpsWarning.style.display = 'block';
        httpsWarning.querySelector('p').innerHTML =
            '<i class="fas fa-lock" aria-hidden="true"></i> ' +
            'カメラを使うには<strong>HTTPS</strong>接続が必要です。<br>' +
            '現在: ' + window.location.protocol + '//' + window.location.host;
    }

    // Permissions API でカメラ権限状態を確認（可能な場合）
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'camera' })
            .then((status) => {
                cameraPermissionState = status.state; // 'granted' | 'denied' | 'prompt'
                status.onchange = () => {
                    cameraPermissionState = status.state;
                    if (status.state === 'granted') {
                        hideCameraGuide();
                    }
                };
            })
            .catch(() => {
                // iOS Safari等、Permissions API未対応環境
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
// イベントバインディング
// =====================================
function bindEvents() {
    imageInput.addEventListener('change', handleFileSelect);

    // カメラ起動ボタン - getUserMedia はユーザージェスチャーから同期的に呼ぶ必要がある
    cameraStartBtn.addEventListener('click', () => {
        handleCameraStart();
    });
    btnBackTop.addEventListener('click', () => switchScreen('top'));
    btnBackCompose.addEventListener('click', () => switchScreen('compose'));
    btnShutter.addEventListener('click', takePicture);

    [inputTitle, inputComment, inputPhotographer, inputDate, inputLocation].forEach(el => {
        el.addEventListener('input', () => {
            saveFormState();
            syncFrameTextLayer();
            updatePreviewFrame();
        });
    });

    // クロマキー調整
    thresholdSlider.addEventListener('input', () => renderPreview());
    featherSlider.addEventListener('input', () => renderPreview());

    // 露光調整
    brightnessSlider.addEventListener('input', updateExposure);
    contrastSlider.addEventListener('input', updateExposure);

    // 色ピックアップ
    uploadPreview.addEventListener('click', handleColorPick);
    overlayCanvas.addEventListener('click', handleOverlayColorPick);

    // ドラッグ・ピンチ（overlay-canvas）
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

    document.getElementById('btn-save-png').addEventListener('click', () => handleActionWithWarning('save'));
    document.getElementById('btn-share').addEventListener('click', () => handleActionWithWarning('share'));
    document.getElementById('btn-copy').addEventListener('click', () => handleActionWithWarning('copy'));

    // 位置情報
    document.getElementById('btn-get-location').addEventListener('click', handleGetLocation);

    // デバッグログコピー
    const btnCopyDebug = document.getElementById('btn-copy-debug');
    if (btnCopyDebug) {
        btnCopyDebug.addEventListener('click', copyDebugLogs);
    }

    // ページ非表示（別タブ・別アプリ・画面OFF）時にカメラを停止
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isCameraActive) {
            stopCameraInternal();
            addDebugLog('visibilitychange', { action: 'stop-camera', reason: 'page-hidden' });
        }
    });

    // ページ離脱時の保険（バックグラウンド遷移・タブ切替・ブラウザ閉じる等）
    window.addEventListener('pagehide', () => {
        if (isCameraActive) {
            stopCameraInternal();
        }
    });
}

// =====================================
// 画面遷移
// =====================================
function switchScreen(name) {
    // カメラ停止（トップに戻る時・プレビューに移動する時）
    if ((name === 'top' && currentScreen === 'compose') || (name === 'preview' && currentScreen === 'compose')) {
        stopCameraInternal();
    }

    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    currentScreen = name;
    window.scrollTo(0, 0);

    // プレビュー画面に遷移した時にデバッグログを再描画・表示
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        if (name === 'preview') {
            debugPanel.classList.add('active');
            renderDebugLog();
        } else {
            debugPanel.classList.remove('active');
        }
    }
}

// =====================================
// カメラ起動ハンドラー（ユーザージェスチャーから同期的に呼ぶ）
// =====================================
function handleCameraStart() {
    console.log('[PrintPhoto] handleCameraStart called');
    if (!selectedImageDataUrl) {
        showToast('先に画像を選択してください');
        return;
    }

    // アプリ内ブラウザ（LINE/Instagram/Twitter等）では getUserMedia が無効なことが多い
    const inAppBrowser = detectInAppBrowser();
    if (inAppBrowser) {
        showCameraGuide('【' + inAppBrowser + '】アプリ内ブラウザではカメラ機能が使用できません。Safari または Chrome の「本体」でこのページを開いてください。（アプリ内の「⋯」メニューから「ブラウザで開く」を選んでください）');
        return;
    }

    switchScreen('compose');
    hideCameraGuide();

    // navigator.mediaDevices の存在確認
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[PrintPhoto] getUserMedia not supported');
        showCameraGuide('お使いのブラウザはカメラ機能に対応していません。Safari / Chrome / Edge をお試しください。');
        return;
    }

    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || /^127\./.test(window.location.hostname) || /^192\.168\./.test(window.location.hostname) || /^10\./.test(window.location.hostname);
    console.log('[PrintPhoto] isSecure:', isSecure, 'protocol:', window.location.protocol, 'hostname:', window.location.hostname);
    if (!isSecure) {
        showCameraGuide('カメラを使うにはHTTPS接続が必要です。現在: ' + window.location.protocol + '//' + window.location.host);
        return;
    }

    // Permissions-Policy / Feature-Policy でカメラがブロックされていないか確認
    if (!isCameraAllowedByPolicy()) {
        showCameraGuide('このサイトのHTTPヘッダー（Permissions-Policy）でカメラがブロックされている可能性があります。サーバー設定を確認してください。');
        return;
    }

    // getUserMedia を同期的に呼ぶ（Promise.then で非同期処理を分離）
    const constraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        },
        audio: false,
    };

    console.log('[PrintPhoto] Requesting getUserMedia...');
    let resolved = false;

    // getUserMedia が無視された場合（Promiseがpendingのまま）を検出するためのタイムアウト
    const timeoutId = setTimeout(() => {
        if (!resolved) {
            console.error('[PrintPhoto] getUserMedia timed out after 10s — browser may be ignoring the request');
            onCameraError({ name: 'TimeoutError', message: 'ブラウザがカメラ要求を無視しました（Permissions-Policy、アプリ内ブラウザ、またはグローバル設定の可能性）' });
        }
    }, 10000);

    navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
            resolved = true;
            clearTimeout(timeoutId);
            console.log('[PrintPhoto] getUserMedia success');
            onCameraSuccess(stream);
        })
        .catch((err) => {
            resolved = true;
            clearTimeout(timeoutId);
            console.log('[PrintPhoto] getUserMedia first attempt failed:', err.name, err.message);
            // facingMode を外して再試行
            if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
                return navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
            }
            throw err;
        })
        .then((stream) => {
            if (stream) onCameraSuccess(stream);
        })
        .catch((err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
            }
            console.error('[PrintPhoto] getUserMedia final error:', err.name, err.message);
            onCameraError(err);
        });
}

// =====================================
// アプリ内ブラウザ検出
// =====================================
function detectInAppBrowser() {
    const ua = navigator.userAgent || '';
    const standAlone = navigator.standalone;
    // iOS WKWebView（アプリ内ブラウザの特徴）
    if (/Line\//i.test(ua)) return 'LINE';
    if (/Instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV/i.test(ua)) return 'Facebook';
    if (/Twitter/i.test(ua)) return 'Twitter/X';
    // iOS で Safari ではなく、かつ standalone でない場合はアプリ内ブラウザの可能性が高い
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
    if (isIOS && !isSafari && !standAlone) {
        return 'アプリ内';
    }
    return null;
}

// =====================================
// Permissions-Policy / Feature-Policy 検出
// =====================================
function isCameraAllowedByPolicy() {
    // document.featurePolicy は旧 API（Chrome 74-88頃）
    if (document.featurePolicy && document.featurePolicy.allowsFeature) {
        try {
            return document.featurePolicy.allowsFeature('camera');
        } catch (e) {
            return true; // 確認できない場合は許可とみなす
        }
    }
    // document.permissionsPolicy は新 API（未対応ブラウザが多い）
    if (document.permissionsPolicy && document.permissionsPolicy.allowsFeature) {
        try {
            return document.permissionsPolicy.allowsFeature('camera');
        } catch (e) {
            return true;
        }
    }
    // 確認手段がない場合は許可とみなす
    return true;
}

function onCameraSuccess(stream) {
    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
        videoElement.play().catch(() => {});
    };
    setActiveStream(stream); // camera.js 側と同期
    isCameraActive = true;
    updateExposure();
    hideCameraGuide();
}

function onCameraError(err) {
    console.error('[PrintPhoto] Camera error:', err.name, err.message);
    isCameraActive = false;

    // エラー時はトップ画面に戻してガイドを表示（compose画面ではガイドが見えない）
    switchScreen('top');

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
// 露光調整（入力画像に適用）
// =====================================
function updateExposure() {
    redrawOverlayCanvas();
}

// =====================================
// オーバーレイCanvas再描画（明るさ・コントラスト適用）
// =====================================
function redrawOverlayCanvas() {
    if (!currentPreviewCanvas) return;

    const frameContent = document.getElementById('frame-content');
    const cssW = frameContent ? frameContent.offsetWidth : currentPreviewCanvas.width;
    const cssH = frameContent ? frameContent.offsetHeight : currentPreviewCanvas.height;

    const ctx = overlayCanvas.getContext('2d');
    overlayCanvas.width = cssW;
    overlayCanvas.height = cssH;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const brightness = parseInt(brightnessSlider.value, 10);
    const contrast = parseInt(contrastSlider.value, 10);

    if (brightness !== 100 || contrast !== 100) {
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    }

    // プレビュー画像を合成エリアにフィットするように左上に描画
    const fitScale = Math.min(cssW / currentPreviewCanvas.width, cssH / currentPreviewCanvas.height);
    ctx.drawImage(currentPreviewCanvas, 0, 0, currentPreviewCanvas.width * fitScale, currentPreviewCanvas.height * fitScale);

    ctx.filter = 'none';

    applyOverlayTransform();
}

// =====================================
// ファイル選択 + クロマキー初期化
// =====================================
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        selectedImageDataUrl = ev.target.result;
        uploadPreview.innerHTML = `<img src="${selectedImageDataUrl}" alt="選択された画像">`;
        uploadPreview.classList.add('active');
        cameraStartBtn.disabled = false;

        try {
            originalImageCanvas = await loadImageToCanvas(selectedImageDataUrl);

            // 透過画像判定（PNG等、すでに透過している場合はクロマキースキップ）
            const isTransparent = hasTransparency(originalImageCanvas);
            if (isTransparent) {
                processedImageCanvas = originalImageCanvas;
                currentPreviewCanvas = originalImageCanvas;
                redrawOverlayCanvas();
                applyOverlayTransform();
                showToast('透過画像を読み込みました');
            } else {
                await renderPreview();
            }

            // フルサイズDataURLを履歴保存
            try {
                await saveThumbnail(selectedImageDataUrl);
                await restoreThumbnails();
            } catch (e) {
                console.warn('History save failed:', e);
            }
        } catch (err) {
            console.error('Image load failed:', err);
            showToast('画像の読み込みに失敗しました');
        }
    };
    reader.readAsDataURL(file);
}

// =====================================
// クロマキープレビュー描画
// =====================================
function renderPreview() {
    if (!originalImageCanvas) return;

    const threshold = parseInt(thresholdSlider.value, 10);
    const feather = parseInt(featherSlider.value, 10);

    currentPreviewCanvas = applyChromaKeyPreview(originalImageCanvas, targetColor, threshold, feather);
    processedImageCanvas = applyChromaKey(originalImageCanvas, targetColor, threshold, feather);

    redrawOverlayCanvas();
}

// =====================================
// オーバーレイ変形適用（CSS transform）
// =====================================
function applyOverlayTransform() {
    overlayCanvas.style.transform = `translate(${overlayTransform.x}px, ${overlayTransform.y}px) scale(${overlayTransform.scale})`;
    overlayCanvas.style.transformOrigin = '0 0';
}

// =====================================
// ドラッグ操作（マウス/タッチ 1本指）
// =====================================
function handlePointerDown(e) {
    if (e.pointerType === 'touch' && e.isPrimary === false) return; // マルチタッチは別処理
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

function handlePointerUp(e) {
    isDragging = false;
}

// =====================================
// ピンチ操作（タッチ 2本指）
// =====================================
function handleTouchStart(e) {
    if (e.touches.length === 2) {
        isDragging = false; // ドラッグを中断
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
// 色ピックアップ
// =====================================
function handleColorPick(e) {
    if (!originalImageCanvas) return;
    const rect = uploadPreview.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const color = pickColor(originalImageCanvas, x, y, true);
    if (color && color.a > 0) {
        setTargetColor(color.r, color.g, color.b);
    }
}

function handleOverlayColorPick(e) {
    if (!originalImageCanvas) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // 元画像座標に換算
    const ox = x * (overlayCanvas.width / originalImageCanvas.width);
    const oy = y * (overlayCanvas.height / originalImageCanvas.height);
    const color = pickColor(originalImageCanvas, ox, oy, true);
    if (color && color.a > 0) {
        setTargetColor(color.r, color.g, color.b);
    }
}

function setTargetColor(r, g, b) {
    targetColor = { r, g, b };
    colorDot.style.background = rgbToHex(r, g, b);
    colorValue.textContent = `R:${r} G:${g} B:${b}`;
    renderPreview();
}

// =====================================
// カメラ再起動（撮影時に未起動だった場合の救済）
// =====================================
async function tryStartCamera() {
    try {
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false,
        };
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        onCameraSuccess(stream);
    } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
            const fallbackConstraints = {
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            };
            let stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            onCameraSuccess(stream);
        } else {
            console.error('[PrintPhoto] tryStartCamera failed:', err);
        }
    }
}

// =====================================
// 撮影（フレーム + video + overlay + テキスト合成）
// =====================================
async function takePicture() {
    if (!processedImageCanvas) {
        showToast('先に画像を選択してください');
        return;
    }

    // カメラが未起動の場合、再度起動を試みる
    if (!isCameraActive && videoElement.readyState < 2) {
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        if (isSecure) {
            showToast('カメラを起動しています...');
            await tryStartCamera();
            // カメラがまだ起動できなかった場合でも、黒背景で続行
        }
    }

    const frameContent = document.getElementById('frame-content');
    const overlayCssWidth = frameContent ? frameContent.offsetWidth : overlayCanvas.width;
    const overlayCssHeight = frameContent ? frameContent.offsetHeight : overlayCanvas.height;

    // CSS 表示サイズを取得（プレビューと合成の一致用）
    // video要素のclientWidth/clientHeightを優先（object-fit: coverと同じ計算基準にする）
    const bgDisplayW = videoElement.clientWidth || (frameContent ? frameContent.offsetWidth : 0);
    const bgDisplayH = videoElement.clientHeight || (frameContent ? frameContent.offsetHeight : 0);

    // カメラ映像サイズをデバッグログ（縦撮り問題の調査用）
    const videoW = videoElement.videoWidth || 0;
    const videoH = videoElement.videoHeight || 0;
    let settingsW = null;
    let settingsH = null;
    try {
        const tracks = videoElement.srcObject?.getVideoTracks?.();
        if (tracks && tracks.length > 0) {
            const s = tracks[0].getSettings();
            settingsW = s.width;
            settingsH = s.height;
        }
    } catch (e) {}

    const isPortrait = window.innerHeight > window.innerWidth;
    addDebugLog('takePicture', {
        videoReadyState: videoElement.readyState,
        videoSize: { w: videoW, h: videoH },
        videoDisplay: { w: videoElement.clientWidth, h: videoElement.clientHeight },
        videoSettings: { w: settingsW, h: settingsH },
        isPortrait,
        frameContent: { w: bgDisplayW, h: bgDisplayH },
        overlaySize: { w: processedImageCanvas.width, h: processedImageCanvas.height },
        overlayCss: { w: overlayCssWidth, h: overlayCssHeight },
        overlayTransform,
    });

    const frameCanvas = renderFrame({
        background: videoElement.readyState >= 2 ? videoElement : null,
        backgroundDisplayWidth: bgDisplayW,
        backgroundDisplayHeight: bgDisplayH,
        overlay: processedImageCanvas,
        overlayTransform: overlayTransform,
        overlayCssWidth: overlayCssWidth,
        overlayCssHeight: overlayCssHeight,
        title: inputTitle.value,
        comment: inputComment.value,
        photographer: inputPhotographer.value,
        date: inputDate.value,
        location: inputLocation.value,
        brightness: parseInt(brightnessSlider.value, 10),
        contrast: parseInt(contrastSlider.value, 10),
        saturation: 100,
    });

    // result-canvas に表示
    resultCanvas.width = frameCanvas.width;
    resultCanvas.height = frameCanvas.height;
    resultCanvas.getContext('2d').drawImage(frameCanvas, 0, 0);

    // フレームテキストレイヤーを同期（合成画面用）
    syncFrameTextLayer();

    switchScreen('preview');
}

// =====================================
// フレームテキストレイヤー同期
// =====================================
function syncFrameTextLayer() {
    document.getElementById('frame-title').textContent = inputTitle.value;
    document.getElementById('frame-comment').textContent = inputComment.value;
    document.getElementById('frame-photographer').textContent = inputPhotographer.value ? `撮影者: ${inputPhotographer.value}` : '';
    const dateLoc = [inputDate.value, inputLocation.value].filter(Boolean).join('  ');
    document.getElementById('frame-date-location').textContent = dateLoc;
}

// =====================================
// プレビュー画面のフレーム再描画
// =====================================
function updatePreviewFrame() {
    if (currentScreen !== 'preview' || !resultCanvas.width) return;

    const ctx = resultCanvas.getContext('2d');
    const W = resultCanvas.width;
    const H = resultCanvas.height;
    const scale = W / 2048;
    const textAreaTop = Math.round(1149 * scale);

    // テキストエリアを白で塗りつぶし
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, textAreaTop, W, H - textAreaTop);

    // テキスト再描画
    const fontFamily = "'M PLUS Rounded 1c', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'bottom';
    const marginX = Math.round(48 * scale);
    const marginBottom = Math.round(36 * scale);
    const bottomY = H - marginBottom;
    const centerX = W / 2;

    // タイトル
    if (inputTitle.value) {
        const maxW = W - marginX * 2;
        let size = Math.round(72 * scale);
        ctx.font = `700 ${size}px ${fontFamily}`;
        while (ctx.measureText(inputTitle.value).width > maxW && size > 10) {
            size -= 2;
            ctx.font = `700 ${size}px ${fontFamily}`;
        }
        ctx.textAlign = 'center';
        ctx.fillText(inputTitle.value, centerX, bottomY - Math.round(50 * scale));
    }

    // コメント
    if (inputComment.value) {
        const maxW = W - marginX * 2;
        let size = Math.round(40 * scale);
        ctx.font = `400 ${size}px ${fontFamily}`;
        ctx.textAlign = 'center';
        const commentY = inputTitle.value
            ? bottomY - Math.round(50 * scale) - Math.round(8 * scale)
            : bottomY - Math.round(30 * scale);
        const lines = wrapTextSimple(ctx, inputComment.value, maxW);
        lines.forEach((line, i) => {
            const lineY = commentY - (lines.length - 1 - i) * (size * 1.3);
            ctx.fillText(line, centerX, lineY);
        });
    }

    // 撮影者
    if (inputPhotographer.value) {
        const metaSize = Math.round(28 * scale);
        ctx.font = `400 ${metaSize}px ${fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillText(`撮影者: ${inputPhotographer.value}`, marginX, bottomY);
    }

    // 日付・場所
    const rightText = [inputDate.value, inputLocation.value].filter(Boolean).join('  ');
    if (rightText) {
        const metaSize = Math.round(28 * scale);
        ctx.font = `400 ${metaSize}px ${fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(rightText, W - marginX, bottomY);
    }
}

function wrapTextSimple(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
        const chars = para.split('');
        let current = '';
        for (const ch of chars) {
            const test = current + ch;
            if (ctx.measureText(test).width > maxWidth && current.length > 0) {
                lines.push(current);
                current = ch;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
    }
    return lines.length ? lines : [text];
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
        comment: inputComment.value,
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
        if (state.comment) inputComment.value = state.comment;
        if (state.photographer) inputPhotographer.value = state.photographer;
        if (state.date) inputDate.value = state.date;
        if (state.location) inputLocation.value = state.location;
    } catch (e) {
        console.warn('Failed to restore form state:', e);
    }
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
        case 'save':
            savePng();
            break;
        case 'share':
            shareImage();
            break;
        case 'copy':
            copyImage();
            break;
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

    // Web Share API（対応環境）
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

    // フォールバック: X Intent
    openXIntent();
}

// =====================================
// X Intent
// =====================================
function openXIntent() {
    const text = encodeURIComponent(getShareText());
    const url = `https://x.com/intent/post?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Xの投稿画面を開きました');
}

// =====================================
// クリップボードコピー
// =====================================
async function copyImage() {
    if (!resultCanvas.width) {
        showToast('コピーする画像がありません');
        return;
    }

    try {
        const blob = await new Promise(resolve => resultCanvas.toBlob(resolve, 'image/png'));
        if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
            ]);
            showToast('画像をコピーしました');
        } else {
            throw new Error('Clipboard API not supported');
        }
    } catch (err) {
        console.error('Copy failed:', err);
        // フォールバック: DataURLをコピー
        try {
            const dataUrl = resultCanvas.toDataURL('image/png');
            await navigator.clipboard.writeText(dataUrl);
            showToast('画像URLをコピーしました（DataURL）');
        } catch (e) {
            showToast('コピーに失敗しました');
        }
    }
}

// =====================================
// 共有テキスト生成
// =====================================
function getShareText() {
    const parts = [];
    if (inputTitle.value) parts.push(inputTitle.value);
    if (inputComment.value) parts.push(inputComment.value);
    if (inputLocation.value) parts.push(`📍 ${inputLocation.value}`);
    if (inputDate.value) parts.push(`📅 ${inputDate.value}`);
    if (inputPhotographer.value) parts.push(`by ${inputPhotographer.value}`);

    // ハッシュタグ
    const tags = ['#PrintPhoto'];
    try {
        const custom = localStorage.getItem('pp_custom_tags');
        if (custom) tags.push(...custom.split(/\s+/).filter(t => t.startsWith('#')));
    } catch (e) {}
    parts.push(tags.join(' '));

    return parts.join('\n');
}

// =====================================
// 位置情報取得
// =====================================
async function handleGetLocation() {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
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
    const grid = document.getElementById('thumbnail-grid');
    if (!thumbs || thumbs.length === 0) {
        grid.innerHTML = '<p class="empty-text" data-testid="thumbnail-empty">まだ履歴がありません</p>';
        return;
    }

    grid.innerHTML = thumbs.map(t => `
        <div class="thumbnail-item" data-id="${t.id}">
            <img src="${t.dataUrl}" alt="履歴画像" loading="lazy">
            <button class="thumbnail-delete" data-id="${t.id}" aria-label="削除">×</button>
        </div>
    `).join('');

    // 削除ボタン
    grid.querySelectorAll('.thumbnail-delete').forEach(btn => {
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

    // クリックで再選択（IndexedDBから直接読み込み、ファイルピッカー不要）
    grid.querySelectorAll('.thumbnail-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            try {
                const dataUrl = await loadThumbnail(id);
                if (!dataUrl) {
                    showToast('履歴画像の読み込みに失敗しました');
                    return;
                }
                selectedImageDataUrl = dataUrl;
                uploadPreview.innerHTML = `<img src="${dataUrl}" alt="選択された画像">`;
                uploadPreview.classList.add('active');
                cameraStartBtn.disabled = false;

                originalImageCanvas = await loadImageToCanvas(dataUrl);
            const isTransparent = hasTransparency(originalImageCanvas);
            if (isTransparent) {
                processedImageCanvas = originalImageCanvas;
                currentPreviewCanvas = originalImageCanvas;
                redrawOverlayCanvas();
                applyOverlayTransform();
            } else {
                await renderPreview();
            }
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
    switchScreen,
    showToast,
    copyDebugLogs,
    debugLogs,
    addDebugLog,
    renderDebugLog,
    selectedImageDataUrl: () => selectedImageDataUrl,
    getProcessedCanvas: () => processedImageCanvas,
    getOriginalCanvas: () => originalImageCanvas,
    getTargetColor: () => targetColor,
    getOverlayTransform: () => overlayTransform,
};
