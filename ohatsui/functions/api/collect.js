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
 *          URL:          https://ohatui-db.pages.dev/api/collect?token=<COLLECT_SECRET>
 *          Method:       POST
 *          Content Type: application/json
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
 *   POST /api/collect?token=xxxxxxxx
 *   { "tweet_url": "https://x.com/ochoco0215/status/2032988351293526350" }
 *
 * リクエスト例 (IFTTT):
 *   POST /api/collect?token=xxxxxxxx
 *   {
 *     "text": "おはちょこ～🍫！今日も北九州散策＆ライブ行ってくるよ～🥳🥳",
 *     "tweet_url": "https://twitter.com/ochoco0215/status/2032988351293526350",
 *     "created_at": "March 15, 2026 at 10:12AM"   ← IFTTT 形式、またはISO 8601
 *   }
 */

const GREETING_PATTERN = /おはちょこ|こんちょこ|こんばんちょこ|おはよ|おは[～〜！!🍫]/u;

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

export async function onRequestPost({ request, env }) {
    // 認証チェック (COLLECT_SECRET が設定されている場合のみ)
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (env.COLLECT_SECRET && token !== env.COLLECT_SECRET) {
        return new Response('Unauthorized', { status: 401 });
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

    let { text, tweet_url, created_at, image_url, like_count, retweet_count } = body ?? {};

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

    if (!text) {
        return new Response('Missing required field: text', { status: 400 });
    }

    // 挨拶ツイートでなければスキップ (挨拶以外のツイートも IFTTT が送ってくる場合の対策)
    if (!GREETING_PATTERN.test(text)) {
        return Response.json({ skipped: true, reason: 'Not a greeting tweet' });
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

    try {
        await env.DB.prepare(
            'INSERT OR REPLACE INTO tweets' +
            ' (id, tweet_id, text, created_at, image_url, like_count, retweet_count, type)' +
            ' VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
        ).bind(tweetId, tweetId, text.trim(), createdAt, image_url ?? null,
               like_count ?? 0, retweet_count ?? 0, detectType(text))
         .run();

        console.log(`[collect] 保存: ${tweetId} [${detectType(text)}] ${createdAt.slice(0, 10)}`);
        return Response.json({ ok: true, id: tweetId, type: detectType(text) });
    } catch (err) {
        console.error('[collect] D1 error:', err);
        return Response.json({ error: err.message }, { status: 500 });
    }
}
