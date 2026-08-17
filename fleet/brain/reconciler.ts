import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import {
    ALLOWED_ROLE_KEYS,
    canAcceptReviewOrder,
    canAdvanceRecovery,
    canProcessWorkOrderId,
    canRestartController,
    canScaleFleet,
    supervisorVerificationSucceeded,
    validateWorkOrder,
    type FleetRoleKey,
    type FleetValidationContext,
    type RecentReviewOrder,
    type RecoveryAttempt,
    type WorkOrder,
    type WorkOrderAction,
} from './reconciler-model';
import { buildFleetChildSpecs, type SupervisorBot } from '../supervisor-model';

const BRAIN_DIR = import.meta.dir;
const REPO_ROOT = join(BRAIN_DIR, '..', '..');
const RUNTIME_DIR = join(BRAIN_DIR, 'runtime');
const PENDING_DIR = join(RUNTIME_DIR, 'work-orders', 'pending');
const COMPLETED_DIR = join(RUNTIME_DIR, 'work-orders', 'completed');
const REJECTED_DIR = join(RUNTIME_DIR, 'work-orders', 'rejected');
const STATUS_PATH = join(RUNTIME_DIR, 'reconciler-status.json');
const PRIVATE_STATE_DIR = process.env.FLEET_PRIVATE_STATE_DIR ?? join(homedir(), '.hermes', 'fleetbrain-worker-state');
const STATE_PATH = join(PRIVATE_STATE_DIR, 'reconciler-state.json');
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
    recentOrders: RecentReviewOrder[];
    recovery: Record<string, RecoveryAttempt>;
    processedOrderIds: string[];
}

async function readJson(path: string): Promise<any | null> {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch {
        return null;
    }
}

