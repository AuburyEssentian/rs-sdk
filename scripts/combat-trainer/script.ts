/**
 * Combat Trainer Script
 *
 * Goal: Maximize Attack + Strength + Defence + Hitpoints levels over 10 minutes.
 *
 * Strategy:
 * - Find and kill goblins (low level, abundant near Lumbridge)
 * - Phase 1 (first ~3 min): Farm coins with Defensive style for Defence XP
 * - Phase 2: Walk to Al Kharid and buy an iron scimitar (major damage upgrade!)
 * - Phase 3: Continue training with better weapon, cycle styles
 * - Pick up bones/coins as loot (coins fund the upgrade)
 * - Eat food if HP drops low
 * - Track XP gains and combat events
 */

import { runScript, TestPresets } from '../script-runner';
import type { ScriptContext } from '../script-runner';
import type { NearbyNpc } from '../../agent/types';

// Combat style indices for swords (4 styles: Stab, Lunge, Slash, Block)
// See: https://oldschool.runescape.wiki/w/Combat_Options
const COMBAT_STYLES = {
    ACCURATE: 0,    // Stab - Trains Attack
    AGGRESSIVE: 1,  // Lunge - Trains Strength
    CONTROLLED: 2,  // Slash - Trains Attack+Strength+Defence evenly
    DEFENSIVE: 3,   // Block - Trains Defence only
};

// Track combat statistics
interface CombatStats {
    kills: number;
    damageDealt: number;
    damageTaken: number;
    startXp: { atk: number; str: number; def: number; hp: number };
    foodEaten: number;
    looted: number;
    coinsCollected: number;
    weaponUpgraded: boolean;
    phase: 'farming' | 'upgrading' | 'training';
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
 * Cycle to the next combat style for balanced training.
 * Phase 1 (farming): Use Defensive to get Defence XP early (fixes Run 002's Def=0)
 * Phase 3 (training): Use Controlled style for balanced Atk/Str/Def XP
 */
async function cycleCombatStyle(ctx: ScriptContext, stats: CombatStats): Promise<void> {
    const state = ctx.state();
    const combatStyle = state?.combatStyle;
    if (!combatStyle) return;

    let targetStyle: number;
    let styleName: string;

    if (stats.phase === 'farming') {
        // Phase 1: Use Defensive to get Defence XP (was 0 in Run 002!)
        // Sword style 3 = Block (Defensive) - trains Defence only
        targetStyle = COMBAT_STYLES.DEFENSIVE;
        styleName = 'Block (Defence)';
    } else {
        // Phase 3 (training): Use Controlled for balanced XP across all melee stats
        // Sword style 2 = Slash (Controlled) - trains Attack + Strength + Defence evenly
        targetStyle = COMBAT_STYLES.CONTROLLED;
        styleName = 'Slash (Controlled - All Stats)';
    }

    if (combatStyle.currentStyle !== targetStyle) {
        ctx.log(`Switching to ${styleName} style`);
        await ctx.sdk.sendSetCombatStyle(targetStyle);
        ctx.progress();
    }
}

/**
 * Wait for current combat to complete (NPC dies or we need to heal)
 * Uses multiple detection methods: XP gains, combatCycle, and NPC disappearance.
 */
async function waitForCombatEnd(
    ctx: ScriptContext,
    targetNpc: NearbyNpc,
    stats: CombatStats
): Promise<'kill' | 'fled' | 'lost_target' | 'need_heal'> {
    let lastSeenTick = ctx.state()?.tick ?? 0;
    let combatStarted = false;
    let ticksSinceCombatEnded = 0;
    let loopCount = 0;

    // Track starting XP to detect combat via XP gains
    const startState = ctx.state();
    const startXp = {
        def: startState?.skills.find(s => s.name === 'Defence')?.experience ?? 0,
        hp: startState?.skills.find(s => s.name === 'Hitpoints')?.experience ?? 0,
    };

    // Wait up to 30 seconds for combat to resolve
    const maxWaitMs = 30000;
    const startTime = Date.now();

    // Initial delay to let combat actually start (attack animation takes time)
    await new Promise(r => setTimeout(r, 800));

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, 400));
        loopCount++;
        const state = ctx.state();
        if (!state) return 'lost_target';

        const currentTick = state.tick;

        // Check if we need to heal
        if (shouldEat(ctx)) {
            return 'need_heal';
        }

