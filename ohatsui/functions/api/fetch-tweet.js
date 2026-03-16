/**
 * GET /api/fetch-tweet?url=<tweet_url>
 * ツイートURLから本文・画像・投稿日・エンゲージメントを取得する
 *
 * 必要な環境変数:
 *   TWITTER_BEARER_TOKEN  Twitter API v2 Bearer Token
 *     → https://developer.twitter.com/en/portal/dashboard
 *
 * レスポンス例:
 *   {
 *     "id": "2032988351293526350",
 *     "text": "おはちょこ～🍫！",
 *     "created_at": "2026-03-15T01:12:00.000Z",
 *     "image_url": "https://pbs.twimg.com/media/...",
 *     "images": ["https://pbs.twimg.com/media/..."],
 *     "like_count": 20,
 *     "retweet_count": 0
 *   }
 */

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const tweetUrl = url.searchParams.get('url');

    if (!tweetUrl) {
        return new Response('Missing url parameter', { status: 400 });
    }

    const match = tweetUrl.match(/status\/(\d+)/);
    if (!match) {
        return new Response('Could not extract tweet ID from URL', { status: 400 });
    }
    const tweetId = match[1];

    if (!env.TWITTER_BEARER_TOKEN) {
        return new Response('TWITTER_BEARER_TOKEN not configured', { status: 503 });
    }

    const apiUrl =
        `https://api.twitter.com/2/tweets/${tweetId}` +
        `?tweet.fields=created_at,text,public_metrics,attachments` +
        `&expansions=attachments.media_keys` +
        `&media.fields=url,preview_image_url,type`;

    let apiRes;
    try {
        apiRes = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}` },
        });
    } catch (err) {
        return new Response(`Failed to reach Twitter API: ${err.message}`, { status: 502 });
    }

    if (!apiRes.ok) {
        const errText = await apiRes.text();
        return new Response(`Twitter API error ${apiRes.status}: ${errText}`, { status: apiRes.status });
    }

    const data = await apiRes.json();
    const tweet = data.data;
    const media = data.includes?.media ?? [];

    const images = media
        .filter(m => m.type === 'photo')
        .map(m => m.url ?? m.preview_image_url)
        .filter(Boolean);

    return Response.json({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        image_url: images[0] ?? null,
        images,
        like_count: tweet.public_metrics?.like_count ?? 0,
        retweet_count: tweet.public_metrics?.retweet_count ?? 0,
    }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
    });
}
