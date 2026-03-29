/**
 * Headless browser test for admin page registration.
 * Verifies that the "登録する" button successfully saves a tweet (no 503 error).
 *
 * Usage: node test/headless-admin-test.mjs
 * Requires: wrangler pages dev running on localhost:8799
 */
import { chromium } from 'playwright-core';

const BASE_URL = 'http://localhost:8799';

// Use available chromium installation
const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';

async function run() {
    const browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH });
    const page = await browser.newPage();

    try {
        // Navigate to admin page
        console.log('1. Opening admin page...');
        await page.goto(`${BASE_URL}/admin/`);
        await page.waitForSelector('#tweet_url');
        console.log('   OK: Admin page loaded');

        // Fill in the form
        console.log('2. Filling form...');
        await page.fill('#tweet_url', 'https://x.com/ochoco0215/status/9990000000000000001');
        await page.fill('#text', 'おはちょこ～🍫 テスト投稿');
        // Set datetime
        await page.fill('#created_at', '2026-03-18T09:00');
        console.log('   OK: Form filled');

        // Click submit button
        console.log('3. Clicking 登録する...');
        await page.click('button:has-text("登録する")');

        // Wait for result to appear
        await page.waitForSelector('#result[style*="display: block"]', { timeout: 10000 });
        const resultText = await page.textContent('#result');
        const resultClass = await page.getAttribute('#result', 'class');
        console.log(`   Result: ${resultText}`);
        console.log(`   Class: ${resultClass}`);

        // Verify success
        if (resultText.includes('HTTP 200') && resultClass === 'ok') {
            console.log('\n✅ TEST PASSED: Tweet registered successfully (no 503 error)');
        } else if (resultText.includes('HTTP 503')) {
            console.error('\n❌ TEST FAILED: Got HTTP 503 (D1 binding not configured)');
            process.exitCode = 1;
        } else {
            console.error(`\n❌ TEST FAILED: Unexpected result - ${resultText}`);
            process.exitCode = 1;
        }

        // Also verify the tweet was saved
        console.log('\n4. Verifying tweet in DB via /api/tweets...');
        const tweetsRes = await page.evaluate(() =>
            fetch('/api/tweets').then(r => r.json())
        );
        const found = tweetsRes.find(t => t.tweet_id === '9990000000000000001');
        if (found) {
            console.log(`   OK: Tweet found in DB (type=${found.type})`);
        } else {
            console.error('   WARN: Tweet not found in /api/tweets response');
        }

    } catch (err) {
        console.error(`\n❌ TEST ERROR: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

run();
