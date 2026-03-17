#!/usr/bin/env node
/**
 * FixTweet API スモークテスト
 * デプロイ前に api.fxtwitter.com への疎通と
 * 全フィールド（text / likes / retweets / created_at）の取得を確認する。
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

    // ---- レスポンス全体を出力（デバッグ用）----
    console.log('[smoke] --- fxtwitter raw response (tweet object) ---');
    const tweet = data.tweet;
    if (!tweet) {
        console.error('[smoke] FAIL: レスポンスに tweet フィールドがありません');
        console.error('full response:', JSON.stringify(data, null, 2));
        process.exit(1);
    }
    // tweet オブジェクトの全キーと値を出力
    for (const [k, v] of Object.entries(tweet)) {
        if (k === 'media' || k === 'author') continue; // 長いので省略
        console.log(`[smoke]   tweet.${k} = ${JSON.stringify(v)}`);
    }
    console.log('[smoke] --- end ---');

    // ---- 必須フィールド検証 ----
    const errors = [];

    if (!tweet.text) {
        errors.push('tweet.text が空');
    }

    // いいね数: likes / favorites / like_count どれかが数値であること
    const likeCount = tweet.likes ?? tweet.favorites ?? tweet.like_count;
    if (likeCount === undefined || likeCount === null) {
        errors.push(`いいね数フィールドが取得できない (likes=${tweet.likes}, favorites=${tweet.favorites}, like_count=${tweet.like_count})`);
    }

    // RT数: retweets / reposts / retweet_count どれかが数値であること
    const rtCount = tweet.retweets ?? tweet.reposts ?? tweet.retweet_count;
    if (rtCount === undefined || rtCount === null) {
        errors.push(`RT数フィールドが取得できない (retweets=${tweet.retweets}, reposts=${tweet.reposts}, retweet_count=${tweet.retweet_count})`);
    }

    // 投稿日時: created_at または created_timestamp があること
    const hasDate = tweet.created_at !== undefined || tweet.created_timestamp !== undefined;
    if (!hasDate) {
        errors.push(`投稿日時フィールドが取得できない (created_at=${tweet.created_at}, created_timestamp=${tweet.created_timestamp})`);
    }

    if (errors.length > 0) {
        console.error('[smoke] FAIL: 以下のフィールドが取得できませんでした:');
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
    }

    console.log('[smoke] OK: 全フィールド確認完了');
    console.log(`[smoke]   text       : ${tweet.text.slice(0, 80)}`);
    console.log(`[smoke]   likes      : ${likeCount}`);
    console.log(`[smoke]   retweets   : ${rtCount}`);
    console.log(`[smoke]   created_at : ${tweet.created_at ?? tweet.created_timestamp}`);
}

run();
