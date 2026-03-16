#!/usr/bin/env node
/**
 * FixTweet API スモークテスト
 * デプロイ前に api.fxtwitter.com への疎通と
 * ツイート取得が正常に動作することを確認する。
 *
 * 使い方:
 *   node ohatsui/test/smoke-fxtwitter.js
 *
 * 終了コード:
 *   0 = 成功
 *   1 = 失敗
 */

const TEST_URL = 'https://x.com/i/status/2033342224906489994';

function tweetUrlToFxTwitter(url) {
    return url
        .replace('https://x.com/', 'https://api.fxtwitter.com/')
        .replace('https://twitter.com/', 'https://api.fxtwitter.com/');
}

async function run() {
    const apiUrl = tweetUrlToFxTwitter(TEST_URL);
    console.log(`[smoke] テスト URL : ${TEST_URL}`);
    console.log(`[smoke] API  URL   : ${apiUrl}`);

    let res;
    try {
        res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'bot' },
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.error(`[smoke] FAIL: FixTweet API に到達できません: ${err.message}`);
        process.exit(1);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[smoke] FAIL: HTTP ${res.status} - ${body.slice(0, 200)}`);
        process.exit(1);
    }

    let data;
    try {
        data = await res.json();
    } catch (err) {
        console.error(`[smoke] FAIL: JSON パースエラー: ${err.message}`);
        process.exit(1);
    }

    const tweet = data.tweet;
    if (!tweet) {
        console.error('[smoke] FAIL: レスポンスに tweet フィールドがありません');
        console.error(JSON.stringify(data, null, 2));
        process.exit(1);
    }

    if (!tweet.text) {
        console.error('[smoke] FAIL: tweet.text が空です');
        process.exit(1);
    }

    console.log('[smoke] OK: FixTweet API 疎通確認');
    console.log(`[smoke]   text             : ${tweet.text.slice(0, 80)}`);
    console.log(`[smoke]   created_at       : ${tweet.created_at}`);
    console.log(`[smoke]   created_timestamp: ${tweet.created_timestamp}`);
    console.log(`[smoke]   likes            : ${tweet.likes}`);
    console.log(`[smoke]   retweets         : ${tweet.retweets}`);
    console.log(`[smoke]   replies          : ${tweet.replies}`);
    console.log(`[smoke]   views            : ${tweet.views}`);
    const photos = tweet.media?.photos ?? [];
    console.log(`[smoke]   images           : ${photos.length} 枚`);
    if (photos[0]) console.log(`[smoke]   image_url        : ${photos[0].url}`);

    // フィールド名の調査（undefined のものを明示）
    const fields = ['likes','retweets','created_at','created_timestamp','favorite_count','retweet_count'];
    console.log('[smoke] --- フィールド存在確認 ---');
    for (const f of fields) {
        console.log(`[smoke]   tweet.${f} = ${JSON.stringify(tweet[f])}`);
    }
}

run();