        // Check XP gains as combat indicator (most reliable!)
        const currentXp = {
            def: state.skills.find(s => s.name === 'Defence')?.experience ?? 0,
            hp: state.skills.find(s => s.name === 'Hitpoints')?.experience ?? 0,
        };
        const xpGained = (currentXp.def - startXp.def) + (currentXp.hp - startXp.hp);
        if (xpGained > 0) {
            combatStarted = true;  // XP gain = definitely in combat
        }

        // Find our target NPC
        const target = state.nearbyNpcs.find(n => n.index === targetNpc.index);

        if (!target) {
            // NPC disappeared - count as kill if we gained XP or waited a bit
            if (combatStarted || xpGained > 0 || loopCount >= 2) {
                stats.kills++;
                return 'kill';
            }
            return 'lost_target';
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

        // Check combat status via combatCycle
        const npcInCombat = target.combatCycle > currentTick;
        const playerInCombat = state.player?.combat?.inCombat ?? false;
        const inActiveCombat = playerInCombat || npcInCombat || xpGained > 0;

        if (inActiveCombat) {
            combatStarted = true;
            ticksSinceCombatEnded = 0;
        } else if (combatStarted) {
            ticksSinceCombatEnded++;
            if (ticksSinceCombatEnded >= 4) {
                return 'fled';
            }
        } else if (loopCount >= 8) {
            // Combat never started after ~4 seconds
            return 'lost_target';
        }

        ctx.progress();
    }

    return 'lost_target';
}

// Al Kharid scimitar shop location and prices
const ALKHARID_SCIMITAR_SHOP = { x: 3287, z: 3186 };  // Zeke's Scimitar Shop
const IRON_SCIMITAR_PRICE = 112;  // Base shop price
const GATE_TOLL = 10;  // Gate toll to enter Al Kharid
const UPGRADE_THRESHOLD = IRON_SCIMITAR_PRICE + GATE_TOLL + 20;  // ~142 coins before attempting

/**
 * Attempt to upgrade weapon by traveling to Al Kharid scimitar shop.
 * Returns true if upgrade was successful.
 */
