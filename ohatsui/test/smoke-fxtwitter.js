#!/usr/bin/env node
/**
 * FixTweet API スモークテスト
 *
 * 1. api.fxtwitter.com に実際にリクエストして全フィールドを確認
 * 2. fetch-tweet.js と同じ処理ロジックを適用してレスポンスを検証
 *
 * 使い方:
 *   node ohatsui/test/smoke-fxtwitter.js
 *
 * 終了コード: 0 = 成功 / 1 = 失敗
 */

const TEST_URL = 'https://x.com/i/status/2033342224906489994';

// fetch-tweet.js と同じ変換ロジック
function tweetUrlToFxTwitter(url) {
    return url
        .replace('https://x.com/', 'https://api.fxtwitter.com/')
        .replace('https://twitter.com/', 'https://api.fxtwitter.com/');
}

// fetch-tweet.js と同じフィールド処理ロジック
function buildApiResponse(tweet, tweetId) {
    const photos = tweet.media?.photos ?? [];
    const images = photos.map(p => p.url).filter(Boolean);

    const likeCount    = tweet.likes     ?? tweet.like_count     ?? tweet.favorites ?? 0;
    const retweetCount = tweet.retweets  ?? tweet.retweet_count  ?? tweet.reposts   ?? 0;
    // created_at が無ければ created_timestamp から ISO 変換
    let createdAt = tweet.created_at ?? null;
    if (!createdAt && tweet.created_timestamp) {
        createdAt = new Date(tweet.created_timestamp * 1000).toISOString();
    }

    // JSON.stringify/parse でシリアライズ挙動を再現
    return JSON.parse(JSON.stringify({
        id: tweetId,
        text: tweet.text,
        created_at: createdAt,
        image_url: images[0] ?? null,
        images,
        like_count:    likeCount,
        retweet_count: retweetCount,
    }));
}

async function run() {
    const apiUrl = tweetUrlToFxTwitter(TEST_URL);
    console.log(`[smoke] テスト URL : ${TEST_URL}`);
    console.log(`[smoke] API URL    : ${apiUrl}`);
    console.log('');

    // ---- Step 1: fxtwitter への疎通確認 ----
    let res;
    try {
        res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'bot' },
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.error(`[smoke] FAIL: API に到達できません: ${err.message}`);
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
        console.error('[smoke] FAIL: tweet フィールドなし');
        console.error(JSON.stringify(data, null, 2));
        process.exit(1);
    }

    // ---- Step 2: 全フィールド出力 ----
    console.log('[smoke] --- fxtwitter raw response ---');
    for (const [k, v] of Object.entries(tweet)) {
        if (k === 'media' || k === 'author') {
            console.log(`[smoke]   tweet.${k} = (省略)`);
            continue;
        }
        console.log(`[smoke]   tweet.${k} = ${JSON.stringify(v)}`);
    }
    console.log('');

    // ---- Step 3: fetch-tweet.js と同じロジックで処理 ----
    const match = TEST_URL.match(/status\/(\d+)/);
    const tweetId = match ? match[1] : 'unknown';
    const result = buildApiResponse(tweet, tweetId);

    console.log('[smoke] --- fetch-tweet.js 処理後の結果 ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    // ---- Step 4: 必須フィールド検証 ----
    const errors = [];

    if (!result.text) {
        errors.push('text が空');
    }
    if (result.like_count === undefined || result.like_count === null) {
        errors.push(`like_count が undefined/null (raw: tweet.likes=${tweet.likes})`);
    }
    if (result.retweet_count === undefined || result.retweet_count === null) {
        errors.push(`retweet_count が undefined/null (raw: tweet.retweets=${tweet.retweets})`);
    }
    if (!result.created_at) {
        errors.push(`created_at が空/null (raw: created_at=${tweet.created_at}, timestamp=${tweet.created_timestamp})`);
    }

    if (errors.length > 0) {
        console.error('[smoke] FAIL: 以下のフィールドに問題があります:');
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
    }

    console.log('[smoke] OK: 全フィールド確認完了');
    console.log(`[smoke]   text         : ${result.text.slice(0, 80)}`);
    console.log(`[smoke]   like_count   : ${result.like_count}`);
    console.log(`[smoke]   retweet_count: ${result.retweet_count}`);
    console.log(`[smoke]   created_at   : ${result.created_at}`);
}

run();
