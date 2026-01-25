/**
 * Arc: mining-lumbridge
 * Character: Adam_3
 *
 * Goal: Train Mining at SE Varrock mine (safe area).
 * Strategy: Walk to mine, mine copper/tin, drop when full.
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// SE Varrock mine - copper and tin, no aggressive monsters
const TARGET_MINE = { x: 3285, z: 3365 };

// Target level
const TARGET_LEVEL = 70;

interface Stats {
    oresMined: number;
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

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

function getInventoryCount(ctx: ScriptContext): number {
    return ctx.state()?.inventory.length ?? 0;
}

/**
 * Find nearest minable rock
 */
function findRock(ctx: ScriptContext): { x: number; z: number; id: number; opIndex: number } | null {
    const state = ctx.state();
    if (!state) return null;

    for (const loc of state.nearbyLocs) {
        if (/rocks?/i.test(loc.name) && !/rockslide/i.test(loc.name)) {
            const mineOpt = loc.optionsWithIndex.find(o => /mine/i.test(o.text));
            if (mineOpt) {
                return {
                    x: loc.x,
                    z: loc.z,
                    id: loc.id,
                    opIndex: mineOpt.opIndex
                };
            }
        }
    }
    return null;
}

/**
 * Drop all ore from inventory
 */
async function dropOres(ctx: ScriptContext, stats: Stats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const oreItems = state.inventory.filter(item =>
        /ore/i.test(item.name) || /clay/i.test(item.name)
    );

    for (const item of oreItems) {
        ctx.log(`Dropping ${item.name}`);
        await ctx.sdk.sendDropItem(item.slot);
        dropped++;
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }

    return dropped;
}

/**
 * Main mining loop
 */
async function miningLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let noRockCount = 0;

    while (getMiningLevel(ctx) < TARGET_LEVEL) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Progress log every 10 loops
        if (loopCount % 10 === 0) {
            ctx.log(`Loop ${loopCount}: Mining=${getMiningLevel(ctx)}, Ores=${stats.oresMined}, Inv=${getInventoryCount(ctx)}/28`);
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Drop ores if inventory is full
        if (currentState.inventory.length >= 28) {
            ctx.log('Inventory full - dropping ores');
            await dropOres(ctx, stats);
            continue;
        }

        // Find and mine a rock
        const rock = findRock(ctx);
        if (rock) {
            noRockCount = 0;
            const startInv = currentState.inventory.length;

            await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, rock.opIndex);
            markProgress(ctx, stats);

            // Wait a bit for mining animation
            await new Promise(r => setTimeout(r, 3000));

            // Check if we got ore
            const newInv = ctx.state()?.inventory.length ?? startInv;
            if (newInv > startInv) {
                stats.oresMined++;
            }
            continue;
        }

        // No rock found - wander
        noRockCount++;
        if (noRockCount % 5 === 0) {
            ctx.log(`No rocks nearby, wandering... (${noRockCount})`);
        }

        const player = currentState.player;
        if (player) {
            // Wander around mine area
            const dx = Math.floor(Math.random() * 6) - 3;
            const dz = Math.floor(Math.random() * 6) - 3;
            await ctx.sdk.sendWalk(TARGET_MINE.x + dx, TARGET_MINE.z + dz);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    ctx.log(`Mining complete! Level ${getMiningLevel(ctx)}`);
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const miningLevel = getMiningLevel(ctx);
    const totalLevel = getTotalLevel(ctx);
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Mining Level: ${miningLevel}`);
    ctx.log(`Ores Mined: ${stats.oresMined}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'mining-lumbridge',
    goal: `Train Mining to level ${TARGET_LEVEL}`,
    timeLimit: 5 * 60 * 1000,
    stallTimeout: 45_000,
    screenshotInterval: 30_000,
}, async (ctx) => {
    const stats: Stats = {
        oresMined: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: mining-lumbridge ===');
    ctx.log(`Starting Mining Level: ${getMiningLevel(ctx)}`);
    ctx.log(`Target: Level ${TARGET_LEVEL}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to SE Varrock mine
    ctx.log('Walking to SE Varrock mine...');
    await ctx.bot.walkTo(TARGET_MINE.x, TARGET_MINE.z);
    markProgress(ctx, stats);

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