async function attemptWeaponUpgrade(ctx: ScriptContext, stats: CombatStats): Promise<boolean> {
    ctx.log('=== Starting Weapon Upgrade Phase ===');
    stats.phase = 'upgrading';

    // Check if we have enough coins
    const coins = ctx.sdk.findInventoryItem(/^coins$/i);
    const coinCount = coins?.count ?? 0;
    ctx.log(`Coins available: ${coinCount}`);

    if (coinCount < UPGRADE_THRESHOLD) {
        ctx.log(`Not enough coins for upgrade (need ${UPGRADE_THRESHOLD}), continuing farming`);
        stats.phase = 'farming';
        return false;
    }

    // Walk towards Al Kharid gate (from Lumbridge goblin area)
    ctx.log('Walking to Al Kharid gate...');
    await ctx.bot.walkTo(3268, 3227);  // Near the toll gate
    ctx.progress();

    // Try to go through the gate (may need to pay toll)
    const gate = ctx.state()?.nearbyObjects.find(o => /gate/i.test(o.name) && o.distance < 10);
    if (gate) {
        ctx.log('Passing through Al Kharid gate...');
        const gateResult = await ctx.bot.openDoor(/gate/i);
        if (!gateResult.success) {
            ctx.log('Gate blocked or toll required, checking dialog...');
        }
        await new Promise(r => setTimeout(r, 1000));

        // Handle toll dialog if it appears
        const state = ctx.state();
        if (state?.dialog.isOpen) {
            ctx.log('Paying gate toll (10gp)...');
            await ctx.sdk.sendClickDialog(1);  // Usually "Yes" to pay toll
            await new Promise(r => setTimeout(r, 500));
        }
    }
    ctx.progress();

    // Walk to scimitar shop
    ctx.log('Walking to Zeke\'s Scimitar Shop...');
    await ctx.bot.walkTo(ALKHARID_SCIMITAR_SHOP.x, ALKHARID_SCIMITAR_SHOP.z);
    ctx.progress();

    // Open the shop
    ctx.log('Opening shop...');
    const shopResult = await ctx.bot.openShop(/zeke/i);
    if (!shopResult.success) {
        // Try generic shopkeeper
        const shopResult2 = await ctx.bot.openShop(/shop/i);
        if (!shopResult2.success) {
            ctx.warn('Failed to open scimitar shop, returning to training');
            stats.phase = 'training';
            return false;
        }
    }
    ctx.progress();

    // Buy iron scimitar
    ctx.log('Buying iron scimitar...');
    const buyResult = await ctx.bot.buyFromShop(/iron scimitar/i, 1);
    if (!buyResult.success) {
        ctx.warn(`Failed to buy iron scimitar: ${buyResult.message}`);
        // Close shop and continue
        await ctx.sdk.sendCloseInterface();
        stats.phase = 'training';
        return false;
    }
    ctx.log('Iron scimitar purchased!');
    ctx.progress();

    // Close shop
    await ctx.sdk.sendCloseInterface();
    await new Promise(r => setTimeout(r, 300));

    // Equip the new weapon
    const scimitar = ctx.sdk.findInventoryItem(/iron scimitar/i);
    if (scimitar) {
        ctx.log('Equipping iron scimitar...');
        await ctx.bot.equipItem(scimitar);
        ctx.progress();
    }

    // Walk back to goblin area
    ctx.log('Walking back to goblin training area...');
    await ctx.bot.walkTo(3245, 3235);  // Goblin area east of Lumbridge
    ctx.progress();

    stats.weaponUpgraded = true;
    stats.phase = 'training';
    ctx.log('=== Weapon Upgrade Complete! Iron Scimitar Equipped ===');
    return true;
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
        coinsCollected: 0,
        weaponUpgraded: false,
        phase: 'farming',  // Start in farming phase to collect coins + Defence XP
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

        // Cycle combat style based on current phase
        await cycleCombatStyle(ctx, stats);

        // Check if we should attempt weapon upgrade (phase 1 -> phase 2)
        if (stats.phase === 'farming' && !stats.weaponUpgraded) {
            const coins = ctx.sdk.findInventoryItem(/^coins$/i);
            const coinCount = coins?.count ?? 0;

            if (coinCount >= UPGRADE_THRESHOLD) {
                ctx.log(`Have ${coinCount} coins - attempting weapon upgrade!`);
                await attemptWeaponUpgrade(ctx, stats);
                continue;  // Re-enter loop after upgrade attempt
            }

            // After 15 kills without enough coins, skip upgrade and go to training
            if (stats.kills >= 15 && coinCount < UPGRADE_THRESHOLD) {
                ctx.log(`Skipping weapon upgrade after ${stats.kills} kills (only ${coinCount} coins, need ${UPGRADE_THRESHOLD})`);
                ctx.log('Switching to balanced training with Controlled style');
                stats.phase = 'training';
            }
        }

        // Pick up loot - prioritize coins (for upgrade), then bones (for prayer XP later)
        const loot = ctx.sdk.getGroundItems()
            .filter(i => /bones|coins/i.test(i.name))
            .filter(i => i.distance <= 5)  // Slightly larger pickup radius
            .sort((a, b) => {
                // Prioritize coins over bones
                const aIsCoins = /coins/i.test(a.name) ? 0 : 1;
                const bIsCoins = /coins/i.test(b.name) ? 0 : 1;
                if (aIsCoins !== bIsCoins) return aIsCoins - bIsCoins;
                return a.distance - b.distance;
            });

        if (loot.length > 0) {
            const item = loot[0]!;
            ctx.log(`Picking up ${item.name}...`);
            const result = await ctx.bot.pickupItem(item);
            if (result.success) {
                stats.looted++;
                if (/coins/i.test(item.name)) {
                    stats.coinsCollected += item.quantity ?? 1;
                }
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

    ctx.log(`--- Stats after ${stats.kills} kills (Phase: ${stats.phase}) ---`);
    ctx.log(`XP Gained: Atk +${xpGained.atk}, Str +${xpGained.str}, Def +${xpGained.def}, HP +${xpGained.hp} (Total: +${totalXp})`);
    ctx.log(`Damage dealt: ${stats.damageDealt}, taken: ${stats.damageTaken}`);
    ctx.log(`Food eaten: ${stats.foodEaten}, Looted: ${stats.looted}, Coins: ${stats.coinsCollected}`);
    ctx.log(`Weapon upgraded: ${stats.weaponUpgraded ? 'YES (Iron Scimitar)' : 'No (Bronze Sword)'}`);
}

// Run the script with standard tutorial-complete items
runScript({
    name: 'combat-trainer',
    goal: 'Maximize Attack + Strength + Defence + Hitpoints levels by killing goblins with weapon upgrade',
    // Standard post-tutorial loadout (bronze gear, basic supplies)
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 10 * 60 * 1000,  // 10 minutes (extended for weapon upgrade trip)
    stallTimeout: 60_000,       // 60 seconds (increased for shop trip)
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
