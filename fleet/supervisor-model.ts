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
