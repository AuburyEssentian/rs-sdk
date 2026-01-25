/**
 * Arc: cooking-lumbridge
 * Character: Adam_3
 *
 * Goal: Train Cooking by cooking fish on Lumbridge range.
 * Strategy: Fish shrimp at Lumbridge swamp, cook at Lumbridge castle range.
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// Locations
const LUMBRIDGE_SWAMP_FISHING = { x: 3239, z: 3149 };
const LUMBRIDGE_RANGE = { x: 3211, z: 3214 }; // Inside Lumbridge castle

// Target level
const TARGET_COOKING = 30;
const TARGET_FISHING = 20;

interface Stats {
    fishCaught: number;
    fishCooked: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getCookingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Cooking')?.baseLevel ?? 1;
}

function getFishingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

function countRawFish(ctx: ScriptContext): number {
    return ctx.state()?.inventory.filter(i => /^raw /i.test(i.name)).length ?? 0;
}

function findFishingSpot(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    const spots = state.nearbyNpcs
        .filter(npc => /fishing\s*spot/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /^net$/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return spots[0] ?? null;
}

function findRange(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    for (const loc of state.nearbyLocs) {
        if (/range|stove|fire/i.test(loc.name)) {
            const cookOpt = loc.optionsWithIndex.find(o => /cook/i.test(o.text));
            if (cookOpt) {
                return { x: loc.x, z: loc.z, id: loc.id, opIndex: cookOpt.opIndex };
            }
        }
    }
    return null;
}

async function fishUntilFull(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('Fishing until inventory has some raw fish...');
    let fishAtStart = countRawFish(ctx);

    while (countRawFish(ctx) < 10 && ctx.state()!.inventory.length < 28) {
        const state = ctx.state();
        if (!state) break;

        if (state.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        const spot = findFishingSpot(ctx);
        if (!spot) {
            ctx.log('No fishing spot, wandering...');
            await ctx.sdk.sendWalk(LUMBRIDGE_SWAMP_FISHING.x, LUMBRIDGE_SWAMP_FISHING.z);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
        if (netOpt) {
            await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 3000));

            const newFish = countRawFish(ctx) - fishAtStart;
            if (newFish > 0) {
                stats.fishCaught += newFish;
                fishAtStart = countRawFish(ctx);
            }
        }
    }

    ctx.log(`Got ${countRawFish(ctx)} raw fish`);
}

async function cookFish(ctx: ScriptContext, stats: Stats): Promise<void> {
    const rawFishCount = countRawFish(ctx);
    if (rawFishCount === 0) return;

    ctx.log(`Cooking ${rawFishCount} fish...`);

    // Walk to range
    await ctx.bot.walkTo(LUMBRIDGE_RANGE.x, LUMBRIDGE_RANGE.z);
    markProgress(ctx, stats);

    // Cook each raw fish
    const state = ctx.state();
    if (!state) return;

    for (const item of state.inventory) {
        if (/^raw /i.test(item.name)) {
            const range = findRange(ctx);
            if (!range) {
                ctx.log('No range found nearby');
                break;
            }

            // Use fish on range
            await ctx.sdk.sendUseItemOnLoc(item.slot, range.x, range.z, range.id);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 2000));

            // Handle cook dialog if it appears
            const dialogState = ctx.state();
            if (dialogState?.dialog.isOpen) {
                await ctx.sdk.sendClickDialog(0);
                await new Promise(r => setTimeout(r, 1000));
            }

            stats.fishCooked++;
        }
    }

    ctx.log(`Cooked ${stats.fishCooked} fish total`);
}

async function mainLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    while (getCookingLevel(ctx) < TARGET_COOKING || getFishingLevel(ctx) < TARGET_FISHING) {
        // Fish some
        await ctx.bot.walkTo(LUMBRIDGE_SWAMP_FISHING.x, LUMBRIDGE_SWAMP_FISHING.z);
        markProgress(ctx, stats);
        await fishUntilFull(ctx, stats);

        // Cook what we caught
        if (countRawFish(ctx) > 0) {
            await cookFish(ctx, stats);
        }

        ctx.log(`Progress: Cooking=${getCookingLevel(ctx)}, Fishing=${getFishingLevel(ctx)}`);
    }

    ctx.log(`Training complete! Cooking=${getCookingLevel(ctx)}, Fishing=${getFishingLevel(ctx)}`);
}

function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Cooking Level: ${getCookingLevel(ctx)}`);
    ctx.log(`Fishing Level: ${getFishingLevel(ctx)}`);
    ctx.log(`Fish Caught: ${stats.fishCaught}`);
    ctx.log(`Fish Cooked: ${stats.fishCooked}`);
    ctx.log(`Total Level: ${getTotalLevel(ctx)}`);
    ctx.log('');
}

runArc({
    characterName: 'Adam_3',
    arcName: 'cooking-lumbridge',
    goal: `Train Cooking to ${TARGET_COOKING} and Fishing to ${TARGET_FISHING}`,
    timeLimit: 5 * 60 * 1000,
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
}, async (ctx) => {
    const stats: Stats = {
        fishCaught: 0,
        fishCooked: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: cooking-lumbridge ===');
    ctx.log(`Starting Cooking: ${getCookingLevel(ctx)}, Fishing: ${getFishingLevel(ctx)}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

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
