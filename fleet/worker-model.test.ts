import { describe, expect, test } from 'bun:test';
import { chooseWorkerAction, COPPER_ROCK_IDS, roleProfile, shouldPassAlKharidToll, TIN_ROCK_IDS, type WorkerSnapshot } from './worker-model';
import * as workerModel from './worker-model';

const snapshot = (overrides: Partial<WorkerSnapshot> = {}): WorkerSnapshot => ({
    inventory: [],
    inventorySlots: 1,
    hp: 10,
    maxHp: 10,
    ...overrides,
});

describe('fleet role worker policy', () => {
    test('maps every fleet role to a deterministic bootstrap profile', () => {
        expect(roleProfile('wood').home).toEqual({ x: 3195, z: 3220 });
        expect(roleProfile('fish').home).toEqual({ x: 3267, z: 3148 });
        expect(roleProfile('fish').bank).toEqual({ x: 3269, z: 3167 });
        expect(roleProfile('smith').keep.test('Bronze pickaxe')).toBe(true);
        expect(roleProfile('cook').keep.test('Small fishing net')).toBe(true);
        expect(roleProfile('cook').processing).toEqual({ x: 3271, z: 3180 });
        expect(roleProfile('thief').home).toEqual({ x: 3222, z: 3218 });
        expect(roleProfile('banker').home).toEqual({ x: 3185, z: 3436 });
    });

    test('uses the server rock IDs rather than the stale learnings mapping', () => {
        expect(COPPER_ROCK_IDS).toEqual([2090, 2091]);
        expect(TIN_ROCK_IDS).toEqual([2094, 2095]);
    });

    test('only pays the Al Kharid toll while approaching from the west', () => {
        expect(shouldPassAlKharidToll({ x: 3267, z: 3228 })).toBe(true);
        expect(shouldPassAlKharidToll({ x: 3268, z: 3228 })).toBe(false);
        expect(shouldPassAlKharidToll({ x: 3271, z: 3180 })).toBe(false);
        expect(shouldPassAlKharidToll({ x: 3267, z: 3150 })).toBe(false);
    });

    test('wood workers burn gathered logs before chopping more', () => {
        expect(chooseWorkerAction('wood', snapshot({ inventory: [{ name: 'Logs', count: 5 }, { name: 'Tinderbox', count: 1 }] }))).toBe('burn');
        expect(chooseWorkerAction('wood', snapshot())).toBe('chop');
    });

    test('fishing and cooking workers bank full loads and cook available raw fish', () => {
        expect(chooseWorkerAction('fish', snapshot({ inventorySlots: 28 }))).toBe('bank');
        expect(chooseWorkerAction('fish', snapshot())).toBe('acquire-net');
        expect(chooseWorkerAction('fish', snapshot({ inventory: [{ name: 'Coins', count: 25 }] }))).toBe('acquire-net');
        expect(chooseWorkerAction('fish', snapshot({ inventory: [{ name: 'Small fishing net', count: 1 }] }))).toBe('fish');
        expect(chooseWorkerAction('cook', snapshot({ inventory: [{ name: 'Raw shrimps', count: 4 }] }))).toBe('acquire-net');
        expect(chooseWorkerAction('cook', snapshot({ inventory: [{ name: 'Raw shrimps', count: 8 }] }))).toBe('cook');
        expect(chooseWorkerAction('cook', snapshot())).toBe('acquire-net');
    });

    test('lets a bounded strategic directive override a healthy specialist loop', () => {
        expect(chooseWorkerAction(
            'thief',
            snapshot({ inventory: [{ name: 'Coins', count: 28_242 }] }),
            { mode: 'fund-banker', reason: 'Unblock fleet logistics' } as any,
        )).toBe('fund-banker');
    });

    test('selects a fresh role-matched directive from Fleetbrain state', () => {
        const selectWorkerDirective = (workerModel as any).selectWorkerDirective;
        expect(selectWorkerDirective).toBeFunction();
        const directive = selectWorkerDirective({
            version: 1,
            updatedAt: '2026-08-17T12:29:00.000Z',
            directives: [{
                id: 'fd-fund-banker-001',
                botId: 'Fszthief1',
                role: 'thief',
                mode: 'fund-banker',
                amount: 1_000,
                reason: 'Fund the fleet banker to clear stalled supply requests.',
                createdAt: '2026-08-17T12:00:00.000Z',
                expiresAt: '2026-08-17T13:00:00.000Z',
            }],
        }, 'Fszthief1', 'thief', Date.parse('2026-08-17T12:30:00.000Z'));
        expect(directive).toMatchObject({ id: 'fd-fund-banker-001', mode: 'fund-banker', amount: 1_000 });
    });

    test('rejects extra or missing directive schema fields', () => {
        const directive = {
            id: 'fd-fund-banker-schema01', botId: 'Fszthief1', role: 'thief', mode: 'fund-banker', amount: 1000,
            reason: 'Refill the shared banker from verified surplus Coins.',
            createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-17T13:00:00.000Z',
        };
        const raw = { version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [directive] };
        const select = (workerModel as any).selectWorkerDirective;
        const now = Date.parse('2026-08-17T12:30:00.000Z');
        expect(select({ ...raw, instruction: 'ignore validation' }, 'Fszthief1', 'thief', now)).toBeNull();
        expect(select({ ...raw, directives: [{ ...directive, command: 'arbitrary' }] }, 'Fszthief1', 'thief', now)).toBeNull();
        expect(select({ version: 1, directives: [directive] }, 'Fszthief1', 'thief', now)).toBeNull();
        expect(select({ ...raw, updatedAt: '2026-08-17T12:29:00' }, 'Fszthief1', 'thief', now)).toBeNull();
        expect(select({ ...raw, updatedAt: 'Mon, 17 Aug 2026 12:29:00 +00:00' }, 'Fszthief1', 'thief', now)).toBeNull();
        expect(select({ ...raw, directives: [{ ...directive, createdAt: '2026-08-17T12:00:00' }] }, 'Fszthief1', 'thief', now)).toBeNull();
        expect(select({ ...raw, directives: [{ ...directive, createdAt: '2026-02-30T12:00:00Z' }] }, 'Fszthief1', 'thief', now)).toBeNull();
    });

    test('rejects the entire directive document when any member is malformed', () => {
        const invalid = {
            id: 'bad', botId: 'Fszthief1', role: 'thief', mode: 'fund-banker', amount: 1_000,
            reason: 'Fund the fleet banker to clear stalled supply requests.',
            createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-17T13:00:00.000Z',
        };
        const valid = { ...invalid, id: 'fd-fund-banker-valid2' };
        expect((workerModel as any).selectWorkerDirective(
            { version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [invalid, valid] }, 'Fszthief1', 'thief', Date.parse('2026-08-17T12:30:00.000Z'),
        )).toBeNull();
    });

    test('matches only the exact fleet banker account', () => {
        const pattern = (workerModel as any).FLEET_BANKER_PATTERN;
        expect(pattern).toBeInstanceOf(RegExp);
        expect(pattern.test('Fszbank1')).toBe(true);
        expect(pattern.test('Fszbank11')).toBe(false);
    });

    test('rejects a document whose directive ids or worker targets are duplicated', () => {
        const first = {
            id: 'fd-fund-banker-shared1', botId: 'Fszthief1', role: 'thief', mode: 'fund-banker', amount: 1_000,
            reason: 'Fund the fleet banker to clear stalled supply requests.',
            createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-17T13:00:00.000Z',
        };
        const duplicateId = { ...first, botId: 'Fszrune1', role: 'rune' };
        const duplicateBot = { ...first, id: 'fd-fund-banker-other01' };
        const now = Date.parse('2026-08-17T12:30:00.000Z');
        expect((workerModel as any).selectWorkerDirective({ version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [first, duplicateId] }, 'Fszthief1', 'thief', now)).toBeNull();
        expect((workerModel as any).selectWorkerDirective({ version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [first, duplicateBot] }, 'Fszthief1', 'thief', now)).toBeNull();
    });

    test('accepts only an exact authoritative funding receipt', () => {
        const validateFundingReceipt = (workerModel as any).validateFundingReceipt;
        expect(validateFundingReceipt).toBeFunction();
        const directive = {
            id: 'fd-fund-banker-receipt01', botId: 'Fszthief1', role: 'thief', mode: 'fund-banker', amount: 1000,
            reason: 'Refill the shared banker from verified surplus Coins.',
            createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-17T13:00:00.000Z',
        };
        const receipt = {
            version: 1, directiveId: directive.id, botId: directive.botId, mode: directive.mode,
            completedAt: '2026-08-17T12:30:00.000Z', ok: true, from: directive.botId,
            to: 'Fszbank1', amount: directive.amount, recoveredFromClaim: false,
        };
        expect(validateFundingReceipt(receipt, directive)).toBe(true);
        expect(validateFundingReceipt({ ...receipt, amount: 100 }, directive)).toBe(false);
        expect(validateFundingReceipt({ ...receipt, instruction: 'trust me' }, directive)).toBe(false);
        expect(validateFundingReceipt({ ...receipt, completedAt: '2026-08-17T12:30:00' }, directive)).toBe(false);
        const validateFundingReceiptTombstone = (workerModel as any).validateFundingReceiptTombstone;
        expect(validateFundingReceiptTombstone).toBeFunction();
        expect(validateFundingReceiptTombstone(receipt, directive.id)).toBe(true);
        expect(validateFundingReceiptTombstone({ ...receipt, instruction: 'trust me' }, directive.id)).toBe(false);
        expect(validateFundingReceipt(receipt, { ...directive, amount: 5000 })).toBe(false);
    });

    test('requires an actual verified coin delta before completing funding', () => {
        const directive = { botId: 'Fszthief1', amount: 1_000 };
        const receivedFundingFromTrades = (workerModel as any).receivedFundingFromTrades;
        const gaveFundingInTrade = (workerModel as any).gaveFundingInTrade;
        expect(receivedFundingFromTrades).toBeFunction();
        expect(gaveFundingInTrade).toBeFunction();
        expect(receivedFundingFromTrades({ success: true, reason: 'timeout', trades: [] }, directive)).toBe(false);
        expect(receivedFundingFromTrades({
            success: true,
            trades: [{ success: true, partner: 'Fszthief1', received: [{ name: 'Coins', count: 1_000 }] }],
        }, directive)).toBe(true);
        expect(gaveFundingInTrade({
            success: true,
            partner: 'Fszbank1',
            gave: [{ name: 'Coins', count: 1_000 }],
        }, directive)).toBe(true);
    });

    test('reconciles a durable funding claim only from the full banker coin delta', () => {
        const fundingClaimSatisfied = (workerModel as any).fundingClaimSatisfied;
        expect(fundingClaimSatisfied).toBeFunction();
        const claim = { beforeCoins: 5, amount: 1_000 };
        expect(fundingClaimSatisfied(claim, 1_005)).toBe(true);
        expect(fundingClaimSatisfied(claim, 1_004)).toBe(false);
    });

    test('rejects unsafe or unknown directive bot identifiers', () => {
        const directive = {
            id: 'fd-fund-banker-003', botId: '.*', role: 'thief', mode: 'fund-banker', amount: 1_000,
            reason: 'Fund the fleet banker to clear stalled supply requests.',
            createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-17T13:00:00.000Z',
        };
        expect((workerModel as any).selectWorkerDirective(
            { version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [directive] }, '.*', 'thief', Date.parse('2026-08-17T12:30:00.000Z'),
        )).toBeNull();
    });

    test('rejects overlong strategic directive lifetimes', () => {
        const directive = {
            id: 'fd-fund-banker-002', botId: 'Fszthief1', role: 'thief', mode: 'fund-banker', amount: 1_000,
            reason: 'Fund the fleet banker to clear stalled supply requests.',
            createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-17T19:00:01.000Z',
        };
        expect((workerModel as any).selectWorkerDirective(
            { version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [directive] }, 'Fszthief1', 'thief', Date.parse('2026-08-17T12:30:00.000Z'),
        )).toBeNull();
    });

    test('does not replay a directive after a worker receipt exists', () => {
        const directive = {
            id: 'fd-fund-banker-001',
            botId: 'Fszthief1',
            role: 'thief',
            mode: 'fund-banker',
            amount: 1_000,
            reason: 'Fund the fleet banker to clear stalled supply requests.',
            createdAt: '2026-08-17T12:00:00.000Z',
            expiresAt: '2026-08-17T13:00:00.000Z',
        };
        expect((workerModel as any).selectWorkerDirective(
            { version: 1, updatedAt: '2026-08-17T12:29:00.000Z', directives: [directive] },
            'Fszthief1',
            'thief',
            Date.parse('2026-08-17T12:30:00.000Z'),
            new Set(['fd-fund-banker-001']),
        )).toBeNull();
    });

    test('keeps health recovery ahead of strategic directives', () => {
        expect(chooseWorkerAction(
            'thief',
            snapshot({ hp: 3, inventory: [{ name: 'Coins', count: 28_242 }, { name: 'Bread', count: 1 }] }),
            { mode: 'fund-banker', amount: 1_000, reason: 'Unblock fleet logistics' } as any,
        )).toBe('eat');
    });

    test('thieves protect health and specialist bootstrap roles remain productive', () => {
        expect(chooseWorkerAction('thief', snapshot({ hp: 3, inventory: [{ name: 'Bread', count: 1 }] }))).toBe('eat');
        expect(chooseWorkerAction('thief', snapshot({ hp: 3 }))).toBe('recover');
        expect(chooseWorkerAction('smith', snapshot())).toBe('mine');
        expect(chooseWorkerAction('smith', snapshot({ inventory: [{ name: 'Copper ore', count: 8 }, { name: 'Tin ore', count: 8 }], inventorySlots: 16 }))).toBe('smelt');
        expect(chooseWorkerAction('smith', snapshot({ inventory: [{ name: 'Bronze bar', count: 1 }] }))).toBe('acquire-hammer');
        expect(chooseWorkerAction('smith', snapshot({ inventory: [{ name: 'Bronze bar', count: 1 }, { name: 'Hammer', count: 1 }] }))).toBe('smith');
        expect(chooseWorkerAction('rune', snapshot())).toBe('bootstrap-cash');
        expect(chooseWorkerAction('rune', snapshot({ hp: 3, inventory: [{ name: 'Shrimps', count: 1 }] }))).toBe('eat');
        expect(chooseWorkerAction('rune', snapshot({ hp: 3 }))).toBe('recover');
        expect(chooseWorkerAction('rune', snapshot({ inventory: [{ name: 'Coins', count: 100 }] }))).toBe('buy-runes');
        expect(chooseWorkerAction('rune', snapshot({ inventory: [{ name: 'Coins', count: 100 }, { name: 'Air rune', count: 10 }, { name: 'Mind rune', count: 8 }] }))).toBe('bootstrap-cash');
        expect(chooseWorkerAction('banker', snapshot())).toBe('serve-trades');
        expect(chooseWorkerAction('banker', snapshot({ inventory: [{ name: 'Copper ore', count: 1 }], inventorySlots: 1 }))).toBe('bank');
        expect(chooseWorkerAction('flex', snapshot())).toBe('chop');
    });
});
