#!/usr/bin/env bun
/**
 * Fletch & Sell Script v6
 * Goal: Maximize Fletching level within 3 minutes
 *
 * Reward function: Fletching level (GP removed - arrow shafts = 0 value!)
 *
 * Experimental results:
 * - v1: Lvl 21 (pure fletch, no sell - BEST!)
 * - v2: Lvl 7 (got stuck in shop loop)
 * - v3-v5: Lvl 14 (sold items but shop interface stuck, arrow shafts = 0 GP anyway)
 *
 * v6 strategy: PURE FLETCHING
 * - Don't even try to sell (arrow shafts have 0 value)
 * - Continuous chop -> fletch cycle
 * - No state machine complexity, just simple loop
 */

import { runTest, sleep } from '../test/utils/test-runner';
import { Items, Locations } from '../test/utils/save-generator';

const DURATION_SECONDS = 180; // 3 minutes
const LOG_INTERVAL_SECONDS = 15;

// Lumbridge general store location
const LUMBRIDGE_SHOP = { x: 3212, z: 3246 };

// Trees near Lumbridge general store (closer = less walking)
const TREE_SPOT = { x: 3200, z: 3240 }; // Between castle and shop

interface RunStats {
    startTime: number;
    logsChopped: number;
    logsFletchedCount: number;
    arrowShaftsSold: number;
    fletchingXpGained: number;
    coinsGained: number;
    initialReward: number;
    currentReward: number;
    rewardHistory: Array<{ elapsed: number; reward: number; fletchLvl: number; gp: number }>;
    timeInShop: number;
    timeFletching: number;
    timeChopping: number;
    dialogDismissals: number;
}

function getReward(sdk: any): { reward: number; fletchLvl: number; gp: number } {
    const fletchLvl = sdk.getSkill('Fletching')?.baseLevel ?? 1;
    const coins = sdk.findInventoryItem(/coins/i)?.count ?? 0;
    // Reward: level + coins/100 (so 100 GP = 1 reward point)
    const reward = fletchLvl + Math.floor(coins / 100);
    return { reward, fletchLvl, gp: coins };
}

// State machine for clear flow
type BotState = 'CHOPPING' | 'FLETCHING' | 'SELLING';
const MIN_LOGS_BEFORE_FLETCH = 3; // Batch at least 3 logs before fletching (lowered from 5)

