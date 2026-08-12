import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,
    reporter: 'list',
    outputDir: '.playwright-results',
    use: {
        baseURL: 'http://127.0.0.1:8080',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // WebKit未インストールのためコメントアウト
        // {
        //     name: 'Mobile Safari',
        //     use: { ...devices['iPhone 13'] },
        // },
    ],
    webServer: {
        command: 'node ./node_modules/http-server/bin/http-server ./ -p 8080 -a 127.0.0.1 -s',
        url: 'http://127.0.0.1:8080',
        reuseExistingServer: false,
    },
});
