/**
 * GET /api/refresh-today
 * 今日のおはついツイートの最新エンゲージメント (like_count, retweet_count) を
 * FixTweet API から再取得して D1 を更新し、更新後のデータを返す。
 *
 * 認証不要（読み取り＋エンゲージメント更新のみ）
 * GitHub Actions cron から1時間ごとに呼び出される想定。
 */

/** FixTweet API からツイートの最新データを取得 */
async function fetchEngagement(tweetId) {
    const apiUrl = `https://api.fxtwitter.com/i/status/${tweetId}`;
    try {
        const res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'bot' },
            cf: { cacheTtl: 0 },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const tweet = data.tweet;
        if (!tweet) return null;

        return {
            like_count:    tweet.likes    ?? tweet.like_count    ?? tweet.favorites ?? 0,
            retweet_count: tweet.retweets ?? tweet.retweet_count ?? tweet.reposts   ?? 0,
        };
    } catch {
        return null;
    }
}

export async function onRequestGet({ env }) {
    if (!env.DB) {
        return Response.json({ error: 'DB not configured' }, { status: 503 });
    }

    // JST (UTC+9) で「今日」の日付範囲を算出
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const todayStr = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const startUtc = new Date(`${todayStr}T00:00:00+09:00`).toISOString();
    const endUtc   = new Date(`${todayStr}T23:59:59.999+09:00`).toISOString();

    try {
        const { results: todayTweets } = await env.DB.prepare(
            'SELECT id, tweet_id, text, created_at, image_url, like_count, retweet_count, type' +
            ' FROM tweets WHERE created_at >= ?1 AND created_at <= ?2'
        ).bind(startUtc, endUtc).all();

        if (todayTweets.length === 0) {
            return Response.json({
                updated: [],
                refreshed_at: now.toISOString(),
            }, {
                headers: { 'Access-Control-Allow-Origin': '*' },
            });
        }

        // 各ツイートの最新エンゲージメントを取得して D1 を更新
        const updated = [];
        for (const tweet of todayTweets) {
            const engagement = await fetchEngagement(tweet.tweet_id);
            if (engagement) {
                await env.DB.prepare(
                    'UPDATE tweets SET like_count = ?1, retweet_count = ?2 WHERE id = ?3'
                ).bind(engagement.like_count, engagement.retweet_count, tweet.id).run();

                updated.push({
                    ...tweet,
                    like_count: engagement.like_count,
                    retweet_count: engagement.retweet_count,
                });
            } else {
                updated.push(tweet);
            }
        }

        return Response.json({
            updated,
            refreshed_at: now.toISOString(),
        }, {
            headers: {
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        console.error('[refresh-today] error:', err);
        return Response.json({ error: err.message }, { status: 500 });
    }
}
