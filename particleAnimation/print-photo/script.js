/**
 * PrintPhoto - メインスクリプト (フェーズ1: 基盤構築)
 * 画面遷移、ファイル選択、日付自動設定、ローカルストレージ復元
 */

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

// =====================================
// 初期化
// =====================================
function init() {
    // ローディング終了
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            content.style.display = 'flex';
            content.classList.add('fade-in-up');
        }, 500);
    }, 800);

    // 日付自動設定
    inputDate.value = getTodayStr();

    // ローカルストレージ復元
    restoreFormState();

    // イベントリスナー
    bindEvents();
}

function bindEvents() {
    // ファイル選択
    imageInput.addEventListener('change', handleFileSelect);

    // 画面遷移
    cameraStartBtn.addEventListener('click', () => switchScreen('compose'));
    btnBackTop.addEventListener('click', () => switchScreen('top'));
    btnBackCompose.addEventListener('click', () => switchScreen('compose'));
    btnShutter.addEventListener('click', () => switchScreen('preview'));

    // テキスト入力 → ローカルストレージ自動保存
    [inputTitle, inputComment, inputPhotographer, inputDate, inputLocation].forEach(el => {
        el.addEventListener('input', saveFormState);
    });

    // ワーニングモーダル
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

    // 保存・共有ボタン（場所ワーニング付き）
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
// ファイル選択
// =====================================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (ev) => {
        selectedImageDataUrl = ev.target.result;
        uploadPreview.innerHTML = `<img src="${selectedImageDataUrl}" alt="選択された画像">`;
        uploadPreview.classList.add('active');
        cameraStartBtn.disabled = false;
    };
    reader.readAsDataURL(file);
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
};
