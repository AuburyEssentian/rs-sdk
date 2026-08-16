import { open, readdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
    buildAnalytics,
    buildMilestones,
    buildTelemetryPoint,
    deriveObjective,
    isReadOnlyMethod,
    summarizeItems,
    type TelemetryPoint,
} from './model';
import { buildFleetSnapshot, type FleetBotDefinition, type FleetBotStatus } from './fleet';
import { buildBrainSnapshot } from './brain';

const DASHBOARD_DIR = import.meta.dir;
const REPO_ROOT = join(DASHBOARD_DIR, '..');
const BOT_NAME = 'FSZ6yjrsA';
const BOT_DIR = join(REPO_ROOT, 'bots', BOT_NAME);
const STATUS_PATH = join(BOT_DIR, 'status.json');
const BROWSER_HEALTH_PATH = join(BOT_DIR, 'browser-health.json');
const SCREENSHOT_PATH = join(BOT_DIR, 'live.jpg');
const PLAYER_LOG_PATH = join(BOT_DIR, 'logs', 'player.log');
const CLIENT_LOG_PATH = join(BOT_DIR, 'logs', 'client.log');
const HISTORY_PATH = join(DASHBOARD_DIR, 'history.json');
const HISTORY_TMP_PATH = join(DASHBOARD_DIR, '.history.json.tmp');
const FLEET_PATH = join(REPO_ROOT, 'fleet.json');
const LOGISTICS_PATH = join(REPO_ROOT, 'fleet', 'logistics.json');
const BRAIN_RUNTIME_PATH = join(REPO_ROOT, 'fleet', 'brain', 'runtime');
const BRAIN_STATUS_PATH = join(BRAIN_RUNTIME_PATH, 'brain-status.json');
const STRATEGY_PATH = join(BRAIN_RUNTIME_PATH, 'strategy.json');
const RECONCILER_STATUS_PATH = join(BRAIN_RUNTIME_PATH, 'reconciler-status.json');
const COSTS_PATH = join(BRAIN_RUNTIME_PATH, 'costs.json');
const PORT = Number(process.env.PORT || 8240);
const HOST = process.env.HOST || '127.0.0.1';
const startedAt = new Date().toISOString();

async function readJsonFile(path: string): Promise<any | null> {
    try {
        return await Bun.file(path).json();
    } catch {
        return null;
    }
}

async function countJsonFiles(path: string): Promise<number> {
    try {
        return (await readdir(path, { withFileTypes: true }))
            .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.result.json')).length;
    } catch {
        return 0;
    }
}

const initialHistory = await readJsonFile(HISTORY_PATH);
const telemetryHistory: TelemetryPoint[] = Array.isArray(initialHistory) ? initialHistory.slice(-10_080) : [];

async function recordTelemetry(status: any): Promise<void> {
    const point = buildTelemetryPoint(status);
    if (!point || telemetryHistory.at(-1)?.timestamp === point.timestamp) return;
    telemetryHistory.push(point);
    if (telemetryHistory.length > 10_080) telemetryHistory.splice(0, telemetryHistory.length - 10_080);
    await Bun.write(HISTORY_TMP_PATH, JSON.stringify(telemetryHistory));
    await rename(HISTORY_TMP_PATH, HISTORY_PATH);
}

async function ageMs(timestamp?: string): Promise<number | null> {
    if (!timestamp) return null;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : null;
}

async function tailFile(path: string, maxBytes = 48_000, maxLines = 120): Promise<string[]> {
    try {
        const info = await stat(path);
        const length = Math.min(info.size, maxBytes);
        const offset = Math.max(0, info.size - length);
        const handle = await open(path, 'r');
        try {
            const buffer = Buffer.alloc(length);
            await handle.read(buffer, 0, length, offset);
            let text = buffer.toString('utf8');
            if (offset > 0) text = text.slice(text.indexOf('\n') + 1);
            return text.split('\n').filter(Boolean).slice(-maxLines);
        } finally {
            await handle.close();
        }
    } catch {
        return [];
    }
}

function classifyLog(line: string): 'ok' | 'warn' | 'info' {
    if (/failed|fatal|error|timeout|stale|disconnect/i.test(line)) return 'warn';
    if (/succeeded|buried|picked up|attacked|equipped|burned|chopped|in-game/i.test(line)) return 'ok';
    return 'info';
}

