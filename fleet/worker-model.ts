export type FleetRole = 'smith' | 'fish' | 'cook' | 'wood' | 'thief' | 'rune' | 'banker' | 'flex';
export type WorkerAction = 'mine' | 'smelt' | 'smith' | 'acquire-hammer' | 'acquire-net' | 'local-cash' | 'supply-net' | 'fish' | 'cook' | 'bank' | 'burn' | 'chop' | 'eat' | 'recover' | 'thieve' | 'bootstrap-cash' | 'buy-runes' | 'serve-trades' | 'fund-banker' | 'receive-funding';

export interface WorkerDirective {
    id?: string;
    mode: 'fund-banker';
    amount?: number;
    reason: string;
}

export interface StrategicWorkerDirective extends WorkerDirective {
    id: string;
    botId: string;
    role: FleetRole;
    amount: number;
    createdAt: string;
    expiresAt: string;
}

export const COPPER_ROCK_IDS = [2090, 2091] as const;
export const TIN_ROCK_IDS = [2094, 2095] as const;
export const FLEET_BANKER_PATTERN = /^Fszbank1$/i;

export interface WorkerItem {
    name: string;
    count: number;
}

export interface WorkerSnapshot {
    inventory: WorkerItem[];
    inventorySlots: number;
    hp: number;
    maxHp: number;
}

export interface RoleProfile {
    role: FleetRole;
    label: string;
    home: { x: number; z: number };
    bank?: { x: number; z: number };
    processing?: { x: number; z: number };
    keep: RegExp;
}

const PROFILES: Record<FleetRole, RoleProfile> = {
    smith: { role: 'smith', label: 'Smithing and metalwork', home: { x: 3285, z: 3365 }, keep: /pickaxe|hammer/i },
    fish: { role: 'fish', label: 'Fishing supplier', home: { x: 3267, z: 3148 }, bank: { x: 3269, z: 3167 }, keep: /small fishing net|coins/i },
    cook: { role: 'cook', label: 'Cooking and food logistics', home: { x: 3267, z: 3148 }, bank: { x: 3269, z: 3167 }, processing: { x: 3271, z: 3180 }, keep: /small fishing net|coins/i },
    wood: { role: 'wood', label: 'Woodcutting and firemaking', home: { x: 3195, z: 3220 }, keep: /axe|tinderbox/i },
    thief: { role: 'thief', label: 'Thieving and cash generation', home: { x: 3222, z: 3218 }, keep: /coins|bread|shrimps|kebab/i },
    rune: { role: 'rune', label: 'Runecrafting and Magic supplies', home: { x: 3222, z: 3218 }, keep: /coins|rune|staff|bread|shrimps/i },
    banker: { role: 'banker', label: 'Banking and trade logistics', home: { x: 3185, z: 3436 }, keep: /coins/i },
    flex: { role: 'flex', label: 'Flexible bottleneck worker', home: { x: 3195, z: 3220 }, keep: /axe|tinderbox|coins/i },
};

export function shouldPassAlKharidToll(position: { x: number; z: number }): boolean {
    return position.x < 3268 && position.z >= 3227;
}

export function roleProfile(role: FleetRole): RoleProfile {
    return PROFILES[role];
}

