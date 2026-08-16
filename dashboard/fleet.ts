export interface FleetBotDefinition {
    id: string;
    role: string;
    clientMode: 'browser' | 'lite';
    statusPath: string;
}

export interface FleetBotStatus {
    updatedAt?: string;
    online?: boolean;
    totalLevel?: number;
    activity?: string;
    detail?: string;
    position?: { x: number; z: number; level?: number } | null;
    levels?: Record<string, number>;
    inventory?: Array<{ id: number; name: string; count: number }>;
    resources?: Record<string, number>;
}

export function buildFleetSnapshot(
    definitions: FleetBotDefinition[],
    statuses: Record<string, FleetBotStatus | null | undefined>,
    now = Date.now(),
) {
    const bots = definitions.map(definition => {
        const status = statuses[definition.id] ?? null;
        const parsed = status?.updatedAt ? Date.parse(status.updatedAt) : Number.NaN;
        const ageMs = Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
        const healthy = Boolean(status?.online) && ageMs !== null && ageMs < 120_000;
        return {
            ...definition,
            healthy,
            ageMs,
            totalLevel: typeof status?.totalLevel === 'number' ? status.totalLevel : null,
            activity: status?.activity ?? 'Waiting for controller',
            detail: status?.detail ?? 'No status received',
            position: status?.position ?? null,
            levels: status?.levels ?? {},
            inventory: status?.inventory ?? [],
            resources: status?.resources ?? {},
            updatedAt: status?.updatedAt ?? null,
        };
    });
    return {
        summary: {
            configured: bots.length,
            online: bots.filter(bot => bot.healthy).length,
            totalLevel: bots.reduce((sum, bot) => sum + (bot.totalLevel ?? 0), 0),
        },
        bots,
    };
}
