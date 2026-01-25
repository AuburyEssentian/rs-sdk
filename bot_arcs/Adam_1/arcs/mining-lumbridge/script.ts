/**
 * Arc: mining-lumbridge
 * Character: Adam_1
 *
 * Goal: Train Mining at Lumbridge Swamp mine.
 * Strategy: Mine copper/tin ore, drop when full, repeat.
 *
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyLoc, InventoryItem } from '../../../../agent/types';

// SE Varrock mine (tested and working location)
const VARROCK_SE_MINE = { x: 3285, z: 3365 };

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
 * Count ore in inventory
 */
function countOre(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;
    return state.inventory
        .filter(i => /ore$/i.test(i.name))
        .reduce((sum, i) => sum + i.count, 0);
}

/**
 * Find pickaxe in inventory
 */
function findPickaxe(ctx: ScriptContext): InventoryItem | null {
    const state = ctx.state();
    if (!state) return null;
    return state.inventory.find(i => /pickaxe/i.test(i.name)) ?? null;
}

/**
 * Find nearest minable rock (copper or tin)
 */
function findRock(ctx: ScriptContext): NearbyLoc | null {
    const state = ctx.state();
    if (!state) return null;

    // Find rocks with "Mine" option
    // Look for copper/tin rocks (they have specific names like "Rocks" with brown/grey color)
    const rocks = state.nearbyLocs
        .filter(loc => /rocks?$/i.test(loc.name))
        .filter(loc => loc.options.some(opt => /^mine$/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return rocks[0] ?? null;
}

/**
 * Drop all ore to make space
 */
async function dropAllOre(ctx: ScriptContext, stats: Stats): Promise<number> {
    const state = ctx.state();
    if (!state) return 0;

    let dropped = 0;
    const oreItems = state.inventory.filter(i => /ore$/i.test(i.name));

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
    ctx.log('=== Mining Arc Started ===');
    let lastOreCount = countOre(ctx);
    let noRockCount = 0;
    let loopCount = 0;

    while (true) {
        loopCount++;
        if (loopCount % 100 === 0) {
            ctx.log(`Mining loop: ${loopCount} iterations, Mining: ${getMiningLevel(ctx)}, ore: ${countOre(ctx)}`);
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

        // Check if inventory is full
        if (currentState.inventory.length >= 28) {
            ctx.log('Inventory full - dropping ore');
            const dropped = await dropAllOre(ctx, stats);
            ctx.log(`Dropped ${dropped} ore`);
            continue;
        }

        // Check for drift from mine
        const player = currentState.player;
        if (player) {
            const distFromMine = Math.sqrt(
                Math.pow(player.worldX - VARROCK_SE_MINE.x, 2) +
                Math.pow(player.worldZ - VARROCK_SE_MINE.z, 2)
            );
            if (distFromMine > 20) {
                ctx.log(`Drifted ${distFromMine.toFixed(0)} tiles, walking back to mine...`);
                await ctx.sdk.sendWalk(VARROCK_SE_MINE.x, VARROCK_SE_MINE.z, true);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
        }

        // Track ore mined
        const currentOreCount = countOre(ctx);
        if (currentOreCount > lastOreCount) {
            const newOre = currentOreCount - lastOreCount;
            stats.oresMined += newOre;
            ctx.log(`Mined ${newOre} ore! Total: ${stats.oresMined}`);
            noRockCount = 0;
        }
        lastOreCount = currentOreCount;

        // Debug: show nearby locations every 100 iterations
        if (loopCount === 10) {
            const allLocs = currentState.nearbyLocs.slice(0, 10);
            ctx.log(`All nearby locs: ${allLocs.map(l => `${l.name}`).join(', ')}`);
            const rocks = currentState.nearbyLocs.filter(l => /rock/i.test(l.name));
            ctx.log(`Rock-like objects: ${rocks.map(l => `${l.name}(${l.options.join(',')})`).join(', ') || 'none'}`);
        }

        // Find rock
        const rock = findRock(ctx);
        if (!rock) {
            noRockCount++;
            if (noRockCount === 20) {
                const locs = currentState.nearbyLocs.slice(0, 10);
                ctx.log(`Nearby locs: ${locs.map(l => `${l.name}(${l.options.join(',')})`).join(', ')}`);
                ctx.log(`Position: (${player?.worldX}, ${player?.worldZ})`);
            }
            if (noRockCount % 50 === 0) {
                ctx.log(`No rock found (${noRockCount} attempts), walking to mine...`);
                await ctx.sdk.sendWalk(VARROCK_SE_MINE.x, VARROCK_SE_MINE.z, true);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 2000));
            }
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        noRockCount = 0;

        // Walk closer to rock if too far (need to be within 2 tiles to interact)
        if (rock.distance > 3) {
            if (loopCount <= 20 || loopCount % 50 === 0) {
                ctx.log(`Rock too far (${rock.distance.toFixed(1)} tiles), walking to (${rock.x}, ${rock.z})...`);
            }
            await ctx.sdk.sendWalk(rock.x, rock.z, true);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Only mine if idle
        const isIdle = player?.animId === -1;

        if (isIdle) {
            const mineOpt = rock.optionsWithIndex?.find(o => /^mine$/i.test(o.text));
            if (mineOpt) {
                if (loopCount <= 20 || loopCount % 100 === 0) {
                    ctx.log(`Mining rock: pos=(${rock.x}, ${rock.z}), dist=${rock.distance.toFixed(1)}, id=${rock.id}, opIndex=${mineOpt.opIndex}, player=(${player?.worldX}, ${player?.worldZ})`);
                    ctx.log(`  All options: ${JSON.stringify(rock.optionsWithIndex)}`);
                }
                // Try using op index 1 directly (Mine is typically first option after Examine)
                await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
                markProgress(ctx, stats);
            } else {
                ctx.log(`Rock ${rock.name} has no Mine option: ${rock.options.join(',')}`);
            }
        } else {
            // Not idle - currently mining
            if (loopCount <= 20) {
                ctx.log(`Mining in progress... animId=${player?.animId}`);
            }
            markProgress(ctx, stats);
        }

        // Wait for mining animation
        await new Promise(r => setTimeout(r, 2000));
        markProgress(ctx, stats);
    }
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
    ctx.log(`Mining: Level ${getMiningLevel(ctx)}, +${miningXpGained} XP`);
    ctx.log(`Ores mined: ${stats.oresMined}`);
    ctx.log(`Total Level: ${getTotalLevel(ctx)}`);
}

// Run the arc
runArc({
    characterName: 'Adam_1',
    arcName: 'mining-lumbridge',
    goal: 'Train Mining at SE Varrock mine',
    timeLimit: 3 * 60 * 1000,      // 3 minutes
    stallTimeout: 30_000,
    screenshotInterval: 30_000,
    // Initialize with current skills + pickaxe
    initializeFromPreset: {
        position: VARROCK_SE_MINE,
        skills: { Fishing: 48, Woodcutting: 41, Mining: 1 },
        inventory: [
            { id: 1265, count: 1 },   // Bronze pickaxe
            { id: 1351, count: 1 },   // Bronze axe
            { id: 590, count: 1 },    // Tinderbox
        ],
    },
    launchOptions: {
        useSharedBrowser: false,  // Try independent browser
    },
}, async (ctx) => {
    const stats: Stats = {
        oresMined: 0,
        startMiningXp: getMiningXp(ctx),
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: mining-lumbridge ===');
    ctx.log(`Starting Mining: ${getMiningLevel(ctx)}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Check inventory
    const inv = ctx.state()?.inventory || [];
    const hasPickaxe = inv.some(i => /pickaxe/i.test(i.name));
    ctx.log(`Inventory check: pickaxe=${hasPickaxe}`);
    ctx.log(`Inventory: ${inv.map(i => i.name).join(', ')}`);

    if (!hasPickaxe) {
        ctx.error('No pickaxe in inventory! Cannot mine.');
        return;
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to mine if needed
    for (let attempt = 0; attempt < 3; attempt++) {
        const player = ctx.state()?.player;
        if (!player) continue;

        const dist = Math.sqrt(
            Math.pow(player.worldX - VARROCK_SE_MINE.x, 2) +
            Math.pow(player.worldZ - VARROCK_SE_MINE.z, 2)
        );
        ctx.log(`Distance to mine: ${dist.toFixed(0)} tiles`);

        if (dist < 20) {
            ctx.log('At mine!');
            break;
        }

        ctx.log('Walking to mine...');
        await ctx.sdk.sendWalk(VARROCK_SE_MINE.x, VARROCK_SE_MINE.z, true);

        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);
            if (ctx.state()?.dialog.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }
            const p = ctx.state()?.player;
            if (p) {
                const d = Math.sqrt(
                    Math.pow(p.worldX - VARROCK_SE_MINE.x, 2) +
                    Math.pow(p.worldZ - VARROCK_SE_MINE.z, 2)
                );
                if (d < 20) break;
            }
        }
    }

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
