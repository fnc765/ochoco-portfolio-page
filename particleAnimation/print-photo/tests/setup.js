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
        this.fillStyle = '#000';
        this.font = '10px sans-serif';
        this.textAlign = 'start';
        this.textBaseline = 'alphabetic';
        this.filter = 'none';
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

    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        // 簡易: ソース全体をコピー
        if (img instanceof MockCanvasElement) {
            const srcCtx = img.getContext('2d');
            const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
            const ctx = this;
            const destW = dw !== undefined ? dw : img.width;
            const destH = dh !== undefined ? dh : img.height;
            const startX = dx !== undefined ? dx : sx;
            const startY = dy !== undefined ? dy : sy;
            for (let y = 0; y < destH; y++) {
                for (let x = 0; x < destW; x++) {
                    const srcX = Math.floor((x / destW) * img.width);
                    const srcY = Math.floor((y / destH) * img.height);
                    const sIdx = (srcY * img.width + srcX) * 4;
                    const dIdx = ((startY + y) * ctx.width + (startX + x)) * 4;
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

    save() {}
    restore() {}
    translate(x, y) {}
    scale(x, y) {}
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
        if (type === '2d') return this._ctx;
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

global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') {
            return new MockCanvasElement(100, 100);
        }
        return {};
    },
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
