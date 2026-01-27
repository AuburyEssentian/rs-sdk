/**
 * Arc: get-to-alkharid
 * Character: calk
 *
 * Goal: Travel from Lumbridge spawn to Al Kharid
 * Strategy:
 * 1. Sell shortbow at Lumbridge General Store (20gp)
 * 2. Walk to Al Kharid toll gate
 * 3. Pay 10gp toll and pass through
 * 4. Walk to Al Kharid kebab shop area
 *
 * Duration: 5 minutes (short travel arc)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// === LOCATIONS ===
const LOCATIONS = {
    LUMBRIDGE_SPAWN: { x: 3222, z: 3218 },
    LUMBRIDGE_GENERAL_STORE: { x: 3212, z: 3247 },
    ALKHARID_GATE: { x: 3268, z: 3228 },
    ALKHARID_INSIDE: { x: 3277, z: 3227 },
    ALKHARID_KEBAB_SHOP: { x: 3273, z: 3180 },
    ALKHARID_BANK: { x: 3269, z: 3167 },
};

// === HELPERS ===
function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

function isInAlKharid(ctx: ScriptContext): boolean {
    const player = ctx.state()?.player;
    return player ? player.worldX >= 3270 : false;
}

async function waitForState(ctx: ScriptContext): Promise<boolean> {
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 45000);
        const state = ctx.state();
        ctx.log('State ready! Position: (' + state?.player?.worldX + ', ' + state?.player?.worldZ + ')');
        return true;
    } catch (e) {
        ctx.warn('State did not populate after 45 seconds');
        return false;
    }
}

async function dismissDialogs(ctx: ScriptContext): Promise<void> {
    for (let i = 0; i < 5; i++) {
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }
    }
}

// === PHASE 1: Sell shortbow for GP ===
async function sellShortbow(ctx: ScriptContext): Promise<boolean> {
    ctx.log('=== Phase 1: Sell shortbow for GP ===');

    const shortbow = ctx.state()?.inventory.find(i => /shortbow/i.test(i.name));
    if (!shortbow) {
        ctx.log('No shortbow in inventory - checking if we already have coins');
        const coins = getCoins(ctx);
        if (coins >= 10) {
            ctx.log('Already have ' + coins + ' GP - skipping shop');
            return true;
        }
        ctx.warn('No shortbow and not enough coins!');
        return false;
    }

    ctx.log('Walking to Lumbridge General Store...');
    await ctx.bot.walkTo(LOCATIONS.LUMBRIDGE_GENERAL_STORE.x, LOCATIONS.LUMBRIDGE_GENERAL_STORE.z);
    ctx.progress();
    await new Promise(r => setTimeout(r, 1000));

    // Open shop
    ctx.log('Opening shop...');
    const shopResult = await ctx.bot.openShop(/shop.*keeper/i);
    if (!shopResult.success) {
        ctx.warn('Failed to open shop: ' + shopResult.message);
        return false;
    }
    ctx.progress();
    await new Promise(r => setTimeout(r, 500));

    // Sell shortbow
    ctx.log('Selling shortbow...');
    const sellResult = await ctx.bot.sellToShop(/shortbow/i);
    if (!sellResult.success) {
        ctx.warn('Failed to sell shortbow: ' + sellResult.message);
    }
    ctx.progress();
    await new Promise(r => setTimeout(r, 500));

    // Close shop
    await ctx.bot.closeShop();
    await new Promise(r => setTimeout(r, 500));

    const coins = getCoins(ctx);
    ctx.log('GP after selling: ' + coins);
    return coins >= 10;
}

// === PHASE 2: Walk to and pass through toll gate ===
async function passGate(ctx: ScriptContext): Promise<boolean> {
    ctx.log('=== Phase 2: Pass through Al Kharid toll gate ===');

    // Check if already inside
    if (isInAlKharid(ctx)) {
        ctx.log('Already inside Al Kharid!');
        return true;
    }

    const coins = getCoins(ctx);
    if (coins < 10) {
        ctx.error('Not enough coins for toll! Have: ' + coins + ', need: 10');
        return false;
    }

    // Walk to gate
    ctx.log('Walking to toll gate...');
    await ctx.bot.walkTo(3268, 3228);  // Exact coordinates from best practices
    ctx.progress();
    await new Promise(r => setTimeout(r, 1000));

    // Try passing through gate multiple times
    for (let attempt = 0; attempt < 5; attempt++) {
        ctx.log('Gate attempt ' + (attempt + 1) + ' - current position: (' +
            ctx.state()?.player?.worldX + ', ' + ctx.state()?.player?.worldZ + ')');

        // Check if already through
        if (isInAlKharid(ctx)) {
            ctx.log('Already inside Al Kharid!');
            return true;
        }

        // Find and click gate
        const gate = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name));
        if (!gate) {
            ctx.warn('No gate found nearby, walking closer...');
            await ctx.sdk.sendWalk(3268, 3228, true);
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        ctx.log('Found gate at (' + gate.x + ', ' + gate.z + '), options: ' +
            gate.optionsWithIndex.map(o => o.text).join(', '));

        const openOpt = gate.optionsWithIndex.find(o => /open/i.test(o.text));
        if (!openOpt) {
            ctx.warn('No open option on gate!');
            continue;
        }

        // Click gate to trigger dialog
        ctx.log('Clicking gate to open dialog...');
        await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, openOpt.opIndex);
        await new Promise(r => setTimeout(r, 1000));

        // Handle dialog - click through until "Yes" option appears
        let paidToll = false;
        for (let i = 0; i < 25; i++) {
            const s = ctx.state();

            // Check if dialog is open
            if (!s?.dialog.isOpen) {
                // Maybe gate opened without dialog (already paid)
                if (i > 5) {
                    ctx.log('Dialog closed, trying to walk through...');
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
                continue;
            }

            ctx.log('Dialog open, options: ' + s.dialog.options.map(o => o.text).join(', '));

            // Look for "Yes" or "ok" option to pay toll
            const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
            if (yesOpt) {
                ctx.log('Found pay option: "' + yesOpt.text + '" - clicking...');
                await ctx.sdk.sendClickDialog(yesOpt.index);
                paidToll = true;
                ctx.progress();
                await new Promise(r => setTimeout(r, 500));
                break;
            }

            // Click to continue dialog
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }

        // Wait for dialog to close and gate to actually open
        ctx.log('Waiting for dialog to close and gate to open...');
        for (let waitI = 0; waitI < 10; waitI++) {
            if (!ctx.state()?.dialog.isOpen) break;
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }
        await new Promise(r => setTimeout(r, 1500));

        // Check game messages for issues
        const msgs = ctx.state()?.gameMessages.slice(-5) || [];
        ctx.log('Recent messages: ' + msgs.map(m => m.text).join(' | '));

        // Walk through with sendWalk (more direct than pathfinder)
        ctx.log('Attempting to walk through gate with sendWalk...');
        for (let walkAttempt = 0; walkAttempt < 5; walkAttempt++) {
            // Use sendWalk for direct movement through gate
            await ctx.sdk.sendWalk(3277, 3227, true);
            ctx.progress();
            await new Promise(r => setTimeout(r, 2000));

            const pos = ctx.state()?.player;
            ctx.log('Walk attempt ' + (walkAttempt + 1) + ' - position: (' +
                pos?.worldX + ', ' + pos?.worldZ + ')');

            if (isInAlKharid(ctx)) {
                ctx.log('Successfully entered Al Kharid!');
                return true;
            }

            // Try clicking slightly different positions
            if (walkAttempt === 1) {
                await ctx.sdk.sendWalk(3275, 3227, true);
                await new Promise(r => setTimeout(r, 1500));
            } else if (walkAttempt === 2) {
                await ctx.sdk.sendWalk(3280, 3227, true);
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        ctx.log('Could not walk through, will retry gate interaction...');
        await new Promise(r => setTimeout(r, 1000));
    }

    ctx.warn('Failed to pass through gate after 5 attempts');
    return isInAlKharid(ctx);
}

// === PHASE 3: Walk to kebab shop area ===
async function walkToKebabArea(ctx: ScriptContext): Promise<void> {
    ctx.log('=== Phase 3: Walk to kebab shop area ===');

    if (!isInAlKharid(ctx)) {
        ctx.warn('Not in Al Kharid - cannot walk to kebab area');
        return;
    }

    ctx.log('Walking to kebab shop (Karim)...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_KEBAB_SHOP.x, LOCATIONS.ALKHARID_KEBAB_SHOP.z);
    ctx.progress();
    await new Promise(r => setTimeout(r, 1000));

    const player = ctx.state()?.player;
    ctx.log('Arrived at kebab area! Position: (' + player?.worldX + ', ' + player?.worldZ + ')');
}

// === FINAL STATE LOGGING ===
function logFinalState(ctx: ScriptContext): void {
    const player = ctx.state()?.player;
    const coins = getCoins(ctx);

    ctx.log('');
    ctx.log('=== Arc Complete ===');
    ctx.log('Position: (' + player?.worldX + ', ' + player?.worldZ + ')');
    ctx.log('In Al Kharid: ' + isInAlKharid(ctx));
    ctx.log('GP: ' + coins);
    ctx.log('Total Level: ' + getTotalLevel(ctx));

    // Log inventory
    const inv = ctx.state()?.inventory || [];
    ctx.log('Inventory (' + inv.length + ' items):');
    for (const item of inv.slice(0, 10)) {
        ctx.log('  - ' + item.name + (item.count > 1 ? ' x' + item.count : ''));
    }
}

// === RUN THE ARC ===
runArc({
    characterName: 'calk',
    arcName: 'get-to-alkharid',
    goal: 'Travel from Lumbridge to Al Kharid',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Arc: get-to-alkharid ===');
    ctx.log('Goal: Reach Al Kharid from Lumbridge spawn');

    const stateReady = await waitForState(ctx);
    if (!stateReady || ctx.state()?.player?.worldX === 0) {
        ctx.error('Cannot proceed without valid game state');
        return;
    }

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    const player = ctx.state()?.player;
    ctx.log('Starting position: (' + player?.worldX + ', ' + player?.worldZ + ')');
    ctx.log('Starting GP: ' + getCoins(ctx));

    // Check if already in Al Kharid
    if (isInAlKharid(ctx)) {
        ctx.log('Already in Al Kharid! Walking to kebab area...');
        await walkToKebabArea(ctx);
        logFinalState(ctx);
        return;
    }

    try {
        // Phase 1: Get GP by selling shortbow
        const hasGP = await sellShortbow(ctx);
        if (!hasGP) {
            ctx.error('Failed to get enough GP for toll');
            logFinalState(ctx);
            return;
        }

        // Phase 2: Pass through toll gate
        const passedGate = await passGate(ctx);
        if (!passedGate) {
            ctx.error('Failed to pass through toll gate');
            logFinalState(ctx);
            return;
        }

        // Phase 3: Walk to kebab shop area
        await walkToKebabArea(ctx);

    } catch (e) {
        if (e instanceof StallError) {
            ctx.error('Arc aborted: ' + e.message);
        } else {
            throw e;
        }
    } finally {
        logFinalState(ctx);
    }
});
