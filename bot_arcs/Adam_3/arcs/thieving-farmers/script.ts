/**
 * Arc: thieving-farmers
 * Character: Adam_3
 *
 * Goal: Train Thieving by pickpocketing farmers.
 * Strategy: Find nearby farmers, pickpocket them.
 * Duration: 5 minutes
 *
 * No tools required - great when inventory is empty!
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// Target level
const TARGET_LEVEL = 20;

interface Stats {
    pickpockets: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getThievingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Thieving')?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

/**
 * Find a farmer to pickpocket
 */
function findFarmer(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    const farmers = state.nearbyNpcs
        .filter(npc => /farmer/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /pickpocket/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return farmers[0] ?? null;
}

/**
 * Drop junk items to make space
 */
async function dropJunk(ctx: ScriptContext, stats: Stats): Promise<void> {
    const state = ctx.state();
    if (!state) return;

    // Drop seeds, potatoes, and other thieving loot to make space
    const junkItems = state.inventory.filter(item =>
        /seed/i.test(item.name) || /potato/i.test(item.name)
    );

    for (const item of junkItems.slice(0, 5)) { // Drop up to 5 at a time
        ctx.log(`Dropping ${item.name}`);
        await ctx.sdk.sendDropItem(item.slot);
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }
}

/**
 * Main thieving loop
 */
async function thievingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let noFarmerCount = 0;

    while (getThievingLevel(ctx) < TARGET_LEVEL) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        const thievingLevel = getThievingLevel(ctx);

        // Progress log every 20 loops
        if (loopCount % 20 === 0) {
            ctx.log(`Loop ${loopCount}: Thieving=${thievingLevel}, Pickpockets=${stats.pickpockets}`);
        }

        // Dismiss any dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Drop junk if inventory is nearly full
        if (currentState.inventory.length >= 25) {
            ctx.log('Inventory getting full - dropping junk');
            await dropJunk(ctx, stats);
            continue;
        }

        // Find a farmer
        const farmer = findFarmer(ctx);
        if (!farmer) {
            noFarmerCount++;
            if (noFarmerCount % 10 === 0) {
                ctx.log(`No farmers nearby, wandering... (${noFarmerCount})`);
            }

            // Wander to find farmers
            const player = currentState.player;
            if (player) {
                const dx = Math.floor(Math.random() * 10) - 5;
                const dz = Math.floor(Math.random() * 10) - 5;
                await ctx.sdk.sendWalk(player.worldX + dx, player.worldZ + dz);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 2000));
            }
            continue;
        }

        noFarmerCount = 0;

        // Find pickpocket option
        const pickpocketOpt = farmer.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
        if (!pickpocketOpt) {
            ctx.warn('Farmer has no pickpocket option');
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Pickpocket!
        await ctx.sdk.sendInteractNpc(farmer.index, pickpocketOpt.opIndex);
        stats.pickpockets++;
        markProgress(ctx, stats);

        // Wait a bit for animation
        await new Promise(r => setTimeout(r, 1500));
    }

    ctx.log(`Training complete! Thieving=${getThievingLevel(ctx)}`);
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const thievingLevel = getThievingLevel(ctx);
    const totalLevel = getTotalLevel(ctx);
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Thieving Level: ${thievingLevel}`);
    ctx.log(`Pickpocket Attempts: ${stats.pickpockets}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'thieving-farmers',
    goal: `Train Thieving to ${TARGET_LEVEL} by pickpocketing farmers`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 45_000,          // 45 seconds
    screenshotInterval: 30_000,
}, async (ctx) => {
    const stats: Stats = {
        pickpockets: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: thieving-farmers ===');
    ctx.log(`Starting Thieving Level: ${getThievingLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    try {
        await thievingLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error(`Arc aborted: ${e.message}`);
        } else {
            throw e;
        }
    } finally {
        logFinalStats(ctx, stats);
    }
});
