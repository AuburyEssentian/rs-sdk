import { chmod, lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
    ALLOWED_ROLE_KEYS,
    canRestartController,
    canScaleFleet,
    validateWorkOrder,
    type FleetRoleKey,
    type FleetValidationContext,
    type WorkOrder,
    type WorkOrderAction,
} from './reconciler-model';

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
const RESTART_COOLDOWN_MS = 5 * 60_000;
const SCALE_COOLDOWN_MS = 15 * 60_000;
const HARD_MAX_ACCOUNTS = 20;
const PROTECTED_ACCOUNT = 'FSZ6yjrsA';
const ACTIONS: WorkOrderAction[] = ['restart_controller', 'restart_client', 'restart_account', 'add_account', 'remove_account'];

const ROLE_LABELS: Record<FleetRoleKey, string> = {
    smith: 'Smithing and metalwork',
    fish: 'Fishing supplier',
    cook: 'Cooking and food logistics',
    wood: 'Woodcutting and firemaking',
    thief: 'Thieving and cash generation',
    rune: 'Runecrafting and Magic supplies',
    banker: 'Banking and trade logistics',
    flex: 'Flexible bottleneck worker',
};

interface ReconcilerState {
    lastRestartAt: Record<string, string>;
    lastScaleAt?: string;
}

async function readJson(path: string): Promise<any | null> {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch {
        return null;
    }
}

async function atomicJson(path: string, value: unknown, mode = 0o600): Promise<void> {
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
    await rename(tmp, path);
}

