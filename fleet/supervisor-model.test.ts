import { describe, expect, test } from 'bun:test';
import { buildFleetChildSpecs, reconcileFleetChildSpecs, restartDelayMs, validateFleetCapacity, type SupervisorBot } from './supervisor-model';

const bots: SupervisorBot[] = [
    { id: 'FSZ6yjrsA', clientMode: 'browser', controller: 'bots/FSZ6yjrsA/autoplay.ts' },
    { id: 'Fszminer1', clientMode: 'lite', controller: 'bots/Fszminer1/miner.ts' },
    { id: 'Fszwood1', clientMode: 'lite', controller: 'fleet/worker.ts', role: 'Woodcutting and firemaking', roleKey: 'wood' },
];

describe('fleet supervisor model', () => {
    test('builds one client and one controller child per Lite account only', () => {
        const specs = buildFleetChildSpecs(bots, '/repo');
        expect(specs.map(spec => spec.key)).toEqual([
            'Fszminer1:client', 'Fszminer1:controller',
            'Fszwood1:client', 'Fszwood1:controller',
        ]);
        expect(specs[0]).toMatchObject({ cwd: '/repo/server/webclient', command: ['/opt/homebrew/bin/bun', 'src/lite/runner.ts', 'Fszminer1'] });
        expect(specs[1].command).toEqual(['/opt/homebrew/bin/bun', 'bots/Fszminer1/miner.ts']);
        expect(specs[3].command).toEqual(['/opt/homebrew/bin/bun', 'fleet/worker.ts', 'Fszwood1', 'wood']);
    });

    test('backs off repeated crashes but caps recovery delay', () => {
        expect(restartDelayMs(0)).toBe(5_000);
        expect(restartDelayMs(3)).toBe(40_000);
        expect(restartDelayMs(99)).toBe(60_000);
    });

    test('diffs manifest changes without disturbing unchanged children', () => {
        const current = buildFleetChildSpecs(bots, '/repo');
        const desired = buildFleetChildSpecs([
            bots[0],
            bots[1],
            { id: 'Fszfish1', clientMode: 'lite', controller: 'fleet/worker.ts', roleKey: 'fish' },
        ], '/repo');
        const diff = reconcileFleetChildSpecs(current, desired);
        expect(diff.add.map(spec => spec.key)).toEqual(['Fszfish1:client', 'Fszfish1:controller']);
        expect(diff.remove.map(spec => spec.key)).toEqual(['Fszwood1:client', 'Fszwood1:controller']);
        expect(diff.replace).toEqual([]);
    });

    test('restarts only a child whose command changed', () => {
        const current = buildFleetChildSpecs([bots[2]], '/repo');
        const desired = buildFleetChildSpecs([{ ...bots[2], roleKey: 'flex' }], '/repo');
        const diff = reconcileFleetChildSpecs(current, desired);
        expect(diff.replace.map(spec => spec.key)).toEqual(['Fszwood1:controller']);
        expect(diff.add).toEqual([]);
        expect(diff.remove).toEqual([]);
    });

    test('enforces the hard active and total account cap', () => {
        expect(validateFleetCapacity(bots, 20)).toEqual({ ok: true, active: 3, total: 3 });
        const twentyOne = Array.from({ length: 21 }, (_, index) => ({
            id: `Fsz${index}`,
            clientMode: 'lite' as const,
            controller: 'fleet/worker.ts',
        }));
        expect(validateFleetCapacity(twentyOne, 20).ok).toBe(false);
        expect(validateFleetCapacity([...twentyOne.slice(0, 20), { ...twentyOne[20], enabled: false }], 20).ok).toBe(false);
    });
});
