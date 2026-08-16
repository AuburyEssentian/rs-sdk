import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { runScript, type ScriptContext } from '../sdk/runner';
import { shouldExitForRestart } from '../bots/FSZ6yjrsA/reliability';
import { uniqueItemTypes } from '../bots/Fszminer1/miner-model';
import { chooseWorkerAction, COPPER_ROCK_IDS, roleProfile, shouldPassAlKharidToll, TIN_ROCK_IDS, type FleetRole, type WorkerAction } from './worker-model';

const BOT_ID = process.argv[2];
const ROLE = process.argv[3] as FleetRole;
if (!BOT_ID || !['smith', 'fish', 'cook', 'wood', 'thief', 'rune', 'banker', 'flex'].includes(ROLE)) {
    throw new Error('Usage: bun fleet/worker.ts <botId> <smith|fish|cook|wood|thief|rune|banker|flex>');
}

const BOT_DIR = `bots/${BOT_ID}`;
const STATUS_PATH = `${BOT_DIR}/status.json`;
const BOOTSTRAP_PATH = `${BOT_DIR}/fleet-bootstrap.done`;
const SUPPLY_REQUESTERS = ['Fszfish1', 'Fszcook1'] as const;
const VARROCK_BANK = { x: 3185, z: 3436 };
const DRAYNOR_BANK = { x: 3092, z: 3243 };
const MINE = { x: 3285, z: 3365 };
const FURNACE = { x: 3225, z: 3256 };
const ANVIL = { x: 3188, z: 3421 };

const profile = roleProfile(ROLE);

let actions = 0;
let failures = 0;
let lastStatusAt = 0;
let detail = 'Starting fleet worker';
let activity = profile.label.toLowerCase();

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function pendingSupplyRequest(): any | null {
    for (const requester of SUPPLY_REQUESTERS) {
        const path = supplyRequestPath(requester);
        if (!existsSync(path)) continue;
        try {
            const request = JSON.parse(readFileSync(path, 'utf8'));
            if (request.status === 'pending' && request.requester === requester) return request;
        } catch {}
    }
    return null;
}

function supplyRequestPath(requester: string): string {
    return `${import.meta.dir}/supply-${requester}.json`;
}

function levelsFromState(state: any): Record<string, number> {
    return Object.fromEntries((state?.skills ?? []).map((skill: any) => [skill.name, skill.baseLevel ?? skill.level ?? 1]));
}

