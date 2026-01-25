/**
 * Combat Trainer Script
 *
 * Goal: Maximize Attack + Strength + Defence + Hitpoints levels over 10 minutes.
 *
 * Strategy:
 * - Phase 1: Train at Lumbridge goblins until Combat Level 20 (Defensive style)
 * - Phase 2: Walk through Al Kharid gate (10gp toll), buy iron scimitar + kebabs
 * - Phase 3: Train at Al Kharid warriors (better XP, better drops)
 * - Pick up bones/coins as loot
 * - Eat food (kebabs) if HP drops low
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

// Training locations
const LOCATIONS = {
    LUMBRIDGE_GOBLINS: { x: 3245, z: 3235 },  // Goblin spawn east of Lumbridge
    ALKHARID_GATE: { x: 3268, z: 3227 },       // Gate to Al Kharid
    ALKHARID_SCIMITAR_SHOP: { x: 3287, z: 3186 },  // Zeke's shop
    ALKHARID_KEBAB_SHOP: { x: 3273, z: 3180 },     // Karim's kebab shop
    ALKHARID_WARRIORS: { x: 3293, z: 3174 },       // Al Kharid warriors (combat level 9)
};

// Upgrade config
const COMBAT_LEVEL_TRIGGER = 15;  // Combat level to trigger Al Kharid trip
const IRON_SCIMITAR_PRICE = 112;
const KEBAB_PRICE = 1;
const GATE_TOLL = 10;
const KEBABS_TO_BUY = 10;  // Buy 10 kebabs for food

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
    phase: 'lumbridge' | 'upgrading' | 'alkharid';
    lastStatsLog: number;  // Last kills count when we logged stats
}

/**
 * Find the best target to attack based on current phase:
 * - Lumbridge phase: Kill goblins
 * - Al Kharid phase: Kill warriors (or men if no warriors)
 *
 * Filters out NPCs already in combat with someone else.
 */
function findBestTarget(ctx: ScriptContext, phase: 'lumbridge' | 'alkharid'): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    // Target pattern based on phase
    const targetPattern = phase === 'lumbridge'
        ? /goblin/i
        : /al.?kharid warrior|warrior|man/i;

    const targets = state.nearbyNpcs
        .filter(npc => targetPattern.test(npc.name))
        .filter(npc => npc.options.some(o => /attack/i.test(o)))
        // Filter out NPCs already fighting someone else
        .filter(npc => {
            if (npc.targetIndex === -1) return true;
            return !npc.inCombat;
        })
        .sort((a, b) => {
            // Prefer NPCs not in combat
            if (a.inCombat !== b.inCombat) {
                return a.inCombat ? 1 : -1;
            }
            // Prefer warriors over men in Al Kharid
            if (phase === 'alkharid') {
                const aIsWarrior = /warrior/i.test(a.name) ? 0 : 1;
                const bIsWarrior = /warrior/i.test(b.name) ? 0 : 1;
                if (aIsWarrior !== bIsWarrior) return aIsWarrior - bIsWarrior;
            }
            // Then by distance
            return a.distance - b.distance;
        });

    return targets[0] ?? null;
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

// Style rotation for balanced training
const STYLE_ROTATION = [
    { style: COMBAT_STYLES.ACCURATE, name: 'Stab (Attack)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Lunge (Strength)' },
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Block (Defence)' },
];

/**
 * Cycle combat style every few kills for balanced Attack/Strength/Defence training.
 */
