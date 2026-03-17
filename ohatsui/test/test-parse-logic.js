#!/usr/bin/env node
/**
 * fetch-tweet.js のパースロジックをモック API レスポンスでテスト
 */

// 実際の FixTweet API レスポンス (curl で取得した実データ)
const MOCK_FXTWITTER_RESPONSE = {
    code: 200,
    message: "OK",
    tweet: {
        url: "https://x.com/ochoco0215/status/2033698551092617246",
        id: "2033698551092617246",
        text: "おはちょこ🍫☀\n今日も1日がんばろ〜😘",
        replies: 6,
        retweets: 2,
        likes: 39,
        bookmarks: 0,
        created_at: "Tue Mar 17 00:14:53 +0000 2026",
        created_timestamp: 1773706493,
        views: 242,
        lang: "ja",
        media: {
            photos: [
                {
                    type: "photo",
                    url: "https://pbs.twimg.com/media/HDkmDC7bEAAnbQX.jpg?name=orig",
                    width: 3840,
                    height: 2160
                }
            ]
        }
    }
};

// fetch-tweet.js と同じロジックを再現
function parseFetchTweet(apiResponse) {
    const data = apiResponse;
    const tweet = data.tweet;

    if (!tweet) {
        return { error: 'Tweet not found' };
    }

    const photos = tweet.media?.photos ?? [];
    const images = photos.map(p => p.url).filter(Boolean);

    const likeCount    = tweet.likes     ?? tweet.like_count     ?? tweet.favorites ?? 0;
    const retweetCount = tweet.retweets  ?? tweet.retweet_count  ?? tweet.reposts   ?? 0;
    let createdAt = tweet.created_at ?? null;
    if (!createdAt && tweet.created_timestamp) {
        createdAt = new Date(tweet.created_timestamp * 1000).toISOString();
    }

    return {
        id: tweet.id,
        text: tweet.text,
        created_at: createdAt,
        image_url: images[0] ?? null,
        images,
        like_count:    likeCount,
        retweet_count: retweetCount,
    };
}

// collect.js の fetchTweetFromFxTwitter と同じロジック
function parseCollect(apiResponse) {
    const data = apiResponse;
    const tweet = data.tweet;

    if (!tweet) return { ok: false, error: 'Tweet not found in response' };

    const photos = tweet.media?.photos ?? [];
    const images = photos.map(p => p.url).filter(Boolean);

    return {
        ok: true,
        text: tweet.text,
        created_at: tweet.created_at,
        image_url: images[0] ?? null,
        like_count: tweet.likes ?? 0,
        retweet_count: tweet.retweets ?? 0,
    };
}

// テスト実行
let errors = 0;

console.log('=== fetch-tweet.js ロジックテスト ===');
const result1 = parseFetchTweet(MOCK_FXTWITTER_RESPONSE);
console.log(JSON.stringify(result1, null, 2));

function check(label, value, expected) {
    if (value === expected || (expected === 'truthy' && value)) {
        console.log(`  ✓ ${label}: ${JSON.stringify(value)}`);
    } else {
        console.error(`  ✗ ${label}: got ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`);
        errors++;
    }
}

check('text', result1.text, 'truthy');
check('like_count', result1.like_count, 39);
check('retweet_count', result1.retweet_count, 2);
check('created_at', result1.created_at, 'truthy');
check('image_url', result1.image_url, 'truthy');

// Response.json() のシリアライズ挙動をチェック
const serialized = JSON.parse(JSON.stringify(result1));
console.log('\n=== JSON.stringify -> JSON.parse 後 ===');
check('like_count (after serialize)', serialized.like_count, 39);
check('retweet_count (after serialize)', serialized.retweet_count, 2);
check('created_at (after serialize)', serialized.created_at, 'truthy');

console.log('\n=== collect.js ロジックテスト ===');
const result2 = parseCollect(MOCK_FXTWITTER_RESPONSE);
console.log(JSON.stringify(result2, null, 2));
check('collect like_count', result2.like_count, 39);
check('collect retweet_count', result2.retweet_count, 2);
check('collect created_at', result2.created_at, 'truthy');

// created_at が ISO 形式でない場合のテスト
console.log('\n=== created_at 形式テスト ===');
const rawDate = MOCK_FXTWITTER_RESPONSE.tweet.created_at;
console.log(`  raw created_at: "${rawDate}"`);
const parsed = new Date(rawDate);
console.log(`  Date parse: ${parsed.toISOString()}`);
check('Date parse valid', !isNaN(parsed.getTime()), true);

if (errors > 0) {
    console.error(`\n✗ ${errors} エラーあり`);
    process.exit(1);
} else {
    console.log('\n✓ 全テスト OK');
}