runTest({
    name: 'Fletch & Sell Script v5',
    saveConfig: {
        position: Locations.LUMBRIDGE_CASTLE, // Start near trees
        skills: { Fletching: 1, Woodcutting: 1 },
        inventory: [
            { id: Items.BRONZE_AXE, count: 1 },
            { id: Items.KNIFE, count: 1 },
        ],
    },
}, async ({ sdk, bot }) => {
    const stats: RunStats = {
        startTime: Date.now(),
        logsChopped: 0,
        logsFletchedCount: 0,
        arrowShaftsSold: 0,
        fletchingXpGained: 0,
        coinsGained: 0,
        initialReward: 0,
        currentReward: 0,
        rewardHistory: [],
        timeInShop: 0,
        timeFletching: 0,
        timeChopping: 0,
        dialogDismissals: 0,
    };

    const { reward: initReward, fletchLvl: initLevel, gp: initGp } = getReward(sdk);
    stats.initialReward = initReward;
    stats.currentReward = initReward;

    const initialXp = sdk.getSkill('Fletching')?.experience ?? 0;

    console.log(`\n=== FLETCH & SELL SCRIPT v5 ===`);
    console.log(`Duration: ${DURATION_SECONDS}s`);
    console.log(`Initial reward: ${initReward} (Lvl ${initLevel}, ${initGp} GP)`);
    console.log(`Position: ${sdk.getState()?.player?.worldX}, ${sdk.getState()?.player?.worldZ}\n`);

    stats.rewardHistory.push({ elapsed: 0, reward: initReward, fletchLvl: initLevel, gp: initGp });

    let lastLogTime = Date.now();
    const endTime = Date.now() + DURATION_SECONDS * 1000;

    // State machine
    let currentState: BotState = 'CHOPPING';
    let stuckCounter = 0;
    let lastActionTime = Date.now();

    // Main loop
    let loopCount = 0;
    while (Date.now() < endTime) {
        loopCount++;
        const state = sdk.getState();
        const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);

        // Debug: log every 50 iterations
        if (loopCount % 50 === 0) {
            console.log(`[${elapsed}s] Loop #${loopCount}, state=${currentState}, dialog=${state?.dialog?.isOpen}, interface=${state?.interface?.isOpen}`);
        }

        // Periodic logging
        if (Date.now() - lastLogTime >= LOG_INTERVAL_SECONDS * 1000) {
            const { reward, fletchLvl, gp } = getReward(sdk);
            stats.currentReward = reward;
            stats.rewardHistory.push({ elapsed, reward, fletchLvl, gp });

            const currentXp = sdk.getSkill('Fletching')?.experience ?? 0;
            stats.fletchingXpGained = currentXp - initialXp;

            console.log(`[${elapsed}s] [${currentState}] Reward: ${reward} (Lvl ${fletchLvl}, ${gp} GP) | Chopped: ${stats.logsChopped} | Fletched: ${stats.logsFletchedCount}`);
            lastLogTime = Date.now();
        }

        // Handle dialogs (fletching interface, level ups, etc)
        if (state?.dialog?.isOpen) {
            stats.dialogDismissals++;
            // Log dialog dismissals (increased limit for debugging)
            if (stats.dialogDismissals <= 30) {
                console.log(`[${elapsed}s] Dialog: ${state.dialog.options.map((o: any) => o.text).join(', ')}`);
            }

            // For now, always make arrow shafts (simpler, and v1 got to level 21!)
            // Making bows requires clicking the bow option then clicking OK - more complex
            // TODO v6: Implement bow selection for GP value

            // Just click OK or first option
            const okOption = state.dialog.options.find((o: any) => o.text.toLowerCase() === 'ok');
            if (okOption) {
                await sdk.sendClickDialog(okOption.index);
            } else if (state.dialog.options.length > 0) {
                await sdk.sendClickDialog(state.dialog.options[0].index);
            } else {
                await sdk.sendClickDialog(0);
            }
            await sleep(300);
            continue;
        }

        // Handle interfaces - but only if NOT in SELLING state (shop interface is handled separately)
        if (state?.interface?.isOpen && currentState !== 'SELLING') {
            console.log(`[${elapsed}s] Interface open in ${currentState}, clicking first option...`);
            if (state.interface.options && state.interface.options.length > 0) {
                await sdk.sendClickInterface(state.interface.options[0].index);
            } else {
                // Try closing the shop interface directly
                await sdk.sendCloseShop();
            }
            await sleep(300);
            continue;
        }

        // Get inventory state
        const logs = sdk.findInventoryItem(/^logs$/i);
        const knife = sdk.findInventoryItem(/knife/i);
        const arrowShafts = sdk.findInventoryItem(/arrow shaft/i);
        const axe = sdk.findInventoryItem(/axe/i);
        const inventoryCount = sdk.getInventory().length;
        const inventoryFull = inventoryCount >= 28;
        const shopOpen = sdk.getState()?.shop?.isOpen ?? false;

        // Close shop if we're not in SELLING state
        if (shopOpen && currentState !== 'SELLING') {
            await sdk.sendCloseShop();
            await sleep(300);
            continue;
        }

        // State transitions
        if (currentState === 'CHOPPING') {
            // Count ALL logs in inventory (in case they're in multiple slots or count is weird)
            const allLogs = sdk.getInventory().filter((i: any) => /^logs$/i.test(i.name));
            const totalLogCount = allLogs.reduce((sum: number, item: any) => sum + (item.count || 1), 0);

            // Transition to FLETCHING when we have enough logs OR inventory is getting full
            if (totalLogCount >= MIN_LOGS_BEFORE_FLETCH || (totalLogCount > 0 && inventoryFull)) {
                console.log(`[${elapsed}s] Have ${totalLogCount} logs (${allLogs.length} stacks), switching to FLETCHING`);
                currentState = 'FLETCHING';
                continue;
            }

            // Chop trees
            if (!inventoryFull && axe) {
                const tree = sdk.findNearbyLoc(/^tree$/i);

                if (!tree) {
                    console.log(`[${elapsed}s] Walking to trees...`);
                    await bot.walkTo(TREE_SPOT.x, TREE_SPOT.z);
                    await sleep(500);
                    continue;
                }

                const chopStart = Date.now();
                const chopResult = await bot.chopTree(tree);
                if (chopResult.success) {
                    stats.logsChopped++;
                    lastActionTime = Date.now();
                }
                stats.timeChopping += Date.now() - chopStart;
                continue;
            }
        }

        if (currentState === 'FLETCHING') {
            // Check for any fletched products
            const longbow = sdk.findInventoryItem(/longbow/i);
            const shortbow = sdk.findInventoryItem(/shortbow/i);
            const fletchedProduct = longbow || shortbow || arrowShafts;

            // Transition to SELLING when no more logs
            if (!logs) {
                if (fletchedProduct) {
                    console.log(`[${elapsed}s] Fletched all logs, have ${fletchedProduct.count} ${fletchedProduct.name}, switching to SELLING`);
                    currentState = 'SELLING';
                } else {
                    console.log(`[${elapsed}s] No logs or products, switching to CHOPPING`);
                    currentState = 'CHOPPING';
                }
                continue;
            }

            // Fletch logs
            if (knife && logs) {
                const fletchStart = Date.now();
                await sdk.sendUseItemOnItem(knife.slot, logs.slot);
                stats.logsFletchedCount++;
                lastActionTime = Date.now();
                await sleep(600);
                stats.timeFletching += Date.now() - fletchStart;
                continue;
            }
        }

        if (currentState === 'SELLING') {
            // Find any sellable fletching products (bows are worth GP, shafts are not)
            const longbow = sdk.findInventoryItem(/longbow/i);
            const shortbow = sdk.findInventoryItem(/shortbow/i);
            const arrowShaftsItem = sdk.findInventoryItem(/arrow shaft/i);
            const sellableItem = longbow || shortbow || arrowShaftsItem;
            const sellableCount = sellableItem?.count ?? 0;

            // Debug: log shop state EVERY iteration in SELLING state
            console.log(`[${elapsed}s] SELLING iter: shopOpen=${shopOpen}, sellable=${sellableItem?.name ?? 'none'}(${sellableCount}), invCount=${inventoryCount}`);

            // Transition back to CHOPPING when nothing left to sell
            if (!sellableItem) {
                console.log(`[${elapsed}s] Nothing left to sell, closing shop...`);

                // Close shop and WAIT for it to actually close
                await sdk.sendCloseShop();
                await sleep(500);

                // Verify shop closed - retry if not
                let shopClosedAttempts = 0;
                while (sdk.getState()?.shop?.isOpen && shopClosedAttempts < 5) {
                    console.log(`[${elapsed}s] Shop still open, retrying close...`);
                    await sdk.sendCloseShop();
                    await sleep(500);
                    shopClosedAttempts++;
                }

                // Also dismiss any lingering interface
                const interfaceOpen = sdk.getState()?.interface?.isOpen;
                if (interfaceOpen) {
                    console.log(`[${elapsed}s] Interface still open, dismissing...`);
                    await bot.dismissBlockingUI();
                    await sleep(300);
                }

                console.log(`[${elapsed}s] Shop closed, switching to CHOPPING`);
                currentState = 'CHOPPING';
                lastActionTime = Date.now();
                continue;
            }

            // Open shop if not open
            if (!shopOpen) {
                const shopKeeper = sdk.findNearbyNpc(/shop\s*keeper/i);
                if (!shopKeeper) {
                    console.log(`[${elapsed}s] Walking to shop...`);
                    await bot.walkTo(LUMBRIDGE_SHOP.x, LUMBRIDGE_SHOP.z);
                    await sleep(500);
                    continue;
                }

                console.log(`[${elapsed}s] Opening shop...`);
                const shopStart = Date.now();
                const result = await bot.openShop(shopKeeper);
                stats.timeInShop += Date.now() - shopStart;
                if (!result.success) {
                    console.log(`[${elapsed}s] Failed to open shop: ${result.message}`);
                    await sleep(500);
                } else {
                    console.log(`[${elapsed}s] openShop returned success`);
                    // Check shop state immediately after
                    const shopStateNow = sdk.getState()?.shop;
                    console.log(`[${elapsed}s] Shop state: isOpen=${shopStateNow?.isOpen}, title=${shopStateNow?.title}`);
                }
                await sleep(300);
                continue;
            }

            // Sell the item using high-level bot.sellToShop with 'all'
            console.log(`[${elapsed}s] Selling ${sellableItem.count} ${sellableItem.name}...`);
            const sellStart = Date.now();
            const countBefore = sellableItem.count;

            try {
                // Use bot.sellToShop with 'all' amount for efficient batch selling
                const sellResult = await bot.sellToShop(sellableItem, 'all');

                if (sellResult.success) {
                    stats.arrowShaftsSold += countBefore; // Track all sold items (rename later)
                    lastActionTime = Date.now();
                    console.log(`[${elapsed}s] Sold! ${sellResult.message}`);
                    stuckCounter = 0;

                    // Check coins received
                    const coins = sdk.findInventoryItem(/coins/i);
                    if (coins) {
                        console.log(`[${elapsed}s] Current coins: ${coins.count}`);
                    }
                } else {
                    console.log(`[${elapsed}s] Sell failed: ${sellResult.message}`);
                    stuckCounter++;
                }
            } catch (e: any) {
                console.log(`[${elapsed}s] Sell error: ${e.message}`);
                stuckCounter++;
            }

            stats.timeInShop += Date.now() - sellStart;

            if (stuckCounter > 3) {
                console.log(`[${elapsed}s] Stuck selling, closing shop and retrying...`);
                await sdk.sendCloseShop();
                stuckCounter = 0;
                await sleep(500);
            }
            await sleep(300);
            continue;
        }

        // Stuck detection - if no action for 10s, reset state
        if (Date.now() - lastActionTime > 10000) {
            console.log(`[${elapsed}s] Stuck detected, resetting to CHOPPING`);
            if (shopOpen) {
                await sdk.sendCloseShop();
                await sleep(300);
            }
            currentState = 'CHOPPING';
            lastActionTime = Date.now();
        }

        // Fallback: wait a bit
        await sleep(500);
    }

    // Final summary
    const { reward: finalReward, fletchLvl: finalLevel, gp: finalGp } = getReward(sdk);
    const finalXp = sdk.getSkill('Fletching')?.experience ?? 0;
    stats.currentReward = finalReward;
    stats.fletchingXpGained = finalXp - initialXp;
    stats.coinsGained = finalGp - initGp;
    stats.rewardHistory.push({ elapsed: DURATION_SECONDS, reward: finalReward, fletchLvl: finalLevel, gp: finalGp });

    console.log(`\n=== FINAL RESULTS ===`);
    console.log(`Duration: ${DURATION_SECONDS}s`);
    console.log(`Initial Reward: ${stats.initialReward}`);
    console.log(`Final Reward: ${finalReward}`);
    console.log(`Reward Delta: +${finalReward - stats.initialReward}`);
    console.log(`\nFletching: Lvl ${initLevel} -> ${finalLevel} (+${finalLevel - initLevel})`);
    console.log(`XP Gained: +${stats.fletchingXpGained}`);
    console.log(`GP Gained: +${stats.coinsGained}`);
    console.log(`\nStats:`);
    console.log(`  Logs chopped: ${stats.logsChopped}`);
    console.log(`  Logs fletched: ${stats.logsFletchedCount}`);
    console.log(`  Arrow shafts sold: ${stats.arrowShaftsSold}`);
    console.log(`  Dialog dismissals: ${stats.dialogDismissals}`);
    console.log(`  Time chopping: ${Math.round(stats.timeChopping / 1000)}s`);
    console.log(`  Time fletching: ${Math.round(stats.timeFletching / 1000)}s`);
    console.log(`  Time in shop: ${Math.round(stats.timeInShop / 1000)}s`);
    console.log(`\nReward History:`);
    for (const entry of stats.rewardHistory) {
        console.log(`  ${entry.elapsed}s: ${entry.reward} (Lvl ${entry.fletchLvl}, ${entry.gp} GP)`);
    }

    console.log(`\n=== OBSERVATIONS FOR v2 ===`);
    console.log(`(Analyze /runs output to identify improvements)`);

    return finalReward > stats.initialReward;
});
