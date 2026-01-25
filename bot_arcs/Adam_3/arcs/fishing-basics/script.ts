/**
 * Arc: fishing-basics
 * Character: Adam_3
 *
 * Goal: Fish at Draynor until level 10+ fishing.
 * Strategy: Fish shrimp, drop when full, repeat.
 * Duration: 5 minutes (short first arc to establish patterns)
 *
 * This is Adam_3's first arc - keeping it simple and safe.
 */

import { runArc, TestPresets, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyNpc } from '../../../../agent/types';

// Draynor Village fishing spots
const DRAYNOR_FISHING = { x: 3087, z: 3230 };

// Target fishing level
const TARGET_LEVEL = 30;

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
function findFishingSpot(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    // Fishing spots are NPCs with "Net" option
    // Prefer "Net, Bait" spots (level 1 fishing - shrimp)
    const spots = state.nearbyNpcs
        .filter(npc => /fishing\s*spot/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /^net$/i.test(opt)))
        .filter(npc => npc.options.some(opt => /^bait$/i.test(opt))) // Small net spots
        .sort((a, b) => a.distance - b.distance);

    return spots[0] ?? null;
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
    let dialogDismissCount = 0;

    while (getFishingLevel(ctx) < TARGET_LEVEL) {
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Dismiss any blocking dialogs using the high-level bot method
        // This handles level-up dialogs more robustly
        if (currentState.dialog.isOpen) {
            dialogDismissCount++;
            if (dialogDismissCount <= 20) {
                await ctx.bot.dismissBlockingUI();
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 200));
                continue;
            } else if (dialogDismissCount === 21) {
                ctx.warn('Dialog stuck after 20 attempts - will try fishing anyway');
            }
            // After 20 attempts, ignore and try to fish
        } else {
            if (dialogDismissCount > 0) {
                ctx.log(`Dialogs cleared after ${dialogDismissCount} attempts`);
            }
            dialogDismissCount = 0;
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
        const spot = findFishingSpot(ctx);

        if (!spot) {
            noSpotCount++;
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
    characterName: 'Adam_3',
    arcName: 'fishing-basics',
    goal: `Fish at Draynor until level ${TARGET_LEVEL} fishing`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 60_000,          // 60 seconds (long walk from Lumbridge to Draynor)
    screenshotInterval: 15_000,
    // First run complete - now using persistent character
    // initializeFromPreset: TestPresets.LUMBRIDGE_SPAWN,
}, async (ctx) => {
    const stats: Stats = {
        fishCaught: 0,
        startFishingXp: getFishingXp(ctx),
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: fishing-basics ===');
    ctx.log(`Starting Fishing Level: ${getFishingLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to Draynor fishing spots
    ctx.log('Walking to Draynor fishing area...');
    await ctx.bot.walkTo(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z);
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
