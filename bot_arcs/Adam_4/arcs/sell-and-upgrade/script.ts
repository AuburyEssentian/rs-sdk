/**
 * Arc: sell-and-upgrade
 * Character: Adam_4
 *
 * Goal: Sell unneeded items, buy better equipment
 *
 * Strategy:
 * 1. Walk to Lumbridge general store
 * 2. Sell unneeded starter items
 * 3. Walk to Varrock sword shop
 * 4. Buy best affordable weapon
 *
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// Locations
const LOCATIONS = {
    LUMBRIDGE_GEN_STORE: { x: 3211, z: 3247 },  // Lumbridge general store
    VARROCK_SWORD_SHOP: { x: 3203, z: 3398 },   // Varrock sword shop (opposite Blue Moon Inn)
    VARROCK_BANK: { x: 3185, z: 3436 },         // Varrock West bank
};

// Waypoints from cow field to Lumbridge general store
const COW_FIELD_TO_LUM_STORE = [
    { x: 3253, z: 3255 },  // Cow field gate
    { x: 3230, z: 3240 },  // Towards Lumbridge
    { x: 3211, z: 3247 },  // General store
];

// Waypoints from Lumbridge to Varrock sword shop
const LUM_TO_VARROCK_SHOP = [
    { x: 3220, z: 3260 },  // North of Lumbridge
    { x: 3210, z: 3290 },  // North more
    { x: 3200, z: 3320 },  // Midway
    { x: 3200, z: 3350 },  // Past Dark Wizards (go west to avoid)
    { x: 3200, z: 3380 },  // Approaching Varrock
    { x: 3203, z: 3398 },  // Sword shop
];

// Items we want to KEEP (don't sell)
const KEEP_ITEMS = [
    /coins/i,
    /bronze sword/i,  // Our current weapon
    /iron sword/i,    // Better weapon
    /steel sword/i,   // Even better
    /bronze dagger/i, // Backup weapon
    /food|shrimp|bread|meat|trout/i,  // Food
];

// Items we can sell
const SELLABLE_ITEMS = [
    /bronze axe/i,      // Don't need for combat
    /tinderbox/i,       // Don't need
    /fishing net/i,     // Don't need
    /bronze pickaxe/i,  // Don't need for combat
    /wooden shield/i,   // Useless
    /shortbow/i,        // Not using ranged
    /arrow/i,           // Not using ranged
    /rune$/i,           // All runes
    /bucket/i,          // Don't need
    /pot$/i,            // Don't need
    /raw beef/i,        // Raw food is less valuable
    /cow\s*hide/i,      // Sell hides
    /bones/i,           // Worthless
];

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

async function waitUntilOutOfCombat(ctx: ScriptContext): Promise<void> {
    ctx.log('Waiting to exit combat...');

    // Try to run away from current position to break combat
    const player = ctx.state()?.player;
    if (player && player.worldX > 0) {
        // Run south (away from cow field)
        ctx.log('Running away from combat...');
        await ctx.sdk.sendWalk(player.worldX - 10, player.worldZ - 10, true);
        await new Promise(r => setTimeout(r, 2000));
        ctx.progress();
    }

    for (let i = 0; i < 15; i++) {
        const p = ctx.state()?.player;
        // Check if in combat (animation playing or explicit combat flag)
        const inCombat = p?.animId !== -1 && p?.animId !== 808;
        if (!inCombat) {
            ctx.log('Out of combat, can walk now');
            return;
        }
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();
    }
    ctx.log('Timed out waiting for combat to end, proceeding anyway');
}

async function walkWaypoints(ctx: ScriptContext, waypoints: Array<{ x: number; z: number }>): Promise<boolean> {
    // First, wait until we're out of combat
    await waitUntilOutOfCombat(ctx);

    for (const wp of waypoints) {
        ctx.log(`Walking to waypoint (${wp.x}, ${wp.z})...`);

        for (let attempt = 0; attempt < 5; attempt++) {
            // Check if we're in combat and need to wait
            const animId = ctx.state()?.player?.animId ?? -1;
            if (animId !== -1 && animId !== 808) {
                ctx.log('In combat, waiting...');
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            await ctx.bot.walkTo(wp.x, wp.z);
            await new Promise(r => setTimeout(r, 1500));  // Give more time to walk
            ctx.progress();

            const player = ctx.state()?.player;
            if (!player || player.worldX === 0) continue;

            const dist = Math.sqrt(
                Math.pow(player.worldX - wp.x, 2) +
                Math.pow(player.worldZ - wp.z, 2)
            );

            if (dist <= 10) break;  // Close enough
            ctx.log(`  Attempt ${attempt + 1}: ${dist.toFixed(0)} tiles away`);
        }

        // Dismiss any dialogs that pop up
        if (ctx.state()?.dialog?.isOpen) {
            await ctx.bot.dismissBlockingUI();
        }
    }
    return true;
}

async function sellAtShop(ctx: ScriptContext): Promise<number> {
    ctx.log('=== Opening general store ===');

    // Debug: Log nearby NPCs
    const npcs = ctx.state()?.nearbyNpcs.slice(0, 10) ?? [];
    ctx.log(`Nearby NPCs: ${npcs.map(n => `${n.name}(${n.distance})`).join(', ')}`);

    // Find shopkeeper - try multiple patterns
    let result = await ctx.bot.openShop(/shop\s*(keeper|assistant)/i);
    if (!result.success) {
        // Try just "shop"
        result = await ctx.bot.openShop(/shop/i);
    }
    if (!result.success) {
        ctx.warn(`Failed to open shop: ${result.message}`);
        return 0;
    }

    ctx.log('Shop opened, selling items...');
    await new Promise(r => setTimeout(r, 500));

    let totalSold = 0;
    const coinsBefore = getCoins(ctx);

    // Sell each sellable item type
    for (const pattern of SELLABLE_ITEMS) {
        // Find item in inventory
        const item = ctx.sdk.findInventoryItem(pattern);
        if (!item) continue;

        ctx.log(`  Selling ${item.name}...`);
        const sellResult = await ctx.bot.sellToShop(item, 'all');
        if (sellResult.success) {
            ctx.log(`    Sold ${sellResult.amountSold ?? 'some'} ${item.name}`);
            totalSold += sellResult.amountSold ?? 1;
        } else {
            ctx.log(`    Failed: ${sellResult.message}`);
        }

        await new Promise(r => setTimeout(r, 300));
        ctx.progress();
    }

    const coinsAfter = getCoins(ctx);
    ctx.log(`Sold ${totalSold} items for ${coinsAfter - coinsBefore} GP`);

    // Close shop
    await ctx.bot.closeShop();
    return coinsAfter - coinsBefore;
}

async function buyWeapon(ctx: ScriptContext): Promise<boolean> {
    ctx.log('=== Opening sword shop ===');

    // Find shopkeeper
    const result = await ctx.bot.openShop(/shop\s*(keeper|assistant)/i);
    if (!result.success) {
        ctx.warn(`Failed to open sword shop: ${result.message}`);
        return false;
    }

    ctx.log('Shop opened, checking weapons...');
    await new Promise(r => setTimeout(r, 500));

    const coins = getCoins(ctx);
    ctx.log(`Available GP: ${coins}`);

    // Check what we can afford (in order of preference)
    // Prices are approximate
    const weapons = [
        { name: /adamant long/i, price: 2880 },
        { name: /adamant sword/i, price: 1920 },
        { name: /mithril long/i, price: 1040 },
        { name: /mithril sword/i, price: 650 },
        { name: /steel long/i, price: 400 },
        { name: /steel sword/i, price: 260 },
        { name: /iron long/i, price: 140 },
        { name: /iron sword/i, price: 91 },
    ];

    for (const weapon of weapons) {
        if (coins < weapon.price * 1.5) continue;  // Need ~1.5x for safety margin

        const shop = ctx.state()?.shop;
        if (!shop?.isOpen) break;

        const shopItem = shop.shopItems.find(i => weapon.name.test(i.name));
        if (!shopItem || shopItem.count === 0) continue;

        ctx.log(`Buying ${shopItem.name} for ~${weapon.price} GP...`);
        const buyResult = await ctx.bot.buyFromShop(shopItem, 1);

        if (buyResult.success) {
            ctx.log(`Bought ${buyResult.item?.name}!`);
            await ctx.bot.closeShop();
            return true;
        } else {
            ctx.log(`Failed to buy: ${buyResult.message}`);
        }

        ctx.progress();
    }

    ctx.log('No affordable weapons in shop');
    await ctx.bot.closeShop();
    return false;
}

runArc({
    characterName: 'Adam_4',
    arcName: 'sell-and-upgrade',
    goal: 'Sell items, buy better weapon',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    // Wait for valid game state with extended timeout
    ctx.log('Waiting for game state...');
    let stateLoaded = false;
    for (let i = 0; i < 60; i++) {  // 30 seconds
        const state = ctx.state();
        if (state?.player?.worldX !== 0 && state?.player?.worldZ !== 0) {
            ctx.log(`State loaded after ${i * 500}ms`);
            stateLoaded = true;
            break;
        }
        if (i % 10 === 0) ctx.log(`Waiting for state... (${i * 500}ms)`);
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
    }

    if (!stateLoaded) {
        ctx.error('State never loaded - aborting arc');
        return;
    }

    const state = ctx.state();
    ctx.log('=== Arc: sell-and-upgrade (Adam_4) ===');
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    ctx.log(`Inventory: ${state?.inventory.length} items`);
    ctx.log(`GP: ${getCoins(ctx)}`);

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    // Step 1: Walk to Lumbridge general store
    ctx.log('');
    ctx.log('=== Step 1: Walk to Lumbridge general store ===');
    await walkWaypoints(ctx, COW_FIELD_TO_LUM_STORE);

    // Step 2: Sell items
    ctx.log('');
    ctx.log('=== Step 2: Sell items ===');
    const goldEarned = await sellAtShop(ctx);
    ctx.log(`Gold earned from selling: ${goldEarned}`);

    // Step 3: Walk to Varrock sword shop (if we have enough gold)
    const currentGold = getCoins(ctx);
    ctx.log(`Current gold: ${currentGold}`);

    if (currentGold >= 100) {
        ctx.log('');
        ctx.log('=== Step 3: Walk to Varrock sword shop ===');
        await walkWaypoints(ctx, LUM_TO_VARROCK_SHOP);

        // Step 4: Buy weapon
        ctx.log('');
        ctx.log('=== Step 4: Buy weapon ===');
        const bought = await buyWeapon(ctx);
        if (bought) {
            ctx.log('Successfully upgraded weapon!');
        }
    } else {
        ctx.log('Not enough gold to bother walking to Varrock');
    }

    // Final stats
    ctx.log('');
    ctx.log('=== Final State ===');
    ctx.log(`GP: ${getCoins(ctx)}`);
    ctx.log(`Total Level: ${getTotalLevel(ctx)}`);
    ctx.log(`Inventory: ${ctx.state()?.inventory.length} items`);

    const equipment = ctx.state()?.equipment ?? [];
    ctx.log(`Equipment: ${equipment.map(e => e.name).join(', ') || 'None'}`);
});
