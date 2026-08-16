export interface Objective {
    title: string;
    target: string;
    progress: number;
    nextBand: number;
}

export interface TelemetrySkill {
    level: number;
    xp: number;
}

export interface TelemetryPoint {
    timestamp: string;
    totalLevel: number;
    skills: Record<string, TelemetrySkill>;
}

export interface Analytics {
    windowHours: number;
    totalLevelGain: number;
    skillGains: Record<string, { levels: number; xp: number }>;
    xpPerHour: Record<string, number>;
    topSkill: string | null;
    series: Array<{ timestamp: string; totalLevel: number }>;
}

export const TRACKED_SKILLS = ['Woodcutting', 'Firemaking', 'Thieving', 'Attack', 'Strength', 'Defence', 'Prayer'] as const;

export function isReadOnlyMethod(method: string): boolean {
    return method === 'GET' || method === 'HEAD';
}

export function deriveObjective(levels: Record<string, number> = {}): Objective {
    const level = (name: string) => levels[name] ?? 1;
    const minimum = Math.min(...TRACKED_SKILLS.map(level));
    const nextBand = (Math.floor(minimum / 10) + 1) * 10;
    let title = 'Balanced progression';
    let target = `Raise tracked skills to level ${nextBand}`;
    let categoryLevels = TRACKED_SKILLS.map(level);

    if (level('Woodcutting') < nextBand || level('Firemaking') < nextBand) {
        title = 'Woodcutting + Firemaking';
        target = `Raise both gathering skills to ${nextBand}`;
        categoryLevels = [level('Woodcutting'), level('Firemaking')];
    } else if (level('Thieving') < nextBand) {
        title = 'Lumbridge pickpocket circuit';
        target = `Raise Thieving to ${nextBand} without risking starter gear`;
        categoryLevels = [level('Thieving')];
    } else {
        title = 'Chicken-yard combat loop';
        target = `Balance Attack, Strength, Defence and Prayer at ${nextBand}`;
        categoryLevels = ['Attack', 'Strength', 'Defence', 'Prayer'].map(level);
    }

    const floor = Math.max(1, nextBand - 10);
    const current = Math.min(...categoryLevels);
    const progress = Math.max(0, Math.min(100, ((current - floor) / (nextBand - floor)) * 100));
    return { title, target, progress, nextBand };
}

export function buildAnalytics(history: TelemetryPoint[]): Analytics {
    if (history.length < 2) {
        return {
            windowHours: 0,
            totalLevelGain: 0,
            skillGains: {},
            xpPerHour: {},
            topSkill: null,
            series: history.map(point => ({ timestamp: point.timestamp, totalLevel: point.totalLevel })),
        };
    }

    const first = history[0];
    const last = history[history.length - 1];
    const elapsedMs = Date.parse(last.timestamp) - Date.parse(first.timestamp);
    const windowHours = elapsedMs > 0 ? elapsedMs / 3_600_000 : 0;
    const skillNames = new Set([...Object.keys(first.skills), ...Object.keys(last.skills)]);
    const skillGains: Record<string, { levels: number; xp: number }> = {};
    const xpPerHour: Record<string, number> = {};

    for (const name of skillNames) {
        const before = first.skills[name] ?? { level: 1, xp: 0 };
        const after = last.skills[name] ?? before;
        const levels = Math.max(0, after.level - before.level);
        const xp = Math.max(0, after.xp - before.xp);
        if (levels > 0 || xp > 0) skillGains[name] = { levels, xp };
        if (xp > 0 && windowHours > 0) xpPerHour[name] = Math.round(xp / windowHours);
    }

    const topSkill = Object.entries(xpPerHour).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
        windowHours,
        totalLevelGain: Math.max(0, last.totalLevel - first.totalLevel),
        skillGains,
        xpPerHour,
        topSkill,
        series: history.map(point => ({ timestamp: point.timestamp, totalLevel: point.totalLevel })),
    };
}

export function buildTelemetryPoint(status: any): TelemetryPoint | null {
    if (!status?.updatedAt || !status?.skills || typeof status.skills !== 'object') return null;
    const skills: Record<string, TelemetrySkill> = {};
    for (const [name, raw] of Object.entries(status.skills) as Array<[string, any]>) {
        if (!raw || !Number.isFinite(raw.baseLevel) || !Number.isFinite(raw.xp)) continue;
        skills[name] = { level: raw.baseLevel, xp: raw.xp };
    }
    if (Object.keys(skills).length === 0) return null;
    return {
        timestamp: status.updatedAt,
        totalLevel: Number.isFinite(status.totalLevel) ? status.totalLevel : Object.values(skills).reduce((sum, skill) => sum + skill.level, 0),
        skills,
    };
}

export function buildMilestones(levels: Record<string, number> = {}): {
    nextBand: number;
    reached: string[];
    remaining: string[];
} {
    const level = (name: string) => levels[name] ?? 1;
    const minimum = Math.min(...TRACKED_SKILLS.map(level));
    const nextBand = (Math.floor(minimum / 10) + 1) * 10;
    const reached = TRACKED_SKILLS
        .map(name => ({ name, band: Math.floor(level(name) / 10) * 10 }))
        .filter(item => item.band >= 10)
        .map(item => `${item.name} ${item.band}`);
    const remaining = TRACKED_SKILLS
        .filter(name => level(name) < nextBand)
        .map(name => `${name} ${nextBand}`);
    return { nextBand, reached, remaining };
}

export function summarizeItems(items: Array<{ slot: number; name: string; count: number }> = []): Array<{
    name: string;
    count: number;
    slots: number[];
}> {
    const grouped = new Map<string, { name: string; count: number; slots: number[] }>();
    for (const item of items) {
        const existing = grouped.get(item.name) ?? { name: item.name, count: 0, slots: [] };
        existing.count += item.count;
        existing.slots.push(item.slot);
        grouped.set(item.name, existing);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}
