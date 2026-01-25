/**
 * Al Kharid Travel Script
 *
 * Goal: Get to Al Kharid as fast as possible from Lumbridge (starting with 0gp).
 *
 * Strategy:
 * 1. Kill men in Lumbridge to get 10gp
 * 2. Pay toll at gate
 */

import { runScript } from '../script-runner';
import type { ScriptContext } from '../script-runner';

// Locations
const LUMBRIDGE_MEN = { x: 3235, z: 3205 };  // Men near Lumbridge castle
const INSIDE_AL_KHARID = { x: 3277, z: 3227 };

/**
 * Check if we're inside Al Kharid (east of x=3270)
 */
function isInsideAlKharid(ctx: ScriptContext): boolean {
    const state = ctx.state();
    if (!state?.player) return false;
    return state.player.worldX >= 3270;
}

/**
 * Get current coin count
 */
function getCoins(ctx: ScriptContext): number {
    const coins = ctx.sdk.findInventoryItem(/^coins$/i);
    return coins?.count ?? 0;
}

/**
 * Source coins by selling items to Lumbridge general store
 */
async function sourceCoinsFromShop(ctx: ScriptContext): Promise<boolean> {
    ctx.log('Selling items at general store...');

    // Walk to Lumbridge general store
    await ctx.bot.walkTo(3211, 3247);
    ctx.progress();

    // Open shop
    const openResult = await ctx.bot.openShop(/shop keeper/i);
    if (!openResult.success) {
        ctx.log(`Failed to open shop: ${openResult.message}`);
        return false;
    }
    ctx.log('Shop opened');
    ctx.progress();

    // Sell shortbow first (should be worth more), then runes
    const itemsToSell = [
        /shortbow/i,      // Try this first - bows usually sell for more
        /air rune/i,
        /mind rune/i,
        /water rune/i,
    ];

    for (const pattern of itemsToSell) {
        if (getCoins(ctx) >= 10) break;

        const result = await ctx.bot.sellToShop(pattern, 'all');
        if (result.success) {
            ctx.log(result.message);
            ctx.progress();
        }
    }

    // Close shop
    await ctx.bot.closeShop();

    const coins = getCoins(ctx);
    ctx.log(`Have ${coins}gp after selling`);
    return coins >= 10;
}

/**
 * Source coins by killing men (backup method)
 */
async function sourceCoinsFromCombat(ctx: ScriptContext): Promise<boolean> {
    ctx.log('Killing men for coins...');

    // Walk to area with men (courtyard area)
    await ctx.bot.walkTo(3233, 3218);
    ctx.progress();

    // Log nearby NPCs
    const npcs = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => `${n.name}(${n.distance})`) ?? [];
    ctx.log(`Nearby NPCs: ${npcs.join(', ')}`);

    // Kill men until we have 10gp
    for (let attempt = 0; attempt < 50 && getCoins(ctx) < 10; attempt++) {
        // Pick up any coins on ground first
        const groundCoins = ctx.sdk.getGroundItems().find(i => /coins/i.test(i.name));
        if (groundCoins) {
            ctx.log('Picking up coins...');
            await ctx.bot.pickupItem(groundCoins);
            ctx.progress();
            continue;
        }

        // Check if we're in combat already
        const player = ctx.state()?.player;
        if (player?.combat?.inCombat) {
            await new Promise(r => setTimeout(r, 2000));
            ctx.progress();
            continue;
        }

        // Find a man to attack
        const man = ctx.sdk.findNearbyNpc(/^man$|^woman$/i);
        if (man && man.distance < 10) {
            ctx.log(`Attacking ${man.name}...`);
            const attackOpt = man.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                await ctx.sdk.sendInteractNpc(man.index, attackOpt.opIndex);
                await new Promise(r => setTimeout(r, 5000));  // Wait for kill
                ctx.progress();
            }
        } else {
            // Walk around to find men
            ctx.log('Looking for men...');
            await ctx.bot.walkTo(3233 + (Math.random() - 0.5) * 20, 3218 + (Math.random() - 0.5) * 20);
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    ctx.log(`Final coins: ${getCoins(ctx)}`);
    return getCoins(ctx) >= 10;
}

/**
 * Toll route: walk to gate, pay toll, walk through
 */
