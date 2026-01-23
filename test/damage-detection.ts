#!/usr/bin/env bun
/**
 * Damage Detection and Eating Test (SDK)
 * Test that a player with 99 HP can detect when they take damage
 * and respond by eating food to heal.
 *
 * Location: Dark Wizards south of Varrock - aggressive mages that
 * cast spells and are notorious for killing unprepared players.
 *
 * Success criteria:
 * 1. Start with 99 HP near Dark Wizards
 * 2. Get attacked by aggressive dark wizards (or attack them)
 * 3. Detect HP has dropped from their magic attacks
 * 4. Eat food to heal
 * 5. Verify HP increased after eating
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';
import type { InventoryItem } from '../agent/types';

const BOT_NAME = process.env.BOT_NAME ?? `dmg${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 200;

// Dark Wizards south of Varrock - notorious for killing noobs
// They're aggressive and cast magic spells that hit hard
const DARK_WIZARDS_AREA = { x: 3230, z: 3370 };

async function runTest(): Promise<boolean> {
    console.log('=== Damage Detection and Eating Test (SDK) ===');
    console.log('Goal: Detect damage and eat food to heal');

    // Generate save file with 99 HP and food
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: DARK_WIZARDS_AREA,  // Dark Wizards - aggressive mages that hit hard
        skills: {
            Hitpoints: 99,  // Max HP of 99
            Attack: 5,
            Strength: 5,
            Defence: 5,
        },
        inventory: [
            { id: Items.BREAD, count: 10 },  // Food to eat
            { id: Items.BRONZE_SWORD, count: 1 },  // Weapon
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false, skipTutorial: false });
        const { sdk } = session;

        // Wait for state to fully load
        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        // Get initial HP
        const hpSkill = sdk.getSkill('Hitpoints');
        const maxHp = hpSkill?.baseLevel ?? 10;
        let currentHp = hpSkill?.level ?? 10;
        console.log(`Initial HP: ${currentHp}/${maxHp}`);

        if (maxHp !== 99) {
            console.log(`WARNING: Expected 99 max HP, got ${maxHp}`);
        }

        // Equip weapon
        const weapon = sdk.findInventoryItem(/bronze sword/i);
        if (weapon) {
            const wieldOpt = weapon.optionsWithIndex.find(o => /wield|wear/i.test(o.text));
            if (wieldOpt) {
                console.log(`Equipping ${weapon.name}`);
                await sdk.sendUseItem(weapon.slot, wieldOpt.opIndex);
                await sleep(500);
            }
        }

        let damageTaken = false;
        let foodEaten = false;
        let hpAfterEating = 0;
        let lowestHp = currentHp;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            // Check current HP
            const hp = sdk.getSkill('Hitpoints');
            currentHp = hp?.level ?? 10;

            // Track lowest HP
            if (currentHp < lowestHp) {
                lowestHp = currentHp;
            }

            // Check if we've taken damage
            if (currentHp < maxHp && !damageTaken) {
                damageTaken = true;
                console.log(`Turn ${turn}: DAMAGE DETECTED! HP dropped to ${currentHp}/${maxHp}`);
            }

            // If we've taken damage, eat food
            if (damageTaken && !foodEaten && currentHp < maxHp - 5) {
                const food = findFood(sdk.getInventory());
                if (food) {
                    const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
                    if (eatOpt) {
                        const hpBeforeEating = currentHp;
                        console.log(`Turn ${turn}: Eating ${food.name} at HP ${currentHp}`);
                        await sdk.sendUseItem(food.slot, eatOpt.opIndex);
                        await sleep(1000);  // Wait for eating animation

                        // Check HP after eating
                        hpAfterEating = sdk.getSkill('Hitpoints')?.level ?? 10;
                        if (hpAfterEating > hpBeforeEating) {
                            foodEaten = true;
                            console.log(`Turn ${turn}: HEALED! HP: ${hpBeforeEating} -> ${hpAfterEating}`);
                        }
                    }
                }
            }

            // Success condition: took damage AND ate food AND healed
            if (damageTaken && foodEaten && hpAfterEating > lowestHp) {
                console.log(`\n=== SUCCESS ===`);
                console.log(`- Started with ${maxHp} HP`);
                console.log(`- Took damage, HP dropped to ${lowestHp}`);
                console.log(`- Ate food and healed to ${hpAfterEating}`);
                return true;
            }

            // Handle dialogs
            const state = sdk.getState();
            if (state?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Progress logging
            if (turn % 20 === 0) {
                console.log(`Turn ${turn}: HP=${currentHp}/${maxHp}, damage=${damageTaken}, ate=${foodEaten}`);
            }

            // Find and attack a dark wizard (or let them attack us - they're aggressive)
            if (!damageTaken || (damageTaken && !foodEaten)) {
                const npcs = sdk.getNearbyNpcs();
                // Dark wizards are aggressive so they'll attack us, but we can attack them too
                const enemy = npcs.find(npc => {
                    const name = npc.name.toLowerCase();
                    const hasAttack = npc.optionsWithIndex.some(o => /attack/i.test(o.text));
                    return (name.includes('dark wizard') || name.includes('wizard') || name.includes('guard')) && hasAttack;
                });

                if (enemy) {
                    const attackOpt = enemy.optionsWithIndex.find(o => /attack/i.test(o.text));
                    if (attackOpt) {
                        if (turn % 10 === 1) {
                            console.log(`Turn ${turn}: Engaging ${enemy.name} (they hit hard!)`);
                        }
                        await sdk.sendInteractNpc(enemy.index, attackOpt.opIndex);
                        await sleep(1500);
                        continue;
                    }
                } else if (turn % 15 === 0) {
                    // Dark wizards are aggressive - just wait for them to attack us
                    console.log(`Turn ${turn}: Waiting for dark wizards to attack...`);
                }
            }

            await sleep(600);
        }

        // Final results
        console.log(`\n=== Results ===`);
        console.log(`Max HP: ${maxHp}`);
        console.log(`Lowest HP reached: ${lowestHp}`);
        console.log(`Damage taken: ${damageTaken}`);
        console.log(`Food eaten: ${foodEaten}`);
        console.log(`HP after eating: ${hpAfterEating}`);

        // Partial success if we at least took damage
        if (damageTaken) {
            if (foodEaten) {
                console.log('SUCCESS: Detected damage and ate food');
                return true;
            } else {
                console.log('PARTIAL: Detected damage but did not eat food');
            }
        } else {
            console.log('FAILED: Did not take any damage');
        }

        return damageTaken && foodEaten;

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

function findFood(inventory: InventoryItem[]): InventoryItem | null {
    const foodNames = [
        'bread', 'meat', 'chicken', 'beef', 'shrimp', 'anchovies',
        'sardine', 'herring', 'trout', 'salmon', 'tuna', 'lobster',
        'cake', 'pie', 'pizza', 'cheese', 'cabbage', 'cooked'
    ];
    return inventory.find(item =>
        foodNames.some(food => item.name.toLowerCase().includes(food))
    ) ?? null;
}

runTest()
    .then(ok => {
        console.log(ok ? '\nPASSED' : '\nFAILED');
        process.exit(ok ? 0 : 1);
    })
    .catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });
