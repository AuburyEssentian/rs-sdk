#!/usr/bin/env bun
/**
 * Anvil Smithing Test (SDK)
 * Smith bronze bars into bronze daggers at Varrock anvil.
 *
 * Uses a pre-configured save file that spawns near the anvil with bars ready.
 * This is an atomic test - smelting is tested separately in smithing.ts.
 */

import { runTest, dismissDialog, sleep } from './utils/test-runner';
import { Items } from './utils/save-generator';

const MAX_TURNS = 200;
const ANVIL_AREA = { x: 3190, z: 3424 };

runTest({
    name: 'Anvil Smithing Test (SDK)',
    saveConfig: {
        position: ANVIL_AREA,
        skills: { Smithing: 1 },
        inventory: [
            { id: Items.BRONZE_BAR, count: 1 },
            { id: Items.HAMMER, count: 1 },
        ],
    },
    launchOptions: { skipTutorial: false },
}, async ({ sdk, bot }) => {
    console.log('Goal: Smith bronze bars into bronze daggers');

    // Wait for state to fully load
    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0 && s.inventory.length > 0, 10000);
    await sleep(500);

    const initialLevel = sdk.getSkill('Smithing')?.baseLevel ?? 1;
    const initialXp = sdk.getSkill('Smithing')?.experience ?? 0;
    console.log(`Initial Smithing: level ${initialLevel}, xp ${initialXp}`);

    // Check inventory
    const barCount = sdk.getInventory().filter(i => /bronze bar/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
    const hasHammer = sdk.getInventory().some(i => /hammer/i.test(i.name));
    console.log(`Inventory: ${barCount} bronze bars, hammer: ${hasHammer}`);

    if (barCount < 1 || !hasHammer) {
        console.log('ERROR: Missing bars or hammer in inventory');
        return false;
    }

    let daggersSmithed = 0;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        const currentState = sdk.getState();

        // Handle smithing interface (viewport interface, not dialog)
        if (currentState?.interface?.isOpen) {
            const options = currentState.interface.options;
            const debugInfo = (currentState.interface as any).debugInfo || [];
            if (turn === 1 || turn % 20 === 0) {
                console.log(`Turn ${turn}: Smithing interface (id: ${currentState.interface.interfaceId})`);
                if (options.length > 0) {
                    console.log('  Options:');
                    for (const opt of options) {
                        console.log(`    ${opt.index}. ${opt.text}`);
                    }
                }
                if (debugInfo.length > 0) {
                    console.log('  Debug:');
                    for (const line of debugInfo) {
                        console.log(`    ${line}`);
                    }
                }
            }

            // Look for dagger option in smithing interface
            const daggerOpt = options.find(o => /dagger/i.test(o.text));
            if (daggerOpt) {
                console.log(`Turn ${turn}: Selecting "${daggerOpt.text}" (index ${daggerOpt.index})`);
                await sdk.sendClickInterface(daggerOpt.index);
            } else if (options.length > 0 && options[0]) {
                console.log(`Turn ${turn}: Selecting first option "${options[0].text}"`);
                await sdk.sendClickInterface(options[0].index);
            } else {
                console.log(`Turn ${turn}: Clicking smithing component 1119 (dagger) with Make option`);
                await sdk.sendClickInterfaceComponent(1119, 1);
            }
            await sleep(500);
            continue;
        }

        // Handle dialogs (NPC chat, etc.)
        if (currentState?.dialog.isOpen) {
            const options = currentState.dialog.options;
            if (options.length > 0) {
                await sdk.sendClickDialog(1);
            } else {
                await sdk.sendClickDialog(0);
            }
            await sleep(500);
            continue;
        }

        // Count bronze daggers
        const daggerCount = sdk.getInventory().filter(i => /bronze dagger/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
        if (daggerCount > daggersSmithed) {
            daggersSmithed = daggerCount;
            console.log(`Turn ${turn}: Smithed ${daggersSmithed} bronze daggers!`);
        }

        // Check if we've run out of bars
        const barsLeft = sdk.getInventory().filter(i => /bronze bar/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
        if (barsLeft === 0) {
            console.log(`Out of bronze bars`);
            break;
        }

        // Progress logging
        if (turn % 30 === 0) {
            console.log(`Turn ${turn}: daggers=${daggersSmithed}, bars=${barsLeft}`);
        }

        // Find and use anvil
        const allLocs = sdk.getNearbyLocs();
        if (turn === 1 || turn % 30 === 0) {
            console.log(`Turn ${turn} nearby locs:`);
            for (const loc of allLocs.slice(0, 10)) {
                const opts = loc.optionsWithIndex.map(o => o.text).join(', ');
                console.log(`  - ${loc.name} (${loc.x}, ${loc.z}): [${opts}]`);
            }
        }

        // Find anvil and use bar on it
        const bronzeBar = sdk.findInventoryItem(/bronze bar/i);
        const anvil = allLocs.find(loc => /anvil/i.test(loc.name));

        if (bronzeBar && anvil) {
            if (turn % 15 === 1) {
                console.log(`Turn ${turn}: Using bronze bar on ${anvil.name} at (${anvil.x}, ${anvil.z})`);
            }
            await sdk.sendUseItemOnLoc(bronzeBar.slot, anvil.x, anvil.z, anvil.id);

            // Wait for smithing interface or dagger creation
            try {
                await sdk.waitForCondition(state => {
                    if (state.dialog.isOpen) return true;
                    if (state.interface.isOpen) return true;
                    const newDaggers = state.inventory.filter(i => /bronze dagger/i.test(i.name || '')).reduce((sum, i) => sum + i.count, 0);
                    if (newDaggers > daggersSmithed) return true;
                    return false;
                }, 10000);
            } catch { /* timeout */ }
        } else if (!anvil) {
            if (turn % 15 === 1) {
                console.log(`Turn ${turn}: No anvil found nearby`);
            }
        }

        await sleep(400);
    }

    // Final results
    const finalDaggers = sdk.getInventory().filter(i => /bronze dagger/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
    const finalLevel = sdk.getSkill('Smithing')?.baseLevel ?? 1;
    const finalXp = sdk.getSkill('Smithing')?.experience ?? 0;

    console.log(`\n=== Results ===`);
    console.log(`Bronze daggers smithed: ${finalDaggers}`);
    console.log(`Smithing: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);

    if (finalDaggers > 0) {
        console.log('SUCCESS: Smithed bronze daggers!');
        return true;
    } else {
        console.log('FAILED: No daggers smithed');
        return false;
    }
});
