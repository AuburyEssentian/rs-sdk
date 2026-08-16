import { describe, expect, test } from 'bun:test';
import {
    buildAnalytics,
    buildMilestones,
    buildTelemetryPoint,
    deriveObjective,
    isReadOnlyMethod,
    summarizeItems,
    type TelemetryPoint,
} from './model';

describe('read-only request policy', () => {
    test('allows only GET and HEAD', () => {
        expect(isReadOnlyMethod('GET')).toBe(true);
        expect(isReadOnlyMethod('HEAD')).toBe(true);
        expect(isReadOnlyMethod('POST')).toBe(false);
        expect(isReadOnlyMethod('PUT')).toBe(false);
        expect(isReadOnlyMethod('PATCH')).toBe(false);
        expect(isReadOnlyMethod('DELETE')).toBe(false);
    });
});

describe('objective derivation', () => {
    test('advances an exact ten-level boundary to the next band', () => {
        const result = deriveObjective({
            Woodcutting: 20,
            Firemaking: 20,
            Thieving: 10,
            Attack: 12,
            Strength: 13,
            Defence: 13,
            Prayer: 20,
        });
        expect(result.nextBand).toBe(20);
        expect(result.title).toBe('Lumbridge pickpocket circuit');
        expect(result.target).toContain('Thieving to 20');
    });
});

describe('telemetry analytics', () => {
    const history: TelemetryPoint[] = [
        {
            timestamp: '2026-08-16T00:00:00.000Z',
            totalLevel: 100,
            skills: {
                Attack: { level: 10, xp: 500 },
                Woodcutting: { level: 15, xp: 1000 },
            },
        },
        {
            timestamp: '2026-08-16T01:00:00.000Z',
            totalLevel: 110,
            skills: {
                Attack: { level: 12, xp: 1100 },
                Woodcutting: { level: 20, xp: 3000 },
            },
        },
    ];

    test('calculates gains and per-hour XP rates over the available window', () => {
        const result = buildAnalytics(history);
        expect(result.windowHours).toBe(1);
        expect(result.totalLevelGain).toBe(10);
        expect(result.skillGains.Attack).toEqual({ levels: 2, xp: 600 });
        expect(result.xpPerHour.Woodcutting).toBe(2000);
        expect(result.xpPerHour.Attack).toBe(600);
        expect(result.topSkill).toBe('Woodcutting');
    });

    test('returns zeroed analytics for a single point instead of inventing rates', () => {
        const result = buildAnalytics(history.slice(0, 1));
        expect(result.windowHours).toBe(0);
        expect(result.totalLevelGain).toBe(0);
        expect(result.xpPerHour).toEqual({});
        expect(result.topSkill).toBeNull();
    });
});

describe('telemetry history points', () => {
    test('extracts only stable read-only skill data from controller status', () => {
        const point = buildTelemetryPoint({
            updatedAt: '2026-08-16T02:00:00.000Z',
            totalLevel: 125,
            skills: {
                Attack: { level: 12, baseLevel: 11, xp: 1234 },
                Prayer: { level: 20, baseLevel: 20, xp: 4567 },
            },
        });
        expect(point).toEqual({
            timestamp: '2026-08-16T02:00:00.000Z',
            totalLevel: 125,
            skills: {
                Attack: { level: 11, xp: 1234 },
                Prayer: { level: 20, xp: 4567 },
            },
        });
    });

    test('returns null for legacy status without detailed skills', () => {
        expect(buildTelemetryPoint({ updatedAt: '2026-08-16T02:00:00.000Z', totalLevel: 125 })).toBeNull();
    });
});

describe('milestones', () => {
    test('reports reached level bands and the next tracked target', () => {
        const result = buildMilestones({
            Attack: 12,
            Strength: 13,
            Defence: 11,
            Prayer: 20,
            Woodcutting: 20,
            Firemaking: 20,
            Thieving: 16,
        });
        expect(result.nextBand).toBe(20);
        expect(result.reached).toContain('Prayer 20');
        expect(result.reached).toContain('Woodcutting 20');
        expect(result.remaining).toContain('Thieving 20');
        expect(result.remaining).toContain('Defence 20');
    });
});

describe('inventory presentation', () => {
    test('normalizes item rows and keeps aggregate counts', () => {
        const result = summarizeItems([
            { slot: 0, name: 'Coins', count: 15 },
            { slot: 3, name: 'Bronze arrow', count: 25 },
            { slot: 4, name: 'Coins', count: 10 },
        ]);
        expect(result).toEqual([
            { name: 'Bronze arrow', count: 25, slots: [3] },
            { name: 'Coins', count: 25, slots: [0, 4] },
        ]);
    });
});
