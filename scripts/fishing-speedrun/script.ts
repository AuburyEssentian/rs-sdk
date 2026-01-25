/**
 * Fishing Speedrun Script
 *
 * Goal: Maximize Fishing level in 5 minutes starting in Catherby.
 *
 * Strategy:
 * - Net fish at Catherby fishing spots (shrimp/anchovies)
 * - Drop fish to maintain inventory space
 * - Track XP/fish caught for progress
 * - Aggressive stuckness detection - abort early if stuck
 */

import { runScript, type ScriptContext, StallError } from '../script-runner';
import type { SaveConfig } from '../../test/utils/save-generator';
import { Items } from '../../test/utils/save-generator';
import type { NearbyNpc } from '../../agent/types';

// Draynor Village fishing spots - definitely level 1 fishing
// Located near the willow trees south of Draynor bank
const DRAYNOR_FISHING = { x: 3087, z: 3230 };

// Custom preset: Fisher at Draynor with net
const DRAYNOR_FISHER: SaveConfig = {
    position: DRAYNOR_FISHING,
    skills: { Fishing: 1 },
    inventory: [
        { id: Items.SMALL_FISHING_NET, count: 1 },
    ],
};

// Stuckness detection config
const STUCK_CONFIG = {
    // If no fish caught for this long, we're stuck
    noFishTimeoutMs: 15_000,
    // If no XP gained for this long, we're stuck
    noXpTimeoutMs: 20_000,
    // Check interval
    checkIntervalMs: 1000,
};

interface FishingStats {
    fishCaught: number;
    fishDropped: number;
    startXp: number;
    startTime: number;
    lastFishTime: number;
    lastXpTime: number;
    lastXp: number;
}

/**
 * Find the nearest fishing spot suitable for level 1 fishing
 * Note: Fishing spots are NPCs, not locations!
 *
 * Important: There are two types of "Net" fishing:
 * - "Net, Bait" spots = small net (shrimp/anchovies) - NO level requirement
 * - "Net, Harpoon" spots = big net (mackerel/cod/bass) - requires level 16+
 *
 * We must prefer "Net, Bait" spots for level 1 fishing!
 */
function findFishingSpot(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const allFishingSpots = state.nearbyNpcs
        .filter(npc => /fishing\s*spot/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /^net$/i.test(opt)));

    // Prefer "Net, Bait" spots (small net fishing - no level req)
    // Avoid "Net, Harpoon" spots (big net fishing - level 16+ req)
    const smallNetSpots = allFishingSpots
        .filter(npc => npc.options.some(opt => /^bait$/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    if (smallNetSpots.length > 0) {
        return smallNetSpots[0];
    }

    // Fallback to any Net spot if no small net spots found
    // (but this may fail if player level is too low)
    return allFishingSpots.sort((a, b) => a.distance - b.distance)[0] ?? null;
}

/**
 * Get current fishing XP
 */
function getFishingXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fishing')?.experience ?? 0;
}

/**
 * Get current fishing level
 */
function getFishingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
}

/**
 * Count fish in inventory (shrimps, anchovies, etc.)
 */
function countFish(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;

    return state.inventory
        .filter(item => /shrimp|anchov|sardine|herring|trout|salmon|tuna|lobster|swordfish/i.test(item.name))
        .reduce((sum, item) => sum + item.count, 0);
}

/**
 * Drop all fish from inventory to make space
 */
async function dropAllFish(ctx: ScriptContext, stats: FishingStats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const fishItems = state.inventory
        .filter(item => /shrimp|anchov|sardine|herring|trout|salmon|tuna|lobster|swordfish/i.test(item.name));

    for (const fish of fishItems) {
        ctx.log(`Dropping ${fish.name} x${fish.count}`);
        await ctx.sdk.sendDropItem(fish.slot);
        dropped += fish.count;
        ctx.progress();

        // Brief delay to let the drop process
        await new Promise(r => setTimeout(r, 100));
    }

    stats.fishDropped += dropped;
    return dropped;
}

/**
 * Check for stuckness based on time since last progress
 */
function checkStuck(ctx: ScriptContext, stats: FishingStats): string | null {
    const now = Date.now();
    const currentXp = getFishingXp(ctx);

    // Update XP tracking
    if (currentXp > stats.lastXp) {
        stats.lastXpTime = now;
        stats.lastXp = currentXp;
    }

    // Check for no fish timeout
    const timeSinceLastFish = now - stats.lastFishTime;
    if (timeSinceLastFish > STUCK_CONFIG.noFishTimeoutMs) {
        return `No fish caught for ${Math.round(timeSinceLastFish / 1000)}s`;
    }

    // Check for no XP timeout
    const timeSinceLastXp = now - stats.lastXpTime;
    if (timeSinceLastXp > STUCK_CONFIG.noXpTimeoutMs) {
        return `No fishing XP gained for ${Math.round(timeSinceLastXp / 1000)}s`;
    }

    return null;
}

