#!/usr/bin/env node
/**
 * ヘッドレスブラウザテスト: /admin ページのツイート取得機能
 *
 * wrangler dev が localhost:8788 で起動している前提。
 * /api/fetch-tweet へのリクエストを playwright route でインターセプトし、
 * 実際の FixTweet API レスポンスをモックして動作確認する。
 *
 * 使い方:
 *   npx playwright test --config=... か、
 *   node ohatsui/test/headless-admin.mjs
 */
import { chromium } from 'playwright-core';

const BASE_URL = 'http://localhost:8788';
const TWEET_URL = 'https://x.com/ochoco0215/status/2033698551092617246';

// fetch-tweet.js が返すべきレスポンス（FixTweet API の実データに基づく）
const MOCK_FETCH_RESPONSE = {
    id: '2033698551092617246',
    text: 'おはちょこ🍫☀\n今日も1日がんばろ〜😘',
    created_at: '2026-03-17T00:14:53.000Z',
    image_url: 'https://pbs.twimg.com/media/HDkmDC7bEAAnbQX.jpg?name=orig',
    images: ['https://pbs.twimg.com/media/HDkmDC7bEAAnbQX.jpg?name=orig'],
    like_count: 39,
    retweet_count: 2,
};

let errors = 0;

function assert(condition, msg) {
    if (condition) {
        console.log(`  ✓ ${msg}`);
    } else {
        console.error(`  ✗ ${msg}`);
        errors++;
    }
}

async function run() {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // /api/fetch-tweet をモック
    await page.route('**/api/fetch-tweet**', async (route) => {
        const reqUrl = new URL(route.request().url());
        const tweetUrlParam = reqUrl.searchParams.get('url');
        console.log(`  [mock] /api/fetch-tweet called with url=${tweetUrlParam}`);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_FETCH_RESPONSE),
        });
    });

    // 画像リクエストはブロック（高速化）
    await page.route('**/*.jpg**', route => route.abort());
    await page.route('**/*.png**', route => route.abort());

    try {
        // =============================================
        // テスト 1: admin ページの表示
        // =============================================
        console.log('\n=== テスト 1: /admin ページの表示 ===');
        const res = await page.goto(`${BASE_URL}/admin/`, { waitUntil: 'domcontentloaded' });
        assert(res.ok(), `ページが 200 で返る (実際: ${res.status()})`);

        const title = await page.title();
        assert(title.includes('おはついアーカイブ'), `タイトルに "おはついアーカイブ" を含む: "${title}"`);

        const h1 = await page.textContent('h1');
        assert(h1.includes('手動登録'), `H1 に "手動登録" を含む: "${h1}"`);

        // フォーム要素の存在確認
        assert(await page.isVisible('#tweet_url'), 'ツイートURL入力欄が表示されている');
        assert(await page.isVisible('#text'), 'ツイート本文テキストエリアが表示されている');
        assert(await page.isVisible('#created_at'), '投稿日時入力欄が表示されている');
        assert(await page.isVisible('#fetch-btn'), 'URL取得ボタンが表示されている');

        // =============================================
        // テスト 2: URL から取得 (モック API)
        // =============================================
        console.log('\n=== テスト 2: URL から取得 ===');
        await page.fill('#tweet_url', TWEET_URL);
        assert((await page.inputValue('#tweet_url')) === TWEET_URL, 'URL入力欄にURLが入力された');

        // URL取得ボタンをクリック
        await page.click('#fetch-btn');

        // 結果表示を待つ
        await page.waitForSelector('#result.ok', { timeout: 5000 });

        // 本文がフォームに反映されたか
        const textValue = await page.inputValue('#text');
        assert(textValue.includes('おはちょこ'), `本文に "おはちょこ" を含む: "${textValue.slice(0, 40)}"`);

        // 投稿日時がフォームに反映されたか
        const dateValue = await page.inputValue('#created_at');
        assert(dateValue !== '', `投稿日時が設定されている: "${dateValue}"`);
        assert(dateValue.includes('2026-03-17'), `投稿日時が正しい日付: "${dateValue}"`);

        // 結果メッセージの確認
        const resultText = await page.textContent('#result');
        assert(resultText.includes('取得成功'), '結果メッセージに "取得成功" を含む');
        assert(resultText.includes('いいね: 39'), `いいね数が 39 と表示: "${resultText}"`);
        assert(resultText.includes('RT: 2'), `RT数が 2 と表示: "${resultText}"`);
        assert(!resultText.includes('undefined'), `"undefined" が含まれない: "${resultText}"`);
        assert(!resultText.includes('null'), `"null" が含まれない: "${resultText}"`);

        // スクリーンショット保存
        await page.screenshot({ path: '/tmp/admin-fetch-success.png', fullPage: true });
        console.log('  📸 スクリーンショット: /tmp/admin-fetch-success.png');

        // =============================================
        // テスト 3: エラーハンドリング
        // =============================================
        console.log('\n=== テスト 3: エラーハンドリング ===');

        // モックをエラーレスポンスに変更
        await page.unroute('**/api/fetch-tweet**');
        await page.route('**/api/fetch-tweet**', async (route) => {
            await route.fulfill({
                status: 502,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'FixTweet API unreachable' }),
            });
        });

        await page.fill('#tweet_url', 'https://x.com/test/status/999');
        await page.click('#fetch-btn');
        await page.waitForSelector('#result.err', { timeout: 5000 });

        const errText = await page.textContent('#result');
        assert(errText.includes('取得エラー'), `エラーメッセージが表示: "${errText.slice(0, 60)}"`);

        await page.screenshot({ path: '/tmp/admin-fetch-error.png', fullPage: true });
        console.log('  📸 スクリーンショット: /tmp/admin-fetch-error.png');

    } finally {
        await browser.close();
    }

    if (errors > 0) {
        console.error(`\n✗ ${errors} エラーあり`);
        process.exit(1);
    } else {
        console.log('\n✓ 全テスト OK');
    }
}

run().catch(err => {
    console.error('テスト実行エラー:', err);
    process.exit(1);
});
