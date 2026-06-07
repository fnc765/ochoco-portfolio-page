/**
 * PrintPhoto - デバッグログ ユニットテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';

// script.js を読み込む（グローバルに window.PrintPhoto が公開される）
import '../../script.js';

describe('debug-log', () => {
    beforeEach(() => {
        // ログをクリア
        window.PrintPhoto.debugLogs.length = 0;
        document._clearMockElements();
    });

    it('U-D1: addDebugLog でログが蓄積される', () => {
        window.PrintPhoto.addDebugLog('test', { key: 'value' });
        expect(window.PrintPhoto.debugLogs.length).toBe(1);
        expect(window.PrintPhoto.debugLogs[0]).toContain('test');
        expect(window.PrintPhoto.debugLogs[0]).toContain('key');
    });

    it('U-D2: renderDebugLog で textarea に反映される', () => {
        // textarea 要素をモックとして登録
        const textarea = document.createElement('textarea');
        textarea.id = 'debug-log';
        document._registerMockElement('debug-log', textarea);

        window.PrintPhoto.addDebugLog('test1', { a: 1 });
        window.PrintPhoto.addDebugLog('test2', { b: 2 });
        window.PrintPhoto.renderDebugLog();

        expect(textarea.value).toContain('test1');
        expect(textarea.value).toContain('test2');
        expect(textarea.value).toContain('a');
        expect(textarea.value).toContain('b');
    });

    it('U-D3: addDebugLog は textarea が存在しない場合でも蓄積される', () => {
        // textarea が存在しない状態
        document._clearMockElements();

        window.PrintPhoto.addDebugLog('no-textarea', { data: true });
        expect(window.PrintPhoto.debugLogs.length).toBe(1);
        expect(window.PrintPhoto.debugLogs[0]).toContain('no-textarea');
    });

    it('U-D4: renderDebugLog は textarea 不在でもエラーにならない', () => {
        document._clearMockElements();

        window.PrintPhoto.addDebugLog('test', { x: 1 });
        // エラーが投げられないことを確認
        expect(() => window.PrintPhoto.renderDebugLog()).not.toThrow();
    });
});
