/**
 * POST /api/collect
 * IFTTT Webhook からおはついデータを受け取り D1 に保存する
 *
 * ─────────────────────────────────────────
 * IFTTT 設定方法
 * ─────────────────────────────────────────
 * 1. https://ifttt.com でアカウント作成（無料）
 * 2. 新しい Applet を作成
 *    If:   X (Twitter) > "New tweet by you"
 *    Then: Webhooks > "Make a web request"
 *          URL:          https://ohatui-db.pages.dev/api/collect
 *          Method:       POST
 *          Content Type: application/json
 *          Additional headers:
 *            Authorization: Bearer <COLLECT_SECRET>
 *          Body:
 *            {"text":"{{Text}}","tweet_url":"{{LinkToTweet}}","created_at":"{{CreatedAt}}"}
 *
 * 3. Cloudflare Pages の環境変数 COLLECT_SECRET を設定
 *    (デプロイワークフローが自動設定、または Pages ダッシュボードで手動設定)
 * ─────────────────────────────────────────
 *
 * text を省略した場合、FixTweet API (api.fxtwitter.com) を使って
 * 本文・画像・投稿日を自動取得します（APIキー不要・無料）。
 *
 * リクエスト例 (手動 / tweet_url のみ):
 *   POST /api/collect
 *   Authorization: Bearer xxxxxxxx
 *   { "tweet_url": "https://x.com/ochoco0215/status/2032988351293526350" }
 *
 * リクエスト例 (IFTTT):
 *   POST /api/collect
 *   Authorization: Bearer xxxxxxxx
 *   {
 *     "text": "おはちょこ～🍫！今日も北九州散策＆ライブ行ってくるよ～🥳🥳",
 *     "tweet_url": "https://twitter.com/ochoco0215/status/2032988351293526350",
 *     "created_at": "March 15, 2026 at 10:12AM"   ← IFTTT 形式、またはISO 8601
 *   }
 */

const GREETING_PATTERN = /おはちょこ|こんちょこ|こんばんちょこ/u;

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

/** トークンと秘密をSHA-256でハッシュ化して定数時間比較（長さ漏洩防止） */
async function timingSafeCompare(token, secret) {
    const enc = new TextEncoder();
    const [hashA, hashB] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(token)),
        crypto.subtle.digest('SHA-256', enc.encode(secret)),
    ]);
    return crypto.subtle.timingSafeEqual(hashA, hashB);
}

/** FixTweet API (api.fxtwitter.com) からツイートデータを取得するヘルパー（APIキー不要） */
async function fetchTweetFromFxTwitter(tweetUrl) {
    // tweet ID からクリーンな API URL を構築（クエリパラメータ混入を防止）
    const match = tweetUrl.match(/status\/(\d+)/);
    const tweetId = match?.[1];
    if (!tweetId) return { ok: false, error: 'Could not extract tweet ID' };

    const apiUrl = `https://api.fxtwitter.com/i/status/${tweetId}`;
    try {
        const res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'bot' },
            cf: { cacheTtl: 0 },
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            return { ok: false, error: `${res.status}: ${err.slice(0, 200)}` };
        }
        const data = await res.json();
        const tweet = data.tweet;
        if (!tweet) return { ok: false, error: 'Tweet not found in response' };

        const photos = tweet.media?.photos ?? [];
        const images = photos.map(p => p.url).filter(Boolean);

        const likeCount    = tweet.likes    ?? tweet.like_count    ?? tweet.favorites ?? 0;
        const retweetCount = tweet.retweets ?? tweet.retweet_count ?? tweet.reposts   ?? 0;

        // created_at を ISO 8601 に正規化
        let createdAt = null;
        if (tweet.created_timestamp) {
            createdAt = new Date(tweet.created_timestamp * 1000).toISOString();
        } else if (tweet.created_at) {
            const d = new Date(tweet.created_at);
            createdAt = isNaN(d.getTime()) ? tweet.created_at : d.toISOString();
        }

        return {
            ok: true,
            text: tweet.text,
            created_at: createdAt,
            image_url: images[0] ?? null,
            like_count: likeCount,
            retweet_count: retweetCount,
        };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function detectType(text) {
    if (/こんばんちょこ|こんばんは|こんばん/.test(text)) return 'konbanchoco';
    if (/こんちょこ|こんにちは|こんちゃ/.test(text)) return 'konchoco';
    return 'ohachoco';
}

function extractTweetId(tweetUrl) {
    const match = tweetUrl?.match(/status\/(\d+)/);
    return match?.[1] ?? null;
}

