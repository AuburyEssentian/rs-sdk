/**
 * Fletching GP Maximizer
 *
 * Goal: Maximize GP earned in 5 minutes via fletching and selling unstrung bows
 *
 * Strategy:
 * - Chop normal trees for logs
 * - Fletch logs into best available product:
 *   - Level 1-4: Arrow shafts (sell for ~1gp each, get 15 per log)
 *   - Level 5-9: Shortbow (u) (sell for ~5gp each)
 *   - Level 10+: Longbow (u) (sell for ~10gp each)
 * - Sell products at Lumbridge general store
 * - Track total GP earned as reward signal
 *
 * Plain save: Just bronze axe + knife, no skill boosts
 */

import { runScript, type ScriptContext } from '../script-runner';
import { Items, Locations } from '../../test/utils/save-generator';

// Locations
const TREES_AREA = { x: 3200, z: 3230 }; // Trees between castle and general store
const GENERAL_STORE = Locations.LUMBRIDGE_SHOP; // (3212, 3246)

// Inventory management - balanced batch size for good GP
const LOGS_BEFORE_FLETCH = 6; // Fletch after 6 logs
const MIN_LOGS_TO_FLETCH = 4;  // Minimum logs before fletching

// Products and their requirements
type FletchProduct = 'arrow shafts' | 'short bow' | 'long bow';

function getBestProduct(fletchingLevel: number): FletchProduct {
    // Note: Normal logs can only make arrow shafts and shortbows
    // Longbows require oak logs or better
    if (fletchingLevel >= 5) return 'short bow';
    return 'arrow shafts';
}

// Track GP earned
interface GPTracker {
    startingGP: number;
    currentGP: number;
    itemsSold: number;
    logsChopped: number;
    productsFletched: number;
}

function getFletchingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fletching')?.baseLevel ?? 1;
}

function getGP(ctx: ScriptContext): number {
    const coins = ctx.sdk.findInventoryItem(/coins/i);
    return coins?.count ?? 0;
}

function countLogs(ctx: ScriptContext): number {
    // Logs don't stack - count all log items in inventory
    const inv = ctx.state()?.inventory ?? [];
    return inv.filter(i => /^logs$/i.test(i.name)).length;
}

function countSellableItems(ctx: ScriptContext): number {
    const inv = ctx.state()?.inventory ?? [];
    // Count arrow shafts (15 per log) and unstrung bows (1 per log)
    return inv.filter(i =>
        /arrow shaft|shortbow|longbow/i.test(i.name)
    ).reduce((sum, i) => sum + i.count, 0);
}

function getInventoryFreeSlots(ctx: ScriptContext): number {
    const inv = ctx.state()?.inventory ?? [];
    return 28 - inv.length;
}

function logStats(ctx: ScriptContext, tracker: GPTracker, label: string): void {
    const level = getFletchingLevel(ctx);
    const gpEarned = tracker.currentGP - tracker.startingGP;
    ctx.log(`[${label}] GP earned: ${gpEarned} | Fletching: ${level} | Logs: ${tracker.logsChopped} | Fletched: ${tracker.productsFletched} | Sold: ${tracker.itemsSold}`);
}

