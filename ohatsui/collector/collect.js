#!/usr/bin/env node
/**
 * おはつい収集スクリプト
 * X API v2 で @ochoco0215 の最新ツイートを取得し、Cloudflare D1 に保存する
 *
 * 必要な環境変数 (GitHub Secrets):
 *   X_BEARER_TOKEN     — X Developer Portal の Bearer Token
 *   CF_API_TOKEN       — Cloudflare API Token (D1:Edit 権限)
 *   CF_ACCOUNT_ID      — Cloudflare アカウント ID
 *   CF_D1_DATABASE_ID  — D1 データベース ID
 *
 * X API プラン要件:
 *   Basic プラン以上 (月 $100) または OAuth 1.0a ユーザー認証
 *   → developer.twitter.com でアプリを作成し Bearer Token を取得
 */

const X_USERNAME = 'ochoco0215';

// 挨拶ツイートとして認識するパターン
const GREETING_PATTERN = /おはちょこ|こんちょこ|こんばんちょこ|おはよ|おは[～〜！!🍫]/u;

/**
 * ツイートテキストから種類を判定
 */
function detectType(text) {
    if (/こんばんちょこ|こんばんは|こんばん/.test(text)) return 'konbanchoco';
    if (/こんちょこ|こんにちは|こんちゃ/.test(text)) return 'konchoco';
    return 'ohachoco';  // おはちょこ / おはよう / default
}

/**
 * X API v2 でユーザー ID を取得
 */
async function getUserId(bearerToken) {
    const url = `https://api.twitter.com/2/users/by/username/${X_USERNAME}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`getUserId failed: ${res.status} ${body}`);
    }
    const data = await res.json();
    return data.data.id;
}

/**
 * X API v2 でユーザーの最新ツイートを取得 (最大 100 件、過去 48 時間)
 */
async function fetchRecentTweets(bearerToken, userId) {
    const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
        max_results: '100',
        start_time: startTime,
        'tweet.fields': 'created_at,public_metrics,attachments',
        expansions: 'attachments.media_keys',
        'media.fields': 'url,type',
    });

    const url = `https://api.twitter.com/2/users/${userId}/tweets?${params}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`fetchRecentTweets failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    return data;
}

/**
 * D1 HTTP API でツイートを挿入 (INSERT OR REPLACE)
 */
async function upsertTweet(cfApiToken, accountId, databaseId, tweet) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    const sql =
        'INSERT OR REPLACE INTO tweets (id, tweet_id, text, created_at, image_url, like_count, retweet_count, type)' +
        ' VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)';

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${cfApiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sql,
            params: [
                tweet.id,
                tweet.id,
                tweet.text,
                tweet.created_at,
                tweet.image_url ?? null,
                tweet.like_count,
                tweet.retweet_count,
                tweet.type,
            ],
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`upsertTweet failed: ${res.status} ${body}`);
    }

    return await res.json();
}

/**
 * メイン処理
 */
async function main() {
    const bearerToken = process.env.X_BEARER_TOKEN;
    const cfApiToken = process.env.CF_API_TOKEN;
    const accountId = process.env.CF_ACCOUNT_ID;
    const databaseId = process.env.CF_D1_DATABASE_ID;

    if (!bearerToken || !cfApiToken || !accountId || !databaseId) {
        console.error('必要な環境変数が未設定です。');
        console.error('  X_BEARER_TOKEN, CF_API_TOKEN, CF_ACCOUNT_ID, CF_D1_DATABASE_ID');
        process.exit(1);
    }

    console.log(`[collect] @${X_USERNAME} のツイートを取得中...`);

    // ユーザー ID 取得
    const userId = await getUserId(bearerToken);
    console.log(`[collect] user_id: ${userId}`);

    // 最新ツイート取得
    const data = await fetchRecentTweets(bearerToken, userId);
    const rawTweets = data.data ?? [];
    const mediaMap = {};
    (data.includes?.media ?? []).forEach(m => {
        if (m.type === 'photo' && m.url) mediaMap[m.media_key] = m.url;
    });

    console.log(`[collect] 取得: ${rawTweets.length} 件`);

    // 挨拶ツイートのみフィルタ
    const greetings = rawTweets.filter(t => GREETING_PATTERN.test(t.text));
    console.log(`[collect] 挨拶ツイート: ${greetings.length} 件`);

    if (greetings.length === 0) {
        console.log('[collect] 新規の挨拶ツイートなし。終了。');
        return;
    }

    // D1 に保存
    let saved = 0;
    for (const raw of greetings) {
        const mediaKey = raw.attachments?.media_keys?.[0];
        const tweet = {
            id: raw.id,
            text: raw.text,
            created_at: raw.created_at,
            image_url: mediaKey ? (mediaMap[mediaKey] ?? null) : null,
            like_count: raw.public_metrics?.like_count ?? 0,
            retweet_count: raw.public_metrics?.retweet_count ?? 0,
            type: detectType(raw.text),
        };

        try {
            await upsertTweet(cfApiToken, accountId, databaseId, tweet);
            console.log(`[collect] 保存: ${tweet.id} [${tweet.type}] "${tweet.text.slice(0, 30)}..."`);
            saved++;
        } catch (err) {
            console.error(`[collect] 保存失敗 ${tweet.id}:`, err.message);
        }
    }

    console.log(`[collect] 完了: ${saved}/${greetings.length} 件保存`);
}

main().catch(err => {
    console.error('[collect] 予期せぬエラー:', err);
    process.exit(1);
});
