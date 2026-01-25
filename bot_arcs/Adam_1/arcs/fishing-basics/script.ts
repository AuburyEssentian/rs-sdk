/**
 * Arc: fishing-basics
 * Character: Adam_1
 *
 * Goal: Fish at Draynor until level 10+ fishing.
 * Strategy: Fish shrimp, drop when full, repeat.
 * Duration: 5 minutes (short first arc to establish patterns)
 *
 * This is Adam_1's first arc - keeping it simple and safe.
 */

import { runArc, TestPresets, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyNpc } from '../../../../agent/types';

// Draynor Village fishing spots
const DRAYNOR_FISHING = { x: 3087, z: 3230 };

// Target fishing level
const TARGET_LEVEL = 20;

interface Stats {
    fishCaught: number;
    startFishingXp: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getFishingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
}

function getFishingXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fishing')?.experience ?? 0;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

/**
 * Find the nearest small-net fishing spot (shrimp/anchovies)
 */
function findFishingSpot(ctx: ScriptContext, logDebug: boolean = false): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    // First, find all fishing spots
    const allSpots = state.nearbyNpcs
        .filter(npc => /fishing\s*spot/i.test(npc.name));

    if (logDebug && allSpots.length > 0) {
        ctx.log(`Found ${allSpots.length} fishing spots:`);
        for (const spot of allSpots.slice(0, 3)) {
            ctx.log(`  - ${spot.name}: options=[${spot.options.join(', ')}] dist=${spot.distance.toFixed(0)}`);
        }
    }

    // Filter for spots with Net option (shrimp fishing)
    const netSpots = allSpots
        .filter(npc => npc.options.some(opt => /^net$/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return netSpots[0] ?? null;
}

/**
 * Count raw fish in inventory
 */
function countRawFish(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;

    return state.inventory
        .filter(item => /^raw\s/i.test(item.name))
        .reduce((sum, item) => sum + item.count, 0);
}

/**
 * Drop all raw fish to make space
 */
async function dropAllFish(ctx: ScriptContext, stats: Stats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const fishItems = state.inventory.filter(item => /^raw\s/i.test(item.name));

    for (const item of fishItems) {
        ctx.log(`Dropping ${item.name} x${item.count}`);
        await ctx.sdk.sendDropItem(item.slot);
        dropped += item.count;
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }

    return dropped;
}

/**
 * Main fishing loop
 */
async function fishingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let lastFishCount = countRawFish(ctx);
    let noSpotCount = 0;

    while (getFishingLevel(ctx) < TARGET_LEVEL) {
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Dismiss any blocking dialogs (level-up, etc.)
        if (currentState.dialog.isOpen) {
            // Log dialog content for debugging
            const dialogOptions = currentState.dialog.options;
            if (dialogOptions.length > 0) {
                ctx.log(`Dialog options: ${dialogOptions.map(o => o.text).join(', ')}`);
            }
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check if inventory is full
        if (currentState.inventory.length >= 28) {
            ctx.log('Inventory full - dropping fish');
            const dropped = await dropAllFish(ctx, stats);
            ctx.log(`Dropped ${dropped} fish`);
            continue;
        }

        // Check for new fish caught
        const currentFishCount = countRawFish(ctx);
        if (currentFishCount > lastFishCount) {
            const newFish = currentFishCount - lastFishCount;
            stats.fishCaught += newFish;
            ctx.log(`Caught fish! Total: ${stats.fishCaught}`);
            markProgress(ctx, stats);
        }
        lastFishCount = currentFishCount;

        // Find and interact with fishing spot
        const logDebug = false;  // Disable noisy logging
        const spot = findFishingSpot(ctx, logDebug);

        if (!spot) {
            noSpotCount++;

            // Log nearby NPCs for debugging
            if (noSpotCount === 10) {
                const npcs = currentState.nearbyNpcs.slice(0, 5);
                ctx.log(`Nearby NPCs: ${npcs.map(n => n.name).join(', ') || 'none'}`);
                ctx.log(`Player position: (${currentState.player?.worldX}, ${currentState.player?.worldZ})`);
            }

            if (noSpotCount % 50 === 0) {
                ctx.log(`Waiting for fishing spot... (${noSpotCount})`);
            }

            // If we've waited too long, walk back to fishing area
            if (noSpotCount >= 100) {
                const player = currentState.player;
                if (player) {
                    const dist = Math.sqrt(
                        Math.pow(player.worldX - DRAYNOR_FISHING.x, 2) +
                        Math.pow(player.worldZ - DRAYNOR_FISHING.z, 2)
                    );
                    if (dist > 10) {
                        ctx.log(`Walking back to fishing area...`);
                        await ctx.sdk.sendWalk(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z);
                        markProgress(ctx, stats);
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }
                noSpotCount = 0;
            }

            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        noSpotCount = 0;

        // Get the "Net" option
        const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
        if (!netOpt) {
            ctx.warn(`Fishing spot has no Net option`);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Start fishing
        await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 200));
    }

    ctx.log(`Reached fishing level ${getFishingLevel(ctx)}!`);
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const state = ctx.state();
    const fishing = state?.skills.find(s => s.name === 'Fishing');
    const xpGained = (fishing?.experience ?? 0) - stats.startFishingXp;
    const duration = (Date.now() - stats.startTime) / 1000;
    const totalLevel = getTotalLevel(ctx);

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Fishing Level: ${fishing?.baseLevel ?? '?'}`);
    ctx.log(`XP Gained: ${xpGained}`);
    ctx.log(`Fish Caught: ${stats.fishCaught}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_1',
    arcName: 'fishing-basics',
    goal: `Fish at Draynor until level ${TARGET_LEVEL} fishing`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 25_000,          // 25 seconds
    screenshotInterval: 15_000,
    // Inventory restored - back to persistent mode
    // initializeFromPreset: ...,
    // Use shared browser for consistency
    launchOptions: {
        useSharedBrowser: true,
    },
}, async (ctx) => {
    const stats: Stats = {
        fishCaught: 0,
        startFishingXp: getFishingXp(ctx),
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: fishing-basics ===');

    // Wait for game state to be ready
    ctx.log('Waiting for game state...');
    for (let i = 0; i < 20; i++) {
        const state = ctx.state();
        if (state?.player && state.player.worldX !== 0) {
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        markProgress(ctx, stats);
    }

    ctx.log(`Starting Fishing Level: ${getFishingLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to Draynor fishing spots
    ctx.log('Walking to Draynor fishing area...');

    // Use bot.walkTo which handles pathfinding properly
    // Keep clicking walk until we're close to the fishing area
    for (let attempt = 0; attempt < 5; attempt++) {
        const player = ctx.state()?.player;
        if (player) {
            const dist = Math.sqrt(
                Math.pow(player.worldX - DRAYNOR_FISHING.x, 2) +
                Math.pow(player.worldZ - DRAYNOR_FISHING.z, 2)
            );
            ctx.log(`Distance to fishing area: ${dist.toFixed(0)} tiles (at ${player.worldX}, ${player.worldZ})`);

            if (dist < 10) {
                ctx.log('Close enough to fishing area!');
                break;
            }
        }

        // Walk command
        await ctx.sdk.sendWalk(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z, true);
        markProgress(ctx, stats);

        // Wait while walking, checking progress
        for (let i = 0; i < 40; i++) {  // 20 seconds per attempt
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);

            // Check if we're close
            const p = ctx.state()?.player;
            if (p) {
                const d = Math.sqrt(
                    Math.pow(p.worldX - DRAYNOR_FISHING.x, 2) +
                    Math.pow(p.worldZ - DRAYNOR_FISHING.z, 2)
                );
                if (d < 10) break;
            }

            // Dismiss any blocking dialogs
            if (ctx.state()?.dialog.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }
        }
    }

    const finalPos = ctx.state()?.player;
    ctx.log(`Arrived at (${finalPos?.worldX}, ${finalPos?.worldZ})`);
    markProgress(ctx, stats);

    try {
        await fishingLoop(ctx, stats);
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