async function publishStatus(overrides: Record<string, unknown> = {}): Promise<void> {
    const previous = await readJson(STATUS_PATH) ?? {};
    await atomicJson(STATUS_PATH, {
        ...previous,
        version: 2,
        online: true,
        readOnlyDashboard: true,
        allowedActions: ACTIONS,
        hardMaxAccounts: HARD_MAX_ACCOUNTS,
        protectedAccounts: [PROTECTED_ACCOUNT],
        removalPolicy: 'disable-and-archive',
        restartCooldownMs: RESTART_COOLDOWN_MS,
        scaleCooldownMs: SCALE_COOLDOWN_MS,
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

function validationContext(manifest: any): FleetValidationContext {
    const bots = Array.isArray(manifest?.bots) ? manifest.bots : [];
    const protectedBots = new Set<string>([
        PROTECTED_ACCOUNT,
        ...(Array.isArray(manifest?.limits?.protectedAccounts) ? manifest.limits.protectedAccounts : []),
    ]);
    const maxAccounts = Math.min(HARD_MAX_ACCOUNTS, Number(manifest?.limits?.maxAccounts ?? HARD_MAX_ACCOUNTS));
    return {
        enabledLiteBots: new Set<string>(bots.filter((bot: any) => bot.enabled !== false && bot.clientMode === 'lite').map((bot: any) => bot.id)),
        disabledLiteBots: new Set<string>(bots.filter((bot: any) => bot.enabled === false && bot.clientMode === 'lite').map((bot: any) => bot.id)),
        allBotIds: new Set<string>(bots.map((bot: any) => bot.id)),
        protectedBots,
        activeAccountCount: bots.filter((bot: any) => bot.enabled !== false).length,
        totalAccountCount: bots.length,
        maxAccounts,
    };
}

function loadState(raw: any): ReconcilerState {
    return raw && typeof raw === 'object'
        ? { lastRestartAt: raw.lastRestartAt ?? {}, lastScaleAt: raw.lastScaleAt }
        : { lastRestartAt: {} };
}

function runningChildren(supervisor: any, botId: string, kinds: Array<'client' | 'controller'>): any[] {
    return (supervisor?.children ?? []).filter((candidate: any) =>
        candidate.botId === botId
        && kinds.includes(candidate.kind)
        && candidate.running === true
        && Number.isInteger(candidate.pid));
}

async function signalLifecycle(supervisor: any, botId: string, kinds: Array<'client' | 'controller'>): Promise<Record<string, number>> {
    const children = runningChildren(supervisor, botId, kinds);
    if (children.length !== kinds.length) throw new Error(`supervisor does not have all requested running children: ${kinds.join(',')}`);
    const pids: Record<string, number> = {};
    for (const kind of ['controller', 'client'] as const) {
        if (!kinds.includes(kind)) continue;
        const child = children.find(candidate => candidate.kind === kind);
        process.kill(child.pid, 0);
        process.kill(child.pid, 'SIGTERM');
        pids[kind] = child.pid;
    }
    return pids;
}

async function createCharacter(botId: string): Promise<void> {
    const process = Bun.spawn({
        cmd: ['/opt/homebrew/bin/bun', 'bots/create-bot.ts', botId, '--no-chat'],
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
        env: processEnv(),
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    const envPath = join(REPO_ROOT, 'bots', botId, 'bot.env');
    if (exitCode !== 0 || !(await Bun.file(envPath).exists())) {
        const bounded = `${stdout}\n${stderr}`.trim().slice(-500);
        throw new Error(`account bootstrap failed (exit ${exitCode}): ${bounded}`);
    }
    await chmod(envPath, 0o600);
}

function processEnv(): Record<string, string> {
    return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

async function waitForSupervisor(botId: string, shouldRun: boolean, previousPids: Record<string, number> = {}, timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const supervisor = await readJson(SUPERVISOR_PATH);
        const children = (supervisor?.children ?? []).filter((child: any) => child.botId === botId && child.running === true);
        if (!shouldRun && children.length === 0) return true;
        if (shouldRun && children.length === 2
            && children.every((child: any) => !previousPids[child.kind] || previousPids[child.kind] !== child.pid)) return true;
        await Bun.sleep(1_000);
    }
    return false;
}

async function applyScaleAction(typed: WorkOrder, manifest: any): Promise<Record<string, unknown>> {
    const bots = Array.isArray(manifest.bots) ? manifest.bots : [];
    const existing = bots.find((bot: any) => bot.id === typed.botId);
    const now = new Date().toISOString();

    if (typed.action === 'remove_account') {
        existing.enabled = false;
        existing.disabledAt = now;
        existing.disabledBy = 'fleetbrain';
        existing.disableReason = typed.reason;
        await atomicJson(MANIFEST_PATH, manifest, 0o644);
        const verified = await waitForSupervisor(typed.botId, false);
        return { active: false, archived: true, credentialsPreserved: true, supervisorVerified: verified };
    }

    const roleKey = typed.roleKey as FleetRoleKey;
    const reactivated = Boolean(existing?.enabled === false);
    if (reactivated) {
        existing.enabled = true;
        existing.roleKey = roleKey;
        existing.role = ROLE_LABELS[roleKey];
        existing.controller = 'fleet/worker.ts';
        existing.statusPath = `bots/${typed.botId}/status.json`;
        delete existing.disabledAt;
        delete existing.disabledBy;
        delete existing.disableReason;
    } else {
        await createCharacter(typed.botId);
        bots.push({
            id: typed.botId,
            role: ROLE_LABELS[roleKey],
            roleKey,
            clientMode: 'lite',
            controller: 'fleet/worker.ts',
            statusPath: `bots/${typed.botId}/status.json`,
            enabled: true,
            managedBy: 'fleetbrain',
            createdAt: now,
        });
    }
    manifest.bots = bots;
    await atomicJson(MANIFEST_PATH, manifest, 0o644);
    const verified = await waitForSupervisor(typed.botId, true);
    return { active: true, reactivated, created: !reactivated, supervisorVerified: verified };
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
        readJson(path), readJson(MANIFEST_PATH), readJson(SUPERVISOR_PATH), readJson(STATE_PATH),
    ]);
    const context = validationContext(manifest);
    const validation = validateWorkOrder(order, context);
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

    const state = loadState(rawState);
    const isScale = typed.action === 'add_account' || typed.action === 'remove_account';
    const isReactivation = typed.action === 'add_account' && context.disabledLiteBots?.has(typed.botId);
    if (isScale && !isReactivation && !canScaleFleet(state.lastScaleAt, Date.now(), SCALE_COOLDOWN_MS)) {
        const error = 'fleet scale action is inside the fifteen-minute cooldown';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }
    if (!isScale && !canRestartController(state.lastRestartAt[typed.botId], Date.now(), RESTART_COOLDOWN_MS)) {
        const error = 'account lifecycle restart is inside the five-minute cooldown';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }

    try {
        let details: Record<string, unknown>;
        if (isScale) {
            details = await applyScaleAction(typed, manifest);
            state.lastScaleAt = new Date().toISOString();
        } else {
            const kinds: Array<'client' | 'controller'> = typed.action === 'restart_controller'
                ? ['controller']
                : typed.action === 'restart_client' ? ['client'] : ['client', 'controller'];
            const previousPids = await signalLifecycle(supervisor, typed.botId, kinds);
            const verified = await waitForSupervisor(typed.botId, true, previousPids);
            details = { previousPids, supervisorVerified: verified };
            state.lastRestartAt[typed.botId] = new Date().toISOString();
        }
        await atomicJson(STATE_PATH, state);
        const freshManifest = await readJson(MANIFEST_PATH);
        const freshContext = validationContext(freshManifest);
        await archive(path, COMPLETED_DIR, typed, {
            ok: true,
            action: typed.action,
            botId: typed.botId,
            activeAccounts: freshContext.activeAccountCount,
            totalAccounts: freshContext.totalAccountCount,
            maxAccounts: freshContext.maxAccounts,
            ...details,
        });
        await publishStatus({
            lastResult: 'completed', lastError: null, lastWorkOrderId: typed.id,
            lastAction: typed.action, lastBotId: typed.botId,
            activeAccounts: freshContext.activeAccountCount, totalAccounts: freshContext.totalAccountCount,
        });
    } catch (error: any) {
        const message = error?.message ?? String(error);
        await archive(path, REJECTED_DIR, typed, { ok: false, action: typed.action, botId: typed.botId, error: message });
        await publishStatus({ lastResult: 'rejected', lastError: message, lastWorkOrderId: typed.id });
    }
    return true;
}

await Promise.all([PENDING_DIR, COMPLETED_DIR, REJECTED_DIR].map(path => mkdir(path, { recursive: true })));
await publishStatus({ phase: 'starting', lastResult: 'starting' });
console.log(`[fleetbrain-reconciler] watching ${PENDING_DIR}; actions=${ACTIONS.join(',')}; maxAccounts=${HARD_MAX_ACCOUNTS}`);

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { stopping = true; });
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
