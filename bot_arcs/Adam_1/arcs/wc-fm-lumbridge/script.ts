/**
 * Arc: wc-fm-lumbridge
 * Character: Adam_1
 *
 * Goal: Train Woodcutting and Firemaking at Lumbridge.
 * Strategy:
 * 1. Chop trees until inventory has 10+ logs
 * 2. Light all logs for Firemaking XP
 * 3. Repeat
 *
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyLoc, InventoryItem } from '../../../../agent/types';

// Lumbridge tree area (west of castle)
const LUMBRIDGE_TREES = { x: 3200, z: 3220 };

// How many logs before we start firemaking
const LOG_THRESHOLD = 5;

interface Stats {
    logsChopped: number;
    firesLit: number;
    startWcXp: number;
    startFmXp: number;
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

function getWcXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Woodcutting')?.experience ?? 0;
}

function getFmXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Firemaking')?.experience ?? 0;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

/**
 * Find logs in inventory
 */
function countLogs(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;
    const logs = state.inventory.find(i => /^logs$/i.test(i.name));
    return logs?.count ?? 0;
}

function findLogs(ctx: ScriptContext): InventoryItem | null {
    const state = ctx.state();
    if (!state) return null;
    return state.inventory.find(i => /^logs$/i.test(i.name)) ?? null;
}

function findTinderbox(ctx: ScriptContext): InventoryItem | null {
    const state = ctx.state();
    if (!state) return null;
    return state.inventory.find(i => /tinderbox/i.test(i.name)) ?? null;
}

function findAxe(ctx: ScriptContext): InventoryItem | null {
    const state = ctx.state();
    if (!state) return null;
    return state.inventory.find(i => /axe/i.test(i.name) && !/pickaxe/i.test(i.name)) ?? null;
}

/**
 * Find nearest tree
 */
function findTree(ctx: ScriptContext): NearbyLoc | null {
    const state = ctx.state();
    if (!state) return null;

    // Find trees - they're locations with "Chop down" option
    const trees = state.nearbyLocs
        .filter(loc => /^tree$/i.test(loc.name))
        .filter(loc => loc.options.some(opt => /chop/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return trees[0] ?? null;
}

/**
 * Chop trees until we have enough logs
 */
async function chopUntilFull(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log(`Chopping trees until ${LOG_THRESHOLD} logs...`);
    let noTreeCount = 0;
    let loopCount = 0;
    let lastLogCount = countLogs(ctx);

    while (countLogs(ctx) < LOG_THRESHOLD) {
        loopCount++;
        if (loopCount % 100 === 0) {
            ctx.log(`Chopping loop: ${loopCount} iterations, logs: ${countLogs(ctx)}`);
        }

        const currentState = ctx.state();
        if (!currentState) break;

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check inventory space
        if (currentState.inventory.length >= 28) {
            ctx.log(`Inventory full (${currentState.inventory.length} items): ${currentState.inventory.map(i => i.name).join(', ')}`);
            break;
        }

        // Check if we drifted too far from tree area - walk back
        const player = currentState.player;
        if (player) {
            const distFromArea = Math.sqrt(
                Math.pow(player.worldX - LUMBRIDGE_TREES.x, 2) +
                Math.pow(player.worldZ - LUMBRIDGE_TREES.z, 2)
            );
            if (distFromArea > 15) {
                ctx.log(`Drifted ${distFromArea.toFixed(0)} tiles away, walking back...`);
                await ctx.sdk.sendWalk(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z, true);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
        }

        // Check if we got a log since last check
        const currentLogCount = countLogs(ctx);
        if (currentLogCount > lastLogCount) {
            const newLogs = currentLogCount - lastLogCount;
            stats.logsChopped += newLogs;
            ctx.log(`Got ${newLogs} log(s)! Total chopped: ${stats.logsChopped}, inventory: ${currentLogCount}`);
            noTreeCount = 0;
        }
        lastLogCount = currentLogCount;

        // Find tree
        const tree = findTree(ctx);
        if (!tree) {
            noTreeCount++;
            if (noTreeCount === 10) {
                const locs = currentState.nearbyLocs.filter(l => /tree/i.test(l.name)).slice(0, 3);
                ctx.log(`Tree-like locs: ${locs.map(l => `${l.name}(${l.options.join(',')})`).join(', ') || 'none'}`);
                ctx.log(`Position: (${currentState.player?.worldX}, ${currentState.player?.worldZ})`);
            }
            if (noTreeCount % 50 === 0) {
                ctx.log(`No tree found (${noTreeCount} attempts), walking to tree area...`);
                await ctx.sdk.sendWalk(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z, true);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 2000));
            }
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        noTreeCount = 0;

        // Only chop if we're idle (not already chopping)
        const isIdle = player?.animId === -1;

        if (isIdle) {
            // Get the "Chop down" option
            const chopOpt = tree.optionsWithIndex?.find(o => /chop/i.test(o.text));
            if (chopOpt) {
                await ctx.sdk.sendInteractLoc(tree.x, tree.z, tree.id, chopOpt.opIndex);
                markProgress(ctx, stats);
            }
        }

        // Wait for chopping - trees take time
        await new Promise(r => setTimeout(r, 2000));
        markProgress(ctx, stats);
    }

    ctx.log(`Collected ${countLogs(ctx)} logs (total chopped: ${stats.logsChopped})`);
}

/**
 * Light all logs for Firemaking XP
 */
async function lightAllLogs(ctx: ScriptContext, stats: Stats): Promise<void> {
    const tinderbox = findTinderbox(ctx);
    if (!tinderbox) {
        ctx.warn('No tinderbox found!');
        return;
    }

    ctx.log('Lighting logs for Firemaking XP...');

    while (countLogs(ctx) > 0) {
        const logs = findLogs(ctx);
        if (!logs) break;

        const fmXpBefore = getFmXp(ctx);

        // Use tinderbox on logs
        await ctx.sdk.sendUseItemOnItem(tinderbox.slot, logs.slot);
        markProgress(ctx, stats);

        // Wait for fire lighting
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);

            // Dismiss any dialogs
            if (ctx.state()?.dialog.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }

            // Check if we gained FM XP (fire was lit)
            const fmXp = getFmXp(ctx);
            if (fmXp > fmXpBefore) {
                stats.firesLit++;
                ctx.log(`Fire lit! (${stats.firesLit} total)`);
                break;
            }

            // Check if logs are gone (used up)
            if (countLogs(ctx) < (logs.count ?? 1)) {
                break;
            }
        }

        // Small delay between fires
        await new Promise(r => setTimeout(r, 500));
    }

    ctx.log(`Firemaking complete. Fires lit: ${stats.firesLit}`);
}

