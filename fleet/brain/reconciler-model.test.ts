import { describe, expect, test } from 'bun:test';
import { validateWorkOrder, canRestartController, controllerRestartPrecondition, type WorkOrder } from './reconciler-model';

const now = Date.parse('2026-08-17T00:00:00.000Z');
const knownBots = new Set(['Fszfish1', 'Fszcook1']);

function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
    return {
        version: 1,
        id: 'wo-20260817-fish-stale',
        requestedBy: 'fleetbrain',
        action: 'restart_controller',
        botId: 'Fszfish1',
        reason: 'Controller status has been stale for more than three minutes while its Lite client remains fresh.',
        evidence: ['statusAgeMs=241000', 'clientRunning=true'],
        createdAt: '2026-08-16T23:59:00.000Z',
        expiresAt: '2026-08-17T00:09:00.000Z',
        ...overrides,
    };
}

describe('Fleetbrain reconciler guardrails', () => {
    test('accepts one bounded Lite-controller restart request', () => {
        expect(validateWorkOrder(order(), knownBots, now)).toEqual({ ok: true });
    });

    test('rejects unknown bots, unsupported actions and untrusted writers', () => {
        expect(validateWorkOrder(order({ botId: 'FSZ6yjrsA' }), knownBots, now).ok).toBe(false);
        expect(validateWorkOrder(order({ action: 'restart_client' as any }), knownBots, now).ok).toBe(false);
        expect(validateWorkOrder(order({ requestedBy: 'dashboard' as any }), knownBots, now).ok).toBe(false);
    });

    test('rejects expired, overlong and weakly justified requests', () => {
        expect(validateWorkOrder(order({ expiresAt: '2026-08-16T23:59:59.000Z' }), knownBots, now).ok).toBe(false);
        expect(validateWorkOrder(order({ expiresAt: '2026-08-17T01:00:00.000Z' }), knownBots, now).ok).toBe(false);
        expect(validateWorkOrder(order({ reason: 'stale' }), knownBots, now).ok).toBe(false);
    });

    test('enforces a per-controller restart cooldown', () => {
        expect(canRestartController(undefined, now, 300_000)).toBe(true);
        expect(canRestartController('2026-08-16T23:56:00.000Z', now, 300_000)).toBe(false);
        expect(canRestartController('2026-08-16T23:54:00.000Z', now, 300_000)).toBe(true);
    });

    test('requires a genuinely unhealthy live status before signalling a controller', () => {
        expect(controllerRestartPrecondition({ online: true, updatedAt: '2026-08-16T23:51:00.000Z' }, now).ok).toBe(false);
        expect(controllerRestartPrecondition({ online: true, updatedAt: '2026-08-16T23:49:00.000Z' }, now).ok).toBe(true);
        expect(controllerRestartPrecondition({ online: false, updatedAt: '2026-08-16T23:59:30.000Z' }, now).ok).toBe(true);
        expect(controllerRestartPrecondition(null, now).ok).toBe(false);
    });
});