async function persistStatus(sdk: any, force = false): Promise<void> {
    if (!force && Date.now() - lastStatusAt < 5_000) return;
    const state = sdk.getState();
    const inventory = sdk.getInventory().map((item: any) => ({ id: item.id, name: item.name, count: item.count, slot: item.slot }));
    const levels = levelsFromState(state);
    const payload = {
        botId: BOT_ID,
        role: ROLE,
        roleLabel: profile.label,
        clientMode: 'lite',
        updatedAt: new Date().toISOString(),
        online: Boolean(state?.player),
        activity,
        detail,
        actions,
        failures,
        position: state?.player ? { x: state.player.worldX, z: state.player.worldZ, level: state.player.level } : null,
        player: state?.player ? {
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            combatLevel: state.player.combatLevel,
            inCombat: state.player.combat?.inCombat ?? false,
            runEnergy: state.player.runEnergy,
        } : null,
        levels,
        totalLevel: Object.values(levels).reduce((sum: number, value) => sum + Number(value), 0),
        inventorySlots: inventory.length,
        inventory,
    };
    const tmp = `${STATUS_PATH}.tmp`;
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`);
    await rename(tmp, STATUS_PATH);
    lastStatusAt = Date.now();
}

async function note(sdk: any, nextActivity: string, message: string, ok = true): Promise<void> {
    activity = nextActivity;
    detail = message;
    if (ok) actions += 1;
    else failures += 1;
    console.log(`[${BOT_ID}:${ROLE}] ${activity}: ${message}`);
    await persistStatus(sdk, true);
}

async function dismissDialog(sdk: any): Promise<void> {
    if (sdk.getState()?.dialog?.isOpen) {
        await sdk.sendClickDialog(0).catch(() => {});
        await delay(250);
    }
}

async function openBankAt(sdk: any, bot: any, coords: { x: number; z: number }): Promise<boolean> {
    if (!sdk.isBankOpen()) {
        const walked = await bot.walkTo(coords.x, coords.z);
        if (!walked.success) {
            await note(sdk, 'banking', `Could not reach bank: ${walked.message}`, false);
            return false;
        }
        const opened = await bot.openBank();
        if (!opened.success) {
            await note(sdk, 'banking', `Could not open bank: ${opened.message}`, false);
            return false;
        }
    }
    return true;
}

async function depositInventory(sdk: any, bot: any, initial = false): Promise<boolean> {
    const bank = profile.bank ?? VARROCK_BANK;
    if (!await openBankAt(sdk, bot, bank)) return false;
    const production = ROLE === 'smith' ? /ore$|bar$|^bronze /i
        : ROLE === 'fish' || ROLE === 'cook' ? /shrimps|anchovies|fish|burnt/i
            : /logs$/i;
    for (const item of uniqueItemTypes([...sdk.getInventory()])) {
        if (profile.keep.test(item.name)) continue;
        if (!initial && ROLE !== 'banker' && !production.test(item.name)) continue;
        const result = await bot.depositItem(item, -1);
        if (!result.success && sdk.findInventoryItem(new RegExp(`^${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))) {
            await note(sdk, 'banking', `Could not deposit ${item.name}: ${result.message}`, false);
        }
    }
    await bot.closeBank().catch(() => {});
    await note(sdk, 'banking', initial ? 'Banked starter clutter' : 'Banked production load');
    return true;
}

async function bootstrap(sdk: any, bot: any): Promise<void> {
    await bot.skipTutorial();
    await delay(1_000);
    if (!existsSync(BOOTSTRAP_PATH)) {
        if (await depositInventory(sdk, bot, true)) {
            await writeFile(BOOTSTRAP_PATH, `${new Date().toISOString()}\n`);
        }
    }
}

async function mine(sdk: any, bot: any): Promise<void> {
    if (sdk.getInventory().length >= 28) {
        await depositInventory(sdk, bot);
        return;
    }
    const player = sdk.getState()?.player;
    if (!player || Math.hypot(player.worldX - MINE.x, player.worldZ - MINE.z) > 18) {
        const walked = await bot.walkTo(MINE.x, MINE.z);
        await note(sdk, 'mining copper and tin', walked.success ? 'Reached south-east Varrock mine' : walked.message, walked.success);
        return;
    }
    const inventory = sdk.getInventory();
    const copper = inventory.filter((item: any) => /^copper ore$/i.test(item.name)).length;
    const tin = inventory.filter((item: any) => /^tin ore$/i.test(item.name)).length;
    const target = copper <= tin ? 'copper' : 'tin';
    const ids = new Set(target === 'copper' ? COPPER_ROCK_IDS : TIN_ROCK_IDS);
    const rock = (sdk.getState()?.nearbyLocs ?? [])
        .filter((loc: any) => ids.has(loc.id) && loc.optionsWithIndex?.some((option: any) => /^mine$/i.test(option.text)))
        .sort((a: any, b: any) => a.distance - b.distance)[0];
    if (!rock) {
        await note(sdk, 'mining copper and tin', `Waiting for ${target} rock`, false);
        await delay(1_200);
        return;
    }
    const before = sdk.getInventory().length;
    const result = await bot.interactLoc(rock, 'mine');
    if (!result.success) {
        await note(sdk, 'mining copper and tin', `${target} dispatch failed: ${result.message}`, false);
        return;
    }
    try {
        await sdk.waitForCondition((state: any) => state.inventory.length > before, 12_000);
        await note(sdk, 'mining copper and tin', `Mined ${target} ore`);
    } catch {
        await note(sdk, 'mining copper and tin', `${target} rock depleted before ore arrived`, false);
    }
}