runScript({
    name: 'fletching-gp',
    goal: 'Maximize GP from fletching and selling unstrung bows in 5 minutes',
    saveConfig: {
        position: TREES_AREA,
        inventory: [
            { id: Items.BRONZE_AXE, count: 1 },
            { id: Items.KNIFE, count: 1 },
        ],
        skills: { Fletching: 5 }, // Start at level 5 to make shortbows immediately
    },
    timeLimit: 5 * 60 * 1000, // 5 minutes
    stallTimeout: 45_000,     // 45 seconds (some operations take time)
}, async (ctx) => {
    const { bot, sdk, log, progress } = ctx;

    // Initialize tracking
    const tracker: GPTracker = {
        startingGP: getGP(ctx),
        currentGP: getGP(ctx),
        itemsSold: 0,
        logsChopped: 0,
        productsFletched: 0,
    };

    logStats(ctx, tracker, 'START');

    // Main loop: Chop -> Fletch -> Sell
    while (true) {
        const state = ctx.state();
        if (!state?.player) {
            await sleep(500);
            continue;
        }

        // Close shop first if open (before checking dialogs)
        if (state.shop.isOpen) {
            // First dismiss any dialogs that might be blocking
            if (state.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
            }
            // Try closing shop up to 5 times, then walk away to force close
            for (let attempt = 0; attempt < 5; attempt++) {
                log(`Closing shop (attempt ${attempt + 1})...`);
                await sdk.sendCloseShop();
                await sleep(600);
                if (!ctx.state()?.shop.isOpen) {
                    log('Shop closed successfully');
                    break;
                }
            }
            // If STILL open after 5 attempts, walk away to force close
            if (ctx.state()?.shop.isOpen) {
                log('Shop stuck, walking away to force close...');
                await bot.walkTo(TREES_AREA.x, TREES_AREA.z);
            }
            progress();
            continue;
        }

        // Dismiss level-up dialogs (NOT shop interface)
        if (state.dialog.isOpen) {
            await sdk.sendClickDialog(0);
            await sleep(250);
            progress();
            continue;
        }

        const freeSlots = getInventoryFreeSlots(ctx);
        const logCount = countLogs(ctx);
        const sellableCount = countSellableItems(ctx);
        const fletchLevel = getFletchingLevel(ctx);

        // Log state every time we have logs (for debugging)
        if (logCount >= MIN_LOGS_TO_FLETCH) {
            log(`Decision: ${logCount} logs, ${sellableCount} sellable, ${freeSlots} free slots`);
        }

        // Decision tree:
        // 1. If we have sellable items and inventory is getting full, go sell
        // 2. If we have enough logs, fletch them
        // 3. Otherwise, chop more trees

        if (sellableCount > 0 && (freeSlots < 8 || sellableCount >= 6)) {
            // === SELLING PHASE ===
            log(`Selling ${sellableCount} items...`);

            // Walk to general store
            await bot.walkTo(GENERAL_STORE.x, GENERAL_STORE.z);
            progress();

            // Open shop
            const shopResult = await bot.openShop(/shop.*keeper|general/i);
            if (!shopResult.success) {
                log(`Failed to open shop: ${shopResult.message}`);
                await sleep(1000);
                continue;
            }
            progress();

            // Sell all fletched products - shortbows first (more valuable)
            const sellPatterns = [/shortbow/i, /longbow/i, /arrow shaft/i];
            const gpBefore = getGP(ctx);
            let totalItemsSold = 0;

            for (const pattern of sellPatterns) {
                let attempts = 0;
                while (attempts < 20) { // Max 20 attempts per pattern
                    attempts++;
                    const currentState = ctx.state();
                    if (!currentState?.shop.isOpen) break;

                    const item = currentState.shop.playerItems.find(i => pattern.test(i.name));
                    if (!item || item.count === 0) break;

                    const gpBeforeSell = getGP(ctx);
                    const sellResult = await bot.sellToShop(item, 'all');

                    // Check if GP increased (actual success) even if sellResult reports failure
                    const gpAfterSell = getGP(ctx);
                    if (gpAfterSell > gpBeforeSell || sellResult.success) {
                        const gpGained = gpAfterSell - gpBeforeSell;
                        const sold = sellResult.amountSold ?? 1;
                        totalItemsSold += sold;
                        tracker.itemsSold += sold;
                        log(`Sold ${item.name} (+${gpGained} GP)`);
                        progress();
                    } else if (sellResult.rejected) {
                        log(`Shop won't buy ${item.name}`);
                        break;
                    } else {
                        // No GP gain and not successful, move to next pattern
                        break;
                    }
                    await sleep(100);
                }
            }

            const gpAfter = getGP(ctx);
            log(`Sell cycle complete: +${gpAfter - gpBefore} GP, ${totalItemsSold} items`);

            // Dismiss any level-up dialogs that appeared during selling
            for (let i = 0; i < 5; i++) {
                const currentState = ctx.state();
                if (currentState?.dialog.isOpen) {
                    log('Dismissing dialog before closing shop...');
                    await sdk.sendClickDialog(0);
                    await sleep(300);
                } else {
                    break;
                }
            }

            // Close shop before checking GP
            await bot.closeShop();
            await sleep(500);

            // If shop still open, force close
            if (ctx.state()?.shop.isOpen) {
                log('Shop still open after closeShop, forcing close...');
                await sdk.sendCloseShop();
                await sleep(500);
            }

            // Update GP tracking
            tracker.currentGP = getGP(ctx);
            const gpEarned = tracker.currentGP - tracker.startingGP;
            log(`Total GP earned so far: ${gpEarned}`);
            logStats(ctx, tracker, 'AFTER SELL');
            progress();

        } else if (logCount >= MIN_LOGS_TO_FLETCH && (logCount >= LOGS_BEFORE_FLETCH || freeSlots <= 3)) {
            // === FLETCHING PHASE ===
            // First dismiss any dialogs
            for (let i = 0; i < 3; i++) {
                if (ctx.state()?.dialog.isOpen) {
                    await sdk.sendClickDialog(0);
                    await sleep(300);
                } else {
                    break;
                }
            }

            const product = getBestProduct(fletchLevel);
            log(`Fletching ${logCount} logs into ${product} (level ${fletchLevel})...`);

            // Fletch all logs with timeout protection
            let fletchedThisBatch = 0;
            let consecutiveFailures = 0;
            const fletchStart = Date.now();
            const maxFletchTime = 60_000; // 60 seconds max for fletching

            while (countLogs(ctx) > 0 && Date.now() - fletchStart < maxFletchTime) {
                // Dismiss any dialogs first
                if (ctx.state()?.dialog.isOpen) {
                    await sdk.sendClickDialog(0);
                    await sleep(200);
                    continue;
                }

                const currentProduct = getBestProduct(getFletchingLevel(ctx));
                const fletchResult = await bot.fletchLogs(currentProduct);
                if (fletchResult.success) {
                    fletchedThisBatch++;
                    tracker.productsFletched++;
                    consecutiveFailures = 0;
                    progress();

                    // Check if we leveled up
                    const newLevel = getFletchingLevel(ctx);
                    if (newLevel !== fletchLevel) {
                        log(`Fletching level up! Now level ${newLevel}`);
                    }
                } else {
                    consecutiveFailures++;
                    log(`Fletch failed (${consecutiveFailures}/3): ${fletchResult.message}`);
                    if (consecutiveFailures >= 3) {
                        log(`Too many fletch failures, moving on...`);
                        break;
                    }
                    // Wait a bit before retry
                    await sleep(500);
                }
                await sleep(100);
            }

            if (fletchedThisBatch > 0) {
                log(`Fletched ${fletchedThisBatch} items`);
            }

        } else {
            // === CHOPPING PHASE ===
            // Find and chop a tree
            const tree = sdk.findNearbyLoc(/^tree$/i);

            if (!tree) {
                // Walk to trees area
                log('No trees nearby, walking to trees area...');
                await bot.walkTo(TREES_AREA.x, TREES_AREA.z);
                progress();
                await sleep(500);
                continue;
            }

            // Chop the tree
            const chopResult = await bot.chopTree(tree);
            if (chopResult.success) {
                tracker.logsChopped++;
                progress();

                // Log progress occasionally
                if (tracker.logsChopped % 10 === 0) {
                    logStats(ctx, tracker, `CHOP #${tracker.logsChopped}`);
                }
            } else {
                // Tree might be gone, wait and retry
                await sleep(500);
            }
        }

        await sleep(100);
    }
});

// Helper
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
