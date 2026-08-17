import { describe, expect, test } from 'bun:test';
import {
    ALLOWED_ROLE_KEYS,
    canRestartController,
    canScaleFleet,
    validateWorkOrder,
    type FleetValidationContext,
    type WorkOrder,
} from './reconciler-model';
import * as reconcilerModel from './reconciler-model';

const now = Date.parse('2026-08-17T00:00:00.000Z');
const context: FleetValidationContext = {
    enabledLiteBots: new Set(['Fszfish1', 'Fszcook1']),
    allBotIds: new Set(['FSZ6yjrsA', 'Fszfish1', 'Fszcook1']),
    protectedBots: new Set(['FSZ6yjrsA']),
    activeAccountCount: 3,
    totalAccountCount: 3,
    maxAccounts: 20,
};

function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
    return {
        version: 2,
        id: 'wo-20260817-fish-restart',
        requestedBy: 'fleetbrain',
        action: 'restart_controller',
        botId: 'Fszfish1',
        reason: 'Fleetbrain has current evidence that this selective lifecycle action will improve fleet health.',
        evidence: ['requestedByLuna=true', 'controllerRunning=true'],
        createdAt: '2026-08-16T23:59:00.000Z',
        expiresAt: '2026-08-17T00:09:00.000Z',
        ...overrides,
    };
}

