import { describe, expect, test } from 'bun:test';
import { buildFleetChildSpecs, restartDelayMs, type SupervisorBot } from './supervisor-model';

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
});
