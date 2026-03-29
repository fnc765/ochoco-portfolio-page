/**
 * GET /api/image/:id
 * ツイート画像をR2キャッシュから配信する。
 * R2にない場合はTwitterから取得→R2に保存→レスポンス。
 * 画像がないツイートにはタイプ別プレースホルダーSVGを返す。
 *
 * バインディング:
 *   env.IMAGES → R2 bucket "ohatui-images"
 *   env.DB     → D1 database "ohatui-tweets"
 */

const R2_KEY_PREFIX = 'images/small/';

/** 画像URLの許可ホスト一覧（SSRF防止） */
const ALLOWED_IMAGE_HOSTS = new Set(['pbs.twimg.com', 'ton.twimg.com']);

/** image_url が許可ホストの HTTPS URL かどうかを検証する */
function isAllowedImageUrl(imageUrl) {
    if (!imageUrl) return false;
    try {
        const url = new URL(imageUrl);
        return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

/** Twitter画像URLを small サイズ (680px幅) に変換 */
function toSmallImageUrl(imageUrl) {
    try {
        const url = new URL(imageUrl);
        if (url.hostname === 'pbs.twimg.com') {
            url.searchParams.set('format', 'jpg');
            url.searchParams.set('name', 'small');
        }
        return url.toString();
    } catch {
        return null;
    }
}

/** タイプ別プレースホルダーSVG を生成 */
function generatePlaceholder(type) {
    const colors = {
        ohachoco:    { bg: '#ffb74d', label: 'おはちょこ' },
        konchoco:    { bg: '#81c784', label: 'こんちょこ' },
        konbanchoco: { bg: '#9575cd', label: 'こんばんちょこ' },
    };
    const { bg, label } = colors[type] || colors.ohachoco;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
  <rect width="150" height="150" fill="${bg}" opacity="0.3" rx="8"/>
  <text x="75" y="70" text-anchor="middle" fill="${bg}" font-size="14" font-family="sans-serif">${label}</text>
  <text x="75" y="95" text-anchor="middle" fill="${bg}" font-size="24">🍫</text>
</svg>`;
}

export async function onRequestGet({ params, env }) {
    const tweetId = params.id;
    if (!tweetId || !/^\d+$/.test(tweetId)) {
        return new Response('Invalid tweet ID', { status: 400 });
    }

    const r2Key = `${R2_KEY_PREFIX}${tweetId}.jpg`;

    // 1. R2 から取得を試みる
    if (env.IMAGES) {
        const object = await env.IMAGES.get(r2Key);
        if (object) {
            // Content-Type は image/* のみ許可（汚染コンテンツ配信防止）
            const rawCt = object.httpMetadata?.contentType || '';
            const contentType = rawCt.startsWith('image/') ? rawCt : 'image/jpeg';
            return new Response(object.body, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*',
                    'X-Content-Type-Options': 'nosniff',
                },
            });
        }
    }

    // 2. D1 から元の image_url を取得
    if (!env.DB) {
        return placeholderResponse('ohachoco');
    }

    let row;
    try {
        const stmt = env.DB.prepare('SELECT image_url, type FROM tweets WHERE id = ?1').bind(tweetId);
        row = (await stmt.first());
    } catch {
        return placeholderResponse('ohachoco');
    }

    if (!row || !row.image_url) {
        return placeholderResponse(row?.type || 'ohachoco');
    }

    // 3. Twitter から画像を取得（SSRF防止: 許可ホストのみ）
    if (!isAllowedImageUrl(row.image_url)) {
        console.warn(`[image] disallowed image_url for ${tweetId}: ${row.image_url}`);
        return placeholderResponse(row.type);
    }
    const smallUrl = toSmallImageUrl(row.image_url);
    if (!smallUrl) {
        return placeholderResponse(row.type);
    }
    let imageRes;
    try {
        imageRes = await fetch(smallUrl, {
            headers: { 'User-Agent': 'bot' },
            cf: { cacheTtl: 0 },
        });
        if (!imageRes.ok) {
            console.error(`[image] Twitter fetch failed: ${imageRes.status} for ${tweetId}`);
            return placeholderResponse(row.type);
        }
    } catch (err) {
        console.error(`[image] Twitter fetch error: ${err.message} for ${tweetId}`);
        return placeholderResponse(row.type);
    }

    // 4. R2 に保存（ベストエフォート）
    const imageBuffer = await imageRes.arrayBuffer();
    // Content-Type は image/* のみ許可（汚染防止）
    const rawCt = imageRes.headers.get('Content-Type') || '';
    const contentType = rawCt.startsWith('image/') ? rawCt : 'image/jpeg';

    if (env.IMAGES) {
        try {
            await env.IMAGES.put(r2Key, imageBuffer, {
                httpMetadata: { contentType },
            });
            console.log(`[image] R2 cached: ${r2Key}`);
        } catch (err) {
            console.error(`[image] R2 put error: ${err.message}`);
        }
    }

    // 5. レスポンス
    return new Response(imageBuffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

function placeholderResponse(type) {
    const svg = generatePlaceholder(type);
    return new Response(svg, {
        headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
