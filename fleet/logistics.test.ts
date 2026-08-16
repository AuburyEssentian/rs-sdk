import { describe, expect, test } from 'bun:test';
import { buildOreTransferPlan } from './logistics';

describe('fleet logistics plan', () => {
    test('routes each present ore type to the fleet banker exactly once', () => {
        const plan = buildOreTransferPlan([
            { name: 'Copper ore', count: 1 },
            { name: 'Copper ore', count: 1 },
            { name: 'Tin ore', count: 1 },
            { name: 'Bronze pickaxe', count: 1 },
        ]);
        expect(plan.target).toBe('Fszbank1');
        expect(plan.give).toEqual([
            { item: 'Copper ore', amount: -1 },
            { item: 'Tin ore', amount: -1 },
        ]);
    });

    test('does not invent absent material offers', () => {
        expect(buildOreTransferPlan([{ name: 'Tin ore', count: 4 }]).give).toEqual([
            { item: 'Tin ore', amount: -1 },
        ]);
    });
});
