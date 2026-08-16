import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { canRestartController, controllerRestartPrecondition, validateWorkOrder, type WorkOrder } from './reconciler-model';

const BRAIN_DIR = import.meta.dir;
const REPO_ROOT = join(BRAIN_DIR, '..', '..');
const RUNTIME_DIR = join(BRAIN_DIR, 'runtime');
const PENDING_DIR = join(RUNTIME_DIR, 'work-orders', 'pending');
const COMPLETED_DIR = join(RUNTIME_DIR, 'work-orders', 'completed');
const REJECTED_DIR = join(RUNTIME_DIR, 'work-orders', 'rejected');
const STATUS_PATH = join(RUNTIME_DIR, 'reconciler-status.json');
const STATE_PATH = join(RUNTIME_DIR, 'reconciler-state.json');
const MANIFEST_PATH = join(REPO_ROOT, 'fleet.json');
const SUPERVISOR_PATH = join(REPO_ROOT, 'fleet', 'supervisor-status.json');
const COOLDOWN_MS = 5 * 60_000;

interface ReconcilerState {
    lastRestartAt: Record<string, string>;
}

async function readJson(path: string): Promise<any | null> {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch {
        return null;
    }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, path);
}

async function publishStatus(overrides: Record<string, unknown> = {}): Promise<void> {
    const previous = await readJson(STATUS_PATH) ?? {};
    await atomicJson(STATUS_PATH, {
        ...previous,
        version: 1,
        online: true,
        readOnlyDashboard: true,
        allowedActions: ['restart_controller'],
        cooldownMs: COOLDOWN_MS,
        updatedAt: new Date().toISOString(),
        ...overrides,
    });
}

async function archive(path: string, destination: string, order: unknown, result: Record<string, unknown>): Promise<void> {
    const target = join(destination, basename(path));
    await rename(path, target).catch(async () => {
        await writeFile(target, `${JSON.stringify(order, null, 2)}\n`, { mode: 0o600 });
    });
    await atomicJson(`${target}.result.json`, {
        ...result,
        processedAt: new Date().toISOString(),
    });
}

async function processNext(): Promise<boolean> {
    const files = (await readdir(PENDING_DIR, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name)
        .sort();
    if (!files.length) return false;

    const path = join(PENDING_DIR, files[0]);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) {
        await archive(path, REJECTED_DIR, null, { ok: false, error: 'work order must be a regular file' });
        return true;
    }

    const [order, manifest, supervisor, rawState] = await Promise.all([
        readJson(path),
        readJson(MANIFEST_PATH),
        readJson(SUPERVISOR_PATH),
        readJson(STATE_PATH),
    ]);
    const knownLiteBots = new Set<string>((manifest?.bots ?? [])
        .filter((bot: any) => bot.enabled !== false && bot.clientMode === 'lite')
        .map((bot: any) => bot.id));
    const validation = validateWorkOrder(order, knownLiteBots);
    if (!validation.ok) {
        await archive(path, REJECTED_DIR, order, { ok: false, error: validation.error });
        await publishStatus({ lastResult: 'rejected', lastError: validation.error, lastWorkOrderId: order?.id ?? null });
        return true;
    }

    const typed = order as WorkOrder;
    if (basename(path) !== `${typed.id}.json`) {
        const error = 'filename must match the validated work-order id';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }

    const definition = (manifest?.bots ?? []).find((bot: any) => bot.id === typed.botId);
    const accountStatus = definition?.statusPath ? await readJson(join(REPO_ROOT, definition.statusPath)) : null;
    const precondition = controllerRestartPrecondition(accountStatus);
    if (!precondition.ok) {
        await archive(path, REJECTED_DIR, typed, { ok: false, error: precondition.error });
        await publishStatus({ lastResult: 'rejected', lastError: precondition.error, lastWorkOrderId: typed.id });
        return true;
    }

    const state: ReconcilerState = rawState && typeof rawState === 'object'
        ? { lastRestartAt: rawState.lastRestartAt ?? {} }
        : { lastRestartAt: {} };
    if (!canRestartController(state.lastRestartAt[typed.botId], Date.now(), COOLDOWN_MS)) {
        const error = 'controller restart is inside the five-minute cooldown';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }

    const child = (supervisor?.children ?? []).find((candidate: any) =>
        candidate.key === `${typed.botId}:controller`
        && candidate.kind === 'controller'
        && candidate.running === true
        && Number.isInteger(candidate.pid));
    if (!child) {
        const error = 'supervisor has no running controller matching the work order';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }

    try {
        process.kill(child.pid, 0);
        process.kill(child.pid, 'SIGTERM');
    } catch (error: any) {
        const message = `controller signal failed: ${error?.message ?? String(error)}`;
        await archive(path, REJECTED_DIR, typed, { ok: false, error: message });
        await publishStatus({ lastResult: 'rejected', lastError: message, lastWorkOrderId: typed.id });
        return true;
    }

    const restartedAt = new Date().toISOString();
    state.lastRestartAt[typed.botId] = restartedAt;
    await atomicJson(STATE_PATH, state);
    await archive(path, COMPLETED_DIR, typed, {
        ok: true,
        action: typed.action,
        botId: typed.botId,
        previousPid: child.pid,
        restartedAt,
    });
    await publishStatus({
        lastResult: 'completed',
        lastError: null,
        lastWorkOrderId: typed.id,
        lastAction: typed.action,
        lastBotId: typed.botId,
        lastControllerPid: child.pid,
    });
    return true;
}

await Promise.all([PENDING_DIR, COMPLETED_DIR, REJECTED_DIR].map(path => mkdir(path, { recursive: true })));
await publishStatus({ phase: 'starting', lastResult: 'starting' });
console.log(`[fleetbrain-reconciler] watching ${PENDING_DIR}`);

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => { stopping = true; });
}
while (!stopping) {
    try {
        while (await processNext()) {}
        await publishStatus({ phase: 'idle' });
    } catch (error: any) {
        console.error(`[fleetbrain-reconciler] ${error?.stack ?? error}`);
        await publishStatus({ lastResult: 'error', lastError: error?.message ?? String(error) }).catch(() => {});
    }
    await Bun.sleep(5_000);
}
await publishStatus({ online: false, phase: 'stopped', lastResult: 'stopped' });
