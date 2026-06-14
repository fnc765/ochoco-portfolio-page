/**
 * Vitest setup - jsdom用Canvasモック
 */

class MockCanvasRenderingContext2D {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this._data = {
            data: new Uint8ClampedArray(width * height * 4),
            width: width,
            height: height,
        };
        this._stack = [];
        this._transforms = [];
        this._fontHistory = [];
        this.fillStyle = '#000';
        this.font = '10px sans-serif';
        this.textAlign = 'start';
        this.textBaseline = 'alphabetic';
        this.filter = 'none';
        this._installPropertyTrackers();
    }

    fillRect(x, y, w, h) {
        // 簡易実装: 全体をfillStyleで塗りつぶし
        const [r, g, b, a] = parseColor(this.fillStyle);
        for (let py = Math.max(0, y); py < Math.min(this.height, y + h); py++) {
            for (let px = Math.max(0, x); px < Math.min(this.width, x + w); px++) {
                const idx = (py * this.width + px) * 4;
                this._data.data[idx] = r;
                this._data.data[idx + 1] = g;
                this._data.data[idx + 2] = b;
                this._data.data[idx + 3] = a;
            }
        }
    }

    drawImage(img, a, b, c, d, e, f, g, h) {
        // 簡易: ソース切り出しに対応したコピー
        if (img instanceof MockCanvasElement) {
            const srcCtx = img.getContext('2d');
            const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
            const ctx = this;

            const is9 = typeof h === 'number';
            const is5 = typeof c === 'number' && !is9;

            let srcX, srcY, srcW, srcH, destX, destY, destW, destH;
            if (is9) {
                srcX = a; srcY = b; srcW = c; srcH = d;
                destX = e; destY = f; destW = g; destH = h;
            } else if (is5) {
                srcX = 0; srcY = 0; srcW = img.width; srcH = img.height;
                destX = a; destY = b; destW = c; destH = d;
            } else {
                srcX = 0; srcY = 0; srcW = img.width; srcH = img.height;
                destX = a; destY = b; destW = img.width; destH = img.height;
            }

            for (let y = 0; y < destH; y++) {
                for (let x = 0; x < destW; x++) {
                    const srcPixelX = Math.floor((x / destW) * srcW + srcX);
                    const srcPixelY = Math.floor((y / destH) * srcH + srcY);
                    const sIdx = (srcPixelY * img.width + srcPixelX) * 4;
                    const dIdx = ((destY + y) * ctx.width + (destX + x)) * 4;
                    if (dIdx >= 0 && dIdx < ctx._data.data.length) {
                        ctx._data.data[dIdx] = srcData.data[sIdx];
                        ctx._data.data[dIdx + 1] = srcData.data[sIdx + 1];
                        ctx._data.data[dIdx + 2] = srcData.data[sIdx + 2];
                        ctx._data.data[dIdx + 3] = srcData.data[sIdx + 3];
                    }
                }
            }
        }
    }

    getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const srcIdx = ((y + py) * this.width + (x + px)) * 4;
                const dstIdx = (py * w + px) * 4;
                if (srcIdx >= 0 && srcIdx < this._data.data.length) {
                    data[dstIdx] = this._data.data[srcIdx];
                    data[dstIdx + 1] = this._data.data[srcIdx + 1];
                    data[dstIdx + 2] = this._data.data[srcIdx + 2];
                    data[dstIdx + 3] = this._data.data[srcIdx + 3];
                }
            }
        }
        return { data, width: w, height: h };
    }

    putImageData(imgData, x, y) {
        for (let py = 0; py < imgData.height; py++) {
            for (let px = 0; px < imgData.width; px++) {
                const srcIdx = (py * imgData.width + px) * 4;
                const dstIdx = ((y + py) * this.width + (x + px)) * 4;
                if (dstIdx >= 0 && dstIdx < this._data.data.length) {
                    this._data.data[dstIdx] = imgData.data[srcIdx];
                    this._data.data[dstIdx + 1] = imgData.data[srcIdx + 1];
                    this._data.data[dstIdx + 2] = imgData.data[srcIdx + 2];
                    this._data.data[dstIdx + 3] = imgData.data[srcIdx + 3];
                }
            }
        }
    }

    save() { this._stack.push(this._state()); }
    restore() { const s = this._stack.pop(); if (s) Object.assign(this, s); }
    translate(x, y) {}
    scale(x, y) {}
    transform(a, b, c, d, e, f) { this._transforms.push({ a, b, c, d, e, f }); }
    setTransform(a, b, c, d, e, f) { this._transforms.push({ a, b, c, d, e, f, set: true }); }
    _state() {
        return {
            fillStyle: this.fillStyle,
            font: this.font,
            textAlign: this.textAlign,
            textBaseline: this.textBaseline,
            filter: this.filter,
        };
    }

    _installPropertyTrackers() {
        const tracked = ['fillStyle', 'font', 'textAlign', 'textBaseline', 'filter'];
        for (const key of tracked) {
            let value = this[key];
            Object.defineProperty(this, key, {
                configurable: true,
                enumerable: true,
                get() { return value; },
                set(v) {
                    value = v;
                    if (key === 'font') this._fontHistory.push(v);
                },
            });
        }
    }
    beginPath() {}
    rect(x, y, w, h) {}
    clip() {}
    clearRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(this.height, y + h); py++) {
            for (let px = Math.max(0, x); px < Math.min(this.width, x + w); px++) {
                const idx = (py * this.width + px) * 4;
                this._data.data[idx] = 0;
                this._data.data[idx + 1] = 0;
                this._data.data[idx + 2] = 0;
                this._data.data[idx + 3] = 0;
            }
        }
    }

    measureText(text) {
        return { width: text.length * 8 };
    }

    fillText(text, x, y) {}
}

