/**
 * PrintPhoto - タイトルフォント (Noto Sans / Noto Sans JP / oblique 18deg) E2Eテスト
 *
 * 1ページUIの frame-title において、指定のフォント・ウェイト・font-style が
 * computed style として適用されていることを検証する。
 */

import { test, expect, openApp } from './helpers.js';

async function getTitleComputedStyle(page) {
    return await page.evaluate(() => {
        const el = document.getElementById('frame-title');
        if (!el) return null;
        const s = window.getComputedStyle(el);
        return {
            fontFamily: s.fontFamily,
            fontWeight: s.fontWeight,
            fontStyle: s.fontStyle,
            textAlign: s.textAlign,
        };
    });
}

test.describe('タイトルフォント (Noto Sans / oblique 18deg)', () => {
    test('E-TX-F1: Google Fonts の link に Noto Sans / Noto Sans JP が含まれる', async ({ page }) => {
        await openApp(page);

        const links = await page.$$eval('link[href*="fonts.googleapis.com"]', els =>
            els.map(e => e.getAttribute('href'))
        );
        expect(links.length).toBeGreaterThan(0);
        const combined = links.join(' ');
        expect(combined).toContain('Noto+Sans');
        expect(combined).toContain('Noto+Sans+JP');
        expect(combined).not.toContain('M+PLUS+Rounded+1c');
    });

    test('E-TX-F2: html, body の font-family に Noto Sans / Noto Sans JP が含まれる', async ({ page }) => {
        await openApp(page);

        const fontFamily = await page.evaluate(() => window.getComputedStyle(document.body).fontFamily);
        expect(fontFamily).toContain('Noto Sans');
        expect(fontFamily).toContain('Noto Sans JP');
    });

    test('E-TX-F3: frame-title に Noto Sans / weight 400 / oblique 18deg が適用される', async ({ page }) => {
        await openApp(page);

        await page.evaluate(() => {
            const input = document.getElementById('input-title');
            if (input) {
                input.value = 'plamちゃん！';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(200);

        const style = await getTitleComputedStyle(page);
        expect(style).not.toBeNull();
        expect(style.fontFamily).toContain('Noto Sans');
        expect(style.fontFamily).toContain('Noto Sans JP');
        expect(style.fontWeight).toBe('400');
        expect(style.fontStyle).toContain('oblique');
        expect(style.fontStyle).toContain('18deg');
        expect(style.textAlign).toBe('center');
    });
});
