/**
 * Combat Trainer Script
 *
 * Goal: Maximize Attack + Strength + Defence + Hitpoints levels over 5 minutes.
 *
 * Strategy:
 * - Find and kill goblins (low level, abundant near Lumbridge)
 * - Cycle combat styles to train all melee skills evenly
 * - Pick up bones/coins as loot
 * - Eat food if HP drops low
 * - Track XP gains and combat events
 */

import { runScript, TestPresets } from '../script-runner';
import type { ScriptContext } from '../script-runner';
import type { NearbyNpc } from '../../agent/types';

// Combat style indices for unarmed/sword combat
const COMBAT_STYLES = {
    ACCURATE: 0,    // Trains Attack
    AGGRESSIVE: 1,  // Trains Strength
    DEFENSIVE: 2,   // Trains Defence (or Block for swords)
    CONTROLLED: 2,  // Some weapons have this instead - trains all
};

// Track combat statistics
interface CombatStats {
    kills: number;
    damageDealt: number;
    damageTaken: number;
    startXp: { atk: number; str: number; def: number; hp: number };
    foodEaten: number;
    looted: number;
}

/**
 * Find the best goblin to attack:
 * - Not already in combat with someone else
 * - Closest to us
 * - Preferably at full HP
 */
function findBestTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const goblins = state.nearbyNpcs
        .filter(npc => /goblin/i.test(npc.name))
        .filter(npc => npc.options.some(o => /attack/i.test(o)))
        // Filter out goblins already fighting someone else
        .filter(npc => {
            // If NPC has no target, it's free
            if (npc.targetIndex === -1) return true;
            // If NPC is targeting us (player index is usually high), that's fine
            // We can't easily get our own player index, so just check if it's in combat
            // and prefer NPCs not in combat at all
            return !npc.inCombat;
        })
        .sort((a, b) => {
            // Prefer NPCs not in combat
            if (a.inCombat !== b.inCombat) {
                return a.inCombat ? 1 : -1;
            }
            // Then by distance
            return a.distance - b.distance;
        });

    return goblins[0] ?? null;
}

/**
 * Check if we should eat food based on HP
 */
function shouldEat(ctx: ScriptContext): boolean {
    const state = ctx.state();
    if (!state) return false;

    const hp = state.skills.find(s => s.name === 'Hitpoints');
    if (!hp) return false;

    // Eat if below 50% HP
    return hp.level < hp.baseLevel * 0.5;
}

/**
 * Cycle to the next combat style for balanced training
 */
async function cycleCombatStyle(ctx: ScriptContext, currentKills: number): Promise<void> {
    // Change style every 3 kills to train evenly
    const styleIndex = Math.floor(currentKills / 3) % 3;
    const styleNames = ['Accurate (Attack)', 'Aggressive (Strength)', 'Defensive (Defence)'];

    const state = ctx.state();
    const combatStyle = state?.combatStyle;

    if (combatStyle && combatStyle.currentStyle !== styleIndex) {
        ctx.log(`Switching to ${styleNames[styleIndex]} style`);
        await ctx.sdk.sendSetCombatStyle(styleIndex);
        ctx.progress();
    }
}

/**
 * Wait for current combat to complete (NPC dies or we need to heal)
 * Uses combatCycle comparison for reliable combat detection.
 */
