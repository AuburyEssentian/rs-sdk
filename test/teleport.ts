#!/usr/bin/env bun
/**
 * Teleport Test (SDK)
 * Cast Varrock Teleport spell.
 *
 * Success criteria: Position changes to Varrock area
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Spells } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `tele${Math.random().toString(36).slice(2, 5)}`;
const MAGIC_TAB = 6;

async function runTest(): Promise<boolean> {
    console.log('=== Teleport Test (SDK) ===');
    console.log('Goal: Cast Varrock Teleport');

    await generateSave(BOT_NAME, {
        position: { x: 3222, z: 3218 },  // Lumbridge
        skills: { Magic: 50 },  // Need 25, using 50 to ensure enough
        inventory: [
            { id: Items.FIRE_RUNE, count: 10 },
            { id: Items.AIR_RUNE, count: 30 },
            { id: Items.LAW_RUNE, count: 10 },
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { skipTutorial: false });
        const { sdk } = session;

        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const startX = sdk.getState()?.player?.worldX ?? 0;
        const startZ = sdk.getState()?.player?.worldZ ?? 0;
        console.log(`Starting position: (${startX}, ${startZ})`);

        const magicSkill = sdk.getSkill('Magic');
        console.log(`Magic level: ${magicSkill?.baseLevel}, xp: ${magicSkill?.experience}`);
        console.log(`Runes: ${sdk.getInventory().map(i => `${i.name}(${i.count})`).join(', ')}`);

        // Switch to magic tab and cast teleport
        console.log('Switching to magic tab...');
        await sdk.sendSetTab(MAGIC_TAB);
        await sleep(300);

        console.log('Casting Varrock Teleport...');
        await sdk.sendClickInterfaceComponent(Spells.VARROCK_TELEPORT, 1);

        // Wait for position to change
        try {
            await sdk.waitForCondition(s => {
                const x = s.player?.worldX ?? 0;
                const z = s.player?.worldZ ?? 0;
                const dist = Math.abs(x - startX) + Math.abs(z - startZ);
                return dist > 50;
            }, 5000);

            const endX = sdk.getState()?.player?.worldX ?? 0;
            const endZ = sdk.getState()?.player?.worldZ ?? 0;
            console.log(`Teleported to: (${endX}, ${endZ})`);
            console.log('SUCCESS: Position changed significantly');
            return true;
        } catch {
            const endX = sdk.getState()?.player?.worldX ?? 0;
            const endZ = sdk.getState()?.player?.worldZ ?? 0;
            console.log(`Position after: (${endX}, ${endZ})`);
            console.log('FAILED: Did not teleport');
            return false;
        }

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
