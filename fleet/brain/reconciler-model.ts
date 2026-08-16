export const ALLOWED_ROLE_KEYS = ['smith', 'fish', 'cook', 'wood', 'thief', 'rune', 'banker', 'flex'] as const;
export type FleetRoleKey = typeof ALLOWED_ROLE_KEYS[number];
export type WorkOrderAction = 'restart_controller' | 'restart_client' | 'restart_account' | 'add_account' | 'remove_account';

export interface WorkOrder {
    version: 2;
    id: string;
    requestedBy: 'fleetbrain';
    action: WorkOrderAction;
    botId: string;
    roleKey?: FleetRoleKey;
    reason: string;
    evidence: string[];
    createdAt: string;
    expiresAt: string;
}

export interface FleetValidationContext {
    enabledLiteBots: ReadonlySet<string>;
    disabledLiteBots?: ReadonlySet<string>;
    allBotIds: ReadonlySet<string>;
    protectedBots: ReadonlySet<string>;
    activeAccountCount: number;
    totalAccountCount: number;
    maxAccounts: number;
}

export interface ValidationResult {
    ok: boolean;
    error?: string;
}

const ACTIONS: ReadonlySet<string> = new Set<WorkOrderAction>([
    'restart_controller', 'restart_client', 'restart_account', 'add_account', 'remove_account',
]);
const ID_PATTERN = /^wo-[a-z0-9][a-z0-9-]{7,79}$/;
const BOT_ID_PATTERN = /^Fsz[A-Za-z0-9]{1,9}$/;
const MAX_LIFETIME_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 2 * 60_000;

export function validateWorkOrder(value: unknown, context: FleetValidationContext, now = Date.now()): ValidationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'work order must be an object' };
    const order = value as Partial<WorkOrder>;
    if (order.version !== 2) return { ok: false, error: 'unsupported work-order version' };
    if (order.requestedBy !== 'fleetbrain') return { ok: false, error: 'untrusted work-order writer' };
    if (typeof order.action !== 'string' || !ACTIONS.has(order.action)) return { ok: false, error: 'unsupported action' };
    if (typeof order.id !== 'string' || !ID_PATTERN.test(order.id)) return { ok: false, error: 'invalid work-order id' };
    if (typeof order.botId !== 'string') return { ok: false, error: 'botId is required' };
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

    if (order.action === 'add_account') {
        if (!BOT_ID_PATTERN.test(order.botId)) return { ok: false, error: 'new account id must be 4-12 alphanumeric characters beginning with Fsz' };
        if (!order.roleKey || !ALLOWED_ROLE_KEYS.includes(order.roleKey)) return { ok: false, error: 'add_account requires an allowed roleKey' };
        if (context.protectedBots.has(order.botId)) return { ok: false, error: 'protected account cannot be changed' };
        if (context.activeAccountCount >= context.maxAccounts) return { ok: false, error: `active fleet is at the ${context.maxAccounts}-account cap` };
        const reactivating = Boolean(context.disabledLiteBots?.has(order.botId));
        if (context.allBotIds.has(order.botId) && !reactivating) return { ok: false, error: 'account id already exists and is not disabled' };
        if (!reactivating && context.totalAccountCount >= context.maxAccounts) return { ok: false, error: `total character count is at the ${context.maxAccounts}-account cap` };
        return { ok: true };
    }

    if (context.protectedBots.has(order.botId)) return { ok: false, error: 'protected account cannot be changed' };
    if (!context.enabledLiteBots.has(order.botId)) return { ok: false, error: 'target is not an enabled Lite account' };
    return { ok: true };
}

export function canRestartController(lastRestartAt: string | undefined, now = Date.now(), cooldownMs = 300_000): boolean {
    if (!lastRestartAt) return true;
    const parsed = Date.parse(lastRestartAt);
    return !Number.isFinite(parsed) || now - parsed >= cooldownMs;
}

export function canScaleFleet(lastScaleAt: string | undefined, now = Date.now(), cooldownMs = 15 * 60_000): boolean {
    if (!lastScaleAt) return true;
    const parsed = Date.parse(lastScaleAt);
    return !Number.isFinite(parsed) || now - parsed >= cooldownMs;
}
