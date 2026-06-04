/**
 * PrintPhoto - 位置情報 ユニットテスト
 */

import { describe, it, expect } from 'vitest';
import { parseNominatimResults } from '../../location.js';

describe('location', () => {
    it('U-L1: Nominatimレスポンスパース', () => {
        const mockData = {
            display_name: 'Tokyo Tower, Minato, Tokyo, Japan',
            address: {
                building: 'Tokyo Tower',
                road: 'Main Street',
                city: 'Tokyo',
            },
        };

        const results = parseNominatimResults(mockData);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('Tokyo Tower');
    });

    it('U-L2: 空レスポンス', () => {
        const results = parseNominatimResults({});
        expect(results).toEqual([]);
    });

    it('U-L2: addressがない', () => {
        const results = parseNominatimResults({ display_name: 'Somewhere' });
        expect(results).toEqual([]);
    });
});
