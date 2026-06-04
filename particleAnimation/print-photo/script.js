/**
 * PrintPhoto - メインスクリプト (フェーズ1+2: 基盤 + クロマキー)
 */

import {
    loadImageToCanvas,
    applyChromaKey,
    applyChromaKeyPreview,
    pickColor,
    rgbToHex,
} from './chroma-key.js';

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

const thresholdSlider = document.getElementById('threshold-slider');
const featherSlider = document.getElementById('feather-slider');
const colorDot = document.getElementById('color-dot');
const colorValue = document.querySelector('.color-value');
const overlayCanvas = document.getElementById('overlay-canvas');

const inputTitle = document.getElementById('input-title');
const inputComment = document.getElementById('input-comment');
const inputPhotographer = document.getElementById('input-photographer');
const inputDate = document.getElementById('input-date');
const inputLocation = document.getElementById('input-location');

const locationWarningModal = document.getElementById('location-warning-modal');
const btnCancelWarning = document.getElementById('btn-cancel-warning');
const btnRemoveLocation = document.getElementById('btn-remove-location');
const btnContinueWarning = document.getElementById('btn-continue-warning');

// =====================================
// 状態
// =====================================
let currentScreen = 'top';
let selectedImageFile = null;
let selectedImageDataUrl = null;
let originalImageCanvas = null;   // 元画像（クロマキー適用前）
let processedImageCanvas = null;  // 透過済み画像（フルサイズ）
let targetColor = { r: 0, g: 255, b: 0 }; // デフォルト: 緑

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
    bindEvents();
}

function bindEvents() {
    imageInput.addEventListener('change', handleFileSelect);

    cameraStartBtn.addEventListener('click', () => switchScreen('compose'));
    btnBackTop.addEventListener('click', () => switchScreen('top'));
    btnBackCompose.addEventListener('click', () => switchScreen('compose'));
    btnShutter.addEventListener('click', () => switchScreen('preview'));

    [inputTitle, inputComment, inputPhotographer, inputDate, inputLocation].forEach(el => {
        el.addEventListener('input', saveFormState);
    });

    // クロマキー調整スライダー
    thresholdSlider.addEventListener('input', () => renderPreview());
    featherSlider.addEventListener('input', () => renderPreview());

    // 色ピックアップ（アップロードプレビューから）
    uploadPreview.addEventListener('click', handleColorPick);

    // 色ピックアップ（合成画面のオーバーレイから）
    overlayCanvas.addEventListener('click', handleOverlayColorPick);

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
}

// =====================================
// 画面遷移
// =====================================
function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    currentScreen = name;
    window.scrollTo(0, 0);
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

        // プレビュー表示
        uploadPreview.innerHTML = `<img src="${selectedImageDataUrl}" alt="選択された画像">`;
        uploadPreview.classList.add('active');
        cameraStartBtn.disabled = false;

        // Canvas化
        try {
            originalImageCanvas = await loadImageToCanvas(selectedImageDataUrl);
            // 初期クロマキー適用（緑背景）
            await renderPreview();
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

    // プレビュー用（高速・縮小）
    const previewCanvas = applyChromaKeyPreview(originalImageCanvas, targetColor, threshold, feather);

    // フルサイズも保持しておく（撮影時に使用）
    processedImageCanvas = applyChromaKey(originalImageCanvas, targetColor, threshold, feather);

    // overlay-canvas に描画（合成画面用）
    const ctx = overlayCanvas.getContext('2d');
    overlayCanvas.width = previewCanvas.width;
    overlayCanvas.height = previewCanvas.height;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    ctx.drawImage(previewCanvas, 0, 0);
}

// =====================================
// 色ピックアップ（アップロードプレビュー）
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

// =====================================
// 色ピックアップ（合成オーバーレイ）
// =====================================
function handleOverlayColorPick(e) {
    if (!originalImageCanvas) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // オリジナル画像（縮小版に合わせて座標換算）
    const scaleX = originalImageCanvas.width / overlayCanvas.width;
    const scaleY = originalImageCanvas.height / overlayCanvas.height;
    const ox = Math.min(1, Math.max(0, x)) * (overlayCanvas.width / originalImageCanvas.width);
    const oy = Math.min(1, Math.max(0, y)) * (overlayCanvas.height / originalImageCanvas.height);

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
            // TODO: フェーズ5で実装
            showToast('保存機能は開発中です');
            break;
        case 'share':
            // TODO: フェーズ5で実装
            showToast('共有機能は開発中です');
            break;
        case 'copy':
            // TODO: フェーズ5で実装
            showToast('コピー機能は開発中です');
            break;
    }
    pendingAction = null;
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

// グローバルに公開（モジュール間連携用）
window.PrintPhoto = {
    switchScreen,
    showToast,
    selectedImageDataUrl: () => selectedImageDataUrl,
    getProcessedCanvas: () => processedImageCanvas,
    getOriginalCanvas: () => originalImageCanvas,
    getTargetColor: () => targetColor,
};
