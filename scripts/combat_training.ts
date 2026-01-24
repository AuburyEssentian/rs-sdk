#!/usr/bin/env bun
/**
 * Combat Training Script v6
 * Goal: Maximize combined str+atk+def+hp levels
 *
 * Reward function: Attack + Strength + Defence + Hitpoints levels
 *
 * Strategy v6 (learnings from v3 vs v5):
 * - v3 achieved 121 with 187 kills (best rate: 23.2 levels/min)
 * - v5 achieved only 91 with 374 kills (chicken XP caps out)
 * - KEY INSIGHT: v3 prioritized GOBLINS which wander into chicken area
 * - v6 strategy: Stay at chicken pen, but PRIORITIZE GOBLINS
 *   - Goblins give ~3x more XP than chickens at higher levels
 *   - No walking time (goblins come to us)
 *   - Chickens as fallback when no goblins nearby
 */

import { runTest, dismissDialog, waitForCondition, sleep } from '../test/utils/test-runner';
import { TestPresets, Items, Locations } from '../test/utils/save-generator';
import type { NearbyNpc, NearbyLoc, InventoryItem } from '../agent/types';

const DURATION_SECONDS = 300; // 5 minutes
const HEALTH_THRESHOLD = 10;
const LOG_INTERVAL_SECONDS = 30;
const VERBOSE_LOG_INTERVAL = 5; // Log combat state every 5s for debugging

// Training location - CHICKENS ONLY (proven optimal in v3)
const CHICKEN_PEN = { x: 3235, z: 3295, name: 'Chicken Pen' };

interface RunStats {
    startTime: number;
    kills: number;
    foodEaten: number;
    styleChanges: number;
    attacksSent: number;
    timeInCombat: number;
    timeWalking: number;
    timeIdle: number;
    initialReward: number;
    currentReward: number;
    rewardHistory: Array<{ elapsed: number; reward: number; note?: string }>;
    currentPhase: string;
}

function getReward(sdk: any): number {
    const atk = sdk.getSkill('Attack')?.baseLevel ?? 1;
    const str = sdk.getSkill('Strength')?.baseLevel ?? 1;
    const def = sdk.getSkill('Defence')?.baseLevel ?? 1;
    const hp = sdk.getSkill('Hitpoints')?.baseLevel ?? 10;
    return atk + str + def + hp;
}

function getLevels(sdk: any): { atk: number; str: number; def: number; hp: number } {
    return {
        atk: sdk.getSkill('Attack')?.baseLevel ?? 1,
        str: sdk.getSkill('Strength')?.baseLevel ?? 1,
        def: sdk.getSkill('Defence')?.baseLevel ?? 1,
        hp: sdk.getSkill('Hitpoints')?.baseLevel ?? 10,
    };
}

function getCombatLevel(sdk: any): number {
    const levels = getLevels(sdk);
    // Simplified combat level formula
    return Math.floor((levels.atk + levels.str + levels.def + levels.hp) / 4);
}

function skillToKey(skill: string): 'atk' | 'str' | 'def' {
    const map: Record<string, 'atk' | 'str' | 'def'> = {
        'attack': 'atk',
        'strength': 'str',
        'defence': 'def',
    };
    return map[skill.toLowerCase()] ?? 'atk';
}

function findFood(inventory: InventoryItem[]): InventoryItem | null {
    const foodNames = ['bread', 'meat', 'chicken', 'beef', 'shrimp', 'cooked'];
    return inventory.find(item =>
        foodNames.some(food => item.name.toLowerCase().includes(food))
    ) ?? null;
}