async function waitForCombatEnd(
    ctx: ScriptContext,
    targetNpc: NearbyNpc,
    stats: CombatStats
): Promise<'kill' | 'fled' | 'lost_target' | 'need_heal'> {
    const startTick = ctx.state()?.tick ?? 0;
    let lastSeenTick = startTick;
    let combatStarted = false;
    let ticksSinceCombatEnded = 0;

    // Wait up to 30 seconds for combat to resolve
    const maxWaitMs = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, 300));
        const state = ctx.state();
        if (!state) return 'lost_target';

        const currentTick = state.tick;

        // Check if we need to heal
        if (shouldEat(ctx)) {
            return 'need_heal';
        }

        // Find our target NPC
        const target = state.nearbyNpcs.find(n => n.index === targetNpc.index);

        if (!target) {
            // NPC disappeared - likely died
            stats.kills++;
            return 'kill';
        }

        // Check NPC health - if 0, it died (only valid once maxHp > 0)
        if (target.maxHp > 0 && target.hp === 0) {
            stats.kills++;
            return 'kill';
        }

        // Track combat events
        for (const event of state.combatEvents) {
            if (event.tick > lastSeenTick) {
                if (event.type === 'damage_dealt' && event.targetIndex === targetNpc.index) {
                    stats.damageDealt += event.damage;
                    combatStarted = true;
                }
                if (event.type === 'damage_taken') {
                    stats.damageTaken += event.damage;
                    combatStarted = true;
                }
            }
        }
        lastSeenTick = currentTick;

        // Check combat status via combatCycle (more reliable than inCombat flag)
        // NPC combatCycle > currentTick means NPC was hit recently
        const npcInCombat = target.combatCycle > currentTick;

        // Player inCombat now uses combatCycle internally
        const playerInCombat = state.player?.combat?.inCombat ?? false;

        // Consider combat active if EITHER player or NPC shows combat signs
        const inActiveCombat = playerInCombat || npcInCombat;

        if (inActiveCombat) {
            combatStarted = true;
            ticksSinceCombatEnded = 0;
        } else if (combatStarted) {
            // Combat seems to have ended - wait a few ticks to be sure
            ticksSinceCombatEnded++;
            if (ticksSinceCombatEnded >= 3) {
                // NPC is still there but combat ended - they fled or we did
                return 'fled';
            }
        }

        ctx.progress();
    }

    // Timeout - combat took too long
    return 'lost_target';
}

/**
 * Main combat training loop
 */
async function combatTrainingLoop(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state) throw new Error('No initial state');

    // Initialize stats tracking
    const stats: CombatStats = {
        kills: 0,
        damageDealt: 0,
        damageTaken: 0,
        startXp: {
            atk: state.skills.find(s => s.name === 'Attack')?.experience ?? 0,
            str: state.skills.find(s => s.name === 'Strength')?.experience ?? 0,
            def: state.skills.find(s => s.name === 'Defence')?.experience ?? 0,
            hp: state.skills.find(s => s.name === 'Hitpoints')?.experience ?? 0,
        },
        foodEaten: 0,
        looted: 0,
    };

    ctx.log('=== Combat Trainer Started ===');
    ctx.log(`Starting XP - Atk: ${stats.startXp.atk}, Str: ${stats.startXp.str}, Def: ${stats.startXp.def}, HP: ${stats.startXp.hp}`);

    // Equip gear from standard tutorial loadout
    const sword = ctx.sdk.findInventoryItem(/bronze sword/i);
    if (sword) {
        ctx.log(`Equipping ${sword.name}...`);
        await ctx.bot.equipItem(sword);
        ctx.progress();
    }

    const shield = ctx.sdk.findInventoryItem(/wooden shield/i);
    if (shield) {
        ctx.log(`Equipping ${shield.name}...`);
        await ctx.bot.equipItem(shield);
        ctx.progress();
    }

    // Main training loop
    while (true) {
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Log periodic stats
        if (stats.kills > 0 && stats.kills % 5 === 0) {
            logStats(ctx, stats);
        }

        // Check if we need to eat
        if (shouldEat(ctx)) {
            // Find actual food items (not fishing nets!)
            const food = ctx.sdk.findInventoryItem(/^(bread|shrimps?|cooked? meat|anchovies|trout|salmon|lobster|swordfish)$/i);
            if (food) {
                ctx.log(`HP low - eating ${food.name}`);
                await ctx.bot.eatFood(food);
                stats.foodEaten++;
                ctx.progress();
                continue;
            } else {
                ctx.warn('HP low but no food! Continuing anyway...');
            }
        }

        // Cycle combat style based on kills
        await cycleCombatStyle(ctx, stats.kills);

        // Pick up loot if any bones/coins nearby
        const loot = ctx.sdk.getGroundItems()
            .filter(i => /bones|coins/i.test(i.name))
            .filter(i => i.distance <= 3);

        if (loot.length > 0) {
            const item = loot[0]!;
            ctx.log(`Picking up ${item.name}...`);
            const result = await ctx.bot.pickupItem(item);
            if (result.success) {
                stats.looted++;
            }
            ctx.progress();
        }

        // Find a goblin to attack
        const target = findBestTarget(ctx);
        if (!target) {
            ctx.log('No goblins nearby - walking to find some...');
            // Walk towards goblin spawn area (east of Lumbridge)
            await ctx.bot.walkTo(3245, 3235);
            ctx.progress();
            continue;
        }

        // Check if we're already fighting this target
        const playerCombat = currentState.player?.combat;
        if (playerCombat?.inCombat && playerCombat.targetIndex === target.index) {
            // Already fighting - wait for combat to end
            const result = await waitForCombatEnd(ctx, target, stats);
            ctx.log(`Combat ended: ${result}`);
            ctx.progress();
            continue;
        }

        // Attack the target
        ctx.log(`Attacking ${target.name} (HP: ${target.hp}/${target.maxHp}, dist: ${target.distance})`);
        const attackResult = await ctx.bot.attackNpc(target);

        if (!attackResult.success) {
            ctx.warn(`Attack failed: ${attackResult.message}`);

            // If blocked by obstacle, try to open nearby door/gate
            if (attackResult.reason === 'out_of_reach') {
                ctx.log('Trying to open nearby gate...');
                const gateResult = await ctx.bot.openDoor(/gate/i);
                if (gateResult.success) {
                    ctx.log('Gate opened!');
                }
            }
            ctx.progress();
            continue;
        }

        // Wait for combat to complete
        const combatResult = await waitForCombatEnd(ctx, target, stats);
        ctx.log(`Combat ended: ${combatResult}`);

        if (combatResult === 'kill') {
            ctx.log(`Kill #${stats.kills}!`);
        }

        ctx.progress();
    }
}

