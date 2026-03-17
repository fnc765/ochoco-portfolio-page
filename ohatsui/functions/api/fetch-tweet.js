/**
 * GET /api/fetch-tweet?url=<tweet_url>
 * FixTweet API (api.fxtwitter.com) を使ってツイートURL から
 * 本文・画像・投稿日・エンゲージメントを取得する。
 * API キー不要・無料。
 *
 * 対応URL形式:
 *   https://x.com/ochoco0215/status/12345
 *   https://x.com/i/status/12345
 *   https://twitter.com/ochoco0215/status/12345
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

/** ツイート ID からクリーンな FixTweet API URL を構築 */
function buildFxTwitterUrl(tweetId) {
    return `https://api.fxtwitter.com/i/status/${tweetId}`;
}

/** FixTweet tweet オブジェクトから統一フォーマットに変換 */
function parseTweetFields(tweet, tweetId) {
    const photos = tweet.media?.photos ?? [];
    const images = photos.map(p => p.url).filter(Boolean);

    const likeCount    = tweet.likes     ?? tweet.like_count     ?? tweet.favorites ?? 0;
    const retweetCount = tweet.retweets  ?? tweet.retweet_count  ?? tweet.reposts   ?? 0;

    // created_at を ISO 8601 に正規化
    let createdAt = null;
    if (tweet.created_timestamp) {
        createdAt = new Date(tweet.created_timestamp * 1000).toISOString();
    } else if (tweet.created_at) {
        const d = new Date(tweet.created_at);
        createdAt = isNaN(d.getTime()) ? tweet.created_at : d.toISOString();
    }

    return {
        id: tweetId,
        text: tweet.text ?? '',
        created_at: createdAt,
        image_url: images[0] ?? null,
        images,
        like_count:    likeCount,
        retweet_count: retweetCount,
    };
}

export async function onRequestGet({ request }) {
    const url = new URL(request.url);
    const tweetUrl = url.searchParams.get('url');

    if (!tweetUrl) {
        return Response.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    const match = tweetUrl.match(/status\/(\d+)/);
    if (!match) {
        return Response.json({ error: 'Could not extract tweet ID from URL' }, { status: 400 });
    }
    const tweetId = match[1];

    // tweet ID からクリーンな API URL を構築（クエリパラメータ混入を防止）
    const apiUrl = buildFxTwitterUrl(tweetId);

    let apiRes;
    try {
        apiRes = await fetch(apiUrl, {
            headers: { 'User-Agent': 'bot' },
            // Cloudflare Worker 内でのキャッシュを無効化
            cf: { cacheTtl: 0 },
        });
    } catch (err) {
        return Response.json(
            { error: `Failed to reach FixTweet API: ${err.message}` },
            { status: 502 },
        );
    }

    if (!apiRes.ok) {
        const errText = await apiRes.text().catch(() => '');
        return Response.json(
            { error: `FixTweet API error ${apiRes.status}: ${errText.slice(0, 200)}` },
            { status: apiRes.status },
        );
    }

    let data;
    try {
        data = await apiRes.json();
    } catch (err) {
        return Response.json(
            { error: `FixTweet API returned non-JSON: ${err.message}` },
            { status: 502 },
        );
    }

    const tweet = data.tweet;

    if (!tweet) {
        return Response.json(
            { error: 'Tweet not found in FixTweet response', _keys: Object.keys(data) },
            { status: 404 },
        );
    }

    const result = parseTweetFields(tweet, tweetId);

    return Response.json(result, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
        },
    });
}
