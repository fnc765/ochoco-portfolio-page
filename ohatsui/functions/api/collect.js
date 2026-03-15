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
 * リクエスト例:
 *   POST /api/collect?token=xxxxxxxx
 *   {
 *     "text": "おはちょこ～🍫！今日も北九州散策＆ライブ行ってくるよ～🥳🥳",
 *     "tweet_url": "https://twitter.com/ochoco0215/status/2032988351293526350",
 *     "created_at": "March 15, 2026 at 10:12AM"   ← IFTTT 形式、またはISO 8601
 *   }
 */

const GREETING_PATTERN = /おはちょこ|こんちょこ|こんばんちょこ|おはよ|おは[～〜！!🍫]/u;

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
        return new Response('DB not configured', { status: 503 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    const { text, tweet_url, created_at, image_url } = body ?? {};

    if (!text || !tweet_url) {
        return new Response('Missing required fields: text, tweet_url', { status: 400 });
    }

    // 挨拶ツイートでなければスキップ (挨拶以外のツイートも IFTTT が送ってくる場合の対策)
    if (!GREETING_PATTERN.test(text)) {
        return Response.json({ skipped: true, reason: 'Not a greeting tweet' });
    }

    const tweetId = extractTweetId(tweet_url);
    if (!tweetId) {
        return new Response('Could not extract tweet ID from tweet_url', { status: 400 });
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
            ' VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6)'
        ).bind(tweetId, tweetId, text.trim(), createdAt, image_url ?? null, detectType(text))
         .run();

        console.log(`[collect] 保存: ${tweetId} [${detectType(text)}] ${createdAt.slice(0, 10)}`);
        return Response.json({ ok: true, id: tweetId, type: detectType(text) });
    } catch (err) {
        console.error('[collect] D1 error:', err);
        return Response.json({ error: err.message }, { status: 500 });
    }
}