/**
 * Log current training statistics
 */
function logStats(ctx: ScriptContext, stats: CombatStats): void {
    const state = ctx.state();
    if (!state) return;

    const currentXp = {
        atk: state.skills.find(s => s.name === 'Attack')?.experience ?? 0,
        str: state.skills.find(s => s.name === 'Strength')?.experience ?? 0,
        def: state.skills.find(s => s.name === 'Defence')?.experience ?? 0,
        hp: state.skills.find(s => s.name === 'Hitpoints')?.experience ?? 0,
    };

    const xpGained = {
        atk: currentXp.atk - stats.startXp.atk,
        str: currentXp.str - stats.startXp.str,
        def: currentXp.def - stats.startXp.def,
        hp: currentXp.hp - stats.startXp.hp,
    };

    const totalXp = xpGained.atk + xpGained.str + xpGained.def + xpGained.hp;

    ctx.log(`--- Stats after ${stats.kills} kills ---`);
    ctx.log(`XP Gained: Atk +${xpGained.atk}, Str +${xpGained.str}, Def +${xpGained.def}, HP +${xpGained.hp} (Total: +${totalXp})`);
    ctx.log(`Damage dealt: ${stats.damageDealt}, taken: ${stats.damageTaken}`);
    ctx.log(`Food eaten: ${stats.foodEaten}, Items looted: ${stats.looted}`);
}

// Run the script with standard tutorial-complete items
runScript({
    name: 'combat-trainer',
    goal: 'Maximize Attack + Strength + Defence + Hitpoints levels by killing goblins',
    // Standard post-tutorial loadout (bronze gear, basic supplies)
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 45_000,      // 45 seconds (combat can have lulls)
}, async (ctx) => {
    try {
        await combatTrainingLoop(ctx);
    } finally {
        // Log final stats
        const state = ctx.state();
        if (state) {
            const skills = state.skills;
            const atk = skills.find(s => s.name === 'Attack');
            const str = skills.find(s => s.name === 'Strength');
            const def = skills.find(s => s.name === 'Defence');
            const hp = skills.find(s => s.name === 'Hitpoints');

            ctx.log('=== Final Results ===');
            ctx.log(`Attack: Level ${atk?.baseLevel} (${atk?.experience} XP)`);
            ctx.log(`Strength: Level ${str?.baseLevel} (${str?.experience} XP)`);
            ctx.log(`Defence: Level ${def?.baseLevel} (${def?.experience} XP)`);
            ctx.log(`Hitpoints: Level ${hp?.baseLevel} (${hp?.experience} XP)`);
        }
    }
});
