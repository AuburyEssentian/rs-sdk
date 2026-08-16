export type WorkOrderAction = 'restart_controller';

export interface WorkOrder {
    version: 1;
    id: string;
    requestedBy: 'fleetbrain';
    action: WorkOrderAction;
    botId: string;
    reason: string;
    evidence: string[];
    createdAt: string;
    expiresAt: string;
}

export interface ValidationResult {
    ok: boolean;
    error?: string;
}

const ID_PATTERN = /^wo-[a-z0-9][a-z0-9-]{7,79}$/;
const MAX_LIFETIME_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 2 * 60_000;

export function validateWorkOrder(value: unknown, knownLiteBots: ReadonlySet<string>, now = Date.now()): ValidationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'work order must be an object' };
    const order = value as Partial<WorkOrder>;
    if (order.version !== 1) return { ok: false, error: 'unsupported work-order version' };
    if (order.requestedBy !== 'fleetbrain') return { ok: false, error: 'untrusted work-order writer' };
    if (order.action !== 'restart_controller') return { ok: false, error: 'unsupported action' };
    if (typeof order.id !== 'string' || !ID_PATTERN.test(order.id)) return { ok: false, error: 'invalid work-order id' };
    if (typeof order.botId !== 'string' || !knownLiteBots.has(order.botId)) return { ok: false, error: 'bot is not an enabled Lite account' };
    if (typeof order.reason !== 'string' || order.reason.trim().length < 20 || order.reason.length > 500) {
        return { ok: false, error: 'reason must contain 20-500 characters' };
    }
    if (!Array.isArray(order.evidence) || order.evidence.length < 1 || order.evidence.length > 8
        || order.evidence.some(item => typeof item !== 'string' || item.length < 3 || item.length > 240)) {
        return { ok: false, error: 'evidence must contain 1-8 bounded strings' };
    }
    const createdAt = Date.parse(String(order.createdAt));
    const expiresAt = Date.parse(String(order.expiresAt));
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return { ok: false, error: 'timestamps must be valid ISO dates' };
    if (createdAt > now + MAX_CLOCK_SKEW_MS) return { ok: false, error: 'createdAt is in the future' };
    if (expiresAt <= now) return { ok: false, error: 'work order expired' };
    if (expiresAt <= createdAt || expiresAt - createdAt > MAX_LIFETIME_MS) return { ok: false, error: 'work-order lifetime exceeds 15 minutes' };
    return { ok: true };
}

export function controllerRestartPrecondition(status: any, now = Date.now(), staleAfterMs = 10 * 60_000): ValidationResult {
    if (!status || typeof status !== 'object') return { ok: false, error: 'account status is unavailable' };
    if (status.online === false) return { ok: true };
    const updatedAt = Date.parse(String(status.updatedAt));
    if (!Number.isFinite(updatedAt)) return { ok: false, error: 'account status timestamp is invalid' };
    if (now - updatedAt < staleAfterMs) return { ok: false, error: 'account status is not stale enough for an automatic restart' };
    return { ok: true };
}

export function canRestartController(lastRestartAt: string | undefined, now = Date.now(), cooldownMs = 300_000): boolean {
    if (!lastRestartAt) return true;
    const parsed = Date.parse(lastRestartAt);
    return !Number.isFinite(parsed) || now - parsed >= cooldownMs;
}
