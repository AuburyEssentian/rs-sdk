/**
 * Arc: sell-hides
 * Character: Adam_2
 *
 * Goal: Withdraw hides from Draynor bank and sell to Lumbridge general store.
 * Strategy:
 * 1. Open Draynor bank
 * 2. Withdraw all cow hides
 * 3. Walk to Lumbridge general store
 * 4. Sell hides
 * 5. Return to bank and repeat until all hides sold
 *
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// === LOCATIONS ===
const LOCATIONS = {
    DRAYNOR_BANK: { x: 3092, z: 3243 },
    LUMBRIDGE_GENERAL_STORE: { x: 3211, z: 3247 },
};

// Waypoints from Draynor Bank to Lumbridge General Store (east of Draynor)
const WAYPOINTS_TO_STORE = [
    { x: 3110, z: 3243 },  // East from bank
    { x: 3140, z: 3245 },  // Continue east
    { x: 3170, z: 3247 },  // Continue east
    { x: 3200, z: 3247 },  // Near Lumbridge
    { x: 3211, z: 3247 },  // General store
];

const WAYPOINTS_TO_BANK = [
    { x: 3200, z: 3247 },  // West from store
    { x: 3170, z: 3247 },  // Continue west
    { x: 3140, z: 3245 },  // Continue west
    { x: 3110, z: 3243 },  // Near Draynor
    { x: 3092, z: 3243 },  // Draynor Bank
];

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function countHides(ctx: ScriptContext): number {
    const inv = ctx.state()?.inventory ?? [];
    return inv.filter(i => /cow\s*hide/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

// Walk using bot.walkTo which handles pathfinding
async function walkWaypoints(ctx: ScriptContext, waypoints: {x: number, z: number}[]): Promise<boolean> {
    for (let wpIdx = 0; wpIdx < waypoints.length; wpIdx++) {
        const wp = waypoints[wpIdx]!;
        const player = ctx.state()?.player;
        const startDist = player ? Math.sqrt(
            Math.pow(player.worldX - wp.x, 2) +
            Math.pow(player.worldZ - wp.z, 2)
        ) : 999;

        ctx.log(`Walking to waypoint ${wpIdx + 1}/${waypoints.length}: (${wp.x}, ${wp.z}) - ${Math.round(startDist)} tiles away`);

        // Dismiss dialogs first
        if (ctx.state()?.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }

        const result = await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx);

        if (!result.success) {
            ctx.warn(`Walk failed: ${result.message}`);
            // Try opening doors and retry
            await ctx.bot.openDoor(/door|gate/i);
            await new Promise(r => setTimeout(r, 500));
            const retry = await ctx.bot.walkTo(wp.x, wp.z);
            if (!retry.success) {
                ctx.warn(`Walk retry failed: ${retry.message}`);
            }
        }

        const afterPlayer = ctx.state()?.player;
        if (afterPlayer) {
            ctx.log(`Now at: (${afterPlayer.worldX}, ${afterPlayer.worldZ})`);
        }
    }
    return true;
}

// Open bank and withdraw hides
async function withdrawHides(ctx: ScriptContext): Promise<number> {
    ctx.log('=== Opening Bank ===');

    // Find and interact with banker
    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (!banker) {
        ctx.warn('No banker found!');
        return 0;
    }

    const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
    if (!bankOpt) {
        ctx.warn('No bank option on banker');
        return 0;
    }

    await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

    // Wait for bank to open
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) {
            ctx.log('Bank opened!');
            break;
        }
        markProgress(ctx);
    }

    if (!ctx.state()?.interface?.isOpen) {
        ctx.warn('Bank did not open');
        return 0;
    }

    // Wait for bank contents to populate
    await new Promise(r => setTimeout(r, 500));

    // WORKAROUND: Bank contents don't populate in shop.shopItems
    // Try to withdraw from slot 0 directly (hides should be first item deposited)
    const invBefore = ctx.state()?.inventory?.length ?? 0;
    ctx.log(`Inventory before withdrawal: ${invBefore} items`);

    // Try withdrawing from slot 0 (where hides should be)
    ctx.log('Attempting to withdraw all items from bank slot 0...');
    await ctx.sdk.sendBankWithdraw(0, 27);
    await new Promise(r => setTimeout(r, 1000));  // Longer wait for items to appear
    markProgress(ctx);

    // Check if we got anything
    let invAfter = ctx.state()?.inventory?.length ?? 0;
    ctx.log(`Inventory after withdrawal: ${invAfter} items`);

    // Wait a bit more for delayed inventory update
    if (invAfter === invBefore) {
        ctx.log('No items yet, waiting longer...');
        await new Promise(r => setTimeout(r, 1000));
        invAfter = ctx.state()?.inventory?.length ?? 0;
        ctx.log(`Inventory after longer wait: ${invAfter} items`);
    }

    // Also check for hide count directly
    const hidesNow = countHides(ctx);
    ctx.log(`Hides in inventory: ${hidesNow}`);

    if (invAfter === invBefore && hidesNow === 0) {
        ctx.log('No items withdrawn - bank may be empty');
        await ctx.bot.closeShop();
        return 0;
    }

    await new Promise(r => setTimeout(r, 500));
    await ctx.bot.closeShop();

    const withdrawn = countHides(ctx);
    ctx.log(`Withdrew ${withdrawn} hides`);
    return withdrawn;
}

// Sell hides to shop
async function sellHides(ctx: ScriptContext): Promise<{ sold: number; gpEarned: number }> {
    ctx.log('=== Selling Hides ===');

    const gpBefore = getCoins(ctx);
    const hidesBefore = countHides(ctx);

    // Open shop
    const shopResult = await ctx.bot.openShop(/shop\s*keeper|shop assistant/i);
    if (!shopResult.success) {
        ctx.warn(`Failed to open shop: ${shopResult.message}`);
        return { sold: 0, gpEarned: 0 };
    }

    ctx.log('Shop opened!');
    await new Promise(r => setTimeout(r, 500));

    // Sell all hides
    const sellResult = await ctx.bot.sellToShop(/cow\s*hide/i, 'all');
    if (!sellResult.success) {
        ctx.warn(`Sell failed: ${sellResult.message}`);
    } else {
        ctx.log(`Sold: ${sellResult.amountSold} hides`);
    }

    await new Promise(r => setTimeout(r, 500));
    await ctx.bot.closeShop();

    const gpAfter = getCoins(ctx);
    const hidesAfter = countHides(ctx);

    const sold = hidesBefore - hidesAfter;
    const gpEarned = gpAfter - gpBefore;

    ctx.log(`Sold ${sold} hides for ${gpEarned} GP`);
    return { sold, gpEarned };
}

// === RUN THE ARC ===
runArc({
    characterName: 'Adam_2',
    arcName: 'sell-hides',
    goal: 'Sell cow hides for GP',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    let totalSold = 0;
    let totalGP = 0;
    let trips = 0;

    ctx.log('=== Arc: sell-hides ===');
    ctx.log('Goal: Sell banked cow hides at Lumbridge General Store');

    // Wait for state
    ctx.log('Waiting for state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.error('State did not populate');
        return;
    }
    await new Promise(r => setTimeout(r, 500));

    const state = ctx.state();
    if (!state?.player || state.player.worldX === 0) {
        ctx.error('Invalid state');
        return;
    }

    ctx.log('Position: (' + state.player.worldX + ', ' + state.player.worldZ + ')');
    ctx.log('Current GP: ' + getCoins(ctx));
    ctx.log('Hides in inventory: ' + countHides(ctx));

    // Dismiss dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx);

    // First, walk to bank
    ctx.log('Walking to Draynor Bank...');
    await walkWaypoints(ctx, WAYPOINTS_TO_BANK);

    // Main loop: withdraw -> sell -> repeat
    while (true) {
        trips++;
        ctx.log(`=== Trip ${trips} ===`);

        // Withdraw hides from bank
        const withdrawn = await withdrawHides(ctx);
        if (withdrawn === 0) {
            ctx.log('No more hides to sell');
            break;
        }

        // Walk to general store
        ctx.log('Walking to Lumbridge General Store...');
        await walkWaypoints(ctx, WAYPOINTS_TO_STORE);

        // Sell hides
        const { sold, gpEarned } = await sellHides(ctx);
        totalSold += sold;
        totalGP += gpEarned;

        ctx.log(`Total sold: ${totalSold} hides, Total GP: ${totalGP}`);

        // Walk back to bank
        ctx.log('Walking back to bank...');
        await walkWaypoints(ctx, WAYPOINTS_TO_BANK);
    }

    // Final stats
    ctx.log('');
    ctx.log('=== Final Stats ===');
    ctx.log('Trips: ' + trips);
    ctx.log('Total hides sold: ' + totalSold);
    ctx.log('Total GP earned: ' + totalGP);
    ctx.log('Current GP: ' + getCoins(ctx));
});
