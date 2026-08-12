import { describe, expect, it } from 'vitest';
import { detectInAppBrowser } from '../../browser-detection.js';

describe('in-app browser detection', () => {
    it('U-B1: iOS版Chromeをアプリ内ブラウザ扱いしない', () => {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0.0.0 Mobile/15E148 Safari/604.1';
        expect(detectInAppBrowser(ua, false)).toBeNull();
    });

    it('U-B2: LINE内ブラウザは引き続き検出する', () => {
        const ua = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Line/14.0.0';
        expect(detectInAppBrowser(ua, false)).toBe('LINE');
    });

    it.each([
        ['Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'],
        ['Firefox', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/130.0 Mobile/15E148 Safari/605.1.15'],
        ['Edge', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 EdgiOS/130.0 Mobile/15E148 Safari/605.1.15'],
        ['Opera', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 OPiOS/4.6.0 Mobile/15E148 Safari/9537.53'],
    ])('U-B3: iOS版%sをアプリ内ブラウザ扱いしない', (_browser, ua) => {
        expect(detectInAppBrowser(ua, false)).toBeNull();
    });

    it('U-B4: standalone起動は未知のiOS UAでもアプリ内扱いしない', () => {
        expect(detectInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148', true)).toBeNull();
    });

    it('U-B5: 未知のiOS埋め込みUAはアプリ内扱いする', () => {
        expect(detectInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148', false)).toBe('アプリ内');
    });
});