async function dashboardPayload(): Promise<any> {
    const [status, browser, playerLines, clientLines, screenshotInfo] = await Promise.all([
        readJsonFile(STATUS_PATH),
        readJsonFile(BROWSER_HEALTH_PATH),
        tailFile(PLAYER_LOG_PATH, 64_000, 100),
        tailFile(CLIENT_LOG_PATH, 32_000, 40),
        stat(SCREENSHOT_PATH).catch(() => null),
    ]) as [any, any, string[], string[], Awaited<ReturnType<typeof stat>> | null];

    const fleetManifest = await readJsonFile(FLEET_PATH);
    const fleetDefinitions: FleetBotDefinition[] = Array.isArray(fleetManifest?.bots) ? fleetManifest.bots : [];
    const fleetStatusEntries = await Promise.all(fleetDefinitions.map(async definition => [
        definition.id,
        await readJsonFile(join(REPO_ROOT, definition.statusPath)),
    ] as const));
    const fleetStatuses = Object.fromEntries(fleetStatusEntries) as Record<string, FleetBotStatus | null>;
    const logistics = await readJsonFile(LOGISTICS_PATH) ?? { updatedAt: null, lastTransfer: null };
    const fleet = {
        ...buildFleetSnapshot(fleetDefinitions, fleetStatuses),
        limits: fleetManifest?.limits ?? { maxAccounts: 20, protectedAccounts: ['FSZ6yjrsA'], removalPolicy: 'disable-and-archive' },
        resourcePlan: fleetManifest?.resourcePlan ?? null,
        plannedRoles: Array.isArray(fleetManifest?.plannedRoles) ? fleetManifest.plannedRoles : [],
        logistics,
    };
    const [brainStatus, strategy, reconcilerStatus, costs, pendingOrders, completedOrders, rejectedOrders] = await Promise.all([
        readJsonFile(BRAIN_STATUS_PATH),
        readJsonFile(STRATEGY_PATH),
        readJsonFile(RECONCILER_STATUS_PATH),
        readJsonFile(COSTS_PATH),
        countJsonFiles(join(BRAIN_RUNTIME_PATH, 'work-orders', 'pending')),
        countJsonFiles(join(BRAIN_RUNTIME_PATH, 'work-orders', 'completed')),
        countJsonFiles(join(BRAIN_RUNTIME_PATH, 'work-orders', 'rejected')),
    ]);
    const brain = buildBrainSnapshot(brainStatus, reconcilerStatus, costs, {
        pending: pendingOrders,
        completed: completedOrders,
        rejected: rejectedOrders,
    }, strategy);

    await recordTelemetry(status);
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const analyticsWindow = telemetryHistory.filter(point => Date.parse(point.timestamp) >= sixHoursAgo);
    const analytics = buildAnalytics(analyticsWindow);
    const statusAge = await ageMs(status?.updatedAt);
    const browserAge = await ageMs(browser?.updatedAt);
    const screenshotAge = screenshotInfo ? Math.max(0, Date.now() - screenshotInfo.mtimeMs) : null;
    const levels = status?.levels ?? {};
    const objective = deriveObjective(levels);
    const milestones = buildMilestones(levels);
    const browserHealthy = Boolean(browser?.inGame) && browserAge !== null && browserAge < 15_000;
    const controllerHealthy = Boolean(status?.online) && statusAge !== null && statusAge < 120_000;
    const screenshotHealthy = screenshotAge !== null && screenshotAge < 15_000;

    const playerLog = playerLines.map((text, index) => ({
        id: `p-${playerLines.length - index}`,
        source: 'player',
        type: classifyLog(text),
        text,
    })).reverse();
    const clientLog = clientLines.map((text, index) => ({
        id: `c-${clientLines.length - index}`,
        source: 'client',
        type: classifyLog(text),
        text,
    })).reverse();

    return {
        generatedAt: new Date().toISOString(),
        startedAt,
        bot: BOT_NAME,
        readOnly: true,
        online: browserHealthy && controllerHealthy && fleet.summary.active > 0 && fleet.summary.online === fleet.summary.active,
        current: {
            activity: status?.activity ?? 'Starting',
            detail: status?.detail ?? 'Waiting for controller status',
            objective,
            player: status?.player ?? null,
            position: status?.position ?? null,
            inventorySlots: status?.inventorySlots ?? null,
            inventory: status?.inventory ?? [],
            inventorySummary: summarizeItems(status?.inventory ?? []),
            equipment: status?.equipment ?? [],
            bank: status?.bank ?? { isOpen: false, items: [] },
            skills: status?.skills ?? {},
            combatStyle: status?.combatStyle ?? null,
            world: status?.world ?? { nearbyNpcs: [], nearbyPlayers: 0, nearbyObjects: [], groundItems: [] },
            actions: status?.actions ?? 0,
            failures: status?.failures ?? 0,
            totalLevel: status?.totalLevel ?? null,
            levels,
            updatedAt: status?.updatedAt ?? null,
        },
        analytics: {
            ...analytics,
            historyPoints: telemetryHistory.length,
            historyStartedAt: telemetryHistory[0]?.timestamp ?? null,
        },
        milestones,
        fleet,
        brain,
        health: {
            browser: { ok: browserHealthy, ageMs: browserAge, label: 'Renderable client' },
            controller: { ok: controllerHealthy, ageMs: statusAge, label: 'Autoplay controller' },
            screenshot: { ok: screenshotHealthy, ageMs: screenshotAge, label: 'Live frame' },
            fleetBrain: { ok: brain.healthy, ageMs: brain.statusAgeMs, label: 'Fleetbrain orchestrator' },
        },
        screenshot: {
            available: Boolean(screenshotInfo),
            ageMs: screenshotAge,
            url: `/live.jpg?v=${screenshotInfo?.mtimeMs ?? Date.now()}`,
        },
        logs: {
            player: playerLog,
            client: clientLog,
        },
    };
}

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
};