async function smelt(sdk: any, bot: any): Promise<void> {
    const walked = await bot.walkTo(FURNACE.x, FURNACE.z);
    if (!walked.success) {
        await note(sdk, 'smithing production', `Could not reach Lumbridge furnace: ${walked.message}`, false);
        return;
    }
    const copper = sdk.findInventoryItem(/^copper ore$/i);
    const furnace = sdk.findNearbyLoc(/furnace/i, { withOption: /smelt/i });
    if (!copper || !furnace) {
        await note(sdk, 'smithing production', 'Copper ore or usable furnace missing', false);
        return;
    }
    const barsBefore = sdk.getInventory().filter((item: any) => /^bronze bar$/i.test(item.name)).length;
    const sent = await sdk.sendUseItemOnLoc(copper.slot, furnace.x, furnace.z, furnace.id);
    if (!sent.success) {
        await note(sdk, 'smithing production', `Smelt dispatch failed: ${sent.message}`, false);
        return;
    }
    try {
        await sdk.waitForCondition((state: any) => state.inventory.filter((item: any) => /^bronze bar$/i.test(item.name)).length > barsBefore, 12_000);
        await note(sdk, 'smithing production', 'Smelted bronze bar');
    } catch {
        await note(sdk, 'smithing production', 'Bronze smelt timed out', false);
    }
}

async function smith(sdk: any, bot: any): Promise<void> {
    const walked = await bot.walkTo(ANVIL.x, ANVIL.z);
    if (!walked.success) {
        await note(sdk, 'smithing production', `Could not reach Varrock anvil: ${walked.message}`, false);
        return;
    }
    const result = await bot.smithAtAnvil('dagger', { barPattern: /bronze bar/i, timeout: 15_000 });
    await note(sdk, 'smithing production', result.success ? 'Forged bronze dagger' : result.message, result.success);
}

async function acquireHammer(sdk: any, bot: any): Promise<void> {
    if (!await openBankAt(sdk, bot, VARROCK_BANK)) return;
    const coins = await bot.withdrawItem(/^coins$/i, 2);
    await bot.closeBank().catch(() => {});
    if (!coins.success && !sdk.findInventoryItem(/^coins$/i)) {
        await note(sdk, 'smithing production', `Could not withdraw hammer money: ${coins.message}`, false);
        return;
    }
    const walked = await bot.walkTo(3210, 3244);
    if (!walked.success) {
        await note(sdk, 'smithing production', `Could not reach Lumbridge general store: ${walked.message}`, false);
        return;
    }
    const opened = await bot.openShop(/shop\s*keeper/i);
    if (!opened.success) {
        await note(sdk, 'smithing production', `Could not open general store: ${opened.message}`, false);
        return;
    }
    const bought = await bot.buyFromShop(/^hammer$/i, 1);
    await bot.closeShop().catch(() => {});
    await note(sdk, 'smithing production', bought.success ? 'Bought hammer for metalwork' : bought.message, bought.success);
}

async function buyRunes(sdk: any, bot: any): Promise<void> {
    const walked = await bot.walkTo(3253, 3402);
    if (!walked.success) {
        await note(sdk, 'magic supply procurement', `Could not reach Aubury's rune shop: ${walked.message}`, false);
        return;
    }
    const opened = await bot.openShop(/^aubury$/i);
    if (!opened.success) {
        await note(sdk, 'magic supply procurement', `Could not open rune shop: ${opened.message}`, false);
        return;
    }
    const air = await bot.buyFromShop(/^air rune$/i, 1);
    if (!sdk.getState()?.shop?.isOpen) {
        await bot.openShop(/^aubury$/i);
    }
    const mind = await bot.buyFromShop(/^mind rune$/i, 1);
    await bot.closeShop().catch(() => {});
    const success = air.success && mind.success;
    await note(sdk, 'magic supply procurement', success ? 'Bought an air-and-mind rune supply pair' : `${air.message}; ${mind.message}`, success);
}

