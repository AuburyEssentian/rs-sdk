#!/usr/bin/env bun
/**
 * Fishing Test (SDK)
 * Catch fish until gaining a Fishing level.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';

const BOT_NAME = process.env.BOT_NAME;
const MAX_TURNS = 300;

// Draynor Village fishing spots (net fishing - shrimp/anchovies)
// This is west of Lumbridge, reachable without crossing water
const FISHING_AREA = { x: 3086, z: 3230 };

async function runTest(): Promise<boolean> {
    console.log('=== Fishing Test (SDK) ===');
    console.log('Goal: Gain 1 Fishing level');

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

        const initialLevel = sdk.getSkill('Fishing')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Fishing')?.experience ?? 0;
        console.log(`Initial Fishing: level ${initialLevel}, xp ${initialXp}`);

        // Check for fishing equipment
        const net = sdk.findInventoryItem(/net/i);
        const rod = sdk.findInventoryItem(/rod/i);
        console.log(`Equipment: net=${net?.name ?? 'none'}, rod=${rod?.name ?? 'none'}`);

        if (!net && !rod) {
            console.log('WARNING: No fishing equipment found, will try to fish anyway');
        }

        // Walk to fishing area
        console.log(`Walking to fishing area (${FISHING_AREA.x}, ${FISHING_AREA.z})...`);
        await bot.walkTo(FISHING_AREA.x, FISHING_AREA.z, 5);

        let fishCaught = 0;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            // Check for level up
            const currentLevel = sdk.getSkill('Fishing')?.baseLevel ?? 1;
            const currentXp = sdk.getSkill('Fishing')?.experience ?? 0;

            if (currentLevel > initialLevel) {
                console.log(`Turn ${turn}: SUCCESS - Fishing ${initialLevel} -> ${currentLevel}`);
                console.log(`  XP gained: ${currentXp - initialXp}, Fish caught: ~${fishCaught}`);
                return true;
            }

            // Progress logging
            if (turn % 30 === 0) {
                console.log(`Turn ${turn}: Fishing level ${currentLevel}, xp ${currentXp} (+${currentXp - initialXp}), fish ~${fishCaught}`);
            }

            // Handle dialogs
            const state = sdk.getState();
            if (state?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Find fishing spot (fishing spots are NPCs, not locs!)
            const allNpcs = sdk.getNearbyNpcs();
            if (turn === 1 || turn % 50 === 0) {
                console.log(`Turn ${turn}: Nearby NPCs: ${allNpcs.slice(0, 10).map(n => n.name).join(', ')}`);
            }

            // Find any fishing spot
            const fishingSpot = allNpcs.find(npc => /fishing spot/i.test(npc.name));

            if (fishingSpot) {
                const hasNet = sdk.findInventoryItem(/net/i) !== null;
                const hasRod = sdk.findInventoryItem(/fishing rod|fly fishing/i) !== null;

                // Get the appropriate option - prefer matching equipment
                let fishOption = null;
                if (hasNet) {
                    fishOption = fishingSpot.optionsWithIndex.find(o => /small net|net/i.test(o.text));
                }
                if (!fishOption && hasRod) {
                    fishOption = fishingSpot.optionsWithIndex.find(o => /lure|bait/i.test(o.text));
                }
                // Fallback to first fishing-related option
                if (!fishOption) {
                    fishOption = fishingSpot.optionsWithIndex.find(o =>
                        /net|lure|bait|cage|harpoon/i.test(o.text)
                    );
                }

                if (fishOption) {
                    if (turn % 20 === 1) {
                        const allOpts = fishingSpot.optionsWithIndex.map(o => o.text).join(', ');
                        console.log(`Turn ${turn}: Fishing at ${fishingSpot.name} [${allOpts}] using: ${fishOption.text}`);
                    }

                    const invBefore = sdk.getInventory().length;
                    await sdk.sendInteractNpc(fishingSpot.index, fishOption.opIndex);

                    // Wait for fish to be caught or spot to move
                    try {
                        await sdk.waitForCondition(state => {
                            // Success: got a fish
                            if (state.inventory.length > invBefore) return true;
                            // Spot moved (NPC disappeared)
                            if (!state.nearbyNpcs.find(n => n.index === fishingSpot.index)) return true;
                            // Level up dialog
                            if (state.dialog.isOpen) return true;
                            return false;
                        }, 15000);

                        if (sdk.getInventory().length > invBefore) {
                            fishCaught++;
                        }
                    } catch {
                        // Timeout - spot may have moved
                    }
                    continue;
                }
            } else {
                // No fishing spot found, walk around to find one
                if (turn % 10 === 0) {
                    console.log(`Turn ${turn}: Looking for fishing spot...`);
                    const px = state?.player?.worldX ?? FISHING_AREA.x;
                    const pz = state?.player?.worldZ ?? FISHING_AREA.z;
                    const dx = Math.floor(Math.random() * 10) - 5;
                    const dz = Math.floor(Math.random() * 10) - 5;
                    await bot.walkTo(px + dx, pz + dz, 2);
                }
            }

            await sleep(600);
        }

        // Final check
        const finalLevel = sdk.getSkill('Fishing')?.baseLevel ?? 1;
        const finalXp = sdk.getSkill('Fishing')?.experience ?? 0;
        console.log(`Final: Fishing level ${finalLevel}, xp ${finalXp} (+${finalXp - initialXp})`);
        console.log(`Fish caught: ~${fishCaught}`);

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
