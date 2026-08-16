export interface LogisticsItem {
    name: string;
    count: number;
}

export interface TransferRequest {
    item: string;
    amount: number;
}

export interface OreTransferPlan {
    target: string;
    give: TransferRequest[];
}

export function buildOreTransferPlan(items: LogisticsItem[]): OreTransferPlan {
    const names = new Set(items.map(item => item.name.toLowerCase()));
    const give: TransferRequest[] = [];
    if (names.has('copper ore')) give.push({ item: 'Copper ore', amount: -1 });
    if (names.has('tin ore')) give.push({ item: 'Tin ore', amount: -1 });
    return { target: 'Fszbank1', give };
}
