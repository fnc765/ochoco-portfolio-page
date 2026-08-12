/**
 * PrintPhoto - localStorage/IndexedDB管理モジュール
 */

const DB_NAME = 'PrintPhotoDB';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const MAX_ITEMS = 10; // 履歴10枚まで

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

/**
 * 履歴表示用画像と、再利用時の高解像度画像を保存
 * @param {string} dataUrl - 履歴表示用の画像DataURL
 * @param {string} sourceDataUrl - 再利用時に読み込む高解像度画像DataURL
 * @returns {Promise<string>} id
 */
export async function saveThumbnail(dataUrl, sourceDataUrl = dataUrl) {
    const db = await openDB();
    const id = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = { id, dataUrl, createdAt: Date.now() };
        if (sourceDataUrl !== dataUrl) record.sourceDataUrl = sourceDataUrl;
        store.put(record);
        tx.oncomplete = async () => {
            db.close();
            await pruneOld();
            resolve(id);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/**
 * サムネイルを取得（DataURL）
 * @param {string} id
 * @returns {Promise<string|null>} DataURLまたはnull
 */
export async function loadThumbnail(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
            db.close();
            resolve(req.result ? (req.result.sourceDataUrl || req.result.dataUrl) : null);
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

/**
 * サムネイルを削除
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteThumbnail(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/**
 * 全サムネイルを取得（新しい順）
 * @returns {Promise<Array<{id:string,dataUrl:string,createdAt:number}>>}
 */
export async function getAllThumbnails() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.index('createdAt').openCursor(null, 'prev');
        const results = [];
        req.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                db.close();
                resolve(results);
            }
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

/**
 * 古いサムネイルを削除（上限を維持）
 */
async function pruneOld() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        // 新しい順に10件を保持し、それより古いレコードを削除する。
        const req = store.index('createdAt').openCursor(null, 'prev');
        let count = 0;
        const toDelete = [];
        req.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                count++;
                if (count > MAX_ITEMS) {
                    toDelete.push(cursor.value.id);
                }
                cursor.continue();
            } else {
                toDelete.forEach(id => store.delete(id));
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); reject(tx.error); };
            }
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}
