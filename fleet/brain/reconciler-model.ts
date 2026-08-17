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

export interface RecentReviewOrder {
    botId: string;
    acceptedAt: string;
}

export interface RecoveryAttempt {
    action: 'restart_client' | 'restart_controller' | 'restart_account';
    attemptedAt: string;
}

const ACTIONS: ReadonlySet<string> = new Set<WorkOrderAction>([
    'restart_controller', 'restart_client', 'restart_account', 'add_account', 'remove_account',
]);
const ID_PATTERN = /^wo-[a-z0-9][a-z0-9-]{7,79}$/;
const BOT_ID_PATTERN = /^Fsz[A-Za-z0-9]{1,9}$/;
const MAX_LIFETIME_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 2 * 60_000;

function parseIsoTimestamp(value: unknown): number {
    if (typeof value !== 'string' || value.length > 40) return Number.NaN;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return Number.NaN;
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
    const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
        || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) return Number.NaN;
    return Date.parse(value);
}

export function validateWorkOrder(value: unknown, context: FleetValidationContext, now = Date.now()): ValidationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'work order must be an object' };
    const order = value as Partial<WorkOrder>;
    if (order.version !== 2) return { ok: false, error: 'unsupported work-order version' };
    if (order.requestedBy !== 'fleetbrain') return { ok: false, error: 'untrusted work-order writer' };
    if (typeof order.action !== 'string' || !ACTIONS.has(order.action)) return { ok: false, error: 'unsupported action' };
    const expectedKeys = ['version', 'id', 'requestedBy', 'action', 'botId', 'reason', 'evidence', 'createdAt', 'expiresAt'];
    if (order.action === 'add_account') expectedKeys.push('roleKey');
    const actualKeys = Object.keys(order);
    if (actualKeys.length !== expectedKeys.length || !expectedKeys.every(key => Object.prototype.hasOwnProperty.call(order, key))) {
        return { ok: false, error: 'work order contains missing or unsupported fields' };
    }
    if (typeof order.id !== 'string' || !ID_PATTERN.test(order.id)) return { ok: false, error: 'invalid work-order id' };
    if (typeof order.botId !== 'string') return { ok: false, error: 'botId is required' };
    if (typeof order.reason !== 'string' || order.reason.trim().length < 20 || order.reason.length > 500) {
        return { ok: false, error: 'reason must contain 20-500 characters' };
    }
    if (!Array.isArray(order.evidence) || order.evidence.length < 1 || order.evidence.length > 8
        || order.evidence.some(item => typeof item !== 'string' || item.length < 3 || item.length > 240)) {
        return { ok: false, error: 'evidence must contain 1-8 bounded strings' };
    }
    const createdAt = parseIsoTimestamp(order.createdAt);
    const expiresAt = parseIsoTimestamp(order.expiresAt);
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

export function canAcceptReviewOrder(
    history: readonly RecentReviewOrder[],
    botId: string,
    now = Date.now(),
    windowMs = 5 * 60_000,
    maxOrders = 3,
): boolean {
    const recent = history.filter(entry => {
        const acceptedAt = Date.parse(entry.acceptedAt);
        return Number.isFinite(acceptedAt) && now - acceptedAt >= 0 && now - acceptedAt < windowMs;
    });
    return recent.length < maxOrders && !recent.some(entry => entry.botId === botId);
}

export function supervisorVerificationSucceeded(details: unknown): boolean {
    return Boolean(details && typeof details === 'object' && (details as Record<string, unknown>).supervisorVerified === true);
}

export function canProcessWorkOrderId(processedOrderIds: readonly string[], id: string): boolean {
    return !processedOrderIds.includes(id);
}

export function canAdvanceRecovery(
    action: RecoveryAttempt['action'],
    previous: RecoveryAttempt | undefined,
    statusUpdatedAt: string | undefined,
    now = Date.now(),
    freshnessMs = 3 * 60_000,
): boolean {
    if (!previous) return action === 'restart_client';
    const attemptedAt = Date.parse(previous.attemptedAt);
    const freshAt = Date.parse(statusUpdatedAt ?? '');
    const currentlyFreshAfterAttempt = Number.isFinite(freshAt) && Number.isFinite(attemptedAt)
        && freshAt > attemptedAt && now - freshAt >= 0 && now - freshAt < freshnessMs;
    if (currentlyFreshAfterAttempt) return action === 'restart_client';
    const rank: Record<RecoveryAttempt['action'], number> = {
        restart_client: 1,
        restart_controller: 2,
        restart_account: 3,
    };
    return rank[action] === rank[previous.action] + 1;
}
