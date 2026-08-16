import { describe, expect, test } from 'bun:test';
import { buildFleetSnapshot, type FleetBotDefinition } from './fleet';

const bots: FleetBotDefinition[] = [
    { id: 'FSZ6yjrsA', role: 'Generalist', clientMode: 'browser', statusPath: 'a' },
    { id: 'Fszminer1', role: 'Mining supplier', clientMode: 'lite', statusPath: 'b' },
];

describe('fleet dashboard model', () => {
    test('summarises online accounts and combined levels in manifest order', () => {
        const now = Date.parse('2026-08-16T10:00:00Z');
        const snapshot = buildFleetSnapshot(bots, {
            FSZ6yjrsA: { updatedAt: '2026-08-16T09:59:50Z', online: true, totalLevel: 485, activity: 'melee', detail: 'fighting' },
            Fszminer1: { updatedAt: '2026-08-16T09:59:40Z', online: true, totalLevel: 36, activity: 'mining', detail: 'copper' },
        }, now);

        expect(snapshot.summary).toEqual({ configured: 2, online: 2, totalLevel: 521 });
        expect(snapshot.bots.map(bot => bot.id)).toEqual(['FSZ6yjrsA', 'Fszminer1']);
        expect(snapshot.bots[1]).toMatchObject({ role: 'Mining supplier', clientMode: 'lite', healthy: true, ageMs: 20_000 });
    });

    test('marks stale or missing controller state unhealthy', () => {
        const now = Date.parse('2026-08-16T10:00:00Z');
        const snapshot = buildFleetSnapshot(bots, {
            FSZ6yjrsA: { updatedAt: '2026-08-16T09:56:00Z', online: true, totalLevel: 485 },
        }, now);
        expect(snapshot.summary.online).toBe(0);
        expect(snapshot.bots[0].healthy).toBe(false);
        expect(snapshot.bots[1]).toMatchObject({ healthy: false, ageMs: null, totalLevel: null });
    });
});
