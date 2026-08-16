import { describe, expect, test } from 'bun:test';
import { TABS, centeredTabScrollLeft, normalizeTab, nextTab, tabFromHash } from './tabs.js';

describe('dashboard tabs', () => {
    test('uses the eight read-only views in display order', () => {
        expect(TABS).toEqual(['overview', 'fleet', 'brain', 'costs', 'progress', 'loadout', 'world', 'logs']);
    });

    test('normalizes invalid values to overview', () => {
        expect(normalizeTab('progress')).toBe('progress');
        expect(normalizeTab('something-else')).toBe('overview');
        expect(normalizeTab(null)).toBe('overview');
    });

    test('maps current and legacy hashes to a tab', () => {
        expect(tabFromHash('#world')).toBe('world');
        expect(tabFromHash('#brain')).toBe('brain');
        expect(tabFromHash('#costs')).toBe('costs');
        expect(tabFromHash('#gear')).toBe('loadout');
        expect(tabFromHash('#log')).toBe('logs');
        expect(tabFromHash('#stats')).toBe('overview');
        expect(tabFromHash('')).toBe('overview');
    });

    test('moves between tabs with wrapping keyboard navigation', () => {
        expect(nextTab('overview', 1)).toBe('fleet');
        expect(nextTab('logs', 1)).toBe('overview');
        expect(nextTab('overview', -1)).toBe('logs');
        expect(nextTab('progress', -1)).toBe('costs');
    });

    test('centres active tabs without scrolling past either edge', () => {
        expect(centeredTabScrollLeft(0, 84, 390, 120)).toBe(0);
        expect(centeredTabScrollLeft(220, 75, 390, 120)).toBe(62.5);
        expect(centeredTabScrollLeft(390, 55, 390, 120)).toBe(120);
    });
});
