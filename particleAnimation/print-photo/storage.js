/**
 * PrintPhoto - localStorage/IndexedDB管理モジュール
 * フェーズ6
 */

const DB_NAME = 'PrintPhotoDB';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const MAX_ITEMS = 10;

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
 * サムネイルを保存
 * @param {Blob} blob
 * @returns {Promise<string>} id
 */
export async function saveThumbnail(blob) {
    const db = await openDB();
    const id = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ id, blob, createdAt: Date.now() });
        tx.oncomplete = async () => {
            await pruneOld(db);
            db.close();
            resolve(id);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/**
 * サムネイルを取得
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function loadThumbnail(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
            db.close();
            resolve(req.result ? req.result.blob : null);
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
 * @returns {Promise<Array<{id:string,blob:Blob,createdAt:number}>>}
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
async function pruneOld(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.index('createdAt').openCursor();
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
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }
        };
        req.onerror = () => reject(req.error);
    });
}