/**
 * Main loop
 */
async function mainLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('=== Woodcutting + Firemaking Arc Started ===');

    while (true) {
        ctx.log(`\n--- Cycle ---`);
        ctx.log(`WC: ${getWoodcuttingLevel(ctx)}, FM: ${getFiremakingLevel(ctx)}, Total: ${getTotalLevel(ctx)}`);

        // Phase 1: Chop trees
        await chopUntilFull(ctx, stats);

        const logs = countLogs(ctx);
        if (logs === 0) {
            ctx.log('No logs collected, retrying...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Phase 2: Light all logs
        await lightAllLogs(ctx, stats);

        markProgress(ctx, stats);
    }
}

/**
 * Log final stats
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const wcXpGained = getWcXp(ctx) - stats.startWcXp;
    const fmXpGained = getFmXp(ctx) - stats.startFmXp;
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Woodcutting: Level ${getWoodcuttingLevel(ctx)}, +${wcXpGained} XP`);
    ctx.log(`Firemaking: Level ${getFiremakingLevel(ctx)}, +${fmXpGained} XP`);
    ctx.log(`Logs chopped: ${stats.logsChopped}`);
    ctx.log(`Fires lit: ${stats.firesLit}`);
    ctx.log(`Total Level: ${getTotalLevel(ctx)}`);
}

// Run the arc
runArc({
    characterName: 'Adam_1',
    arcName: 'wc-fm-lumbridge',
    goal: 'Train Woodcutting and Firemaking at Lumbridge',
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 30_000,          // 30 seconds
    screenshotInterval: 30_000,
    // Initialize with current skills + full inventory
    initializeFromPreset: {
        position: LUMBRIDGE_TREES,
        skills: { Fishing: 48, Cooking: 1, Woodcutting: 1, Firemaking: 1 },
        inventory: [
            { id: 1351, count: 1 },   // Bronze axe
            { id: 590, count: 1 },    // Tinderbox
            { id: 303, count: 1 },    // Small fishing net
            { id: 315, count: 1 },    // Shrimps
            { id: 1265, count: 1 },   // Bronze pickaxe
        ],
    },
    launchOptions: {
        useSharedBrowser: true,
    },
}, async (ctx) => {
    const stats: Stats = {
        logsChopped: 0,
        firesLit: 0,
        startWcXp: getWcXp(ctx),
        startFmXp: getFmXp(ctx),
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: wc-fm-lumbridge ===');
    ctx.log(`Starting WC: ${getWoodcuttingLevel(ctx)}, FM: ${getFiremakingLevel(ctx)}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Check inventory
    const inv = ctx.state()?.inventory || [];
    const hasAxe = inv.some(i => /axe/i.test(i.name) && !/pickaxe/i.test(i.name));
    const hasTinderbox = inv.some(i => /tinderbox/i.test(i.name));
    ctx.log(`Inventory check: axe=${hasAxe}, tinderbox=${hasTinderbox}`);

    if (!hasAxe) {
        ctx.error('No axe in inventory! Cannot chop trees.');
        return;
    }
    if (!hasTinderbox) {
        ctx.error('No tinderbox in inventory! Cannot light fires.');
        return;
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Ensure we're at the tree area
    for (let attempt = 0; attempt < 3; attempt++) {
        const player = ctx.state()?.player;
        if (!player) continue;

        const dist = Math.sqrt(
            Math.pow(player.worldX - LUMBRIDGE_TREES.x, 2) +
            Math.pow(player.worldZ - LUMBRIDGE_TREES.z, 2)
        );
        ctx.log(`Distance to tree area: ${dist.toFixed(0)} tiles`);

        if (dist < 20) {
            ctx.log('At tree area!');
            break;
        }

        ctx.log('Walking to tree area...');
        await ctx.sdk.sendWalk(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z, true);

        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);
            if (ctx.state()?.dialog.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }
            const p = ctx.state()?.player;
            if (p) {
                const d = Math.sqrt(
                    Math.pow(p.worldX - LUMBRIDGE_TREES.x, 2) +
                    Math.pow(p.worldZ - LUMBRIDGE_TREES.z, 2)
                );
                if (d < 20) break;
            }
        }
    }

    try {
        await mainLoop(ctx, stats);
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
