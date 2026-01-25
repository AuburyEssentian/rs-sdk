/**
 * Arc: mining-basics
 * Character: Adam_2
 *
 * Goal: Train Mining at Lumbridge Swamp mine.
 * Strategy: Mine copper/tin, drop ore when full, repeat.
 *
 * Duration: 5 minutes
 */

import { runArc, TestPresets, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyLoc } from '../../../../agent/types';

// SE Varrock mine (copper and tin rocks - safer, no aggressive mobs)
const SE_VARROCK_MINE = { x: 3285, z: 3365 };

// Waypoints from Lumbridge to SE Varrock mine
const WAYPOINTS_TO_MINE = [
    { x: 3222, z: 3230 },
    { x: 3222, z: 3250 },
    { x: 3230, z: 3280 },
    { x: 3250, z: 3310 },
    { x: 3270, z: 3340 },
    { x: 3285, z: 3360 },
    SE_VARROCK_MINE,
];

// Target mining level
const TARGET_LEVEL = 30;

interface Stats {
    oresMined: number;
    startMiningXp: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getMiningLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Mining')?.baseLevel ?? 1;
}

function getMiningXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Mining')?.experience ?? 0;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

/**
 * Count ores in inventory
 */
function countOres(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;
    return state.inventory
        .filter(i => /ore$/i.test(i.name))
        .reduce((sum, item) => sum + item.count, 0);
}

/**
 * Find nearest minable rock (copper or tin for low level)
 */
function findRock(ctx: ScriptContext): NearbyLoc | null {
    const state = ctx.state();
    if (!state) return null;

    // Look for rocks with "Mine" option
    const rocks = state.nearbyLocs
        .filter(loc => /rocks?/i.test(loc.name) && !/rockslide/i.test(loc.name))
        .filter(loc => loc.options.some(opt => /mine/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return rocks[0] ?? null;
}

/**
 * Drop all ores to make space
 */
async function dropAllOres(ctx: ScriptContext, stats: Stats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const oreItems = state.inventory.filter(item => /ore$/i.test(item.name));

    for (const item of oreItems) {
        ctx.log(`Dropping ${item.name} x${item.count}`);
        await ctx.sdk.sendDropItem(item.slot);
        dropped += item.count;
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }

    return dropped;
}

/**
 * Main mining loop
 */
async function miningLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let noRockCount = 0;
    let lastOreCount = countOres(ctx);

    while (getMiningLevel(ctx) < TARGET_LEVEL) {
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
            ctx.log('Inventory full - dropping ores');
            const dropped = await dropAllOres(ctx, stats);
            ctx.log(`Dropped ${dropped} ores`);
            continue;
        }

        // Track ores gained
        const currentOres = countOres(ctx);
        if (currentOres > lastOreCount) {
            const gained = currentOres - lastOreCount;
            stats.oresMined += gained;
            ctx.log(`Got ${gained} ore(s)! Total: ${stats.oresMined}`);
            markProgress(ctx, stats);
        }
        lastOreCount = currentOres;

        // Find rock
        const rock = findRock(ctx);
        if (!rock) {
            noRockCount++;
            if (noRockCount % 30 === 0) {
                ctx.log(`No rock found (${noRockCount} attempts)`);
            }
            if (noRockCount >= 60) {
                ctx.log('Walking to mine area...');
                await ctx.sdk.sendWalk(SE_VARROCK_MINE.x, SE_VARROCK_MINE.z, true);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 3000));
                noRockCount = 0;
            }
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        noRockCount = 0;

        // Only mine if idle
        const player = currentState.player;
        const isIdle = player?.animId === -1;

        if (isIdle) {
            const mineOpt = rock.optionsWithIndex?.find(o => /mine/i.test(o.text));
            if (mineOpt) {
                await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
                markProgress(ctx, stats);
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }

    ctx.log(`Reached Mining level ${getMiningLevel(ctx)}!`);
}

/**
 * Log final stats
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const miningXpGained = getMiningXp(ctx) - stats.startMiningXp;
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Mining Level: ${getMiningLevel(ctx)}`);
    ctx.log(`XP Gained: ${miningXpGained}`);
    ctx.log(`Ores Mined: ${stats.oresMined}`);
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
    arcName: 'mining-basics',
    goal: `Train Mining to level ${TARGET_LEVEL}`,
    timeLimit: 5 * 60 * 1000,
    stallTimeout: 30_000,
    screenshotInterval: 30_000,
    // Continue from previous state (woodcutting complete)
    // initializeFromPreset: TestPresets.LUMBRIDGE_SPAWN,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        oresMined: 0,
        startMiningXp: getMiningXp(ctx),
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: mining-basics ===');
    await waitForState(ctx, stats);

    ctx.log(`Starting Mining Level: ${getMiningLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Check for pickaxe
    const inv = ctx.state()?.inventory || [];
    const hasPickaxe = inv.some(i => /pickaxe/i.test(i.name));
    ctx.log(`Has pickaxe: ${hasPickaxe}`);

    if (!hasPickaxe) {
        ctx.error('No pickaxe in inventory!');
        return;
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to SE Varrock mine using waypoints
    ctx.log('Walking to SE Varrock mine...');
    for (const wp of WAYPOINTS_TO_MINE) {
        ctx.log(`  Waypoint (${wp.x}, ${wp.z})...`);
        await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx, stats);

        // Brief pause and check for dialogs
        await new Promise(r => setTimeout(r, 300));
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
        }
    }
    ctx.log('Arrived at mine!');

    try {
        await miningLoop(ctx, stats);
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
