#!/usr/bin/env bun
/**
 * Mining Test (SDK)
 * Mine rocks until gaining a Mining level.
 *
 * NOTE: This test requires navigation from Lumbridge to SE Varrock mine,
 * which involves complex pathing through buildings and gates.
 * May fail if the path is blocked. See fishing.ts for a simpler test.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';

const BOT_NAME = process.env.BOT_NAME;
const MAX_TURNS = 300;

// SE Varrock mine (copper/tin rocks)
// Waypoints: follow main road from Lumbridge to Varrock, staying west of buildings
const WAYPOINTS = [
    { x: 3220, z: 3220, name: 'West of Lumbridge' },       // Start position
    { x: 3214, z: 3250, name: 'Road north 1' },            // Follow road
    { x: 3214, z: 3280, name: 'Road north 2' },            // Continue
    { x: 3214, z: 3310, name: 'Road north 3' },            // Continue
    { x: 3214, z: 3340, name: 'Road north 4' },            // Continue
    { x: 3230, z: 3360, name: 'East toward mine' },        // Turn east
    { x: 3260, z: 3365, name: 'Approaching mine' },        // Continue east
    { x: 3283, z: 3367, name: 'SE Varrock mine' },         // The mine
];
const MINING_AREA = { x: 3283, z: 3367 };

async function runTest(): Promise<boolean> {
    console.log('=== Mining Test (SDK) ===');
    console.log('Goal: Gain 1 Mining level');

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

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

        // Walk to mining area via waypoints
        console.log(`Walking to SE Varrock mine via waypoints...`);
        for (const waypoint of WAYPOINTS) {
            const walkResult = await bot.walkTo(waypoint.x, waypoint.z, 10);
            if (!walkResult.success) {
                // Continue trying next waypoint
            }
        }

        const afterState = sdk.getState();
        const dx = Math.abs((afterState?.player?.worldX ?? 0) - MINING_AREA.x);
        const dz = Math.abs((afterState?.player?.worldZ ?? 0) - MINING_AREA.z);
        console.log(`Position: (${afterState?.player?.worldX}, ${afterState?.player?.worldZ})`);
        if (dx > 20 || dz > 20) {
            console.log(`ERROR: Too far from mining area (need clear path through Lumbridge to Varrock)`);
            return false;
        }

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
            const state = sdk.getState();
            if (state?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Debug nearby locations
            const allLocs = sdk.getNearbyLocs();
            if (turn === 1 || turn % 50 === 0) {
                // Show all unique location names
                const uniqueNames = [...new Set(allLocs.map(l => l.name))].slice(0, 15);
                console.log(`Turn ${turn}: Nearby locs: ${uniqueNames.join(', ')}`);
            }

            // Find mineable rock - check for "Mine" option
            const rock = allLocs.find(loc =>
                loc.optionsWithIndex.some(o => /mine/i.test(o.text))
            );

            // Also try finding by name if Mine option search fails
            const rockByName = !rock ? allLocs.find(loc =>
                /^rocks$/i.test(loc.name)
            ) : null;

            if (rockByName && turn % 30 === 1) {
                console.log(`Found by name: ${rockByName.name} options: ${rockByName.optionsWithIndex.map(o => o.text).join(', ')}`);
            }

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
                    const px = state?.player?.worldX ?? MINING_AREA.x;
                    const pz = state?.player?.worldZ ?? MINING_AREA.z;
                    const dx = Math.floor(Math.random() * 10) - 5;
                    const dz = Math.floor(Math.random() * 10) - 5;
                    await bot.walkTo(px + dx, pz + dz, 2);
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

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
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
