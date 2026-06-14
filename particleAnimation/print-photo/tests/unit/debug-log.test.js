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
    });

    it('U-D1: addDebugLog でログが蓄積される', () => {
        window.PrintPhoto.addDebugLog('test', { key: 'value' });
        expect(window.PrintPhoto.debugLogs.length).toBe(1);
        expect(window.PrintPhoto.debugLogs[0]).toContain('test');
        expect(window.PrintPhoto.debugLogs[0]).toContain('key');
    });

    it('U-D3: addDebugLog は引数が undefined でもログを蓄積できる', () => {
        // data 未指定でも落ちずに 1件積まれる
        window.PrintPhoto.addDebugLog('no-data');
        expect(window.PrintPhoto.debugLogs.length).toBe(1);
        expect(window.PrintPhoto.debugLogs[0]).toContain('no-data');
    });
});
