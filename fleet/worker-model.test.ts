import { describe, expect, test } from 'bun:test';
import { chooseWorkerAction, COPPER_ROCK_IDS, roleProfile, shouldPassAlKharidToll, TIN_ROCK_IDS, type WorkerSnapshot } from './worker-model';

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
