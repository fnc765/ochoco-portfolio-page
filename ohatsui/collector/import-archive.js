#!/usr/bin/env node
/**
 * X アーカイブデータから D1 に一括インポートするスクリプト
 *
 * ─────────────────────────────────────────
 * 使い方
 * ─────────────────────────────────────────
 * 1. X のデータアーカイブをリクエスト
 *    設定 > その他 > アカウント > データのアーカイブをリクエスト
 *
 * 2. ダウンロードして展開
 *    解凍すると data/tweets.js (または data/tweet.js) が含まれる
 *
 * 3. 環境変数を設定して実行
 *    CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx CF_D1_DATABASE_ID=xxx \
 *      node import-archive.js /path/to/twitter-data/data/tweets.js
 *
 * ─────────────────────────────────────────
 * X アーカイブの tweets.js 形式:
 *   window.YTD.tweets.part0 = [ { "tweet": { "id": "...", ... } } ]
 * ─────────────────────────────────────────
 */

import { readFileSync } from 'fs';

const GREETING_PATTERN = /おはちょこ|こんちょこ|こんばんちょこ|おはよ|おは[～〜！!🍫]/u;

function detectType(text) {
    if (/こんばんちょこ|こんばんは|こんばん/.test(text)) return 'konbanchoco';
    if (/こんちょこ|こんにちは|こんちゃ/.test(text)) return 'konchoco';
    return 'ohachoco';
}

async function upsertBatch(cfApiToken, accountId, databaseId, tweets) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    const sql =
        'INSERT OR REPLACE INTO tweets' +
        ' (id, tweet_id, text, created_at, image_url, like_count, retweet_count, type)' +
        ' VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)';

    const results = [];
    for (const tweet of tweets) {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${cfApiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sql,
                params: [
                    tweet.id, tweet.id, tweet.text, tweet.created_at,
                    tweet.image_url, tweet.like_count, tweet.retweet_count, tweet.type,
                ],
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`D1 error for ${tweet.id}: ${res.status} ${body}`);
        }

        results.push(await res.json());

        // D1 API レート制限対策 (100ms 待機)
        await new Promise(r => setTimeout(r, 100));
    }
    return results;
}

async function main() {
    const archivePath = process.argv[2];
    if (!archivePath) {
        console.error('使い方: node import-archive.js /path/to/data/tweets.js');
        process.exit(1);
    }

    const cfApiToken = process.env.CF_API_TOKEN;
    const accountId = process.env.CF_ACCOUNT_ID;
    const databaseId = process.env.CF_D1_DATABASE_ID;

    if (!cfApiToken || !accountId || !databaseId) {
        console.error('必要な環境変数が未設定:');
        console.error('  CF_API_TOKEN, CF_ACCOUNT_ID, CF_D1_DATABASE_ID');
        process.exit(1);
    }

    // tweets.js を読み込む
    // 形式: window.YTD.tweets.part0 = [...]  または  window.YTD.tweet.part0 = [...]
    console.log(`[import] ファイルを読み込み中: ${archivePath}`);
    const raw = readFileSync(archivePath, 'utf8');
    const jsonStr = raw.replace(/^window\.YTD\.\w+\.part\d+\s*=\s*/, '').replace(/;?\s*$/, '');

    let items;
    try {
        items = JSON.parse(jsonStr);
    } catch (e) {
        console.error('[import] JSON パースエラー:', e.message);
        process.exit(1);
    }

    console.log(`[import] ${items.length} 件のツイートを読み込みました`);

    // tweet オブジェクトを取り出す (tweet プロパティにラップされている場合と直接の場合)
    const rawTweets = items.map(item => item.tweet ?? item);

    // 挨拶ツイートのみフィルタ
    const greetings = rawTweets.filter(t => {
        const text = t.full_text ?? t.text ?? '';
        return GREETING_PATTERN.test(text);
    });

    console.log(`[import] 挨拶ツイート: ${greetings.length} 件`);
    if (greetings.length === 0) {
        console.log('[import] 対象ツイートがありません。');
        return;
    }

    // 日付順にソート
    greetings.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // D1 に保存
    let saved = 0;
    let failed = 0;

    for (const raw of greetings) {
        const text = raw.full_text ?? raw.text ?? '';
        const tweetId = raw.id_str ?? raw.id;

        const tweet = {
            id: tweetId,
            text,
            created_at: new Date(raw.created_at).toISOString(),
            // X アーカイブに画像は含まれない (pbs.twimg.com URL は有効期限あり)
            // 画像が必要な場合は別途 image_url を手動で設定してください
            image_url: null,
            like_count: parseInt(raw.favorite_count ?? '0', 10),
            retweet_count: parseInt(raw.retweet_count ?? '0', 10),
            type: detectType(text),
        };

        try {
            await upsertBatch(cfApiToken, accountId, databaseId, [tweet]);
            console.log(`[import] ✓ ${tweet.id} [${tweet.type}] ${tweet.created_at.slice(0, 10)} "${text.slice(0, 20)}..."`);
            saved++;
        } catch (err) {
            console.error(`[import] ✗ ${tweetId}: ${err.message}`);
            failed++;
        }
    }

    console.log('');
    console.log(`[import] 完了: ${saved} 件保存, ${failed} 件失敗 (合計 ${greetings.length} 件)`);
}

main().catch(err => {
    console.error('[import] 予期せぬエラー:', err);
    process.exit(1);
});