async function acquireFishingNet(sdk: any, bot: any): Promise<void> {
    const current = sdk.getState()?.player;
    const bankReachable = current && !shouldPassAlKharidToll({ x: current.worldX, z: current.worldZ });
    if (bankReachable && profile.bank && await openBankAt(sdk, bot, profile.bank)) {
        const withdrawn = await bot.withdrawItem(/^small fishing net$/i, 1);
        await bot.closeBank().catch(() => {});
        if (withdrawn.success) {
            await note(sdk, 'fishing equipment', 'Withdrew small fishing net');
            return;
        }
    }

    await writeFile(supplyRequestPath(BOT_ID), `${JSON.stringify({
        status: 'pending',
        requester: BOT_ID,
        supplier: 'Fszbank1',
        item: 'Small fishing net',
        updatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    const walked = await bot.walkTo(VARROCK_BANK.x, VARROCK_BANK.z);
    if (!walked.success) {
        await note(sdk, 'fishing equipment', `Could not reach fleet banker: ${walked.message}`, false);
        return;
    }
    const raw = sdk.getInventory().find((item: any) => /^raw /i.test(item.name));
    const result = await bot.trade('Fszbank1', {
        give: raw ? [{ item: raw.name, amount: 1 }] : [],
        want: [{ item: /^small fishing net$/i, amount: 1 }],
        timeout: 120_000,
    });
    const received = Boolean(sdk.findInventoryItem(/^small fishing net$/i));
    if (result.success && received) {
        await writeFile(supplyRequestPath(BOT_ID), `${JSON.stringify({
            status: 'fulfilled',
            requester: BOT_ID,
            supplier: 'Fszbank1',
            item: 'Small fishing net',
            message: result.message,
            updatedAt: new Date().toISOString(),
        }, null, 2)}\n`);
    }
    await note(sdk, 'fishing equipment', received ? 'Received replacement net from fleet banker' : result.message, result.success && received);
}

async function acquireTollCoins(sdk: any, bot: any): Promise<boolean> {
    await writeFile(supplyRequestPath(BOT_ID), `${JSON.stringify({
        status: 'pending',
        requester: BOT_ID,
        supplier: 'Fszbank1',
        item: 'Coins',
        amount: 10,
        updatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    const walked = await bot.walkTo(VARROCK_BANK.x, VARROCK_BANK.z);
    if (!walked.success) {
        await note(sdk, 'fleet travel', `Could not reach fleet banker for toll money: ${walked.message}`, false);
        return false;
    }
    const result = await bot.trade('Fszbank1', {
        give: [],
        want: [{ item: /^coins$/i, amount: 10 }],
        timeout: 120_000,
    });
    const coins = sdk.getInventory()
        .filter((item: any) => /^coins$/i.test(item.name))
        .reduce((sum: number, item: any) => sum + item.count, 0);
    await note(sdk, 'fleet travel', coins >= 10 ? 'Received Al Kharid toll money from fleet banker' : result.message, result.success && coins >= 10);
    return result.success && coins >= 10;
}

async function ensureAlKharidAccess(sdk: any, bot: any): Promise<boolean> {
    const current = sdk.getState()?.player;
    if (!current || !shouldPassAlKharidToll({ x: current.worldX, z: current.worldZ })) return true;

    const coinCount = () => sdk.getInventory()
        .filter((item: any) => /^coins$/i.test(item.name))
        .reduce((sum: number, item: any) => sum + item.count, 0);

    if (coinCount() < 10 && !await acquireTollCoins(sdk, bot)) return false;

    const eastbound = [
        { x: 3150, z: 3250 },
        { x: 3230, z: 3270 },
        { x: 3267, z: 3228 },
    ];
    for (const point of eastbound) {
        const player = sdk.getState()?.player;
        if (player && Math.hypot(player.worldX - point.x, player.worldZ - point.z) < 15) continue;
        const walked = await bot.walkTo(point.x, point.z);
        if (!walked.success && point === eastbound.at(-1)) break;
        if (!walked.success) {
            await note(sdk, 'fleet travel', `Could not reach Al Kharid toll gate: ${walked.message}`, false);
            return false;
        }
        await persistStatus(sdk, true);
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
        const dialog = sdk.getDialog();
        if (dialog?.isOpen && dialog.options.some((option: any) => /yes, ok/i.test(option.text))) break;
        if (dialog?.isOpen && dialog.options.length <= 1) {
            await sdk.sendClickDialog(0);
        } else if (!dialog?.isOpen) {
            const guard = sdk.getNearbyNpcs()
                .filter((npc: any) => /border guard/i.test(npc.name))
                .sort((a: any, b: any) => a.distance - b.distance)[0];
            if (guard) await sdk.sendInteractNpc(guard.index, 1);
        }
        await delay(700);
    }

    const paid = await sdk.clickDialogByText(/yes, ok/i);
    if (!paid.success) {
        await note(sdk, 'fleet travel', `Could not pay Al Kharid toll: ${paid.message}`, false);
        return false;
    }
    for (let i = 0; i < 10 && sdk.getDialog()?.isOpen; i += 1) {
        await sdk.sendClickDialog(0);
        await delay(500);
    }
    await delay(1_000);
    const arrived = sdk.getState()?.player;
    const passed = Boolean(arrived && !shouldPassAlKharidToll({ x: arrived.worldX, z: arrived.worldZ }));
    await note(sdk, 'fleet travel', passed ? 'Paid toll and entered Al Kharid' : 'Toll paid but gate crossing was not observed', passed);
    return passed;
}

async function fish(sdk: any, bot: any): Promise<void> {
    if (!await ensureAlKharidAccess(sdk, bot)) return;
    const player = sdk.getState()?.player;
    if (!player || Math.hypot(player.worldX - profile.home.x, player.worldZ - profile.home.z) > 15) {
        const walked = await bot.walkTo(profile.home.x, profile.home.z);
        await note(sdk, 'fishing supplier', walked.success ? 'Reached Al Kharid fishing spots' : walked.message, walked.success);
        return;
    }
    const spots = (sdk.getState()?.nearbyNpcs ?? []).filter((npc: any) =>
        /fishing\s*spot/i.test(npc.name)
        && npc.optionsWithIndex?.some((option: any) => /^net$/i.test(option.text))
        && npc.optionsWithIndex?.some((option: any) => /^bait$/i.test(option.text)),
    );
    const spot = spots.sort((a: any, b: any) => a.distance - b.distance)[0];
    const net = spot?.optionsWithIndex.find((option: any) => /^net$/i.test(option.text));
    if (!spot || !net) {
        await note(sdk, 'fishing supplier', 'Waiting for small-net fishing spot', false);
        await delay(1_000);
        return;
    }
    const before = sdk.getInventory().length;
    const result = await sdk.sendInteractNpc(spot.index, net.opIndex);
    if (!result.success) {
        await note(sdk, 'fishing supplier', `Fishing dispatch failed: ${result.message}`, false);
        return;
    }
    try {
        await sdk.waitForCondition((state: any) => state.inventory.length > before, 12_000);
        await note(sdk, 'fishing supplier', 'Caught fish');
    } catch {
        await note(sdk, 'fishing supplier', 'Fishing spot moved before catch', false);
    }
}

async function cook(sdk: any, bot: any): Promise<void> {
    if (!await ensureAlKharidAccess(sdk, bot)) return;
    const source = profile.processing ?? { x: 3100, z: 3256 };
    const walked = await bot.walkTo(source.x, source.z);
    if (!walked.success) {
        await note(sdk, 'cooking food', `Could not reach usable range: ${walked.message}`, false);
        return;
    }
    const raw = sdk.findInventoryItem(/^raw /i);
    const range = sdk.findNearbyLoc(/^(fireplace|range|fire|cooking pot)$/i);
    if (!raw || !range) {
        await note(sdk, 'cooking food', 'Raw fish or usable cooking source missing', false);
        return;
    }
    const result = await bot.useItemOnLoc(raw, range, { timeout: 15_000 });
    await note(sdk, 'cooking food', result.success ? `Cooked ${raw.name}` : result.message, result.success);
}

async function chopOrBurn(sdk: any, bot: any, action: WorkerAction): Promise<void> {
    const player = sdk.getState()?.player;
    if (!player || Math.hypot(player.worldX - profile.home.x, player.worldZ - profile.home.z) > 18) {
        const walked = await bot.walkTo(profile.home.x, profile.home.z);
        await note(sdk, 'wood supply', walked.success ? 'Reached Lumbridge trees' : walked.message, walked.success);
        return;
    }
    if (action === 'burn') {
        const result = await bot.burnLogs();
        await note(sdk, 'wood supply', result.success ? 'Burned logs for firemaking' : result.message, result.success);
    } else {
        const result = await bot.chopTree();
        await note(sdk, 'wood supply', result.success ? 'Chopped a tree' : result.message, result.success);
    }
}

async function eat(sdk: any): Promise<void> {
    const food = sdk.getInventory().find((item: any) => /bread|shrimps|kebab|meat|fish/i.test(item.name));
    const option = food?.optionsWithIndex?.find((entry: any) => /^eat$/i.test(entry.text));
    if (!food || !option) {
        await note(sdk, 'health recovery', 'No food available', false);
        return;
    }
    const result = await sdk.sendUseItem(food.slot, option.opIndex);
    await note(sdk, 'health recovery', result.success ? `Ate ${food.name}` : result.message, result.success);
}

async function supplyNets(sdk: any, bot: any): Promise<void> {
    let nets = sdk.getInventory()
        .filter((item: any) => /^small fishing net$/i.test(item.name))
        .reduce((sum: number, item: any) => sum + item.count, 0);
    if (nets === 0) {
        const toShop = [
            { x: 3150, z: 3250 },
            { x: 3070, z: 3260 },
            { x: 3048, z: 3236 },
            { x: 3014, z: 3224 },
        ];
        for (const point of toShop) {
            const walked = await bot.walkTo(point.x, point.z);
            if (!walked.success) {
                await note(sdk, 'fleet tool supply', `Could not reach Port Sarim fishing shop: ${walked.message}`, false);
                return;
            }
            await persistStatus(sdk, true);
        }
        const opened = await bot.openShop(/^gerrant$/i);
        if (!opened.success) {
            await note(sdk, 'fleet tool supply', opened.message, false);
            return;
        }
        const bought = await bot.buyFromShop(/^small fishing net$/i, 2);
        await bot.closeShop().catch(() => {});
        nets = sdk.getInventory()
            .filter((item: any) => /^small fishing net$/i.test(item.name))
            .reduce((sum: number, item: any) => sum + item.count, 0);
        if (!bought.success || nets === 0) {
            await note(sdk, 'fleet tool supply', `Could not buy replacement nets: ${bought.message}`, false);
            return;
        }
    }

    const toBanker = [
        { x: 3048, z: 3236 },
        { x: 3070, z: 3260 },
        { x: 3150, z: 3250 },
        VARROCK_BANK,
    ];
    for (const point of toBanker) {
        const walked = await bot.walkTo(point.x, point.z);
        if (!walked.success) {
            await note(sdk, 'fleet tool supply', `Could not reach fleet banker: ${walked.message}`, false);
            return;
        }
        await persistStatus(sdk, true);
    }
    const result = await bot.trade('Fszbank1', {
        give: [{ item: /^small fishing net$/i, amount: nets }],
        want: [],
        timeout: 120_000,
    });
    await note(sdk, 'fleet tool supply', result.message, result.success);
}

async function localCash(sdk: any, bot: any): Promise<void> {
    const player = sdk.getState()?.player;
    const westOfToll = Boolean(player && shouldPassAlKharidToll({ x: player.worldX, z: player.worldZ }));
    const home = westOfToll ? { x: 3207, z: 3227 } : { x: 3277, z: 3187 };
    if (!player || Math.hypot(player.worldX - home.x, player.worldZ - home.z) > 15) {
        const walked = await bot.walkTo(home.x, home.z);
        await note(sdk, 'fishing equipment cash', walked.success ? 'Reached local pickpocket area' : walked.message, walked.success);
        return;
    }
    const target = (sdk.getState()?.nearbyNpcs ?? []).find((npc: any) => /^man$/i.test(npc.name) && npc.optionsWithIndex?.some((entry: any) => /pickpocket/i.test(entry.text)));
    const option = target?.optionsWithIndex.find((entry: any) => /pickpocket/i.test(entry.text));
    if (!target || !option) {
        await note(sdk, 'fishing equipment cash', 'Waiting for local pickpocket target', false);
        await delay(800);
        return;
    }
    const result = await sdk.sendInteractNpc(target.index, option.opIndex);
    await delay(1_500);
    await note(sdk, 'fishing equipment cash', result.success ? 'Pickpocketed replacement-net cash' : result.message, result.success);
}

async function thieve(sdk: any, bot: any, label = 'cash generation'): Promise<void> {
    const home = { x: 3222, z: 3218 };
    const player = sdk.getState()?.player;
    if (!player || Math.hypot(player.worldX - home.x, player.worldZ - home.z) > 15) {
        const walked = await bot.walkTo(home.x, home.z);
        await note(sdk, label, walked.success ? 'Reached Lumbridge pickpocket area' : walked.message, walked.success);
        return;
    }
    const target = (sdk.getState()?.nearbyNpcs ?? []).find((npc: any) => /^man$/i.test(npc.name) && npc.optionsWithIndex?.some((o: any) => /pickpocket/i.test(o.text)));
    const option = target?.optionsWithIndex.find((entry: any) => /pickpocket/i.test(entry.text));
    if (!target || !option) {
        await note(sdk, label, 'Waiting for pickpocket target', false);
        await delay(800);
        return;
    }
    const result = await sdk.sendInteractNpc(target.index, option.opIndex);
    await delay(1_500);
    await note(sdk, label, result.success ? 'Pickpocket attempt' : result.message, result.success);
}

const runResult = await runScript(async ({ sdk, bot }: ScriptContext) => {
    await bootstrap(sdk, bot);
    await persistStatus(sdk, true);
    while (true) {
        await dismissDialog(sdk);
        const state = sdk.getState();
        if (!state?.player) throw new Error('No live player state');
        let action = chooseWorkerAction(ROLE, {
            inventory: sdk.getInventory().map((item: any) => ({ name: item.name, count: item.count })),
            inventorySlots: sdk.getInventory().length,
            hp: state.player.hp,
            maxHp: state.player.maxHp,
        });
        if (ROLE === 'banker' && pendingSupplyRequest()) action = 'serve-trades';
        if (ROLE === 'rune' && pendingSupplyRequest()?.item === 'Small fishing net') action = 'supply-net';
        activity = profile.label.toLowerCase();
        detail = `Next deterministic action: ${action}`;
        await persistStatus(sdk);

        if (action === 'mine') await mine(sdk, bot);
        else if (action === 'smelt') await smelt(sdk, bot);
        else if (action === 'smith') await smith(sdk, bot);
        else if (action === 'acquire-hammer') await acquireHammer(sdk, bot);
        else if (action === 'acquire-net') await acquireFishingNet(sdk, bot);
        else if (action === 'local-cash') await localCash(sdk, bot);
        else if (action === 'supply-net') await supplyNets(sdk, bot);
        else if (action === 'buy-runes') await buyRunes(sdk, bot);
        else if (action === 'fish') await fish(sdk, bot);
        else if (action === 'cook') await cook(sdk, bot);
        else if (action === 'bank') await depositInventory(sdk, bot);
        else if (action === 'chop' || action === 'burn') await chopOrBurn(sdk, bot, action);
        else if (action === 'eat') await eat(sdk);
        else if (action === 'recover') {
            await note(sdk, 'health recovery', 'Waiting safely for hitpoint regeneration');
            await delay(30_000);
        } else if (action === 'thieve') await thieve(sdk, bot);
        else if (action === 'bootstrap-cash') await thieve(sdk, bot, 'runecrafting bootstrap cash');
        else if (action === 'serve-trades') {
            const request = ROLE === 'banker' ? pendingSupplyRequest() : null;
            const supplying = Boolean(request);
            const requestedCoins = request?.item === 'Coins';
            const requestedPattern = requestedCoins ? /^coins$/i : /^small fishing net$/i;
            const requestedAmount = requestedCoins ? Number(request?.amount ?? 10) : 1;
            if (supplying && !sdk.findInventoryItem(requestedPattern)) {
                if (await openBankAt(sdk, bot, VARROCK_BANK)) {
                    const withdrawn = await bot.withdrawItem(requestedPattern, requestedAmount);
                    await bot.closeBank().catch(() => {});
                    if (!withdrawn.success) await note(sdk, 'trade logistics', `Could not stock ${request.item}: ${withdrawn.message}`, false);
                }
            }
            const stockedAmount = sdk.getInventory()
                .filter((item: any) => requestedPattern.test(item.name))
                .reduce((sum: number, item: any) => sum + item.count, 0);
            if (supplying && stockedAmount < requestedAmount) {
                if (!requestedCoins) {
                    await note(sdk, 'trade logistics', 'Waiting for Fszrune1 to replenish fishing nets');
                    const refill = await bot.serveTrades({ from: /^Fszrune1$/i, want: [{ item: /^small fishing net$/i, amount: 1 }], timeout: 30_000, tradeTimeout: 45_000 });
                    await note(sdk, 'trade logistics', refill.message, refill.success);
                } else {
                    await note(sdk, 'trade logistics', `Fleet bank has insufficient ${request.item} stock`, false);
                    await delay(5_000);
                }
                continue;
            }
            const walked = await bot.walkTo(VARROCK_BANK.x, VARROCK_BANK.z);
            if (!walked.success) {
                await note(sdk, 'trade logistics', walked.message, false);
            } else {
                await note(sdk, 'trade logistics', supplying ? `Offering ${request.item} to ${request.requester}` : 'Serving verified fleet trades at Varrock West bank');
                const result = supplying
                    ? await bot.serveTrades({ from: new RegExp(`^${request.requester}$`, 'i'), give: [{ item: requestedPattern, amount: requestedAmount }], timeout: 30_000, tradeTimeout: 45_000 })
                    : await bot.serveTrades({ from: /^Fsz/i, timeout: 30_000, tradeTimeout: 45_000 });
                if (supplying && result.success) {
                    await writeFile(supplyRequestPath(request.requester), `${JSON.stringify({ ...request, status: 'fulfilled', supplier: BOT_ID, message: result.message, updatedAt: new Date().toISOString() }, null, 2)}\n`);
                }
                await note(sdk, 'trade logistics', result.message, result.success);
            }
        }
        await delay(350);
    }
}, {
    disconnectAfter: true,
    onDisconnect: 'wait',
    reconnectTimeout: 120_000,
    printState: false,
});

if (shouldExitForRestart(runResult)) {
    console.error(`[${BOT_ID}:${ROLE}] fatal loop error; exiting for supervisor restart: ${runResult.error?.message ?? 'unknown error'}`);
    process.exit(1);
}
