/**
 * PrintPhoto - 位置情報/逆ジオコーディングモジュール
 * フェーズ6
 */

/**
 * 現在位置を取得する
 * @returns {Promise<{lat:number,lon:number}>}
 */
export function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

/**
 * OpenStreetMap Nominatim で逆ジオコーディング
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Array<{name:string,address:string}>>}
 */
export async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ja&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'PrintPhoto/1.0 (ochoco app)' },
    });
    if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
    }
    const data = await response.json();
    return parseNominatimResults(data);
}

/**
 * Nominatim結果をパースして候補一覧にする
 * @param {Object} data
 * @returns {Array<{name:string,address:string}>}
 */
export function parseNominatimResults(data) {
    if (!data || !data.address) return [];

    const addr = data.address;
    const results = [];

    // 優先順位で候補を作成
    const candidates = [
        addr.building || addr.attraction,
        addr.road,
        addr.suburb || addr.neighbourhood,
        addr.city || addr.town || addr.village,
    ].filter(Boolean);

    // 主要候補
    if (data.display_name) {
        results.push({
            name: data.display_name.split(',')[0].trim(),
            address: data.display_name,
        });
    }

    // 追加候補（建物名・道路名など）
    candidates.forEach(name => {
        if (!results.some(r => r.name === name)) {
            results.push({ name, address: data.display_name || name });
        }
    });

    return results.slice(0, 5);
}
