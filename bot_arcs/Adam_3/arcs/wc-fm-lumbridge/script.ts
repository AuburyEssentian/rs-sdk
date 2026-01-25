/**
 * Arc: wc-fm-lumbridge
 * Character: Adam_3
 *
 * Goal: Train Woodcutting and Firemaking near Lumbridge (SAFE area).
 * Strategy: Chop trees, burn logs for XP. Stay near spawn, no dangerous areas.
 * Duration: 5 minutes
 *
 * After death reset, starting fresh with a safe activity.
 */

import { runArc, TestPresets, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// Target levels
const TARGET_WC = 60;
const TARGET_FM = 60;

interface Stats {
    logsChopped: number;
    logsBurned: number;
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

function getFiremakingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Firemaking')?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

function hasLogs(ctx: ScriptContext): boolean {
    return ctx.state()?.inventory.some(i => /logs/i.test(i.name)) ?? false;
}

function hasTinderbox(ctx: ScriptContext): boolean {
    return ctx.state()?.inventory.some(i => /tinderbox/i.test(i.name)) ?? false;
}

/**
 * Main training loop
 */
async function trainingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;

    while (getWoodcuttingLevel(ctx) < TARGET_WC || getFiremakingLevel(ctx) < TARGET_FM) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        const wcLevel = getWoodcuttingLevel(ctx);
        const fmLevel = getFiremakingLevel(ctx);

        // Progress log every 20 loops
        if (loopCount % 20 === 0) {
            ctx.log(`Loop ${loopCount}: WC=${wcLevel}, FM=${fmLevel}, Logs chopped=${stats.logsChopped}, burned=${stats.logsBurned}`);
        }

        // Dismiss any dialogs (level-up, etc.)
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Chop a tree first (priority)
        const tree = ctx.sdk.findNearbyLoc(/^tree$/i);
        if (tree) {
            const result = await ctx.bot.chopTree(tree);
            if (result.success && result.logs) {
                stats.logsChopped++;
                ctx.log(`Chopped tree, got ${result.logs.name}`);
            }
            markProgress(ctx, stats);
            continue;
        }

        // No tree - burn logs if we have them and need FM level
        if (hasLogs(ctx) && hasTinderbox(ctx) && fmLevel < TARGET_FM) {
            const logs = ctx.sdk.findInventoryItem(/^logs$/i);  // Exact match
            if (logs) {
                ctx.log(`Burning ${logs.name}`);
                const result = await ctx.bot.burnLogs(logs);
                if (result.success) {
                    stats.logsBurned++;
                }
                markProgress(ctx, stats);
                continue;
            }
        }

        // Wander to find a tree
        const player = currentState.player;
        if (player) {
            const dx = Math.floor(Math.random() * 10) - 5;
            const dz = Math.floor(Math.random() * 10) - 5;
            const targetX = player.worldX + dx;
            const targetZ = player.worldZ + dz;
            ctx.log(`No tree nearby, wandering...`);
            await ctx.sdk.sendWalk(targetX, targetZ);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    ctx.log(`Training complete! WC=${getWoodcuttingLevel(ctx)}, FM=${getFiremakingLevel(ctx)}`);
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const wcLevel = getWoodcuttingLevel(ctx);
    const fmLevel = getFiremakingLevel(ctx);
    const totalLevel = getTotalLevel(ctx);
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Woodcutting Level: ${wcLevel}`);
    ctx.log(`Firemaking Level: ${fmLevel}`);
    ctx.log(`Logs Chopped: ${stats.logsChopped}`);
    ctx.log(`Logs Burned: ${stats.logsBurned}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'wc-fm-lumbridge',
    goal: `Train WC to ${TARGET_WC} and FM to ${TARGET_FM} near Lumbridge`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 30_000,          // 30 seconds
    screenshotInterval: 30_000,
    // No preset - use existing character state
}, async (ctx) => {
    const stats: Stats = {
        logsChopped: 0,
        logsBurned: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: wc-fm-lumbridge ===');
    ctx.log(`Starting WC Level: ${getWoodcuttingLevel(ctx)}`);
    ctx.log(`Starting FM Level: ${getFiremakingLevel(ctx)}`);
    ctx.log(`Target: WC ${TARGET_WC}, FM ${TARGET_FM}`);
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
