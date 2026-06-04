/**
 * PrintPhoto - メインスクリプト (フェーズ1+2+3: 基盤 + クロマキー + カメラ合成)
 */

import {
    loadImageToCanvas,
    applyChromaKey,
    applyChromaKeyPreview,
    pickColor,
    rgbToHex,
} from './chroma-key.js';

import {
    startCamera,
    stopCamera,
    setExposure,
    captureVideoFrame,
} from './camera.js';

import { renderFrame } from './frame-render.js';

import {
    getCurrentPosition,
    reverseGeocode,
} from './location.js';

import {
    saveThumbnail,
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
    bindEvents();
}

function bindEvents() {
    imageInput.addEventListener('change', handleFileSelect);

    cameraStartBtn.addEventListener('click', async () => {
        await startCompose();
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

    // 位置情報取得
    document.getElementById('btn-get-location').addEventListener('click', handleGetLocation);
}

// =====================================
// 画面遷移
// =====================================
function switchScreen(name) {
    // カメラ停止（トップに戻る時）
    if (name === 'top' && currentScreen === 'compose') {
        stopCamera();
    }

    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    currentScreen = name;
    window.scrollTo(0, 0);
}

// =====================================
// 合成画面開始（カメラ起動）
// =====================================
async function startCompose() {
    switchScreen('compose');

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        showToast('カメラを使うにはHTTPS接続が必要です');
        return;
    }

    try {
        await startCamera(videoElement);
        updateExposure();
    } catch (err) {
        console.error('Camera error:', err);
        if (err.message === 'HTTPS_REQUIRED') {
            showToast('HTTPS接続が必要です');
        } else if (err.name === 'NotAllowedError') {
            showToast('カメラの使用が許可されていません');
        } else {
            showToast('カメラの起動に失敗しました');
        }
    }
}

// =====================================
// 露光調整
// =====================================
function updateExposure() {
    const brightness = brightnessSlider.value;
    const contrast = contrastSlider.value;
    setExposure(videoElement, brightness, contrast);
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
            await renderPreview();
            // サムネイル保存
            try {
                const blob = await (await fetch(selectedImageDataUrl)).blob();
                await saveThumbnail(blob);
                await restoreThumbnails();
            } catch (e) {
                console.warn('Thumbnail save failed:', e);
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

    const previewCanvas = applyChromaKeyPreview(originalImageCanvas, targetColor, threshold, feather);
    processedImageCanvas = applyChromaKey(originalImageCanvas, targetColor, threshold, feather);

    const ctx = overlayCanvas.getContext('2d');
    overlayCanvas.width = previewCanvas.width;
    overlayCanvas.height = previewCanvas.height;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    ctx.drawImage(previewCanvas, 0, 0);

    // 変形をリセットして適用
    applyOverlayTransform();
}

// =====================================
// オーバーレイ変形適用（CSS transform）
// =====================================
function applyOverlayTransform() {
    overlayCanvas.style.transform = `translate(${overlayTransform.x}px, ${overlayTransform.y}px) scale(${overlayTransform.scale})`;
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
// 撮影（フレーム + video + overlay + テキスト合成）
// =====================================
function takePicture() {
    if (!videoElement.videoWidth || !processedImageCanvas) {
        showToast('カメラまたは画像が準備できていません');
        return;
    }

    const frameCanvas = renderFrame({
        background: videoElement,
        overlay: processedImageCanvas,
        overlayTransform: overlayTransform,
        title: inputTitle.value,
        comment: inputComment.value,
        photographer: inputPhotographer.value,
        date: inputDate.value,
        location: inputLocation.value,
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

    // result-canvas から背景を取得（既に合成済みの画像）
    // ただしテキストだけ変更する場合、再撮影なしでフレームを再描画するには
    // カメラ映像を保持している必要がある → 簡易的に再撮影と同じ処理
    // 実際には video は停止している可能性があるので、result-canvas の内容をベースにテキストだけ上書き
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = resultCanvas.width;
    baseCanvas.height = resultCanvas.height;
    baseCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);

    // 白フレーム部分をクリアして再描画（簡易：フル再合成）
    // 最も確実な方法は takePicture と同じだが video が停止している場合がある
    // ここでは result-canvas の内容を保持しつつ、テキスト領域だけ白塗り＆再描画
    const ctx = resultCanvas.getContext('2d');
    const W = resultCanvas.width;
    const H = resultCanvas.height;
    const scale = W / 2048;
    const textAreaTop = Math.round(1149 * scale);

    // テキストエリアを白で塗りつぶし
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, textAreaTop, W, H - textAreaTop);

    // テキスト再描画（frame-render.js の内部ロジックを簡易再現）
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

    grid.innerHTML = thumbs.map(t => {
        const url = URL.createObjectURL(t.blob);
        return `
            <div class="thumbnail-item" data-id="${t.id}">
                <img src="${url}" alt="履歴画像" loading="lazy">
                <button class="thumbnail-delete" data-id="${t.id}" aria-label="削除">×</button>
            </div>
        `;
    }).join('');

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

    // クリックで再選択（ファイルピッカーを開く）
    grid.querySelectorAll('.thumbnail-item').forEach(item => {
        item.addEventListener('click', () => {
            imageInput.click();
        });
    });
}

// =====================================
// スタート
// =====================================
document.addEventListener('DOMContentLoaded', init);

// グローバルに公開
window.PrintPhoto = {
    switchScreen,
    showToast,
    selectedImageDataUrl: () => selectedImageDataUrl,
    getProcessedCanvas: () => processedImageCanvas,
    getOriginalCanvas: () => originalImageCanvas,
    getTargetColor: () => targetColor,
    getOverlayTransform: () => overlayTransform,
};
