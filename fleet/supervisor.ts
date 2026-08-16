import { closeSync, mkdirSync, openSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildFleetChildSpecs, restartDelayMs, type FleetChildSpec, type SupervisorBot } from './supervisor-model';

const ROOT = '/Users/aubury/.hermes/agent-games/rs-sdk';
const MANIFEST_PATH = join(ROOT, 'fleet.json');
const STATUS_PATH = join(ROOT, 'fleet', 'supervisor-status.json');
const DRY_RUN = process.argv.includes('--dry-run');

interface ChildRuntime {
    spec: FleetChildSpec;
    process: ChildProcess | null;
    crashCount: number;
    lastStartedAt: string | null;
    lastExit: { at: string; code: number | null; signal: string | null } | null;
    restartAt: string | null;
    restartTimer: ReturnType<typeof setTimeout> | null;
}

let stopping = false;
const runtimes = new Map<string, ChildRuntime>();

async function loadBots(): Promise<SupervisorBot[]> {
    const manifest = JSON.parse(await Bun.file(MANIFEST_PATH).text()) as { bots?: SupervisorBot[] };
    return manifest.bots ?? [];
}

async function writeStatus(): Promise<void> {
    const payload = {
        updatedAt: new Date().toISOString(),
        pid: process.pid,
        stopping,
        children: [...runtimes.values()].map(runtime => ({
            key: runtime.spec.key,
            botId: runtime.spec.botId,
            kind: runtime.spec.kind,
            pid: runtime.process?.pid ?? null,
            running: Boolean(runtime.process && runtime.process.exitCode === null),
            crashCount: runtime.crashCount,
            lastStartedAt: runtime.lastStartedAt,
            lastExit: runtime.lastExit,
            restartAt: runtime.restartAt,
        })),
    };
    const tmp = `${STATUS_PATH}.tmp`;
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`);
    await rename(tmp, STATUS_PATH);
}

function launch(runtime: ChildRuntime): void {
    if (stopping || runtime.process) return;
    const spec = runtime.spec;
    mkdirSync(dirname(spec.stdoutPath), { recursive: true });
    const stdoutFd = openSync(spec.stdoutPath, 'a');
    const stderrFd = openSync(spec.stderrPath, 'a');
    const startedAt = Date.now();
    runtime.lastStartedAt = new Date(startedAt).toISOString();
    runtime.restartAt = null;

    const child = spawn(spec.command[0], spec.command.slice(1), {
        cwd: spec.cwd,
        env: { ...process.env, FLEET_SUPERVISED: '1' },
        stdio: ['ignore', stdoutFd, stderrFd],
    });
    runtime.process = child;
    console.log(`[fleet] started ${spec.key} pid=${child.pid}`);
    void writeStatus();

    child.once('exit', (code, signal) => {
        closeSync(stdoutFd);
        closeSync(stderrFd);
        runtime.process = null;
        runtime.lastExit = { at: new Date().toISOString(), code, signal };
        const uptime = Date.now() - startedAt;
        runtime.crashCount = uptime >= 5 * 60_000 ? 0 : runtime.crashCount + 1;
        console.log(`[fleet] exited ${spec.key} code=${code} signal=${signal} uptimeMs=${uptime}`);
        if (!stopping) {
            const delay = restartDelayMs(runtime.crashCount - 1);
            runtime.restartAt = new Date(Date.now() + delay).toISOString();
            runtime.restartTimer = setTimeout(() => {
                runtime.restartTimer = null;
                launch(runtime);
            }, delay);
        }
        void writeStatus();
    });
}

async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    console.log(`[fleet] ${signal}; stopping children`);
    for (const runtime of runtimes.values()) {
        if (runtime.restartTimer) clearTimeout(runtime.restartTimer);
        runtime.restartTimer = null;
        runtime.process?.kill('SIGTERM');
    }
    await writeStatus();
    setTimeout(() => {
        for (const runtime of runtimes.values()) runtime.process?.kill('SIGKILL');
        process.exit(0);
    }, 10_000).unref();
    const check = setInterval(() => {
        if ([...runtimes.values()].every(runtime => !runtime.process)) {
            clearInterval(check);
            process.exit(0);
        }
    }, 100);
}

const bots = await loadBots();
const specs = buildFleetChildSpecs(bots, ROOT);
if (DRY_RUN) {
    console.log(JSON.stringify(specs, null, 2));
    process.exit(0);
}
if (!specs.length) throw new Error('No enabled Lite accounts found in fleet.json');
mkdirSync(dirname(STATUS_PATH), { recursive: true });
for (const spec of specs) {
    runtimes.set(spec.key, {
        spec,
        process: null,
        crashCount: 0,
        lastStartedAt: null,
        lastExit: null,
        restartAt: null,
        restartTimer: null,
    });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
setInterval(() => void writeStatus(), 15_000).unref();
await writeStatus();

let delay = 0;
for (const runtime of runtimes.values()) {
    setTimeout(() => launch(runtime), delay);
    delay += 800;
}
console.log(`[fleet] supervising ${specs.length} children for ${specs.length / 2} Lite accounts`);
await new Promise(() => undefined);
