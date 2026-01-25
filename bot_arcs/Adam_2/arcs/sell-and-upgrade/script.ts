/**
 * Arc: sell-and-upgrade
 * Character: Adam_2
 *
 * Goal: Bank current hides, withdraw all hides from bank, sell to general store,
 * then buy Adamant scimitar from Varrock sword shop.
 *
 * Current state:
 * - Attack 64 (can use Adamant at level 30)
 * - 11 hides in inventory, ~45 in bank
 * - Bronze sword equipped (weak!)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// Locations
const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3269 },
    VARROCK_WEST_BANK: { x: 3185, z: 3436 },
    VARROCK_SWORD_SHOP: { x: 3205, z: 3398 },  // Zaff's Superior Staffs (actually has swords too)
    LUMBRIDGE_GENERAL_STORE: { x: 3211, z: 3247 },
};

// Waypoints from cow field to Varrock West Bank
const WAYPOINTS_COW_TO_BANK = [
    { x: 3253, z: 3290 },
    { x: 3240, z: 3320 },
    { x: 3230, z: 3350 },
    { x: 3220, z: 3380 },
    { x: 3210, z: 3410 },
    { x: 3185, z: 3436 },
];

// Waypoints from Varrock to Lumbridge
const WAYPOINTS_VARROCK_TO_LUMBRIDGE = [
    { x: 3185, z: 3436 },
    { x: 3210, z: 3410 },
    { x: 3220, z: 3380 },
    { x: 3225, z: 3350 },
    { x: 3220, z: 3320 },
    { x: 3220, z: 3290 },
    { x: 3215, z: 3260 },
    { x: 3211, z: 3247 },
];

// Shorter path from cow field to Lumbridge (avoid going to Varrock)
const WAYPOINTS_COW_TO_LUMBRIDGE = [
    { x: 3253, z: 3280 },
    { x: 3240, z: 3270 },
    { x: 3230, z: 3260 },
    { x: 3220, z: 3250 },
    { x: 3211, z: 3247 },
];

// Waypoints from Lumbridge to Varrock sword shop
const WAYPOINTS_LUMBRIDGE_TO_VARROCK_SHOP = [
    { x: 3211, z: 3247 },
    { x: 3215, z: 3270 },
    { x: 3220, z: 3300 },
    { x: 3215, z: 3330 },
    { x: 3210, z: 3360 },
    { x: 3205, z: 3398 },
];

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /^coins$/i.test(i.name));
    return coins?.count ?? 0;
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

async function walkWaypoints(ctx: ScriptContext, waypoints: {x: number, z: number}[], label: string): Promise<void> {
    ctx.log('Walking ' + label + ' via ' + waypoints.length + ' waypoints...');

    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]!;
        await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx);

        for (let j = 0; j < 30; j++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx);

            // Dismiss dialogs
            if (ctx.state()?.dialog?.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }

            const player = ctx.state()?.player;
            if (player) {
                const dist = Math.sqrt(
                    Math.pow(player.worldX - wp.x, 2) +
                    Math.pow(player.worldZ - wp.z, 2)
                );
                if (dist < 10) break;
            }
        }
    }
}

async function openBank(ctx: ScriptContext): Promise<boolean> {
    // Dismiss any blocking dialog first
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (!banker) {
        ctx.warn('No banker found nearby');
        // Log what NPCs are nearby
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name + ' (' + n.distance + ')').join(', ');
        ctx.log('Nearby NPCs: ' + nearby);
        return false;
    }

    const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
    if (!bankOpt) {
        ctx.warn('Banker has no bank option');
        return false;
    }

    ctx.log('Interacting with banker...');
    await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

    // Wait for bank interface
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) {
            ctx.log('Bank opened');
            return true;
        }
        markProgress(ctx);
    }

    ctx.warn('Bank did not open');
    return false;
}

async function depositAllHides(ctx: ScriptContext): Promise<number> {
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    let deposited = 0;

    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
        deposited += hide.count ?? 1;
        await new Promise(r => setTimeout(r, 200));
        markProgress(ctx);
    }

    ctx.log('Deposited ' + deposited + ' hides');
    return deposited;
}

async function withdrawAllHides(ctx: ScriptContext): Promise<number> {
    const state = ctx.state();
    if (!state?.interface?.isOpen) return 0;

    // Bank contents aren't directly visible via SDK state
    // Hides were deposited over multiple sessions, they should be in early bank slots
    // Try withdrawing from slots 0-4 which typically contain recently deposited items

    const invBefore = ctx.state()?.inventory.length ?? 0;
    ctx.log('Attempting to withdraw hides from bank slots 0-4...');
    ctx.log('Inventory slots before: ' + invBefore);

    // Try to withdraw 25 items from each of first 5 slots
    // (bank slots may or may not contain hides)
    for (let slot = 0; slot < 5; slot++) {
        const currentInv = ctx.state()?.inventory.length ?? 0;
        if (currentInv >= 25) break;  // Inventory getting full

        await ctx.sdk.sendBankWithdraw(slot, 25);
        await new Promise(r => setTimeout(r, 400));
        markProgress(ctx);
    }

    await new Promise(r => setTimeout(r, 500));
    const invAfter = ctx.state()?.inventory.length ?? 0;
    const withdrawn = invAfter - invBefore;
    ctx.log('Inventory slots after: ' + invAfter + ' (withdrew ' + withdrawn + ' item stacks)');

    // Count hides we actually got
    const hidesWithdrawn = countItem(ctx, /cow\s*hide/i);
    ctx.log('Hides now in inventory: ' + hidesWithdrawn);

    return hidesWithdrawn;
}

async function sellHidesToShop(ctx: ScriptContext): Promise<number> {
    // Dismiss any blocking dialog first
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    // Open general store
    const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop.?keeper/i.test(n.name));
    if (!shopkeeper) {
        ctx.warn('No shopkeeper found');
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', ');
        ctx.log('Nearby NPCs: ' + nearby);
        return 0;
    }

    const tradeOpt = shopkeeper.optionsWithIndex?.find(o => /trade/i.test(o.text));
    if (!tradeOpt) {
        ctx.warn('Shopkeeper has no trade option');
        return 0;
    }

    ctx.log('Opening shop...');
    await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);

    // Wait for shop interface
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.shop?.isOpen) {
            ctx.log('Shop opened');
            break;
        }
        markProgress(ctx);
    }

    // Sell all hides using the proper bot method
    const gpBefore = getCoins(ctx);
    const hidesBefore = countItem(ctx, /cow\s*hide/i);
    ctx.log('Hides in inventory: ' + hidesBefore + ', GP before: ' + gpBefore);
    let sold = 0;

    for (let attempt = 0; attempt < 50; attempt++) {
        const hideCount = countItem(ctx, /cow\s*hide/i);
        if (hideCount === 0) break;

        const result = await ctx.bot.sellToShop(/cow\s*hide/i, 1);
        if (result.success) {
            sold++;
            ctx.log('Sold hide #' + sold);
        } else {
            ctx.warn('Sell failed: ' + result.message);
            break;
        }

        await new Promise(r => setTimeout(r, 200));
        markProgress(ctx);
    }

    const gpAfter = getCoins(ctx);
    const earned = gpAfter - gpBefore;
    ctx.log('Sold ' + sold + ' hides for ' + earned + 'gp (now have ' + gpAfter + 'gp)');

    await ctx.bot.closeShop();
    return earned;
}

async function buySwordFromShop(ctx: ScriptContext): Promise<boolean> {
    const gp = getCoins(ctx);
    ctx.log('Attempting to buy sword with ' + gp + 'gp');

    // Find sword shop NPC - in Varrock this is "Shopkeeper" or specific sword shop
    const swordShopNpc = ctx.state()?.nearbyNpcs.find(n =>
        /shop.?keeper|sword/i.test(n.name)
    );

    if (!swordShopNpc) {
        ctx.warn('No sword shop NPC found nearby');
        // List what NPCs ARE nearby
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', ');
        ctx.log('Nearby NPCs: ' + nearby);
        return false;
    }

    const tradeOpt = swordShopNpc.optionsWithIndex?.find(o => /trade/i.test(o.text));
    if (!tradeOpt) {
        ctx.warn('NPC has no trade option');
        return false;
    }

    await ctx.sdk.sendInteractNpc(swordShopNpc.index, tradeOpt.opIndex);

    // Wait for shop interface
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.shop?.isOpen) {
            ctx.log('Shop opened: ' + (ctx.state()?.shop?.title || 'unknown'));
            break;
        }
        markProgress(ctx);
    }

    if (!ctx.state()?.shop?.isOpen) {
        ctx.warn('Shop did not open');
        return false;
    }

    // Look for adamant scimitar or sword
    const shopItems = ctx.state()?.shop?.shopItems ?? [];
    ctx.log('Shop has ' + shopItems.length + ' items');

    // Log shop contents
    for (const item of shopItems.slice(0, 10)) {
        ctx.log('  - ' + item.name + ' (slot ' + item.slot + ')');
    }

    // Try to find best weapon we can afford
    // Prices are rough estimates, shop prices vary
    const weaponPriority = [
        { pattern: /rune.*scimitar/i, maxPrice: 25000 },
        { pattern: /rune.*sword/i, maxPrice: 21000 },
        { pattern: /adamant.*scimitar/i, maxPrice: 5000 },
        { pattern: /adamant.*sword/i, maxPrice: 2100 },
        { pattern: /mithril.*scimitar/i, maxPrice: 1300 },
        { pattern: /mithril.*sword/i, maxPrice: 850 },
        { pattern: /steel.*scimitar/i, maxPrice: 500 },
        { pattern: /steel.*sword/i, maxPrice: 330 },
        { pattern: /iron.*scimitar/i, maxPrice: 150 },
        { pattern: /iron.*sword/i, maxPrice: 95 },
    ];

    for (const weapon of weaponPriority) {
        const found = shopItems.find(i => weapon.pattern.test(i.name));
        if (found && gp >= weapon.maxPrice) {
            ctx.log('Buying ' + found.name + '...');
            // Buy from shop (slot, quantity)
            await ctx.sdk.sendShopBuy(found.slot, 1);
            await new Promise(r => setTimeout(r, 500));

            // Check if we got it
            const newWeapon = ctx.state()?.inventory.find(i => weapon.pattern.test(i.name));
            if (newWeapon) {
                ctx.log('Successfully bought ' + newWeapon.name + '!');

                // Equip it
                const wieldOpt = newWeapon.optionsWithIndex?.find(o => /wield|equip/i.test(o.text));
                if (wieldOpt) {
                    await ctx.sdk.sendUseItem(newWeapon.slot, wieldOpt.opIndex);
                    ctx.log('Equipped ' + newWeapon.name);
                }

                await ctx.bot.closeShop();
                return true;
            }
        }
    }

    ctx.warn('Could not find/afford any weapon upgrades');
    await ctx.bot.closeShop();
    return false;
}

async function dropJunk(ctx: ScriptContext): Promise<number> {
    // Drop raw beef and other junk to make room for hides
    const junkItems = ctx.state()?.inventory.filter(i =>
        /raw\s*beef|bones|logs|ore/i.test(i.name)
    ) ?? [];

    let dropped = 0;
    for (const item of junkItems) {
        await ctx.sdk.sendDropItem(item.slot);
        dropped++;
        await new Promise(r => setTimeout(r, 150));
        markProgress(ctx);
    }

    if (dropped > 0) {
        ctx.log('Dropped ' + dropped + ' junk items');
    }
    return dropped;
}

// Main arc
runArc({
    characterName: 'Adam_2',
    arcName: 'sell-and-upgrade',
    goal: 'Sell hides, buy best weapon',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 90_000,  // 90 seconds - state sync can take a while
    screenshotInterval: 20_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    ctx.log('=== Arc: sell-and-upgrade ===');
    ctx.log('Goal: Sell cowhides, buy best available weapon');

    // Wait for game state to load (position must be valid) - can take 40+ seconds with T1 errors
    ctx.log('Waiting for game state to load (may take up to 60s)...');
    for (let i = 0; i < 60; i++) {
        const player = ctx.state()?.player;
        if (player && player.worldX > 100 && player.worldZ > 100) {
            ctx.log('State loaded: position (' + player.worldX + ', ' + player.worldZ + ')');
            break;
        }
        if (i % 10 === 0) {
            ctx.log('Waiting... attempt ' + i);
        }
        await new Promise(r => setTimeout(r, 1000));
        markProgress(ctx);
    }

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    ctx.log('Current GP: ' + getCoins(ctx));
    const currentHides = countItem(ctx, /cow\s*hide/i);
    ctx.log('Current hides in inventory: ' + currentHides);
    ctx.log('Inventory size: ' + (ctx.state()?.inventory.length ?? 0));

    // Skip banking if we already have hides in inventory (saves a long walk)
    if (currentHides >= 10) {
        ctx.log('');
        ctx.log('=== Skipping banking - already have ' + currentHides + ' hides in inventory ===');
        // Just drop junk to make sure we can sell
        await dropJunk(ctx);
    } else {
        // Step 0: Drop junk items (raw beef etc) to make room
        ctx.log('');
        ctx.log('=== Step 0: Drop junk items ===');
        await dropJunk(ctx);

        // Step 1: Walk to bank and deposit current hides
        ctx.log('');
        ctx.log('=== Step 1: Bank current hides ===');
        await walkWaypoints(ctx, WAYPOINTS_COW_TO_BANK, 'to Varrock West Bank');

        if (await openBank(ctx)) {
            await depositAllHides(ctx);

            // Step 2: Withdraw all hides from bank (max 25 per trip)
            ctx.log('');
            ctx.log('=== Step 2: Withdraw hides from bank ===');
            await withdrawAllHides(ctx);
            await ctx.bot.closeShop();
        }
    }

    // Step 3: Walk to Lumbridge and sell
    ctx.log('');
    ctx.log('=== Step 3: Sell hides at Lumbridge ===');
    // Use shorter path if we're near cow field (skipped banking)
    if (currentHides >= 10) {
        await walkWaypoints(ctx, WAYPOINTS_COW_TO_LUMBRIDGE, 'to Lumbridge (short path)');
    } else {
        await walkWaypoints(ctx, WAYPOINTS_VARROCK_TO_LUMBRIDGE, 'to Lumbridge');
    }
    await sellHidesToShop(ctx);

    // Step 4: Walk to Varrock sword shop
    ctx.log('');
    ctx.log('=== Step 4: Buy weapon upgrade ===');
    await walkWaypoints(ctx, WAYPOINTS_LUMBRIDGE_TO_VARROCK_SHOP, 'to Varrock shops');
    const bought = await buySwordFromShop(ctx);

    if (!bought) {
        ctx.log('Failed to buy weapon - checking nearby shops');
        // Try walking a bit to find the sword shop
        await ctx.bot.walkTo(3200, 3400);
        await new Promise(r => setTimeout(r, 2000));
        await buySwordFromShop(ctx);
    }

    ctx.log('');
    ctx.log('=== Final State ===');
    ctx.log('GP: ' + getCoins(ctx));
    ctx.log('Hides remaining: ' + countItem(ctx, /cow\s*hide/i));

    const equipped = ctx.state()?.equipment.filter(e => e !== null) ?? [];
    ctx.log('Equipment: ' + equipped.map(e => e?.name).join(', '));
});
