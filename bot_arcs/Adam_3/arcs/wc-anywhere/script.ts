/**
 * Arc: wc-anywhere
 * Character: Adam_3
 *
 * Goal: Train Woodcutting wherever the character is.
 * Strategy: Find and chop any nearby tree, drop logs when full.
 * Duration: 5 minutes
 *
 * This arc works at any location - no walking required.
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// Target levels
const TARGET_WC = 70;

interface Stats {
    logsChopped: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getWoodcuttingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Woodcutting')?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

function countLogs(ctx: ScriptContext): number {
    return ctx.state()?.inventory.filter(i => /logs/i.test(i.name)).length ?? 0;
}

/**
 * Drop all logs from inventory
 */
async function dropLogs(ctx: ScriptContext, stats: Stats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const logItems = state.inventory.filter(item => /logs/i.test(item.name));

    for (const item of logItems) {
        ctx.log(`Dropping ${item.name}`);
        await ctx.sdk.sendDropItem(item.slot);
        dropped++;
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }

    return dropped;
}

/**
 * Main training loop
 */
async function trainingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let noTreeCount = 0;

    while (getWoodcuttingLevel(ctx) < TARGET_WC) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        const wcLevel = getWoodcuttingLevel(ctx);

        // Progress log every 20 loops
        if (loopCount % 20 === 0) {
            ctx.log(`Loop ${loopCount}: WC=${wcLevel}, Logs=${stats.logsChopped}, Inv=${currentState.inventory.length}/28`);
        }

        // Dismiss any dialogs (level-up, etc.)
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Drop logs if inventory is nearly full
        if (currentState.inventory.length >= 26) {
            ctx.log('Inventory full - dropping logs');
            await dropLogs(ctx, stats);
            continue;
        }

        // Find any tree (regular, oak, willow, etc.)
        const tree = ctx.sdk.findNearbyLoc(/^(tree|oak|willow|maple|yew)$/i);
        if (tree) {
            noTreeCount = 0;
            const startLogs = countLogs(ctx);

            const result = await ctx.bot.chopTree(tree);
            if (result.success && result.logs) {
                stats.logsChopped++;
                ctx.log(`Chopped ${tree.name}, got ${result.logs.name}`);
            }
            markProgress(ctx, stats);
            continue;
        }

        // No tree - wander a bit to find one
        noTreeCount++;
        if (noTreeCount % 5 === 0) {
            ctx.log(`No trees nearby, wandering... (${noTreeCount})`);
        }

        const player = currentState.player;
        if (player) {
            const dx = Math.floor(Math.random() * 10) - 5;
            const dz = Math.floor(Math.random() * 10) - 5;
            const targetX = player.worldX + dx;
            const targetZ = player.worldZ + dz;
            await ctx.sdk.sendWalk(targetX, targetZ);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    ctx.log(`Training complete! WC=${getWoodcuttingLevel(ctx)}`);
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const wcLevel = getWoodcuttingLevel(ctx);
    const totalLevel = getTotalLevel(ctx);
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Woodcutting Level: ${wcLevel}`);
    ctx.log(`Logs Chopped: ${stats.logsChopped}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'wc-anywhere',
    goal: `Train WC to ${TARGET_WC} at current location`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 45_000,          // 45 seconds
    screenshotInterval: 30_000,
    // No preset - use existing character state
}, async (ctx) => {
    const stats: Stats = {
        logsChopped: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: wc-anywhere ===');
    ctx.log(`Starting WC Level: ${getWoodcuttingLevel(ctx)}`);
    ctx.log(`Target: WC ${TARGET_WC}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    try {
        await trainingLoop(ctx, stats);
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