const server = Bun.serve({
    hostname: HOST,
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        if (!isReadOnlyMethod(request.method)) {
            return new Response('Read-only dashboard: only GET and HEAD are allowed', {
                status: 405,
                headers: { ...securityHeaders, Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
            });
        }
        if (url.pathname === '/api/status') {
            return Response.json(await dashboardPayload(), {
                headers: { ...securityHeaders, 'Cache-Control': 'no-store' },
            });
        }
        if (url.pathname === '/api/export') {
            const payload = await dashboardPayload();
            return new Response(JSON.stringify(payload, null, 2) + '\n', {
                headers: {
                    ...securityHeaders,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${BOT_NAME}-read-only-status.json"`,
                    'Cache-Control': 'no-store',
                },
            });
        }
        if (url.pathname === '/health') {
            const payload = await dashboardPayload();
            return Response.json({ ok: payload.online, generatedAt: payload.generatedAt, health: payload.health }, {
                status: payload.online ? 200 : 503,
                headers: { ...securityHeaders, 'Cache-Control': 'no-store' },
            });
        }
        if (url.pathname === '/live.jpg') {
            const file = Bun.file(SCREENSHOT_PATH);
            if (!await file.exists()) return new Response('No live frame yet', { status: 404, headers: securityHeaders });
            const disposition = url.searchParams.has('download')
                ? { 'Content-Disposition': `attachment; filename="${BOT_NAME}-live.jpg"` }
                : {};
            return new Response(file, {
                headers: {
                    ...securityHeaders,
                    ...disposition,
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'no-store, max-age=0',
                },
            });
        }
        if (url.pathname === '/tabs.js') {
            return new Response(Bun.file(join(DASHBOARD_DIR, 'tabs.js')), {
                headers: { ...securityHeaders, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' },
            });
        }
        if (url.pathname === '/favicon.svg') {
            return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#11150f"/><path d="M18 44V18h15c9 0 14 4 14 11 0 5-3 8-7 9l9 8H38l-8-8h-3v6H18zm9-14h6c3 0 5-1 5-3s-2-3-5-3h-6v6z" fill="#d9ef91"/></svg>`, {
                headers: { ...securityHeaders, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
            });
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
            return new Response(Bun.file(join(DASHBOARD_DIR, 'index.html')), {
                headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
            });
        }
        return new Response('Not found', { status: 404, headers: securityHeaders });
    },
});

console.log(`[dashboard] RS-SDK dashboard listening on http://${HOST}:${server.port}`);
