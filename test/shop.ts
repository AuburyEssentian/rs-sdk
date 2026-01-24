#!/usr/bin/env bun
/**
 * Shop Test (SDK)
 * Tests shop buy/sell functionality with both pattern and object parameters.
 *
 * Success criteria:
 * 1. Open shop using NPC object
 * 2. Sell item using InventoryItem object
 * 3. Verify coins received
 * 4. Buy item using pattern
 * 5. Verify item in inventory
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `shop${Math.random().toString(36).slice(2, 5)}`;

async function runTest(): Promise<boolean> {
    console.log('=== Shop Test (SDK) ===');
    console.log('Goal: Test shop buy/sell with patterns and objects');

    // Spawn at Lumbridge shop with dagger to sell
    await generateSave(BOT_NAME, {
        position: Locations.LUMBRIDGE_SHOP,
        inventory: [
            { id: Items.BRONZE_DAGGER, count: 1 },
        ],
    });

    let session: SDKSession | null = null;
    try {
        session = await launchBotWithSDK(BOT_NAME, { skipTutorial: false });
        const { sdk, bot } = session;

        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);
        const state = sdk.getState();
        console.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

        // --- Test 1: Open shop using NPC object ---
        console.log('\n--- Test 1: Open shop using NPC object ---');
        const shopKeeper = sdk.findNearbyNpc(/shop\s*keeper/i);
        if (!shopKeeper) {
            console.log('ERROR: Shop keeper not found');
            return false;
        }
        console.log(`Found ${shopKeeper.name} at distance ${shopKeeper.distance}`);

        const openResult = await bot.openShop(shopKeeper);
        if (!openResult.success) {
            console.log(`FAIL: Could not open shop: ${openResult.message}`);
            return false;
        }
        console.log(`PASS: ${openResult.message}`);

        // Verify shop is open
        const shopState = sdk.getState()?.shop;
        if (!shopState?.isOpen) {
            console.log('ERROR: Shop not open after openShop()');
            return false;
        }
        console.log(`Shop "${shopState.title}" is open`);

        // --- Test 2: Sell item using InventoryItem object ---
        console.log('\n--- Test 2: Sell item using InventoryItem object ---');
        const dagger = sdk.findInventoryItem(/dagger/i);
        if (!dagger) {
            console.log('ERROR: No dagger in inventory');
            return false;
        }
        console.log(`Selling ${dagger.name} (object, not pattern)`);

        const sellResult = await bot.sellToShop(dagger);
        if (!sellResult.success) {
            console.log(`FAIL: Could not sell dagger: ${sellResult.message}`);
            return false;
        }
        console.log(`PASS: ${sellResult.message}`);

        // --- Test 3: Verify coins received ---
        console.log('\n--- Test 3: Verify coins received ---');
        await sleep(300);
        const coins = sdk.findInventoryItem(/coins/i);
        if (!coins) {
            console.log('FAIL: No coins after selling dagger');
            return false;
        }
        console.log(`PASS: Received ${coins.count} coins`);

        // --- Test 4: Buy item using pattern ---
        console.log('\n--- Test 4: Buy item using pattern ---');
        const buyResult = await bot.buyFromShop(/hammer/i);
        if (!buyResult.success) {
            console.log(`FAIL: Could not buy hammer: ${buyResult.message}`);
            return false;
        }
        console.log(`PASS: ${buyResult.message}`);

        // --- Test 5: Verify item in inventory ---
        console.log('\n--- Test 5: Verify item in inventory ---');
        const hammer = sdk.findInventoryItem(/hammer/i);
        if (!hammer) {
            console.log('FAIL: Hammer not in inventory after purchase');
            return false;
        }
        console.log(`PASS: Have ${hammer.name} in inventory`);

        await sdk.sendCloseShop();

        console.log('\n=== All tests passed ===');
        return true;

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