function hasExactKeys(value: any, expected: readonly string[]): boolean {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === expected.length
        && expected.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

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

function isValidStrategicDirective(directive: any, role: FleetRole, now: number): directive is StrategicWorkerDirective {
    if (!hasExactKeys(directive, ['id', 'botId', 'role', 'mode', 'amount', 'reason', 'createdAt', 'expiresAt'])) return false;
    if (!directive || !/^Fsz[A-Za-z0-9]{1,9}$/.test(directive.botId ?? '')) return false;
    if (directive.mode !== 'fund-banker' || !['thief', 'rune'].includes(role)) return false;
    if (!/^fd-[a-z0-9][a-z0-9-]{7,79}$/.test(directive.id ?? '')) return false;
    const createdAt = parseIsoTimestamp(directive.createdAt);
    const expiresAt = parseIsoTimestamp(directive.expiresAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > now || expiresAt <= now) return false;
    if (expiresAt <= createdAt || expiresAt - createdAt > 6 * 60 * 60_000) return false;
    if (!Number.isInteger(directive.amount) || directive.amount < 100 || directive.amount > 5_000) return false;
    if (typeof directive.reason !== 'string' || directive.reason.length < 20 || directive.reason.length > 300) return false;
    return true;
}

export function selectWorkerDirective(
    raw: any,
    botId: string,
    role: FleetRole,
    now = Date.now(),
    completedDirectiveIds: ReadonlySet<string> = new Set(),
): StrategicWorkerDirective | null {
    if (!hasExactKeys(raw, ['version', 'updatedAt', 'directives'])) return null;
    if (raw.version !== 1 || !Number.isFinite(parseIsoTimestamp(raw.updatedAt)) || !Array.isArray(raw.directives) || raw.directives.length > 5) return null;
    if (!raw.directives.every((candidate: any) => isValidStrategicDirective(candidate, candidate?.role as FleetRole, now))) return null;
    const validated = raw.directives as StrategicWorkerDirective[];
    const ids = validated.map(candidate => candidate.id);
    const bots = validated.map(candidate => candidate.botId);
    if (new Set(ids).size !== ids.length || new Set(bots).size !== bots.length) return null;
    return validated.find(directive =>
        !completedDirectiveIds.has(directive.id) && directive.botId === botId && directive.role === role) ?? null;
}

function hasFundingReceiptShape(value: any): boolean {
    if (!hasExactKeys(value, [
        'version', 'directiveId', 'botId', 'mode', 'completedAt', 'ok', 'from', 'to', 'amount', 'recoveredFromClaim',
    ])) return false;
    return value.version === 1
        && typeof value.directiveId === 'string' && /^fd-[a-z0-9][a-z0-9-]{7,79}$/.test(value.directiveId)
        && typeof value.botId === 'string' && /^Fsz[A-Za-z0-9]{1,9}$/.test(value.botId)
        && value.mode === 'fund-banker'
        && Number.isFinite(parseIsoTimestamp(value.completedAt))
        && value.ok === true
        && value.from === value.botId
        && value.to === 'Fszbank1'
        && Number.isInteger(value.amount) && value.amount >= 100 && value.amount <= 5_000
        && typeof value.recoveredFromClaim === 'boolean';
}

export function validateFundingReceiptTombstone(value: any, directiveId: string): boolean {
    return hasFundingReceiptShape(value) && value.directiveId === directiveId;
}

export function validateFundingReceipt(value: any, directive: StrategicWorkerDirective): boolean {
    return validateFundingReceiptTombstone(value, directive.id)
        && value.botId === directive.botId
        && value.from === directive.botId
        && value.amount === directive.amount;
}

function itemCount(items: any, pattern: RegExp): number {
    if (!Array.isArray(items)) return 0;
    return items
        .filter(item => typeof item?.name === 'string' && pattern.test(item.name))
        .reduce((sum, item) => sum + Number(item.count ?? 0), 0);
}

export function receivedFundingFromTrades(result: any, directive: Pick<StrategicWorkerDirective, 'botId' | 'amount'>): boolean {
    return Array.isArray(result?.trades) && result.trades.some((trade: any) =>
        trade?.success === true
        && String(trade.partner ?? '').toLowerCase() === directive.botId.toLowerCase()
        && itemCount(trade.received, /^coins$/i) >= directive.amount);
}

export function gaveFundingInTrade(result: any, directive: Pick<StrategicWorkerDirective, 'amount'>): boolean {
    return result?.success === true
        && String(result.partner ?? '').toLowerCase() === 'fszbank1'
        && itemCount(result.gave, /^coins$/i) >= directive.amount;
}

export function fundingClaimSatisfied(claim: { beforeCoins: number; amount: number }, currentCoins: number): boolean {
    return Number.isFinite(claim.beforeCoins)
        && Number.isInteger(claim.amount)
        && currentCoins - claim.beforeCoins >= claim.amount;
}

function count(items: WorkerItem[], pattern: RegExp): number {
    return items.filter(item => pattern.test(item.name)).reduce((total, item) => total + item.count, 0);
}

export function chooseWorkerAction(role: FleetRole, snapshot: WorkerSnapshot, directive?: WorkerDirective | null): WorkerAction {
    if ((role === 'thief' || role === 'rune') && snapshot.hp <= Math.max(3, Math.floor(snapshot.maxHp * 0.35))) {
        return count(snapshot.inventory, /bread|shrimps|kebab|meat|fish/i) > 0 ? 'eat' : 'recover';
    }
    const directiveAmount = directive?.amount ?? 100;
    if (directive?.mode === 'fund-banker' && (role === 'thief' || role === 'rune') && count(snapshot.inventory, /^coins$/i) >= directiveAmount + 100) {
        return 'fund-banker';
    }
    if (role === 'smith') {
        const copper = count(snapshot.inventory, /^copper ore$/i);
        const tin = count(snapshot.inventory, /^tin ore$/i);
        const bars = count(snapshot.inventory, /^bronze bar$/i);
        const pairs = Math.min(copper, tin);
        if (pairs > 0 && (bars > 0 || pairs >= 8 || snapshot.inventorySlots >= 26)) return 'smelt';
        if (bars > 0) return count(snapshot.inventory, /^hammer$/i) > 0 ? 'smith' : 'acquire-hammer';
        return 'mine';
    }
    if (role === 'banker') return snapshot.inventory.some(item => !/^coins$/i.test(item.name)) ? 'bank' : 'serve-trades';
    if (role === 'rune') {
        if (snapshot.hp <= Math.max(3, Math.floor(snapshot.maxHp * 0.35))) {
            return count(snapshot.inventory, /bread|shrimps|kebab|meat|fish/i) > 0 ? 'eat' : 'recover';
        }
        const supplied = count(snapshot.inventory, /^air rune$/i) >= 4 && count(snapshot.inventory, /^mind rune$/i) >= 4;
        return !supplied && count(snapshot.inventory, /^coins$/i) >= 100 ? 'buy-runes' : 'bootstrap-cash';
    }
    if (role === 'thief') {
        if (snapshot.hp <= Math.max(3, Math.floor(snapshot.maxHp * 0.35))) {
            return count(snapshot.inventory, /bread|shrimps|kebab|meat|fish/i) > 0 ? 'eat' : 'recover';
        }
        return 'thieve';
    }
    if (role === 'fish') {
        if (snapshot.inventorySlots >= 28) return 'bank';
        if (count(snapshot.inventory, /^small fishing net$/i) > 0) return 'fish';
        return 'acquire-net';
    }
    if (role === 'cook') {
        if (count(snapshot.inventory, /^raw /i) >= 8) return 'cook';
        if (snapshot.inventorySlots >= 28) return 'bank';
        if (count(snapshot.inventory, /^small fishing net$/i) > 0) return 'fish';
        return 'acquire-net';
    }
    if (role === 'wood' || role === 'flex') {
        if (count(snapshot.inventory, /^logs$|oak logs|willow logs/i) >= 5 && count(snapshot.inventory, /tinderbox/i) > 0) return 'burn';
        return 'chop';
    }
    return 'chop';
}
