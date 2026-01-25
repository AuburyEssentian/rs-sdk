/**
 * Arc: combat-money
 * Character: Adam_3
 *
 * Goal: Train combat AND make money by killing chickens.
 * Strategy: Kill chickens, collect feathers (valuable!), handle gates.
 * Duration: 5 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// Target - focus on making money
const TARGET_GP = 100;

interface Stats {
    killCount: number;
    feathersCollected: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getAttackLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
}

function getStrengthLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
}

function getHitpointsLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Hitpoints')?.baseLevel ?? 10;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

function getFeathers(ctx: ScriptContext): number {
    const feathers = ctx.state()?.inventory.find(i => /feather/i.test(i.name));
    return feathers?.count ?? 0;
}

/**
 * Find a chicken to attack
 */
function findTarget(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    const targets = state.nearbyNpcs
        .filter(npc => /^(chicken|goblin|cow)$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /attack/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return targets[0] ?? null;
}

/**
 * Find ground items to pick up (feathers, coins, bones)
 */
function findGroundItem(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    // Look for valuable ground items
    for (const loc of state.nearbyLocs) {
        if (/feather|coins|bones/i.test(loc.name)) {
            const takeOpt = loc.optionsWithIndex.find(o => /take/i.test(o.text));
            if (takeOpt) {
                return { loc, opIndex: takeOpt.opIndex };
            }
        }
    }
    return null;
}

/**
 * Find and open nearby gate if one exists
 */
async function handleGates(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const state = ctx.state();
    if (!state) return false;

    for (const loc of state.nearbyLocs) {
        if (/gate|door/i.test(loc.name)) {
            const openOpt = loc.optionsWithIndex.find(o => /open/i.test(o.text));
            if (openOpt) {
                ctx.log(`Opening ${loc.name}`);
                await ctx.sdk.sendInteractLoc(loc.x, loc.z, loc.id, openOpt.opIndex);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 1000));
                return true;
            }
        }
    }
    return false;
}

/**
 * Drop junk items to make space for valuables
 */
async function dropJunk(ctx: ScriptContext, stats: Stats): Promise<void> {
    const state = ctx.state();
    if (!state) return;

    // Keep: feathers, coins, bones
    // Drop: raw chicken, other junk
    const junkItems = state.inventory.filter(item =>
        /raw chicken|egg/i.test(item.name)
    );

    for (const item of junkItems.slice(0, 3)) {
        ctx.log(`Dropping ${item.name}`);
        await ctx.sdk.sendDropItem(item.slot);
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 100));
    }
}

/**
 * Main combat loop
 */
async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let noTargetCount = 0;
    let stuckCount = 0;

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        const attackLevel = getAttackLevel(ctx);
        const coins = getCoins(ctx);
        const feathers = getFeathers(ctx);

        // Progress log every 20 loops
        if (loopCount % 20 === 0) {
            ctx.log(`Loop ${loopCount}: Atk=${attackLevel}, GP=${coins}, Feathers=${feathers}, Kills=${stats.killCount}`);
        }

        // Dismiss any dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Drop junk if inventory is full
        if (currentState.inventory.length >= 27) {
            ctx.log('Inventory full - dropping junk');
            await dropJunk(ctx, stats);
            continue;
        }

        // Pick up ground items first (feathers are valuable!)
        const groundItem = findGroundItem(ctx);
        if (groundItem) {
            ctx.log(`Picking up ${groundItem.loc.name}`);
            await ctx.sdk.sendInteractLoc(groundItem.loc.x, groundItem.loc.z, groundItem.loc.id, groundItem.opIndex);
            if (/feather/i.test(groundItem.loc.name)) {
                stats.feathersCollected++;
            }
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 500));
            stuckCount = 0;
            continue;
        }

        // Find a target
        const target = findTarget(ctx);
        if (!target) {
            noTargetCount++;

            // Try opening gates if stuck
            if (noTargetCount % 5 === 0) {
                const openedGate = await handleGates(ctx, stats);
                if (openedGate) {
                    noTargetCount = 0;
                    continue;
                }
            }

            if (noTargetCount % 10 === 0) {
                ctx.log(`No targets nearby, wandering... (${noTargetCount})`);
            }

            // Wander to find targets
            const player = currentState.player;
            if (player) {
                const dx = Math.floor(Math.random() * 16) - 8;
                const dz = Math.floor(Math.random() * 16) - 8;
                await ctx.sdk.sendWalk(player.worldX + dx, player.worldZ + dz);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 2000));
            }
            continue;
        }

        noTargetCount = 0;
        stuckCount = 0;

        // Find attack option
        const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
        if (!attackOpt) {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Attack!
        ctx.log(`Attacking ${target.name} at dist ${target.distance}`);
        await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
        markProgress(ctx, stats);

        // Wait much longer for combat - level 1 is very slow
        // Just wait a fixed time and let the player auto-attack
        await new Promise(r => setTimeout(r, 8000)); // Wait 8 seconds per chicken
        stats.killCount++;
        markProgress(ctx, stats);
        ctx.log(`Finished attack attempt ${stats.killCount}`);
    }
}

