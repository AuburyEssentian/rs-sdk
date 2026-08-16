import { join } from 'node:path';

export interface SupervisorBot {
    id: string;
    clientMode: 'browser' | 'lite';
    controller: string;
    role?: string;
    roleKey?: string;
    enabled?: boolean;
}

export interface FleetChildSpec {
    key: string;
    botId: string;
    kind: 'client' | 'controller';
    command: string[];
    cwd: string;
    stdoutPath: string;
    stderrPath: string;
}

export interface FleetChildDiff {
    add: FleetChildSpec[];
    remove: FleetChildSpec[];
    replace: FleetChildSpec[];
}

const BUN = '/opt/homebrew/bin/bun';

export function buildFleetChildSpecs(bots: SupervisorBot[], root: string): FleetChildSpec[] {
    const specs: FleetChildSpec[] = [];
    for (const bot of bots) {
        if (bot.enabled === false || bot.clientMode !== 'lite') continue;
        const logDir = join(root, 'bots', bot.id, 'logs');
        specs.push({
            key: `${bot.id}:client`,
            botId: bot.id,
            kind: 'client',
            command: [BUN, 'src/lite/runner.ts', bot.id],
            cwd: join(root, 'server', 'webclient'),
            stdoutPath: join(logDir, 'client.log'),
            stderrPath: join(logDir, 'client.err.log'),
        });
        const controllerArgs = [BUN, bot.controller];
        if (bot.controller === 'fleet/worker.ts') controllerArgs.push(bot.id, bot.roleKey ?? 'flex');
        specs.push({
            key: `${bot.id}:controller`,
            botId: bot.id,
            kind: 'controller',
            command: controllerArgs,
            cwd: root,
            stdoutPath: join(logDir, 'player.log'),
            stderrPath: join(logDir, 'player.err.log'),
        });
    }
    return specs;
}

export function restartDelayMs(crashCount: number): number {
    return Math.min(60_000, 5_000 * 2 ** Math.max(0, Math.min(crashCount, 8)));
}

function sameSpec(left: FleetChildSpec, right: FleetChildSpec): boolean {
    return left.cwd === right.cwd
        && left.stdoutPath === right.stdoutPath
        && left.stderrPath === right.stderrPath
        && left.command.length === right.command.length
        && left.command.every((value, index) => value === right.command[index]);
}

export function reconcileFleetChildSpecs(current: FleetChildSpec[], desired: FleetChildSpec[]): FleetChildDiff {
    const currentByKey = new Map(current.map(spec => [spec.key, spec]));
    const desiredByKey = new Map(desired.map(spec => [spec.key, spec]));
    return {
        add: desired.filter(spec => !currentByKey.has(spec.key)),
        remove: current.filter(spec => !desiredByKey.has(spec.key)),
        replace: desired.filter(spec => {
            const previous = currentByKey.get(spec.key);
            return Boolean(previous && !sameSpec(previous, spec));
        }),
    };
}

export function validateFleetCapacity(bots: SupervisorBot[], maxAccounts: number): { ok: boolean; active: number; total: number; error?: string } {
    const total = bots.length;
    const active = bots.filter(bot => bot.enabled !== false).length;
    if (!Number.isInteger(maxAccounts) || maxAccounts < 1) return { ok: false, active, total, error: 'invalid fleet account cap' };
    if (total > maxAccounts) return { ok: false, active, total, error: `fleet has ${total} characters, above cap ${maxAccounts}` };
    if (active > maxAccounts) return { ok: false, active, total, error: `fleet has ${active} active accounts, above cap ${maxAccounts}` };
    return { ok: true, active, total };
}
