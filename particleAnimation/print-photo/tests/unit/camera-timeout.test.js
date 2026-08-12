import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForStreamWithTimeout } from '../../camera.js';

describe('camera timeout', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('U-C1: タイムアウト後に到着したストリームを停止する', async () => {
        vi.useFakeTimers();
        const stop = vi.fn();
        const stream = { getTracks: () => [{ stop }] };
        const streamPromise = new Promise(resolve => {
            setTimeout(() => resolve(stream), 50);
        });

        const result = waitForStreamWithTimeout(streamPromise, {
            timeoutMs: 10,
            isCurrent: () => true,
        });
        const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });

        await vi.advanceTimersByTimeAsync(10);
        await rejection;
        await vi.advanceTimersByTimeAsync(40);

        expect(stop).toHaveBeenCalledOnce();
    });
});