class MockCanvasElement {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this._ctx = new MockCanvasRenderingContext2D(width, height);
    }
    getContext(type) {
        if (type === '2d') {
            // width/height が変更された場合はコンテキストを再作成
            if (this._ctx.width !== this.width || this._ctx.height !== this.height) {
                this._ctx = new MockCanvasRenderingContext2D(this.width, this.height);
            }
            return this._ctx;
        }
        return null;
    }
    toBlob(callback, type, quality) {
        callback(new Blob(['mock'], { type: type || 'image/png' }));
    }
    toDataURL(type) {
        return 'data:image/png;base64,mock';
    }
}

function parseColor(str) {
    if (str === '#ffffff' || str === '#fff' || str === 'white') return [255, 255, 255, 255];
    if (str === '#000000' || str === '#000' || str === 'black') return [0, 0, 0, 255];
    if (str.startsWith('#') && str.length === 7) {
        return [
            parseInt(str.slice(1, 3), 16),
            parseInt(str.slice(3, 5), 16),
            parseInt(str.slice(5, 7), 16),
            255,
        ];
    }
    if (str.startsWith('rgb(')) {
        const m = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), 255];
    }
    return [0, 0, 0, 255];
}

const _mockElements = new Map();

global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') {
            return new MockCanvasElement(100, 100);
        }
        return {};
    },
    getElementById: (id) => {
        if (_mockElements.has(id)) return _mockElements.get(id);
        return null;
    },
    querySelector: (sel) => {
        if (sel.startsWith('#')) {
            const id = sel.slice(1);
            if (_mockElements.has(id)) return _mockElements.get(id);
        }
        return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    // テスト用：モック要素を登録
    _registerMockElement: (id, el) => _mockElements.set(id, el),
    _clearMockElements: () => _mockElements.clear(),
};

global.HTMLCanvasElement = MockCanvasElement;

// =====================================
// IndexedDB モック
// =====================================
class FakeIDBDatabase {
    constructor() {
        this.objectStoreNames = { contains: () => false };
        this._stores = {};
    }
    createObjectStore(name, options) {
        const store = new FakeIDBObjectStore(name, options);
        this._stores[name] = store;
        return store;
    }
    transaction(storeNames, mode) {
        return new FakeIDBTransaction(this._stores, storeNames, mode);
    }
    close() {}
}

class FakeIDBObjectStore {
    constructor(name, options) {
        this.name = name;
        this.keyPath = options?.keyPath;
        this._data = new Map();
        this._indexes = {};
    }
    createIndex(name, keyPath, options) {
        this._indexes[name] = { keyPath, unique: options?.unique };
    }
    put(value) {
        this._data.set(value[this.keyPath], value);
        return { set onsuccess(fn) { fn(); }, set onerror(fn) {} };
    }
    get(key) {
        const value = this._data.get(key);
        return { result: value || undefined, set onsuccess(fn) { fn(); }, set onerror(fn) {} };
    }
    delete(key) {
        this._data.delete(key);
        return { set onsuccess(fn) { fn(); }, set onerror(fn) {} };
    }
    openCursor() {
        const entries = Array.from(this._data.values());
        let index = -1;
        const req = {
            result: null,
            set onsuccess(fn) {
                const advance = () => {
                    index++;
                    if (index < entries.length) {
                        req.result = { value: entries[index], continue: advance };
                    } else {
                        req.result = null;
                    }
                    fn({ target: req });
                };
                advance();
            },
            set onerror(fn) {},
        };
        return req;
    }
    index(name) {
        // createdAt インデックス用
        return {
            openCursor: (range, direction) => this.openCursor(),
        };
    }
}

class FakeIDBTransaction {
    constructor(stores, storeNames, mode) {
        this._stores = stores;
        this._storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
        this._mode = mode;
    }
    objectStore(name) {
        if (!this._stores[name]) {
            this._stores[name] = new FakeIDBObjectStore(name, { keyPath: 'id' });
        }
        return this._stores[name];
    }
    get oncomplete() { return this._oncomplete; }
    set oncomplete(fn) { this._oncomplete = fn; if (fn) fn(); }
    get onerror() { return this._onerror; }
    set onerror(fn) { this._onerror = fn; }
}

class FakeIDBRequest {
    constructor() {
        this.result = null;
        this.error = null;
    }
}

// グローバルに1つのDBインスタンスを保持（テスト間でデータを共有）
let globalFakeDB = null;

global.indexedDB = {
    open: (name, version) => {
        const req = new FakeIDBRequest();
        setTimeout(() => {
            if (!globalFakeDB) {
                globalFakeDB = new FakeIDBDatabase();
            }
            req.result = globalFakeDB;
            if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
    },
    _reset: () => { globalFakeDB = null; },
};