describe('Fleetbrain reconciler guardrails', () => {
    test('accepts selective restart and disable actions for enabled Lite accounts', () => {
        for (const action of ['restart_controller', 'restart_client', 'restart_account', 'remove_account'] as const) {
            expect(validateWorkOrder(order({ action }), context, now)).toEqual({ ok: true });
        }
    });

    test('accepts a bounded new Lite account below the hard cap', () => {
        expect(ALLOWED_ROLE_KEYS).toContain('flex');
        expect(validateWorkOrder(order({
            id: 'wo-20260817-add-flex2',
            action: 'add_account',
            botId: 'Fszflex2',
            roleKey: 'flex',
        }), context, now)).toEqual({ ok: true });
    });

    test('rejects extra schema fields and roleKey on non-add actions', () => {
        expect(validateWorkOrder({ ...order(), command: 'arbitrary' } as any, context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ roleKey: 'fish' }), context, now).ok).toBe(false);
    });

    test('rejects protected, unknown and unsupported lifecycle targets', () => {
        expect(validateWorkOrder(order({ botId: 'FSZ6yjrsA', action: 'remove_account' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ botId: 'Unknown1', action: 'restart_account' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ action: 'delete_account' as any }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ requestedBy: 'dashboard' as any }), context, now).ok).toBe(false);
    });

    test('rejects new accounts at the cap, invalid names, duplicates and invalid roles', () => {
        const capped = { ...context, activeAccountCount: 20, totalAccountCount: 20 };
        expect(validateWorkOrder(order({ action: 'add_account', botId: 'Fszflex2', roleKey: 'flex' }), capped, now).ok).toBe(false);
        expect(validateWorkOrder(order({ action: 'add_account', botId: 'bad-name', roleKey: 'flex' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ action: 'add_account', botId: 'Fszfish1', roleKey: 'flex' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ action: 'add_account', botId: 'Fszflex2', roleKey: 'boss' as any }), context, now).ok).toBe(false);
    });

    test('allows add_account to reactivate a disabled known Lite account without creating another character', () => {
        const reactivation = {
            ...context,
            enabledLiteBots: new Set(['Fszfish1']),
            disabledLiteBots: new Set(['Fszcook1']),
        };
        expect(validateWorkOrder(order({ action: 'add_account', botId: 'Fszcook1', roleKey: 'cook' }), reactivation, now)).toEqual({ ok: true });
    });

    test('rejects expired, overlong and weakly justified requests', () => {
        expect(validateWorkOrder(order({ expiresAt: '2026-08-16T23:59:59.000Z' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ expiresAt: '2026-08-17T01:00:00.000Z' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ reason: 'restart it' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ createdAt: '2026-08-16T23:59:00' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ createdAt: 'Mon, 16 Aug 2026 23:59:00 +00:00' }), context, now).ok).toBe(false);
        expect(validateWorkOrder(order({ createdAt: '2026-02-30T12:00:00Z' }), context, now).ok).toBe(false);
    });

    test('enforces lifecycle and scale cooldowns', () => {
        expect(canRestartController(undefined, now, 300_000)).toBe(true);
        expect(canRestartController('2026-08-16T23:56:00.000Z', now, 300_000)).toBe(false);
        expect(canRestartController('2026-08-16T23:54:00.000Z', now, 300_000)).toBe(true);
        expect(canScaleFleet(undefined, now, 15 * 60_000)).toBe(true);
        expect(canScaleFleet('2026-08-16T23:50:00.000Z', now, 15 * 60_000)).toBe(false);
        expect(canScaleFleet('2026-08-16T23:40:00.000Z', now, 15 * 60_000)).toBe(true);
    });

    test('enforces a host-side three-order and distinct-target review budget', () => {
        const canAcceptReviewOrder = (reconcilerModel as any).canAcceptReviewOrder;
        expect(canAcceptReviewOrder).toBeFunction();
        const recent = [
            { botId: 'Fszfish1', acceptedAt: '2026-08-16T23:58:00.000Z' },
            { botId: 'Fszcook1', acceptedAt: '2026-08-16T23:58:30.000Z' },
            { botId: 'Fszwood1', acceptedAt: '2026-08-16T23:59:00.000Z' },
        ];
        expect(canAcceptReviewOrder(recent, 'Fszrune1', now)).toBe(false);
        expect(canAcceptReviewOrder(recent.slice(0, 2), 'Fszfish1', now)).toBe(false);
        expect(canAcceptReviewOrder([{ botId: 'Fszfish1', acceptedAt: '2026-08-16T23:50:00.000Z' }], 'Fszfish1', now)).toBe(true);
    });

    test('requires stale lifecycle recovery to progress from client to controller to account', () => {
        const canAdvanceRecovery = (reconcilerModel as any).canAdvanceRecovery;
        const canProcessWorkOrderId = (reconcilerModel as any).canProcessWorkOrderId;
        const supervisorVerificationSucceeded = (reconcilerModel as any).supervisorVerificationSucceeded;
        expect(canAdvanceRecovery).toBeFunction();
        expect(canProcessWorkOrderId).toBeFunction();
        expect(supervisorVerificationSucceeded).toBeFunction();
        expect(supervisorVerificationSucceeded({ supervisorVerified: true })).toBe(true);
        expect(supervisorVerificationSucceeded({ supervisorVerified: false })).toBe(false);
        const clientAttempt = { action: 'restart_client', attemptedAt: '2026-08-16T23:50:00.000Z' };
        const controllerAttempt = { action: 'restart_controller', attemptedAt: '2026-08-16T23:50:00.000Z' };
        const accountAttempt = { action: 'restart_account', attemptedAt: '2026-08-16T23:50:00.000Z' };
        expect(canAdvanceRecovery('restart_client', undefined, undefined, now)).toBe(true);
        expect(canAdvanceRecovery('restart_controller', undefined, undefined, now)).toBe(false);
        expect(canAdvanceRecovery('restart_account', undefined, undefined, now)).toBe(false);
        expect(canAdvanceRecovery('restart_client', clientAttempt, '2026-08-16T23:49:00.000Z', now)).toBe(false);
        expect(canAdvanceRecovery('restart_controller', clientAttempt, '2026-08-16T23:49:00.000Z', now)).toBe(true);
        expect(canAdvanceRecovery('restart_account', clientAttempt, '2026-08-16T23:49:00.000Z', now)).toBe(false);
        expect(canAdvanceRecovery('restart_account', controllerAttempt, '2026-08-16T23:49:00.000Z', now)).toBe(true);
        expect(canAdvanceRecovery('restart_client', clientAttempt, '2026-08-16T23:59:00.000Z', now)).toBe(true);
        expect(canAdvanceRecovery('restart_controller', clientAttempt, '2026-08-16T23:59:00.000Z', now)).toBe(false);
        expect(canAdvanceRecovery('restart_client', clientAttempt, '2026-08-16T23:51:00.000Z', now)).toBe(false);
        expect(canAdvanceRecovery('restart_account', accountAttempt, '2026-08-16T23:49:00.000Z', now)).toBe(false);
        expect(canProcessWorkOrderId([], 'wo-20260817-fish-restart')).toBe(true);
        expect(canProcessWorkOrderId(['wo-20260817-fish-restart'], 'wo-20260817-fish-restart')).toBe(false);
    });
});
