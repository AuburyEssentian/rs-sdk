import { describe, expect, test } from 'bun:test';
import { buildBrainSnapshot } from './brain';

describe('Fleetbrain dashboard model', () => {
    test('publishes bounded orchestrator state and list-price costs', () => {
        const snapshot = buildBrainSnapshot(
            {
                online: true,
                health: 'healthy',
                model: 'gpt-5.6-luna',
                provider: 'openai-codex',
                reasoningEffort: 'max',
                objective: 'Stabilise fishing supply.',
                decision: 'Observe the current trade before intervening.',
                observations: ['All ten accounts are fresh.'],
                updatedAt: '2026-08-17T00:00:00.000Z',
            },
            { online: true, phase: 'idle', allowedActions: ['restart_controller'], updatedAt: '2026-08-17T00:00:30.000Z' },
            {
                billingMode: 'list-price-equivalent',
                totals: { sessions: 2, inputTokens: 1_000_000, outputTokens: 100_000, estimatedCostUsd: 1.6 },
                updatedAt: '2026-08-17T00:00:20.000Z',
            },
            { pending: 0, completed: 1, rejected: 1 },
            Date.parse('2026-08-17T00:01:00.000Z'),
        );
        expect(snapshot.healthy).toBe(true);
        expect(snapshot.status.model).toBe('gpt-5.6-luna');
        expect(snapshot.workOrders).toEqual({ pending: 0, completed: 1, rejected: 1 });
        expect(snapshot.costs.totals.estimatedCostUsd).toBe(1.6);
        expect(snapshot.costs.actualSubscriptionCharge).toBeNull();
    });

    test('marks stale or absent brain reviews as unhealthy without mutating fleet state', () => {
        expect(buildBrainSnapshot({ online: true, updatedAt: '2026-08-16T23:40:00.000Z' }, {}, {}, { pending: 0, completed: 0, rejected: 0 }, Date.parse('2026-08-17T00:01:00.000Z')).healthy).toBe(false);
        expect(buildBrainSnapshot(null, null, null, { pending: 0, completed: 0, rejected: 0 }, Date.now()).healthy).toBe(false);
    });
});
