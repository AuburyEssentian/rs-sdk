#!/usr/bin/env bun
/**
 * Fletching Test (SDK)
 * Use knife on logs to make arrow shafts and gain Fletching XP.
 *
 * Success criteria: Fletching XP gained (arrow shafts created)
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `fletch${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 50;

async function runTest(): Promise<boolean> {
    console.log('=== Fletching Test (SDK) ===');
    console.log('Goal: Use knife on logs to gain Fletching XP');

    // Spawn with knife and logs - no need to walk or chop
    await generateSave(BOT_NAME, {
        position: Locations.LUMBRIDGE_CASTLE,
        inventory: [
            { id: Items.KNIFE, count: 1 },
            { id: Items.LOGS, count: 5 },
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { skipTutorial: false });
        const { sdk } = session;

        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const initialXp = sdk.getSkill('Fletching')?.experience ?? 0;
        console.log(`Initial Fletching XP: ${initialXp}`);

        const knife = sdk.findInventoryItem(/knife/i);
        const logs = sdk.findInventoryItem(/logs/i);
        if (!knife || !logs) {
            console.log(`ERROR: Missing items - knife=${knife?.name ?? 'none'}, logs=${logs?.name ?? 'none'}`);
            return false;
        }
        console.log(`Have ${knife.name} and ${logs.name} x${logs.count}`);

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentXp = sdk.getSkill('Fletching')?.experience ?? 0;

            // Success: XP gained
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Fletching XP gained (${initialXp} -> ${currentXp})`);
                return true;
            }

            // Handle dialogs (fletching interface)
            const state = sdk.getState();
            if (state?.dialog.isOpen) {
                // Look for Ok button in fletching dialog
                const okOption = state.dialog.options.find(o => o.text.toLowerCase() === 'ok');
                if (okOption) {
                    console.log(`Turn ${turn}: Clicking Ok to fletch`);
                    await sdk.sendClickDialog(okOption.index);
                } else if (state.dialog.options.length > 0) {
                    await sdk.sendClickDialog(state.dialog.options[0].index);
                } else {
                    await sdk.sendClickDialog(0);
                }
                await sleep(500);
                continue;
            }

            // Handle interface (make-x)
            if (state?.interface.isOpen) {
                if (state.interface.options.length > 0) {
                    console.log(`Turn ${turn}: Clicking interface option to fletch`);
                    await sdk.sendClickInterface(state.interface.options[0].index);
                }
                await sleep(500);
                continue;
            }

            // Use knife on logs
            const currentKnife = sdk.findInventoryItem(/knife/i);
            const currentLogs = sdk.findInventoryItem(/logs/i);
            if (currentKnife && currentLogs) {
                if (turn === 1 || turn % 10 === 0) {
                    console.log(`Turn ${turn}: Using knife on logs`);
                }
                await sdk.sendUseItemOnItem(currentKnife.slot, currentLogs.slot);
                await sleep(600);
            } else if (!currentLogs) {
                console.log(`Turn ${turn}: Out of logs`);
                break;
            }
        }

        const finalXp = sdk.getSkill('Fletching')?.experience ?? 0;
        console.log(`Final Fletching XP: ${finalXp} (+${finalXp - initialXp})`);
        return finalXp > initialXp;

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
