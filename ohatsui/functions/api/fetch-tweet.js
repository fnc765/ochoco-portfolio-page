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

function tweetUrlToFxTwitter(tweetUrl) {
    return tweetUrl
        .replace('https://x.com/', 'https://api.fxtwitter.com/')
        .replace('https://twitter.com/', 'https://api.fxtwitter.com/')
        .replace('http://x.com/', 'https://api.fxtwitter.com/')
        .replace('http://twitter.com/', 'https://api.fxtwitter.com/');
}

export async function onRequestGet({ request }) {
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

    const apiUrl = tweetUrlToFxTwitter(tweetUrl);

    let apiRes;
    try {
        apiRes = await fetch(apiUrl, {
            headers: { 'User-Agent': 'bot' },
        });
    } catch (err) {
        return new Response(`Failed to reach FixTweet API: ${err.message}`, { status: 502 });
    }

    if (!apiRes.ok) {
        const errText = await apiRes.text();
        return new Response(`FixTweet API error ${apiRes.status}: ${errText}`, { status: apiRes.status });
    }

    const data = await apiRes.json();
    const tweet = data.tweet;

    if (!tweet) {
        return new Response('Tweet not found', { status: 404 });
    }

    const photos = tweet.media?.photos ?? [];
    const images = photos.map(p => p.url).filter(Boolean);

    // fxtwitter のレスポンスフィールドを候補順に解決
    const likeCount    = tweet.likes     ?? tweet.like_count     ?? tweet.favorites ?? 0;
    const retweetCount = tweet.retweets  ?? tweet.retweet_count  ?? tweet.reposts   ?? 0;
    // created_at が無ければ created_timestamp (Unix秒) から ISO 変換
    let createdAt = tweet.created_at ?? null;
    if (!createdAt && tweet.created_timestamp) {
        createdAt = new Date(tweet.created_timestamp * 1000).toISOString();
    }

    return Response.json({
        id: tweetId,
        text: tweet.text,
        created_at: createdAt,
        image_url: images[0] ?? null,
        images,
        like_count:    likeCount,
        retweet_count: retweetCount,
    }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
    });
}
