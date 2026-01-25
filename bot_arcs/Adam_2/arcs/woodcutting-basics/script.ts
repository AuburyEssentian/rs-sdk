/**
 * Arc: woodcutting-basics
 * Character: Adam_2
 *
 * Goal: Train Woodcutting at Lumbridge trees.
 * Strategy: Chop trees, drop logs when full, repeat.
 *
 * Duration: 5 minutes
 */

import { runArc, TestPresets, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyLoc } from '../../../../agent/types';

// Lumbridge tree area (west of castle)
const LUMBRIDGE_TREES = { x: 3200, z: 3220 };

// Target woodcutting level
const TARGET_LEVEL = 30;

interface Stats {
    logsChopped: number;
    startWcXp: number;
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

function getWcXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Woodcutting')?.experience ?? 0;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

/**
 * Count logs in inventory
 */
function countLogs(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;
    const logs = state.inventory.find(i => /^logs$/i.test(i.name));
    return logs?.count ?? 0;
}

/**
 * Find nearest tree
 */
function findTree(ctx: ScriptContext): NearbyLoc | null {
    const state = ctx.state();
    if (!state) return null;

    const trees = state.nearbyLocs
        .filter(loc => /^tree$/i.test(loc.name))
        .filter(loc => loc.options.some(opt => /chop/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return trees[0] ?? null;
}

/**
 * Drop all logs to make space
 */
async function dropAllLogs(ctx: ScriptContext, stats: Stats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const logsItems = state.inventory.filter(item => /^logs$/i.test(item.name));

    for (const item of logsItems) {
        ctx.log(`Dropping ${item.name} x${item.count}`);
        await ctx.sdk.sendDropItem(item.slot);
        dropped += item.count;
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }

    return dropped;
}

/**
 * Main woodcutting loop
 */
async function woodcuttingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let noTreeCount = 0;
    let lastLogCount = countLogs(ctx);

    while (getWoodcuttingLevel(ctx) < TARGET_LEVEL) {
        const currentState = ctx.state();
        if (!currentState) break;

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check inventory space
        if (currentState.inventory.length >= 28) {
            ctx.log('Inventory full - dropping logs');
            const dropped = await dropAllLogs(ctx, stats);
            ctx.log(`Dropped ${dropped} logs`);
            continue;
        }

        // Track logs gained
        const currentLogs = countLogs(ctx);
        if (currentLogs > lastLogCount) {
            const gained = currentLogs - lastLogCount;
            stats.logsChopped += gained;
            ctx.log(`Got ${gained} log(s)! Total: ${stats.logsChopped}`);
            markProgress(ctx, stats);
        }
        lastLogCount = currentLogs;

        // Find tree
        const tree = findTree(ctx);
        if (!tree) {
            noTreeCount++;
            if (noTreeCount % 30 === 0) {
                ctx.log(`No tree found (${noTreeCount} attempts)`);
            }
            if (noTreeCount >= 60) {
                ctx.log('Walking to tree area...');
                await ctx.sdk.sendWalk(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z, true);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 3000));
                noTreeCount = 0;
            }
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        noTreeCount = 0;

        // Only chop if idle
        const player = currentState.player;
        const isIdle = player?.animId === -1;

        if (isIdle) {
            const chopOpt = tree.optionsWithIndex?.find(o => /chop/i.test(o.text));
            if (chopOpt) {
                await ctx.sdk.sendInteractLoc(tree.x, tree.z, tree.id, chopOpt.opIndex);
                markProgress(ctx, stats);
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }

    ctx.log(`Reached Woodcutting level ${getWoodcuttingLevel(ctx)}!`);
}

/**
 * Log final stats
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const wcXpGained = getWcXp(ctx) - stats.startWcXp;
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Woodcutting Level: ${getWoodcuttingLevel(ctx)}`);
    ctx.log(`XP Gained: ${wcXpGained}`);
    ctx.log(`Logs Chopped: ${stats.logsChopped}`);
    ctx.log(`Total Level: ${getTotalLevel(ctx)}`);
}

async function waitForState(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('Waiting for game state...');
    for (let i = 0; i < 20; i++) {
        const state = ctx.state();
        if (state?.player && state.player.worldX !== 0) {
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        markProgress(ctx, stats);
    }
}

// Run the arc
runArc({
    characterName: 'Adam_2',
    arcName: 'woodcutting-basics',
    goal: `Train Woodcutting to level ${TARGET_LEVEL}`,
    timeLimit: 5 * 60 * 1000,
    stallTimeout: 30_000,
    screenshotInterval: 30_000,
    // Fresh start with Lumbridge spawn
    initializeFromPreset: TestPresets.LUMBRIDGE_SPAWN,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        logsChopped: 0,
        startWcXp: getWcXp(ctx),
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: woodcutting-basics ===');
    await waitForState(ctx, stats);

    ctx.log(`Starting WC Level: ${getWoodcuttingLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Check for axe
    const inv = ctx.state()?.inventory || [];
    const hasAxe = inv.some(i => /axe/i.test(i.name) && !/pickaxe/i.test(i.name));
    ctx.log(`Has axe: ${hasAxe}`);

    if (!hasAxe) {
        ctx.error('No axe in inventory!');
        return;
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to tree area if needed
    const player = ctx.state()?.player;
    if (player) {
        const dist = Math.sqrt(
            Math.pow(player.worldX - LUMBRIDGE_TREES.x, 2) +
            Math.pow(player.worldZ - LUMBRIDGE_TREES.z, 2)
        );
        if (dist > 20) {
            ctx.log(`Walking to tree area (${dist.toFixed(0)} tiles away)...`);
            await ctx.bot.walkTo(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z);
            markProgress(ctx, stats);
        }
    }

    try {
        await woodcuttingLoop(ctx, stats);
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