async function cycleCombatStyle(ctx: ScriptContext, stats: CombatStats): Promise<void> {
    const state = ctx.state();
    const combatStyle = state?.combatStyle;
    if (!combatStyle) return;

    // Cycle style every 2 kills for balanced training
    const styleIndex = Math.floor(stats.kills / 2) % STYLE_ROTATION.length;
    const target = STYLE_ROTATION[styleIndex]!;

    if (combatStyle.currentStyle !== target.style) {
        ctx.log(`Switching to ${target.name} style (kill #${stats.kills})`);
        await ctx.sdk.sendSetCombatStyle(target.style);
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

/**
 * Travel to Al Kharid, buy iron scimitar + kebabs, and stay for training.
 *
 * Steps:
 * 1. Sell bronze sword at Lumbridge general store (gets 10gp for toll)
 * 2. Walk to Al Kharid gate and pay toll
 * 3. Buy iron scimitar from Zeke's shop
 * 4. Buy kebabs from Karim's shop
 * 5. Walk to warrior area (stay there)
 */
async function travelToAlKharid(ctx: ScriptContext, stats: CombatStats): Promise<boolean> {
    ctx.log('=== Starting Al Kharid Journey ===');
    stats.phase = 'upgrading';

    // Step 1: Get 10gp for gate toll
    // First check if we have enough coins from looting
    let coins = ctx.sdk.findInventoryItem(/^coins$/i);
    let coinCount = coins?.count ?? 0;
    ctx.log(`Current coins: ${coinCount}`);

    if (coinCount < GATE_TOLL) {
        // Sell bones at general store to get coins
        const bones = ctx.sdk.findInventoryItem(/^bones$/i);
        if (!bones) {
            ctx.warn('No coins or bones to sell for gate toll!');
            stats.phase = 'lumbridge';
            return false;
        }

        ctx.log(`Selling ${bones.count} bones at general store for gate toll...`);
        await ctx.bot.walkTo(3211, 3247);  // Lumbridge general store
        ctx.progress();

        const shopResult = await ctx.bot.openShop(/shop.?keeper/i);
        if (!shopResult.success) {
            ctx.warn('Failed to open general store');
            stats.phase = 'lumbridge';
            return false;
        }

        // Sell all bones (each sells for ~1gp, need 10+)
        const sellResult = await ctx.bot.sellToShop(/^bones$/i, bones.count);
        if (!sellResult.success) {
            ctx.warn(`Failed to sell bones: ${sellResult.message}`);
            await ctx.bot.closeShop();
            stats.phase = 'lumbridge';
            return false;
        }
        ctx.log('Bones sold!');
        await ctx.bot.closeShop();
        ctx.progress();

        // Re-check coins
        coins = ctx.sdk.findInventoryItem(/^coins$/i);
        coinCount = coins?.count ?? 0;
        ctx.log(`Coins after selling: ${coinCount}`);

        if (coinCount < GATE_TOLL) {
            ctx.warn(`Still not enough coins (${coinCount}/${GATE_TOLL}), need more bones`);
            stats.phase = 'lumbridge';
            return false;
        }
    }

    // Step 2: Walk to Al Kharid gate
    ctx.log('Walking to Al Kharid gate...');
    await ctx.bot.walkTo(3268, 3228);
    ctx.progress();

    // Step 3: Handle toll gate (from best practices - openDoor doesn't work)
    ctx.log('Opening toll gate...');
    const gate = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name));
    if (gate) {
        const openOpt = gate.optionsWithIndex.find(o => /open/i.test(o.text));
        if (openOpt) {
            await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, openOpt.opIndex);
            await new Promise(r => setTimeout(r, 800));
        }
    }

    // Handle gate dialog - click through until "Yes" option appears
    for (let i = 0; i < 20; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 150));
            continue;
        }
        const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
        if (yesOpt) {
            ctx.log('Paying 10gp toll...');
            await ctx.sdk.sendClickDialog(yesOpt.index);
            break;
        }
        await ctx.sdk.sendClickDialog(0);  // Click to continue
        await new Promise(r => setTimeout(r, 200));
    }
    ctx.progress();

    // Wait for dialog to process then walk through gate
    await new Promise(r => setTimeout(r, 1000));

    // Keep trying to walk through the gate
    for (let i = 0; i < 10; i++) {
        const state = ctx.state();
        const currentX = state?.player?.worldX ?? 0;

        // Already inside Al Kharid?
        if (currentX >= 3270) {
            ctx.log('Successfully entered Al Kharid!');
            break;
        }

        // Dismiss any lingering dialogs
        if (state?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Try walking through
        ctx.log(`Attempting to walk through gate (attempt ${i + 1}/10)...`);
        await ctx.bot.walkTo(3277, 3227);  // Inside Al Kharid
        await new Promise(r => setTimeout(r, 800));
        ctx.progress();
    }

    // Verify we're in Al Kharid
    const inAlKharid = (ctx.state()?.player?.worldX ?? 0) >= 3270;
    if (!inAlKharid) {
        ctx.warn(`Failed to enter Al Kharid (position: ${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
        stats.phase = 'lumbridge';
        return false;
    }
    ctx.progress();

    // Step 4: Buy iron scimitar from Zeke's shop
    ctx.log('Walking to Zeke\'s Scimitar Shop...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_SCIMITAR_SHOP.x, LOCATIONS.ALKHARID_SCIMITAR_SHOP.z);
    ctx.progress();

    const scimitarShop = await ctx.bot.openShop(/zeke/i);
    if (!scimitarShop.success) {
        ctx.warn('Failed to open scimitar shop');
    } else {
        const buyScim = await ctx.bot.buyFromShop(/iron scimitar/i, 1);
        if (buyScim.success) {
            ctx.log('Iron scimitar purchased!');
            stats.weaponUpgraded = true;
        } else {
            ctx.warn(`Failed to buy scimitar: ${buyScim.message}`);
        }
        await ctx.bot.closeShop();
    }
    ctx.progress();

    // Equip the scimitar if we got it
    const scimitar = ctx.sdk.findInventoryItem(/iron scimitar/i);
    if (scimitar) {
        ctx.log('Equipping iron scimitar...');
        await ctx.bot.equipItem(scimitar);
        ctx.progress();
    }

    // Step 5: Buy kebabs from Karim's shop
    ctx.log('Walking to Karim\'s Kebab Shop...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_KEBAB_SHOP.x, LOCATIONS.ALKHARID_KEBAB_SHOP.z);
    ctx.progress();

    const kebabShop = await ctx.bot.openShop(/karim/i);
    if (!kebabShop.success) {
        ctx.warn('Failed to open kebab shop');
    } else {
        const buyKebabs = await ctx.bot.buyFromShop(/kebab/i, KEBABS_TO_BUY);
        if (buyKebabs.success) {
            ctx.log(`Bought ${KEBABS_TO_BUY} kebabs!`);
        } else {
            ctx.warn(`Failed to buy kebabs: ${buyKebabs.message}`);
        }
        await ctx.bot.closeShop();
    }
    ctx.progress();

    // Step 6: Walk to warrior training area
    ctx.log('Walking to Al Kharid warrior training area...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_WARRIORS.x, LOCATIONS.ALKHARID_WARRIORS.z);
    ctx.progress();

    stats.phase = 'alkharid';
    ctx.log('=== Now training at Al Kharid! ===');
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
        phase: 'lumbridge',
        lastStatsLog: 0,
    };

    ctx.log('=== Combat Trainer Started ===');
    ctx.log(`Starting XP - Atk: ${stats.startXp.atk}, Str: ${stats.startXp.str}, Def: ${stats.startXp.def}, HP: ${stats.startXp.hp}`);
    ctx.log(`Combat Level: ${state.player?.combatLevel ?? '?'} (will travel to Al Kharid at level ${COMBAT_LEVEL_TRIGGER})`);

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

        // Dismiss any blocking dialogs (level-up messages, etc.)
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            continue;
        }

        // Log periodic stats (every 5 kills, but only once per milestone)
        if (stats.kills > 0 && stats.kills % 5 === 0 && stats.kills !== stats.lastStatsLog) {
            stats.lastStatsLog = stats.kills;
            logStats(ctx, stats);
        }

        // Check if we need to eat
        if (shouldEat(ctx)) {
            // Find food items (including kebabs!)
            const food = ctx.sdk.findInventoryItem(/^(bread|shrimps?|cooked? meat|anchovies|trout|salmon|lobster|swordfish|kebab)$/i);
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

        // Check if we should travel to Al Kharid (combat level >= trigger)
        const combatLevel = currentState.player?.combatLevel ?? 3;
        if (stats.phase === 'lumbridge' && combatLevel >= COMBAT_LEVEL_TRIGGER) {
            // Check if we have resources for the journey (10 coins OR 10+ bones to sell)
            const coins = ctx.sdk.findInventoryItem(/^coins$/i);
            const bones = ctx.sdk.findInventoryItem(/^bones$/i);
            const coinCount = coins?.count ?? 0;
            const boneCount = bones?.count ?? 0;
            const hasResources = coinCount >= GATE_TOLL || boneCount >= GATE_TOLL;

            if (hasResources) {
                ctx.log(`Combat Level ${combatLevel} reached! Coins: ${coinCount}, Bones: ${boneCount} - heading to Al Kharid!`);
                const success = await travelToAlKharid(ctx, stats);
                if (!success) {
                    ctx.log('Al Kharid journey failed, collecting more resources...');
                }
                continue;
            } else {
                // Need more resources - keep training and looting
                if (stats.kills % 10 === 0) {
                    ctx.log(`Combat Level ${combatLevel} but need more resources (coins: ${coinCount}, bones: ${boneCount}). Collecting...`);
                }
            }
        }

        // Pick up loot - prioritize coins, then bones
        const loot = ctx.sdk.getGroundItems()
            .filter(i => /bones|coins/i.test(i.name))
            .filter(i => i.distance <= 5)
            .sort((a, b) => {
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
                    stats.coinsCollected += item.count ?? 1;
                }
            }
            ctx.progress();
        }

        // Find target based on phase (goblins in Lumbridge, warriors in Al Kharid)
        const targetPhase = stats.phase === 'alkharid' ? 'alkharid' : 'lumbridge';
        const target = findBestTarget(ctx, targetPhase);
        if (!target) {
            // Walk to appropriate training area
            const walkTarget = stats.phase === 'alkharid'
                ? LOCATIONS.ALKHARID_WARRIORS
                : LOCATIONS.LUMBRIDGE_GOBLINS;
            ctx.log(`No targets nearby - walking to training area...`);
            await ctx.bot.walkTo(walkTarget.x, walkTarget.z);
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
    goal: 'Train combat to level 20 at Lumbridge goblins, then travel to Al Kharid for better training',
    // Standard post-tutorial loadout (bronze gear, basic supplies)
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 90_000,       // 90 seconds (for shop/gate interactions)
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
            ctx.log(`Combat Level: ${state.player?.combatLevel ?? '?'}`);
            ctx.log(`Attack: Level ${atk?.baseLevel} (${atk?.experience} XP)`);
            ctx.log(`Strength: Level ${str?.baseLevel} (${str?.experience} XP)`);
            ctx.log(`Defence: Level ${def?.baseLevel} (${def?.experience} XP)`);
            ctx.log(`Hitpoints: Level ${hp?.baseLevel} (${hp?.experience} XP)`);
            ctx.log(`Position: (${state.player?.worldX}, ${state.player?.worldZ})`);
        }
    }
});
