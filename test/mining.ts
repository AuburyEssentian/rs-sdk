#!/usr/bin/env bun
/**
 * Mining Test (SDK)
 * Mine rocks until gaining a Mining level.
 *
 * Uses a pre-configured save file that spawns the bot at SE Varrock mine,
 * avoiding the need for complex navigation from Lumbridge.
 */

import { runTest, dismissDialog, sleep } from './utils/test-runner';
import { TestPresets } from './utils/save-generator';

const MAX_TURNS = 300;

runTest({
    name: 'Mining Test (SDK)',
    preset: TestPresets.MINER_AT_VARROCK,
}, async ({ sdk, bot }) => {
    console.log('Goal: Gain 1 Mining level');

    const initialLevel = sdk.getSkill('Mining')?.baseLevel ?? 1;
    const initialXp = sdk.getSkill('Mining')?.experience ?? 0;
    console.log(`Initial Mining: level ${initialLevel}, xp ${initialXp}`);

    // Check for pickaxe
    const pickaxe = sdk.findInventoryItem(/pickaxe/i);
    if (!pickaxe) {
        console.log('ERROR: No pickaxe in inventory');
        return false;
    }
    console.log(`Equipment: ${pickaxe.name}`);

    let oresMined = 0;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        // Check for level up
        const currentLevel = sdk.getSkill('Mining')?.baseLevel ?? 1;
        const currentXp = sdk.getSkill('Mining')?.experience ?? 0;

        if (currentLevel > initialLevel) {
            console.log(`Turn ${turn}: SUCCESS - Mining ${initialLevel} -> ${currentLevel}`);
            console.log(`  XP gained: ${currentXp - initialXp}, Ores mined: ~${oresMined}`);
            return true;
        }

        // Progress logging
        if (turn % 30 === 0) {
            console.log(`Turn ${turn}: Mining level ${currentLevel}, xp ${currentXp} (+${currentXp - initialXp}), ores ~${oresMined}`);
        }

        // Handle dialogs
        if (await dismissDialog(sdk)) {
            continue;
        }

        // Debug nearby locations
        const allLocs = sdk.getNearbyLocs();
        const currentState = sdk.getState();
        if (turn === 1 || turn % 50 === 0) {
            const uniqueNames = [...new Set(allLocs.map(l => l.name))].slice(0, 15);
            console.log(`Turn ${turn}: Nearby locs: ${uniqueNames.join(', ')}`);
        }

        // Find mineable rock - check for "Mine" option
        const rock = allLocs.find(loc =>
            loc.optionsWithIndex.some(o => /mine/i.test(o.text))
        );

        if (rock) {
            const mineOption = rock.optionsWithIndex.find(o => /mine/i.test(o.text));
            if (mineOption) {
                if (turn % 20 === 1) {
                    console.log(`Turn ${turn}: Mining ${rock.name} at (${rock.x}, ${rock.z})`);
                }

                const invBefore = sdk.getInventory().length;
                await sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOption.opIndex);

                // Wait for ore or rock to deplete
                try {
                    await sdk.waitForCondition(state => {
                        // Success: got ore
                        if (state.inventory.length > invBefore) return true;
                        // Rock depleted (changed to empty rock)
                        if (!state.nearbyLocs.find(l =>
                            l.x === rock.x && l.z === rock.z && l.id === rock.id
                        )) return true;
                        // Level up dialog
                        if (state.dialog.isOpen) return true;
                        return false;
                    }, 15000);

                    if (sdk.getInventory().length > invBefore) {
                        oresMined++;
                    }
                } catch {
                    // Timeout
                }
                continue;
            }
        } else {
            // No rock found, walk around
            if (turn % 10 === 0) {
                console.log(`Turn ${turn}: Looking for rocks...`);
                const px = currentState?.player?.worldX ?? 3285;
                const pz = currentState?.player?.worldZ ?? 3365;
                const dx = Math.floor(Math.random() * 10) - 5;
                const dz = Math.floor(Math.random() * 10) - 5;
                await bot.walkTo(px + dx, pz + dz);
            }
        }

        await sleep(600);
    }

    // Final check
    const finalLevel = sdk.getSkill('Mining')?.baseLevel ?? 1;
    const finalXp = sdk.getSkill('Mining')?.experience ?? 0;
    console.log(`Final: Mining level ${finalLevel}, xp ${finalXp} (+${finalXp - initialXp})`);
    console.log(`Ores mined: ~${oresMined}`);

    return finalLevel > initialLevel;
});