/**
 * Log final statistics
 */
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const attackLevel = getAttackLevel(ctx);
    const strengthLevel = getStrengthLevel(ctx);
    const hpLevel = getHitpointsLevel(ctx);
    const coins = getCoins(ctx);
    const feathers = getFeathers(ctx);
    const totalLevel = getTotalLevel(ctx);
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Attack Level: ${attackLevel}`);
    ctx.log(`Strength Level: ${strengthLevel}`);
    ctx.log(`Hitpoints Level: ${hpLevel}`);
    ctx.log(`Kills: ${stats.killCount}`);
    ctx.log(`Feathers: ${feathers} (collected ${stats.feathersCollected})`);
    ctx.log(`Coins: ${coins}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'combat-money',
    goal: `Train combat and collect feathers/coins`,
    timeLimit: 5 * 60 * 1000,      // 5 minutes
    stallTimeout: 60_000,          // 60 seconds
    screenshotInterval: 30_000,
}, async (ctx) => {
    const stats: Stats = {
        killCount: 0,
        feathersCollected: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: combat-money ===');
    ctx.log(`Starting Attack: ${getAttackLevel(ctx)}, Strength: ${getStrengthLevel(ctx)}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
    ctx.log(`Current GP: ${getCoins(ctx)}, Feathers: ${getFeathers(ctx)}`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Equip bronze sword if in inventory (using sdk.getInventory like the test does)
    const inventory = ctx.sdk.getInventory();
    const sword = inventory.find(i => /bronze sword|sword|scimitar|dagger/i.test(i.name));
    if (sword) {
        const wieldOpt = sword.optionsWithIndex.find(o => /wield|wear/i.test(o.text));
        if (wieldOpt) {
            ctx.log(`Equipping ${sword.name} (slot ${sword.slot}, option ${wieldOpt.opIndex})`);
            ctx.log(`Options: ${sword.optionsWithIndex.map(o => `${o.opIndex}:${o.text}`).join(', ')}`);
            await ctx.sdk.sendUseItem(sword.slot, wieldOpt.opIndex);
            await new Promise(r => setTimeout(r, 600));
            markProgress(ctx, stats);
        } else {
            ctx.log(`No wield option found for ${sword.name}`);
            ctx.log(`Options: ${sword.optionsWithIndex.map(o => `${o.opIndex}:${o.text}`).join(', ')}`);
        }
    } else {
        ctx.log('No sword found in inventory');
    }

    // Set combat style to train Attack (check available styles)
    await new Promise(r => setTimeout(r, 300));
    const styleState = ctx.sdk.getState()?.combatStyle;
    if (styleState) {
        ctx.log(`Combat styles: ${styleState.styles.map(s => `${s.index}:${s.name}(${s.trainedSkill})`).join(', ')}`);
        const atkStyle = styleState.styles.find(s => s.trainedSkill === 'Attack');
        if (atkStyle) {
            ctx.log(`Setting combat style to Attack (index ${atkStyle.index})`);
            await ctx.sdk.sendSetCombatStyle(atkStyle.index);
        }
    }

    try {
        await combatLoop(ctx, stats);
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