async function atomicJson(path: string, value: unknown, mode = 0o600): Promise<void> {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode });
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
    const sourceName = basename(path);
    let target = join(destination, sourceName);
    try {
        await lstat(target);
        const stem = sourceName.endsWith('.json') ? sourceName.slice(0, -5) : sourceName;
        target = join(destination, `${stem}.${randomUUID()}.json`);
    } catch {}
    await rename(path, target).catch(async () => {
        await writeFile(target, `${JSON.stringify(order, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
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
        ? {
            lastRestartAt: raw.lastRestartAt ?? {},
            lastScaleAt: raw.lastScaleAt,
            recentOrders: Array.isArray(raw.recentOrders) ? raw.recentOrders : [],
            recovery: raw.recovery && typeof raw.recovery === 'object' ? raw.recovery : {},
            processedOrderIds: Array.isArray(raw.processedOrderIds)
                ? [...new Set<string>(raw.processedOrderIds.filter((id: unknown): id is string => typeof id === 'string' && /^wo-[a-z0-9][a-z0-9-]{7,79}$/.test(id)))]
                : [],
        }
        : { lastRestartAt: {}, recentOrders: [], recovery: {}, processedOrderIds: [] };
}

function runningChildren(supervisor: any, botId: string, kinds: Array<'client' | 'controller'>): any[] {
    return (supervisor?.children ?? []).filter((candidate: any) =>
        candidate.botId === botId
        && kinds.includes(candidate.kind)
        && candidate.running === true
        && Number.isInteger(candidate.pid));
}

async function processCommand(pid: number): Promise<string> {
    const child = Bun.spawn({ cmd: ['/bin/ps', '-p', String(pid), '-o', 'command='], stdout: 'pipe', stderr: 'ignore' });
    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return exitCode === 0 ? stdout.trim() : '';
}

async function signalLifecycle(supervisor: any, manifest: any, botId: string, kinds: Array<'client' | 'controller'>): Promise<Record<string, number>> {
    const supervisorAt = Date.parse(supervisor?.updatedAt ?? '');
    if (!Number.isFinite(supervisorAt) || Date.now() - supervisorAt < 0 || Date.now() - supervisorAt > 15_000) {
        throw new Error('supervisor status is not fresh enough for PID signalling');
    }
    const children = runningChildren(supervisor, botId, kinds);
    if (children.length !== kinds.length) throw new Error(`supervisor does not have all requested running children: ${kinds.join(',')}`);
    const expectedSpecs = buildFleetChildSpecs((manifest?.bots ?? []) as SupervisorBot[], REPO_ROOT);
    const pids: Record<string, number> = {};
    for (const kind of ['controller', 'client'] as const) {
        if (!kinds.includes(kind)) continue;
        const child = children.find(candidate => candidate.kind === kind);
        const expected = expectedSpecs.find(spec => spec.key === `${botId}:${kind}`);
        const command = await processCommand(child.pid);
        if (!expected || command !== expected.command.join(' ')) throw new Error(`refusing to signal PID ${child.pid}: process command does not match ${botId}:${kind}`);
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
    if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > 16_384) {
        await archive(path, REJECTED_DIR, null, { ok: false, error: 'work order must be a regular file no larger than 16 KiB' });
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
    const now = Date.now();
    if (!canProcessWorkOrderId(state.processedOrderIds, typed.id)) {
        const error = 'work-order id has already been processed';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ phase: 'idle', lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }
    // Reserve every valid ID before any policy decision or side effect. Rejected IDs
    // remain immutable tombstones so a later payload cannot reuse the identity.
    state.processedOrderIds = [...state.processedOrderIds, typed.id];
    await atomicJson(STATE_PATH, state, 0o600);
    const isScale = typed.action === 'add_account' || typed.action === 'remove_account';
    const isReactivation = typed.action === 'add_account' && context.disabledLiteBots?.has(typed.botId);
    if (!canAcceptReviewOrder(state.recentOrders, typed.botId, now)) {
        const error = 'five-minute review budget allows at most three distinct account targets';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }
    if (isScale && !isReactivation && !canScaleFleet(state.lastScaleAt, now, SCALE_COOLDOWN_MS)) {
        const error = 'fleet scale action is inside the fifteen-minute cooldown';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }
    if (!isScale && !canRestartController(state.lastRestartAt[typed.botId], now, RESTART_COOLDOWN_MS)) {
        const error = 'account lifecycle restart is inside the five-minute cooldown';
        await archive(path, REJECTED_DIR, typed, { ok: false, error });
        await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
        return true;
    }
    if (!isScale) {
        const definition = (manifest?.bots ?? []).find((candidate: any) => candidate.id === typed.botId);
        const status = definition?.statusPath ? await readJson(join(REPO_ROOT, definition.statusPath)) : null;
        if (!canAdvanceRecovery(typed.action as RecoveryAttempt['action'], state.recovery[typed.botId], status?.updatedAt)) {
            const error = 'stale lifecycle recovery must escalate client -> controller -> full account';
            await archive(path, REJECTED_DIR, typed, { ok: false, error });
            await publishStatus({ lastResult: 'rejected', lastError: error, lastWorkOrderId: typed.id });
            return true;
        }
    }

    const acceptedAt = new Date(now).toISOString();
    state.recentOrders = state.recentOrders.filter(entry => {
        const parsed = Date.parse(entry.acceptedAt);
        return Number.isFinite(parsed) && now - parsed >= 0 && now - parsed < 5 * 60_000;
    });
    state.recentOrders.push({ botId: typed.botId, acceptedAt });
    if (isScale) {
        state.lastScaleAt = acceptedAt;
    } else {
        state.lastRestartAt[typed.botId] = acceptedAt;
        state.recovery[typed.botId] = { action: typed.action as RecoveryAttempt['action'], attemptedAt: acceptedAt };
    }
    await atomicJson(STATE_PATH, state);

    try {
        let details: Record<string, unknown>;
        if (isScale) {
            details = await applyScaleAction(typed, manifest);
        } else {
            const kinds: Array<'client' | 'controller'> = typed.action === 'restart_controller'
                ? ['controller']
                : typed.action === 'restart_client' ? ['client'] : ['client', 'controller'];
            const previousPids = await signalLifecycle(supervisor, manifest, typed.botId, kinds);
            const verified = await waitForSupervisor(typed.botId, true, previousPids);
            details = { previousPids, supervisorVerified: verified };
        }
        if (!supervisorVerificationSucceeded(details)) throw new Error('post-action supervisor verification failed');
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
await mkdir(PRIVATE_STATE_DIR, { recursive: true, mode: 0o700 });
const privateStateInfo = await lstat(PRIVATE_STATE_DIR);
if (!privateStateInfo.isDirectory() || privateStateInfo.isSymbolicLink()) throw new Error('private reconciler state path must be a regular directory');
await chmod(PRIVATE_STATE_DIR, 0o700);
await publishStatus({ phase: 'starting', lastResult: 'starting', lastError: null });
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
