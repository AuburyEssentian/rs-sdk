export interface WorkOrderCounts {
    pending: number;
    completed: number;
    rejected: number;
}

function timestampAgeMs(timestamp: unknown, now: number): number | null {
    if (typeof timestamp !== 'string') return null;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
}

export function buildBrainSnapshot(
    status: any,
    reconciler: any,
    costs: any,
    workOrders: WorkOrderCounts,
    now = Date.now(),
): any {
    const statusAgeMs = timestampAgeMs(status?.updatedAt, now);
    const reconcilerAgeMs = timestampAgeMs(reconciler?.updatedAt, now);
    const costAgeMs = timestampAgeMs(costs?.updatedAt, now);
    const healthy = Boolean(status?.online)
        && statusAgeMs !== null
        && statusAgeMs < 10 * 60_000
        && Boolean(reconciler?.online)
        && reconcilerAgeMs !== null
        && reconcilerAgeMs < 2 * 60_000;
    return {
        healthy,
        statusAgeMs,
        reconcilerAgeMs,
        costAgeMs,
        status: status ?? {
            online: false,
            health: 'offline',
            model: 'gpt-5.6-luna',
            provider: 'openai-codex',
            reasoningEffort: 'max',
            objective: 'Waiting for the first Fleetbrain review.',
            decision: 'No strategic decision has been published.',
            observations: [],
            updatedAt: null,
        },
        reconciler: reconciler ?? {
            online: false,
            phase: 'offline',
            allowedActions: ['restart_controller'],
            updatedAt: null,
        },
        workOrders,
        costs: {
            currency: 'USD',
            billingMode: 'list-price-equivalent',
            actualSubscriptionCharge: null,
            totals: {
                sessions: 0,
                apiCalls: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                reasoningTokens: 0,
                estimatedCostUsd: 0,
            },
            daily: [],
            runs: [],
            ...(costs ?? {}),
        },
    };
}
