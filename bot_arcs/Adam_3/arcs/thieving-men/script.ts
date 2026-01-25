/**
 * Arc: thieving-men
 * Character: Adam_3
 *
 * Goal: Train Thieving by pickpocketing men (level 1 requirement).
 * Strategy: Walk to Varrock, find men, pickpocket them for coins.
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// Varrock city center (near fountain, lots of men)
const VARROCK_CENTER = { x: 3212, z: 3428 };

// Target level
const TARGET_LEVEL = 15;

interface Stats {
    pickpockets: number;
    coinsGained: number;
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

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

/**
 * Find a man to pickpocket
 */
function findMan(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    // Look for Man or Woman (both level 1 thieving)
    const targets = state.nearbyNpcs
        .filter(npc => /^(man|woman)$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /pickpocket/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return targets[0] ?? null;
}

/**
 * Main thieving loop
 */
async function thievingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let noTargetCount = 0;

    while (getThievingLevel(ctx) < TARGET_LEVEL) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        const thievingLevel = getThievingLevel(ctx);
        const coins = getCoins(ctx);

        // Progress log every 20 loops
        if (loopCount % 20 === 0) {
            ctx.log(`Loop ${loopCount}: Thieving=${thievingLevel}, Pickpockets=${stats.pickpockets}, GP=${coins}`);
        }

        // Dismiss any dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Find a man/woman
        const target = findMan(ctx);
        if (!target) {
            noTargetCount++;
            if (noTargetCount % 10 === 0) {
                ctx.log(`No men/women nearby, wandering... (${noTargetCount})`);
            }

            // Wander towards Varrock center
            const player = currentState.player;
            if (player) {
                // Move towards Varrock center
                const dx = Math.sign(VARROCK_CENTER.x - player.worldX) * 5;
                const dz = Math.sign(VARROCK_CENTER.z - player.worldZ) * 5;
                await ctx.sdk.sendWalk(player.worldX + dx, player.worldZ + dz);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 2000));
            }
            continue;
        }

        noTargetCount = 0;

        // Find pickpocket option
        const pickpocketOpt = target.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
        if (!pickpocketOpt) {
            ctx.warn('Target has no pickpocket option');
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Track coins before pickpocket
        const coinsBefore = getCoins(ctx);

        // Pickpocket!
        await ctx.sdk.sendInteractNpc(target.index, pickpocketOpt.opIndex);
        stats.pickpockets++;
        markProgress(ctx, stats);

        // Wait for animation
        await new Promise(r => setTimeout(r, 1500));

        // Check if we got coins
        const coinsAfter = getCoins(ctx);
        if (coinsAfter > coinsBefore) {
            stats.coinsGained += (coinsAfter - coinsBefore);
        }
    }

    ctx.log(`Training complete! Thieving=${getThievingLevel(ctx)}`);
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const thievingLevel = getThievingLevel(ctx);
    const totalLevel = getTotalLevel(ctx);
    const coins = getCoins(ctx);
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Thieving Level: ${thievingLevel}`);
    ctx.log(`Pickpocket Attempts: ${stats.pickpockets}`);
    ctx.log(`Coins Gained: ${stats.coinsGained}`);
    ctx.log(`Total Coins: ${coins}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'thieving-men',
    goal: `Train Thieving to ${TARGET_LEVEL} by pickpocketing men`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 60_000,          // 60 seconds (need time to find men)
    screenshotInterval: 30_000,
}, async (ctx) => {
    const stats: Stats = {
        pickpockets: 0,
        coinsGained: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: thieving-men ===');
    ctx.log(`Starting Thieving Level: ${getThievingLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk towards Varrock center to find men
    ctx.log('Walking towards Varrock center...');
    await ctx.bot.walkTo(VARROCK_CENTER.x, VARROCK_CENTER.z);
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
