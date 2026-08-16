import { closeSync, mkdirSync, openSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
    buildFleetChildSpecs,
    reconcileFleetChildSpecs,
    restartDelayMs,
    validateFleetCapacity,
    type FleetChildSpec,
    type SupervisorBot,
} from './supervisor-model';

const ROOT = '/Users/aubury/.hermes/agent-games/rs-sdk';
const MANIFEST_PATH = join(ROOT, 'fleet.json');
const STATUS_PATH = join(ROOT, 'fleet', 'supervisor-status.json');
const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_MAX_ACCOUNTS = 20;

interface FleetManifest {
    version?: number;
    limits?: { maxAccounts?: number; protectedAccounts?: string[] };
    bots?: SupervisorBot[];
}

interface ChildRuntime {
    spec: FleetChildSpec;
    process: ChildProcess | null;
    desired: boolean;
    replacementSpec: FleetChildSpec | null;
    crashCount: number;
    lastStartedAt: string | null;
    lastExit: { at: string; code: number | null; signal: string | null } | null;
    restartAt: string | null;
    restartTimer: ReturnType<typeof setTimeout> | null;
}

let stopping = false;
let manifestVersion: number | null = null;
let maxAccounts = DEFAULT_MAX_ACCOUNTS;
let activeAccounts = 0;
let totalAccounts = 0;
let manifestError: string | null = null;
let lastReconciledAt: string | null = null;
const runtimes = new Map<string, ChildRuntime>();

async function loadManifest(): Promise<{ manifest: FleetManifest; bots: SupervisorBot[]; maxAccounts: number }> {
    const manifest = JSON.parse(await Bun.file(MANIFEST_PATH).text()) as FleetManifest;
    const bots = manifest.bots ?? [];
    const configuredMax = Number(manifest.limits?.maxAccounts ?? DEFAULT_MAX_ACCOUNTS);
    const capacity = validateFleetCapacity(bots, configuredMax);
    if (!capacity.ok) throw new Error(capacity.error);
    return { manifest, bots, maxAccounts: configuredMax };
}

async function writeStatus(): Promise<void> {
    const payload = {
        updatedAt: new Date().toISOString(),
        pid: process.pid,
        stopping,
        manifestVersion,
        manifestError,
        lastReconciledAt,
        limits: { maxAccounts, activeAccounts, totalAccounts },
        children: [...runtimes.values()].map(runtime => ({
            key: runtime.spec.key,
            botId: runtime.spec.botId,
            kind: runtime.spec.kind,
            pid: runtime.process?.pid ?? null,
            running: Boolean(runtime.process && runtime.process.exitCode === null),
            desired: runtime.desired,
            replacing: Boolean(runtime.replacementSpec),
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

function scheduleLaunch(runtime: ChildRuntime, delayMs: number): void {
    if (stopping || !runtime.desired || runtime.process || runtime.restartTimer) return;
    runtime.restartAt = new Date(Date.now() + delayMs).toISOString();
    runtime.restartTimer = setTimeout(() => {
        runtime.restartTimer = null;
        launch(runtime);
    }, delayMs);
}

function installReplacement(runtime: ChildRuntime): void {
    const replacement = runtime.replacementSpec;
    runtimes.delete(runtime.spec.key);
    if (replacement && !stopping) addRuntime(replacement, replacement.kind === 'client' ? 0 : 5_000);
}

function launch(runtime: ChildRuntime): void {
    if (stopping || !runtime.desired || runtime.process) return;
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
        console.log(`[fleet] exited ${spec.key} code=${code} signal=${signal} uptimeMs=${uptime} desired=${runtime.desired}`);
        if (!runtime.desired || stopping) {
            installReplacement(runtime);
        } else {
            const delay = restartDelayMs(runtime.crashCount - 1);
            scheduleLaunch(runtime, delay);
        }
        void writeStatus();
    });
}

function addRuntime(spec: FleetChildSpec, delayMs: number): void {
    if (stopping || runtimes.has(spec.key)) return;
    const runtime: ChildRuntime = {
        spec,
        process: null,
        desired: true,
        replacementSpec: null,
        crashCount: 0,
        lastStartedAt: null,
        lastExit: null,
        restartAt: null,
        restartTimer: null,
    };
    runtimes.set(spec.key, runtime);
    scheduleLaunch(runtime, delayMs);
}

function retireRuntime(runtime: ChildRuntime, replacementSpec: FleetChildSpec | null = null): void {
    runtime.desired = false;
    runtime.replacementSpec = replacementSpec;
    if (runtime.restartTimer) clearTimeout(runtime.restartTimer);
    runtime.restartTimer = null;
    runtime.restartAt = null;
    if (runtime.process) runtime.process.kill('SIGTERM');
    else installReplacement(runtime);
}

async function reconcileManifest(): Promise<void> {
    if (stopping) return;
    try {
        const loaded = await loadManifest();
        const desired = buildFleetChildSpecs(loaded.bots, ROOT);
        const current = [...runtimes.values()].map(runtime => runtime.spec);
        const diff = reconcileFleetChildSpecs(current, desired);
        const desiredByKey = new Map(desired.map(spec => [spec.key, spec]));

        for (const spec of diff.remove) {
            const runtime = runtimes.get(spec.key);
            if (runtime) retireRuntime(runtime);
        }
        for (const spec of diff.replace) {
            const runtime = runtimes.get(spec.key);
            if (runtime) retireRuntime(runtime, desiredByKey.get(spec.key) ?? spec);
        }
        for (const spec of diff.add) addRuntime(spec, spec.kind === 'client' ? 0 : 5_000);

        manifestVersion = loaded.manifest.version ?? null;
        maxAccounts = loaded.maxAccounts;
        activeAccounts = loaded.bots.filter(bot => bot.enabled !== false).length;
        totalAccounts = loaded.bots.length;
        manifestError = null;
        lastReconciledAt = new Date().toISOString();
        if (diff.add.length || diff.remove.length || diff.replace.length) {
            console.log(`[fleet] manifest reconciled add=${diff.add.length} remove=${diff.remove.length} replace=${diff.replace.length}`);
        }
        await writeStatus();
    } catch (error: any) {
        manifestError = error?.message ?? String(error);
        console.error(`[fleet] manifest reconciliation rejected: ${manifestError}`);
        await writeStatus();
    }
}

async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    console.log(`[fleet] ${signal}; stopping children`);
    for (const runtime of runtimes.values()) {
        runtime.desired = false;
        runtime.replacementSpec = null;
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

if (DRY_RUN) {
    const loaded = await loadManifest();
    console.log(JSON.stringify(buildFleetChildSpecs(loaded.bots, ROOT), null, 2));
    process.exit(0);
}

mkdirSync(dirname(STATUS_PATH), { recursive: true });
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
setInterval(() => void writeStatus(), 15_000).unref();
setInterval(() => void reconcileManifest(), 5_000).unref();
await reconcileManifest();
console.log(`[fleet] dynamic manifest supervisor active; maxAccounts=${maxAccounts}`);
await new Promise(() => undefined);