async function tollRoute(ctx: ScriptContext): Promise<boolean> {
    ctx.log('Taking toll route (10gp)...');

    // Walk to the gate area
    await ctx.bot.walkTo(3268, 3228);
    ctx.progress();

    // Find the gate and interact with it
    const state = ctx.state();
    const gate = state?.nearbyLocs.find(l => /gate/i.test(l.name) && l.distance < 10);

    if (!gate) {
        ctx.log('No gate found nearby!');
        return false;
    }

    ctx.log(`Gate options: ${gate.options.join(', ')}`);
    const opt = gate.optionsWithIndex.find(o => /pay|open/i.test(o.text));

    if (!opt) {
        ctx.log('No open/pay option on gate');
        return false;
    }

    // Click the gate to trigger dialog
    ctx.log(`Clicking "${opt.text}" on gate...`);
    await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, opt.opIndex);
    await new Promise(r => setTimeout(r, 800));

    // Handle dialog - click through until we pay
    let paidToll = false;
    for (let i = 0; i < 20 && !paidToll; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 150));
            continue;
        }

        const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
        if (yesOpt) {
            ctx.log('Paying toll...');
            await ctx.sdk.sendClickDialog(yesOpt.index);
            paidToll = true;
        } else {
            await ctx.sdk.sendClickDialog(0);  // Click to continue
        }
        await new Promise(r => setTimeout(r, 200));
        ctx.progress();
    }

    // Wait for gate to open and dialog to close
    await new Promise(r => setTimeout(r, 500));

    // Click any remaining dialog
    for (let i = 0; i < 5; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) break;
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 200));
    }

    // Wait for gate to update
    await new Promise(r => setTimeout(r, 500));

    // Check if we're already through (sometimes walking to gate goes through)
    if (isInsideAlKharid(ctx)) {
        ctx.log('Already through gate!');
        return true;
    }

    // Try to walk through the now-open gate
    ctx.log('Walking through gate...');

    // Method 1: Try clicking the gate again (should now have "Pass" or just walk through)
    const newState = ctx.state();
    const openGate = newState?.nearbyLocs.find(l => /gate/i.test(l.name) && l.distance < 5);
    if (openGate) {
        // Find pass/open option
        const passOpt = openGate.optionsWithIndex.find(o => /pass|open/i.test(o.text));
        if (passOpt) {
            await ctx.sdk.sendInteractLoc(openGate.x, openGate.z, openGate.id, passOpt.opIndex);
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Method 2: Walk to the other side (retry a few times)
    for (let i = 0; i < 3; i++) {
        await ctx.bot.walkTo(INSIDE_AL_KHARID.x, INSIDE_AL_KHARID.z);
        await new Promise(r => setTimeout(r, 500));

        if (isInsideAlKharid(ctx)) break;

        // If still outside, try clicking gate again
        const g = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name) && l.distance < 5);
        if (g) {
            const opt = g.optionsWithIndex.find(o => /pass|open/i.test(o.text));
            if (opt) {
                await ctx.sdk.sendInteractLoc(g.x, g.z, g.id, opt.opIndex);
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }

    const finalPos = ctx.state()?.player;
    ctx.log(`Position: (${finalPos?.worldX}, ${finalPos?.worldZ})`);

    ctx.progress();
    return isInsideAlKharid(ctx);
}

/**
 * Buy kebabs from the kebab seller in Al Kharid
 * Note: Kebab seller uses dialog, not a shop interface
 */
async function buyKebabs(ctx: ScriptContext): Promise<void> {
    ctx.log('Buying kebabs...');

    // Kebab seller is near the Al Kharid bank
    await ctx.bot.walkTo(3273, 3180);
    ctx.progress();

    // Find the kebab seller
    const kebabSeller = ctx.sdk.findNearbyNpc(/kebab/i);
    if (!kebabSeller) {
        ctx.log('Kebab seller not found');
        return;
    }
    ctx.log(`Found: ${kebabSeller.name}`);

    // Talk to the kebab seller
    const talkOpt = kebabSeller.optionsWithIndex.find(o => /talk/i.test(o.text));
    if (!talkOpt) {
        ctx.log('No talk option');
        return;
    }

    await ctx.sdk.sendInteractNpc(kebabSeller.index, talkOpt.opIndex);
    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();

    // Handle dialog - look for "buy" option
    for (let i = 0; i < 15; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        ctx.log(`Dialog: ${s.dialog.options.map(o => o.text).join(' | ')}`);

        // Look for buy option
        const buyOpt = s.dialog.options.find(o => /buy|yes|kebab/i.test(o.text));
        if (buyOpt) {
            ctx.log(`Clicking: ${buyOpt.text}`);
            await ctx.sdk.sendClickDialog(buyOpt.index);
        } else {
            // Click to continue
            await ctx.sdk.sendClickDialog(0);
        }
        await new Promise(r => setTimeout(r, 300));
        ctx.progress();
    }

    // Check inventory for kebabs
    const kebab = ctx.sdk.findInventoryItem(/kebab/i);
    ctx.log(`Kebabs in inventory: ${kebab?.count ?? 0}`);
}

/**
 * Main travel function
 */
async function travelToAlKharid(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state) throw new Error('No initial state');

    const startTime = Date.now();
    const startPos = { x: state.player?.worldX ?? 0, z: state.player?.worldZ ?? 0 };

    ctx.log(`Start: (${startPos.x}, ${startPos.z})`);

    if (isInsideAlKharid(ctx)) {
        ctx.log('Already in Al Kharid!');
        return;
    }

    // Source coins if needed
    if (getCoins(ctx) < 10) {
        ctx.log(`Have ${getCoins(ctx)}gp, need 10gp...`);

        // Try selling items first (faster)
        let gotCoins = await sourceCoinsFromShop(ctx);

        // Fall back to combat if selling didn't work
        if (!gotCoins) {
            gotCoins = await sourceCoinsFromCombat(ctx);
        }

        if (!gotCoins) {
            throw new Error(`Could not get 10gp for toll`);
        }
    }

    ctx.log(`Have ${getCoins(ctx)}gp, paying toll...`);

    // Pay toll and go through
    const success = await tollRoute(ctx);

    if (!success) {
        throw new Error('Failed to reach Al Kharid');
    }

    // Buy kebabs!
    await buyKebabs(ctx);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const endPos = ctx.state()?.player;
    ctx.log(`Done in ${duration}s - pos: (${endPos?.worldX}, ${endPos?.worldZ})`);
}

// Run the script
import { TestPresets } from '../script-runner';

runScript({
    name: 'al-kharid-travel',
    goal: 'Reach Al Kharid as fast as possible',
    preset: TestPresets.LUMBRIDGE_SPAWN,  // Standard post-tutorial (no coins)
    timeLimit: 3 * 60 * 1000,
    stallTimeout: 30_000,
}, async (ctx) => {
    await travelToAlKharid(ctx);
});