/**
 * Main fishing loop
 */
async function fishingLoop(ctx: ScriptContext, stats: FishingStats): Promise<void> {
    const state = ctx.state();
    if (!state) throw new Error('No initial state');

    ctx.log('=== Fishing Speedrun Started ===');
    ctx.log(`Starting at level ${getFishingLevel(ctx)} with ${stats.startXp} XP`);
    ctx.log(`Position: (${state.player?.worldX}, ${state.player?.worldZ})`);

    // Dismiss any blocking dialogs before starting
    await ctx.bot.dismissBlockingUI();

    // Main loop
    let lastFishCount = countFish(ctx);
    let consecutiveNoSpotCount = 0;

    while (true) {
        // Check for stuckness
        const stuckReason = checkStuck(ctx, stats);
        if (stuckReason) {
            throw new StallError(`STUCK: ${stuckReason}`);
        }

        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Dismiss any blocking dialogs (level-up, etc.)
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            ctx.progress();
            continue;
        }

        // Check if inventory is getting full (>20 items) - drop fish
        if (currentState.inventory.length > 20) {
            ctx.log('Inventory getting full - dropping fish...');
            const dropped = await dropAllFish(ctx, stats);
            if (dropped > 0) {
                ctx.log(`Dropped ${dropped} fish`);
                ctx.progress();
            }
        }

        // Check if we caught more fish
        const currentFishCount = countFish(ctx);
        if (currentFishCount > lastFishCount) {
            const newFish = currentFishCount - lastFishCount;
            stats.fishCaught += newFish;
            stats.lastFishTime = Date.now();
            ctx.log(`Caught fish! Total: ${stats.fishCaught} (Level ${getFishingLevel(ctx)})`);
            ctx.progress();
        }
        lastFishCount = currentFishCount;

        // Find a fishing spot
        const spot = findFishingSpot(ctx);

        if (!spot) {
            consecutiveNoSpotCount++;

            if (consecutiveNoSpotCount >= 5) {
                // Try walking to the fishing area
                ctx.log('Walking to Draynor fishing area...');
                await ctx.bot.walkTo(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z);
                ctx.progress();
                consecutiveNoSpotCount = 0;
            }

            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        consecutiveNoSpotCount = 0;

        // Find the "Net" option
        const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
        if (!netOpt) {
            ctx.warn(`Fishing spot has no Net option: ${spot.options.join(', ')}`);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Start fishing (fishing spots are NPCs)
        await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
        ctx.progress();

        // Just a small delay to let the action process
        await new Promise(r => setTimeout(r, 300));
    }
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: FishingStats) {
    const state = ctx.state();
    const fishing = state?.skills.find(s => s.name === 'Fishing');
    const endXp = fishing?.experience ?? 0;
    const xpGained = endXp - stats.startXp;
    const duration = (Date.now() - stats.startTime) / 1000;
    const xpPerHour = Math.round((xpGained / duration) * 3600);

    ctx.log('');
    ctx.log('=== Final Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Final Level: ${fishing?.baseLevel ?? '?'}`);
    ctx.log(`XP Gained: ${xpGained}`);
    ctx.log(`XP/Hour: ${xpPerHour}`);
    ctx.log(`Fish Caught: ${stats.fishCaught}`);
    ctx.log(`Fish Dropped: ${stats.fishDropped}`);
}

// Run the script
runScript({
    name: 'fishing-speedrun',
    goal: 'Maximize Fishing level in 5 minutes at Draynor',
    saveConfig: DRAYNOR_FISHER,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 20_000,          // 20 seconds - aggressive stall detection
    screenshotInterval: 15_000,    // Screenshot every 15s for analysis
}, async (ctx) => {
    const stats: FishingStats = {
        fishCaught: 0,
        fishDropped: 0,
        startXp: getFishingXp(ctx),
        startTime: Date.now(),
        lastFishTime: Date.now(),
        lastXpTime: Date.now(),
        lastXp: getFishingXp(ctx),
    };

    try {
        await fishingLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error(`Script aborted: ${e.message}`);
        } else {
            throw e;
        }
    } finally {
        logFinalStats(ctx, stats);
    }
});