runTest({
    name: 'Combat Training Script v6',
    saveConfig: {
        position: CHICKEN_PEN,
        skills: { Attack: 1, Strength: 1, Defence: 1, Hitpoints: 10 },
        inventory: [
            { id: Items.BRONZE_SWORD, count: 1 },
            { id: Items.WOODEN_SHIELD, count: 1 },
            { id: Items.BREAD, count: 20 },
        ],
    },
}, async ({ sdk, bot }) => {
    const stats: RunStats = {
        startTime: Date.now(),
        kills: 0,
        foodEaten: 0,
        styleChanges: 0,
        attacksSent: 0,
        timeInCombat: 0,
        timeWalking: 0,
        timeIdle: 0,
        initialReward: getReward(sdk),
        currentReward: getReward(sdk),
        rewardHistory: [],
        currentPhase: 'chickens',
    };

    console.log(`\n=== COMBAT TRAINING SCRIPT v6 ===`);
    console.log(`Duration: ${DURATION_SECONDS}s (${DURATION_SECONDS/60} min)`);
    console.log(`Initial reward: ${stats.initialReward}`);
    console.log(`Initial levels: ${JSON.stringify(getLevels(sdk))}`);
    console.log(`Position: ${sdk.getState()?.player?.worldX}, ${sdk.getState()?.player?.worldZ}\n`);

    stats.rewardHistory.push({ elapsed: 0, reward: stats.initialReward, note: 'start' });

    // Equip weapon and shield
    for (const item of sdk.getInventory()) {
        const wieldOpt = item.optionsWithIndex.find((o: any) => /wield|wear/i.test(o.text));
        if (wieldOpt && /sword|shield|dagger/i.test(item.name)) {
            console.log(`Equipping ${item.name}`);
            await sdk.sendUseItem(item.slot, wieldOpt.opIndex);
            await sleep(400);
        }
    }

    // Combat style management
    await sleep(300);
    let currentStyleName = 'Strength';

    const getStyleForSkill = (skill: string): number | null => {
        const state = sdk.getState()?.combatStyle;
        if (!state) return null;
        const match = state.styles.find((s: any) => s.trainedSkill.toLowerCase() === skill.toLowerCase());
        return match?.index ?? null;
    };

    const getLowestSkill = (): string => {
        const levels = getLevels(sdk);
        const skills = [
            { name: 'Attack', level: levels.atk },
            { name: 'Strength', level: levels.str },
            { name: 'Defence', level: levels.def },
        ];
        skills.sort((a, b) => a.level - b.level);
        return skills[0].name;
    };

    const styleState = sdk.getState()?.combatStyle;
    if (styleState) {
        console.log(`Combat styles: ${styleState.styles.map((s: any) => `${s.index}:${s.name}(${s.trainedSkill})`).join(', ')}`);
        const lowestSkill = getLowestSkill();
        const style = getStyleForSkill(lowestSkill);
        if (style !== null) {
            await sdk.sendSetCombatStyle(style);
            currentStyleName = lowestSkill;
            console.log(`Starting with ${lowestSkill} training (lowest skill)`);
        }
    }

    // State tracking
    let lastLogTime = Date.now();
    let lastVerboseLogTime = Date.now();
    let lastStyleCheckLevel = 0;
    let lastReward = stats.initialReward;
    const blockedNpcs = new Map<number, number>();

    // Helper to check if player is in combat
    const isInCombat = (): boolean => {
        const state = sdk.getState();
        // Check if player has a combat target or is animating
        return state?.player?.interactingIndex !== undefined && state.player.interactingIndex !== -1;
    };

    // Helper to get current weapon
    const getCurrentWeapon = (): string => {
        const equipment = sdk.getEquipment?.() ?? [];
        const weapon = equipment.find((e: any) => e.slot === 3); // Weapon slot
        return weapon?.name ?? 'fists';
    };

    // Main loop
    const endTime = Date.now() + DURATION_SECONDS * 1000;
    let loopStart = Date.now();

    while (Date.now() < endTime) {
        const loopTime = Date.now();
        const state = sdk.getState();
        const currentTick = state?.tick ?? 0;
        const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
        const combatLevel = getCombatLevel(sdk);
        const playerX = state?.player?.worldX ?? 0;
        const playerZ = state?.player?.worldZ ?? 0;

        // Verbose logging for gap analysis
        if (Date.now() - lastVerboseLogTime >= VERBOSE_LOG_INTERVAL * 1000) {
            const currentReward = getReward(sdk);
            const rewardDelta = currentReward - lastReward;
            const inCombat = isInCombat();
            const npcs = sdk.getNearbyNpcs();
            const attackableCount = npcs.filter((n: NearbyNpc) =>
                n.optionsWithIndex.some((o: any) => o.text.toLowerCase() === 'attack')
            ).length;

            // Check for gaps (no reward increase)
            if (rewardDelta === 0 && elapsed > 5) {
                console.log(`[${elapsed}s] ⚠️ GAP: reward=${currentReward} (no change) | inCombat=${inCombat} | nearbyTargets=${attackableCount} | pos=(${playerX},${playerZ}) | phase=${stats.currentPhase}`);
            }

            lastReward = currentReward;
            lastVerboseLogTime = Date.now();
        }

        // Periodic summary logging
        if (Date.now() - lastLogTime >= LOG_INTERVAL_SECONDS * 1000) {
            const levels = getLevels(sdk);
            stats.currentReward = getReward(sdk);
            stats.rewardHistory.push({ elapsed, reward: stats.currentReward, note: stats.currentPhase });

            const weapon = getCurrentWeapon();
            console.log(`[${elapsed}s] Reward: ${stats.currentReward} (${levels.atk}/${levels.str}/${levels.def}/${levels.hp}) | CL=${combatLevel} | Kills: ${stats.kills} | Weapon: ${weapon} | Phase: ${stats.currentPhase}`);
            lastLogTime = Date.now();
        }

        // Handle dialogs
        if (state?.dialog?.isOpen) {
            await sdk.sendClickDialog(0);
            await sleep(200);
            continue;
        }

        // NO PHASE TRANSITIONS - stay at chickens (proven optimal in v3)

        // Combat style switching (train lowest skill)
        const totalLevels = getReward(sdk);
        if (totalLevels > lastStyleCheckLevel) {
            lastStyleCheckLevel = totalLevels;

            const levels = getLevels(sdk);
            const currentKey = skillToKey(currentStyleName);
            const currentLevel = levels[currentKey];
            const lowestSkill = getLowestSkill();
            const lowestKey = skillToKey(lowestSkill);
            const lowestLevel = levels[lowestKey];

            if (lowestSkill !== currentStyleName && currentLevel >= lowestLevel + 2) {
                const nextStyle = getStyleForSkill(lowestSkill);
                if (nextStyle !== null) {
                    console.log(`[${elapsed}s] 🔄 Switching to ${lowestSkill} (${lowestLevel}) - was training ${currentStyleName} (${currentLevel})`);
                    await sdk.sendSetCombatStyle(nextStyle);
                    currentStyleName = lowestSkill;
                    stats.styleChanges++;
                }
            }
        }

        // Check health and eat if needed
        const hpSkill = sdk.getSkill('Hitpoints');
        const currentHp = hpSkill?.level ?? 10;
        const maxHp = hpSkill?.baseLevel ?? 10;
        if (currentHp < HEALTH_THRESHOLD || currentHp < maxHp * 0.5) {
            const food = findFood(sdk.getInventory());
            if (food) {
                const eatOpt = food.optionsWithIndex.find((o: any) => /eat/i.test(o.text));
                if (eatOpt) {
                    console.log(`[${elapsed}s] 🍞 Eating ${food.name} (HP=${currentHp}/${maxHp})`);
                    await sdk.sendUseItem(food.slot, eatOpt.opIndex);
                    stats.foodEaten++;
                    await sleep(400);
                    continue;
                }
            }
        }

        // Clean up expired blocked NPCs
        for (const [npcIndex, blockedTick] of blockedNpcs) {
            if (currentTick - blockedTick > 10) {
                blockedNpcs.delete(npcIndex);
            }
        }

        // Check for "someone else is fighting" message
        const fightingMsg = state?.gameMessages.find((m: any) =>
            m.text.toLowerCase().includes("someone else is fighting") ||
            m.text.toLowerCase().includes("already under attack")
        );
        if (fightingMsg && fightingMsg.tick > currentTick - 3) {
            const lastNpc = sdk.getNearbyNpcs()[0];
            if (lastNpc) {
                blockedNpcs.set(lastNpc.index, currentTick);
            }
        }

        // Find attackable targets - GOBLINS first (more XP), then chickens as fallback
        const npcs = sdk.getNearbyNpcs();
        const targetNames = ['goblin', 'chicken', 'rat', 'spider', 'man', 'woman'];

        const attackableNpcs = npcs.filter((npc: NearbyNpc) => {
            const hasAttack = npc.optionsWithIndex.some((o: any) => o.text.toLowerCase() === 'attack');
            if (!hasAttack) return false;
            const blocked = blockedNpcs.get(npc.index);
            if (blocked && currentTick - blocked <= 10) return false;
            return true;
        });

        const scoreNpc = (npc: NearbyNpc): number => {
            const name = npc.name.toLowerCase();
            let score = 0;
            const nameIdx = targetNames.findIndex(t => name.includes(t));
            if (nameIdx !== -1) score += (targetNames.length - nameIdx) * 1000;
            score += (15 - Math.min(npc.distance, 15)) * 10;
            // Prefer low-level NPCs for fast kills
            score += Math.max(0, 20 - npc.combatLevel);
            return score;
        };

        const sorted = attackableNpcs.sort((a: NearbyNpc, b: NearbyNpc) => scoreNpc(b) - scoreNpc(a));
        const target = sorted[0];

        if (target) {
            const attackOpt = target.optionsWithIndex.find((o: any) => /attack/i.test(o.text));
            if (attackOpt) {
                try {
                    await sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    stats.attacksSent++;
                    stats.kills++;
                    stats.timeInCombat += 600;
                } catch (e: any) {
                    console.log(`[${elapsed}s] ❌ Attack failed: ${e.message}`);
                }
                await sleep(600); // Reduced further for maximum attack rate
                continue;
            }
        } else {
            // No targets - stay near chicken pen
            stats.timeIdle += 600;
            const dx = CHICKEN_PEN.x - playerX;
            const dz = CHICKEN_PEN.z - playerZ;

            if (Math.abs(dx) > 10 || Math.abs(dz) > 10) {
                console.log(`[${elapsed}s] 🚶 Walking back to chicken pen...`);
                stats.timeWalking += 2000;
                await bot.walkTo(CHICKEN_PEN.x, CHICKEN_PEN.z);
                await sleep(2000);
            } else {
                // Wander within chicken pen
                const randX = playerX + (Math.random() * 6 - 3);
                const randZ = playerZ + (Math.random() * 6 - 3);
                await bot.walkTo(randX, randZ);
            }
        }

        await sleep(600);
    }

    // Final summary
    const finalLevels = getLevels(sdk);
    stats.currentReward = getReward(sdk);
    stats.rewardHistory.push({ elapsed: DURATION_SECONDS, reward: stats.currentReward, note: 'end' });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`=== FINAL RESULTS (v6) ===`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Duration: ${DURATION_SECONDS}s (${DURATION_SECONDS/60} min)`);
    console.log(`\nREWARD:`);
    console.log(`  Initial: ${stats.initialReward}`);
    console.log(`  Final:   ${stats.currentReward}`);
    console.log(`  Delta:   +${stats.currentReward - stats.initialReward}`);
    console.log(`  Rate:    ${((stats.currentReward - stats.initialReward) / (DURATION_SECONDS / 60)).toFixed(1)} levels/min`);

    console.log(`\nLEVELS:`);
    console.log(`  Attack:    ${finalLevels.atk}`);
    console.log(`  Strength:  ${finalLevels.str}`);
    console.log(`  Defence:   ${finalLevels.def}`);
    console.log(`  Hitpoints: ${finalLevels.hp}`);
    console.log(`  Combat Level: ${getCombatLevel(sdk)}`);

    console.log(`\nSTATS:`);
    console.log(`  Kills: ${stats.kills}`);
    console.log(`  Attacks sent: ${stats.attacksSent}`);
    console.log(`  Food eaten: ${stats.foodEaten}`);
    console.log(`  Style changes: ${stats.styleChanges}`);
    console.log(`  Final phase: ${stats.currentPhase}`);

    console.log(`\nTIME BREAKDOWN:`);
    console.log(`  In combat: ~${Math.round(stats.timeInCombat / 1000)}s`);
    console.log(`  Walking:   ~${Math.round(stats.timeWalking / 1000)}s`);
    console.log(`  Idle:      ~${Math.round(stats.timeIdle / 1000)}s`);

    console.log(`\nREWARD HISTORY:`);
    for (const entry of stats.rewardHistory) {
        const note = entry.note ? ` (${entry.note})` : '';
        console.log(`  ${entry.elapsed}s: ${entry.reward}${note}`);
    }

    return stats.currentReward > stats.initialReward;
});
