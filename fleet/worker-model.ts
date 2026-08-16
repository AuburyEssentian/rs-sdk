export type FleetRole = 'smith' | 'fish' | 'cook' | 'wood' | 'thief' | 'rune' | 'banker' | 'flex';
export type WorkerAction = 'mine' | 'smelt' | 'smith' | 'acquire-hammer' | 'acquire-net' | 'local-cash' | 'supply-net' | 'fish' | 'cook' | 'bank' | 'burn' | 'chop' | 'eat' | 'recover' | 'thieve' | 'bootstrap-cash' | 'buy-runes' | 'serve-trades';

export const COPPER_ROCK_IDS = [2090, 2091] as const;
export const TIN_ROCK_IDS = [2094, 2095] as const;

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

function count(items: WorkerItem[], pattern: RegExp): number {
    return items.filter(item => pattern.test(item.name)).reduce((total, item) => total + item.count, 0);
}

export function chooseWorkerAction(role: FleetRole, snapshot: WorkerSnapshot): WorkerAction {
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