/** Twitter画像を取得してR2に small サイズ (680px幅) で保存（ベストエフォート） */
async function cacheImageToR2(imagesBucket, tweetId, imageUrl) {
    // SSRF防止: 許可ホスト以外はスキップ
    if (!isAllowedImageUrl(imageUrl)) {
        console.warn(`[collect] R2 cache skip: disallowed host for ${tweetId}: ${imageUrl}`);
        return;
    }
    try {
        const url = new URL(imageUrl);
        if (url.hostname === 'pbs.twimg.com') {
            url.searchParams.set('format', 'jpg');
            url.searchParams.set('name', 'small');
        }
        const fetchUrl = url.toString();

        const res = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'bot' },
            cf: { cacheTtl: 0 },
        });
        if (!res.ok) {
            console.warn(`[collect] R2 cache skip: fetch ${res.status} for ${tweetId}`);
            return;
        }

        const buffer = await res.arrayBuffer();
        // Content-Type は image/* のみ許可（汚染防止）
        const rawCt = res.headers.get('Content-Type') || '';
        const contentType = rawCt.startsWith('image/') ? rawCt : 'image/jpeg';
        await imagesBucket.put(`images/small/${tweetId}.jpg`, buffer, {
            httpMetadata: { contentType },
        });
        console.log(`[collect] R2 cached: images/small/${tweetId}.jpg`);
    } catch (err) {
        console.warn(`[collect] R2 cache error for ${tweetId}: ${err.message}`);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    // 認証チェック: COLLECT_SECRET が未設定なら 503、トークン不一致なら 401
    // タイミング攻撃を防ぐため定数時間比較 (crypto.subtle.timingSafeEqual) を使用
    const secret = env.COLLECT_SECRET;
    if (!secret) {
        return Response.json({ error: 'COLLECT_SECRET not configured' }, { status: 503 });
    }
    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const authorized = await timingSafeCompare(token, secret);
    if (!authorized) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!env.DB) {
        return Response.json({ error: 'DB not configured' }, { status: 503 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    let { text, tweet_url, created_at, image_url, like_count, retweet_count, force_type } = body ?? {};
    const isSonota = force_type === 'sonota';

    if (!tweet_url) {
        return new Response('Missing required field: tweet_url', { status: 400 });
    }

    const tweetId = extractTweetId(tweet_url);
    if (!tweetId) {
        return new Response('Could not extract tweet ID from tweet_url', { status: 400 });
    }

    // text が未指定の場合、FixTweet API から自動取得（APIキー不要）
    if (!text) {
        const fetched = await fetchTweetFromFxTwitter(tweet_url);
        if (!fetched.ok) {
            return new Response(`FixTweet API fetch failed: ${fetched.error}`, { status: 502 });
        }
        text          = fetched.text;
        image_url     = image_url  ?? fetched.image_url;
        created_at    = created_at ?? fetched.created_at;
        like_count    = like_count    ?? fetched.like_count;
        retweet_count = retweet_count ?? fetched.retweet_count;
    }

    // like_count / retweet_count が未指定の場合、FixTweet から取得（ベストエフォート）
    // text が提供済みでエンゲージメントのみ欠落するケース（admin 手動登録など）に対応
    if (like_count == null || retweet_count == null) {
        const fetched = await fetchTweetFromFxTwitter(tweet_url);
        if (fetched.ok) {
            like_count    = like_count    ?? fetched.like_count;
            retweet_count = retweet_count ?? fetched.retweet_count;
        }
    }

    if (!text) {
        return new Response('Missing required field: text', { status: 400 });
    }

    // 挨拶ツイート（おはちょこ/こんちょこ/こんばんちょこ）以外は登録拒否
    // force_type === 'sonota' の場合のみスキップ（/admin から明示的に指定された場合のみ）
    if (!isSonota && !GREETING_PATTERN.test(text)) {
        return Response.json(
            { error: 'Not a greeting tweet', detail: 'Text must contain おはちょこ, こんちょこ, or こんばんちょこ' },
            { status: 400 },
        );
    }

    // created_at の決定
    // IFTTT 形式 "March 15, 2026 at 10:12AM" は Date() でパース可能
    // パース失敗時はサーバー受信時刻を使用
    let createdAt;
    try {
        const parsed = created_at ? new Date(created_at) : null;
        createdAt = (parsed && !isNaN(parsed)) ? parsed.toISOString() : new Date().toISOString();
    } catch {
        createdAt = new Date().toISOString();
    }

    // image_url は許可ホストのみ保存（SSRF防止）
    const safeImageUrl = isAllowedImageUrl(image_url) ? image_url : null;

    try {
        const type = isSonota ? 'sonota' : detectType(text);

        await env.DB.prepare(
            'INSERT OR REPLACE INTO tweets' +
            ' (id, tweet_id, text, created_at, image_url, like_count, retweet_count, type)' +
            ' VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
        ).bind(tweetId, tweetId, text.trim(), createdAt, safeImageUrl,
               like_count ?? 0, retweet_count ?? 0, type)
         .run();

        console.log(`[collect] 保存: ${tweetId} [${type}] ${createdAt.slice(0, 10)}`);

        // R2 にサムネイルをキャッシュ（ベストエフォート、レスポンスをブロックしない）
        if (safeImageUrl && env.IMAGES) {
            context.waitUntil(cacheImageToR2(env.IMAGES, tweetId, safeImageUrl));
        }

        return Response.json({ ok: true, id: tweetId, type });
    } catch (err) {
        console.error('[collect] D1 error:', err);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
