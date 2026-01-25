/**
 * Arc: combat-progression
 * Character: Adam_2
 *
 * Goal: Train combat to 70+ attack/strength/defence
 * Strategy:
 * 1. Kill cows for XP, cowhides (sell for GP), and raw beef (cook for food)
 * 2. Bank hides at Varrock West Bank
 * 3. Sell hides at Lumbridge general store
 * 4. Buy gear upgrades from Varrock shops (iron -> steel -> mithril etc)
 * 5. Cook raw beef for healing food
 *
 * Gear Progression:
 * - Level 1:  Bronze
 * - Level 5:  Iron
 * - Level 10: Steel
 * - Level 20: Mithril
 * - Level 30: Adamant
 * - Level 40: Rune
 *
 * Duration: 15 minutes (longer for travel and shopping)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc, InventoryItem } from '../../../../agent/types.ts';

// ==================== LOCATIONS ====================

const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3269 },
    VARROCK_WEST_BANK: { x: 3185, z: 3436 },
    VARROCK_SWORD_SHOP: { x: 3205, z: 3398 },     // Zaff's Staffs / near sword shop
    VARROCK_ARMOUR_SHOP: { x: 3195, z: 3427 },    // Horvik's Armour
    LUMBRIDGE_GENERAL_STORE: { x: 3211, z: 3247 },
    LUMBRIDGE_RANGE: { x: 3211, z: 3214 },        // Lumbridge castle kitchen range
};

// Waypoints from cow field to Varrock West Bank
const WAYPOINTS_COW_TO_BANK = [
    { x: 3253, z: 3290 },
    { x: 3240, z: 3320 },
    { x: 3230, z: 3350 },
    { x: 3220, z: 3380 },
    { x: 3210, z: 3410 },
    { x: 3185, z: 3436 },
];

// Waypoints back to cow field
const WAYPOINTS_BANK_TO_COW = [
    { x: 3185, z: 3436 },
    { x: 3210, z: 3410 },
    { x: 3220, z: 3380 },
    { x: 3230, z: 3350 },
    { x: 3240, z: 3320 },
    { x: 3253, z: 3290 },
    { x: 3253, z: 3269 },
];

// Gear level requirements
const GEAR_TIERS = [
    { level: 1, tier: 'Bronze', swordPrice: 26, armourPrice: 70 },
    { level: 5, tier: 'Iron', swordPrice: 91, armourPrice: 210 },
    { level: 10, tier: 'Steel', swordPrice: 325, armourPrice: 750 },
    { level: 20, tier: 'Mithril', swordPrice: 845, armourPrice: 1950 },
    { level: 30, tier: 'Adamant', swordPrice: 2080, armourPrice: 4800 },
    { level: 40, tier: 'Rune', swordPrice: 20800, armourPrice: 50000 },
];

// Thresholds
const HIDE_BANK_THRESHOLD = 30;     // Bank when we have this many hides (increased to avoid immediate banking)
const SELL_THRESHOLD_GP = 200;      // Sell hides when we need GP for upgrades
const LOW_HP_THRESHOLD = 20;        // Eat food when HP drops below this
const RETREAT_HP_THRESHOLD = 10;    // Stop fighting if HP below this and no food

// ==================== STATS ====================

interface Stats {
    kills: number;
    hidesCollected: number;
    hidesBanked: number;
    hidesSold: number;
    meatCollected: number;
    meatCooked: number;
    foodEaten: number;
    gpEarned: number;
    gpSpent: number;
    gearUpgrades: string[];
    bankTrips: number;
    shopTrips: number;
    startTime: number;
    lastProgressTime: number;
}

// ==================== HELPERS ====================

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getSkillLevel(ctx: ScriptContext, skillName: string): number {
    return ctx.sdk.getSkill(skillName)?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /^coins$/i.test(i.name));
    return coins?.count ?? 0;
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

function getCurrentHP(ctx: ScriptContext): number {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return hp?.level ?? hp?.baseLevel ?? 10;
}

function getMaxHP(ctx: ScriptContext): number {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return hp?.baseLevel ?? 10;
}

function getLowestCombatStat(ctx: ScriptContext): { name: string; level: number } {
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');

    if (def <= atk && def <= str) return { name: 'Defence', level: def };
    if (atk <= str) return { name: 'Attack', level: atk };
    return { name: 'Strength', level: str };
}

function getAvailableGearTier(ctx: ScriptContext): { level: number; tier: string; swordPrice: number; armourPrice: number } {
    const lowestStat = getLowestCombatStat(ctx).level;
    const available = GEAR_TIERS.filter(t => t.level <= lowestStat);
    return available[available.length - 1] ?? GEAR_TIERS[0]!;
}

function hasEquipped(ctx: ScriptContext, pattern: RegExp): boolean {
    const equip = ctx.state()?.equipment ?? [];
    return equip.some(e => e && pattern.test(e.name));
}

// ==================== WALKING ====================

async function walkWaypoints(ctx: ScriptContext, stats: Stats, waypoints: {x: number, z: number}[], label: string): Promise<boolean> {
    ctx.log(`Walking ${label} via ${waypoints.length} waypoints...`);

    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]!;
        await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx, stats);

        for (let j = 0; j < 30; j++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);

            // Dismiss dialogs
            if (ctx.state()?.dialog?.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }

            const player = ctx.state()?.player;
            if (player) {
                const dist = Math.sqrt(
                    Math.pow(player.worldX - wp.x, 2) +
                    Math.pow(player.worldZ - wp.z, 2)
                );
                if (dist < 10) break;
            }
        }
    }
    return true;
}

// ==================== COMBAT ====================

function findCow(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const cows = state.nearbyNpcs
        .filter(npc => /^cow$/i.test(npc.name))
        .filter(npc => npc.optionsWithIndex.some(o => /attack/i.test(o.text)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => a.distance - b.distance);

    return cows[0] ?? null;
}

async function setCombatStyle(ctx: ScriptContext, skillName: string): Promise<void> {
    const styleState = ctx.sdk.getState()?.combatStyle;
    if (!styleState) return;

    const style = styleState.styles.find(s => s.trainedSkill === skillName);
    if (style && styleState.currentStyle !== style.index) {
        await ctx.sdk.sendSetCombatStyle(style.index);
        ctx.log(`Combat style: ${skillName}`);
    }
}

// ==================== LOOTING ====================

async function pickupLoot(ctx: ScriptContext, stats: Stats): Promise<number> {
    let pickedUp = 0;
    const state = ctx.state();
    if (!state || state.inventory.length >= 28) return 0;

    const groundItems = ctx.sdk.getGroundItems()
        .filter(i => /cow\s*hide|raw\s*beef|coins/i.test(i.name))
        .filter(i => i.distance <= 8)
        .sort((a, b) => {
            // Priority: hides > beef > coins
            const priority = (name: string) => {
                if (/cow\s*hide/i.test(name)) return 0;
                if (/raw\s*beef/i.test(name)) return 1;
                return 2;
            };
            return priority(a.name) - priority(b.name) || a.distance - b.distance;
        });

    for (const item of groundItems.slice(0, 2)) {
        if (ctx.state()!.inventory.length >= 28) break;

        const result = await ctx.bot.pickupItem(item);
        if (result.success) {
            pickedUp++;
            if (/cow\s*hide/i.test(item.name)) {
                stats.hidesCollected++;
                ctx.log(`Hide collected (total: ${stats.hidesCollected})`);
            } else if (/raw\s*beef/i.test(item.name)) {
                stats.meatCollected++;
            }
            markProgress(ctx, stats);
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return pickedUp;
}

// ==================== EATING ====================

async function eatFood(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const food = ctx.state()?.inventory.find(i =>
        /cooked\s*(meat|beef)|bread|shrimp/i.test(i.name)
    );

    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (eatOpt) {
            await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
            stats.foodEaten++;
            ctx.log(`Ate ${food.name}, HP was ${getCurrentHP(ctx)}`);
            markProgress(ctx, stats);
            return true;
        }
    }
    return false;
}

// ==================== COOKING ====================

async function cookMeat(ctx: ScriptContext, stats: Stats): Promise<number> {
    const rawMeat = ctx.state()?.inventory.filter(i => /raw\s*beef/i.test(i.name)) ?? [];
    if (rawMeat.length === 0) return 0;

    ctx.log(`Cooking ${rawMeat.length} raw beef...`);

    // Find a fire or cooking range nearby
    const range = ctx.state()?.nearbyLocs.find(l => /range|stove|fire/i.test(l.name));
    if (!range) {
        ctx.log('No cooking source nearby');
        return 0;
    }

    let cooked = 0;
    for (const meat of rawMeat) {
        // Use meat on range
        await ctx.sdk.sendUseItemOnLoc(meat.slot, range.x, range.z, range.id);
        await new Promise(r => setTimeout(r, 2000));

        // Check if cooking interface appeared, click to cook
        for (let i = 0; i < 10; i++) {
            const state = ctx.state();
            if (state?.interface?.isOpen) {
                await ctx.sdk.sendClickInterface(1);  // "Cook 1"
                break;
            }
            if (state?.dialog?.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        // Wait for cooking animation
        await new Promise(r => setTimeout(r, 3000));
        cooked++;
        stats.meatCooked++;
        markProgress(ctx, stats);
    }

    ctx.log(`Cooked ${cooked} meat`);
    return cooked;
}

// ==================== BANKING ====================

async function bankHides(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const hidesInInv = countItem(ctx, /cow\s*hide/i);
    if (hidesInInv === 0) return false;

    ctx.log(`=== Banking ${hidesInInv} hides ===`);
    stats.bankTrips++;

    // Walk to bank
    await walkWaypoints(ctx, stats, WAYPOINTS_COW_TO_BANK, 'to Varrock West Bank');
    await new Promise(r => setTimeout(r, 1000));

    // Open bank
    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (banker) {
        const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
        if (bankOpt) {
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
        }
    }

    // Wait for bank interface
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) break;
        markProgress(ctx, stats);
    }

    // Deposit hides
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
        stats.hidesBanked += hide.count ?? 1;
        await new Promise(r => setTimeout(r, 200));
    }

    ctx.log(`Banked ${hides.length} hide stacks. Total banked: ${stats.hidesBanked}`);

    // Close bank
    await ctx.bot.closeShop();
    markProgress(ctx, stats);

    // Return to cows
    await walkWaypoints(ctx, stats, WAYPOINTS_BANK_TO_COW, 'back to cows');
    await ctx.bot.openDoor(/gate/i);

    return true;
}

// ==================== SELLING ====================

async function sellHides(ctx: ScriptContext, stats: Stats): Promise<number> {
    ctx.log('=== Selling hides at general store ===');
    stats.shopTrips++;

    // First withdraw hides from bank
    await walkWaypoints(ctx, stats, WAYPOINTS_COW_TO_BANK, 'to bank for hides');
    await new Promise(r => setTimeout(r, 1000));

    // Open bank and withdraw hides
    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (banker) {
        const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
        if (bankOpt) {
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
        }
    }

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) break;
        markProgress(ctx, stats);
    }

    // Withdraw all hides (they should be in bank)
    // Note: Need to find the hides in bank inventory - bank items in shop.shopItems
    const bankState = ctx.state();
    if (bankState?.interface?.isOpen) {
        const bankHides = bankState.shop.shopItems.filter((i: { name: string }) => /cow\s*hide/i.test(i.name));
        for (const hide of bankHides.slice(0, 25)) { // Max 25 at a time
            await ctx.sdk.sendBankWithdraw(hide.slot, hide.count ?? 1);
            await new Promise(r => setTimeout(r, 200));
        }
    }

    await ctx.bot.closeShop();
    markProgress(ctx, stats);

    // Walk to Lumbridge general store
    ctx.log('Walking to Lumbridge general store...');
    await ctx.bot.walkTo(LOCATIONS.LUMBRIDGE_GENERAL_STORE.x, LOCATIONS.LUMBRIDGE_GENERAL_STORE.z);
    markProgress(ctx, stats);

    // Open shop
    const shopResult = await ctx.bot.openShop(/shop.?keeper/i);
    if (!shopResult.success) {
        ctx.warn('Failed to open shop');
        return 0;
    }

    // Sell all hides
    const gpBefore = getCoins(ctx);
    const inventory = ctx.sdk.getInventory();
    const allHides = inventory.filter(i => /cow\s*hide/i.test(i.name));
    let soldCount = 0;

    for (const hide of allHides) {
        const sellResult = await ctx.bot.sellToShop(/cow\s*hide/i, 1);
        if (sellResult.success) {
            soldCount++;
            stats.hidesSold++;
        } else {
            ctx.warn(`Sell failed: ${sellResult.message}`);
            break;
        }
        await new Promise(r => setTimeout(r, 200));
        markProgress(ctx, stats);
    }

    await ctx.bot.closeShop();

    const gpAfter = getCoins(ctx);
    const earned = gpAfter - gpBefore;
    stats.gpEarned += earned;
    ctx.log(`Sold ${soldCount} hides for ${earned}gp. Total: ${gpAfter}gp`);

    return earned;
}

// ==================== GEAR BUYING ====================

async function buyGearUpgrade(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const tier = getAvailableGearTier(ctx);
    const coins = getCoins(ctx);

    ctx.log(`Checking gear upgrades: Tier=${tier.tier}, Coins=${coins}gp`);

    // Check if we already have this tier sword
    const hasSword = hasEquipped(ctx, new RegExp(`${tier.tier}.*sword|scimitar`, 'i')) ||
                     ctx.state()?.inventory.some(i => new RegExp(`${tier.tier}.*sword|scimitar`, 'i').test(i.name));

    if (hasSword && coins < tier.armourPrice) {
        ctx.log(`Already have ${tier.tier} weapon, need more GP for armour`);
        return false;
    }

    // Need at least sword price
    if (coins < tier.swordPrice) {
        ctx.log(`Need ${tier.swordPrice}gp for ${tier.tier} sword`);
        return false;
    }

    stats.shopTrips++;
    ctx.log(`=== Buying ${tier.tier} gear ===`);

    // Walk to Varrock sword shop
    ctx.log('Walking to Varrock sword shop...');
    await ctx.bot.walkTo(LOCATIONS.VARROCK_SWORD_SHOP.x, LOCATIONS.VARROCK_SWORD_SHOP.z);
    markProgress(ctx, stats);

    // Buy sword if we don't have one
    if (!hasSword) {
        // Find and open sword shop (look for shop NPC)
        const swordShop = await ctx.bot.openShop(/sword|zaff/i);
        if (swordShop.success) {
            const swordPattern = new RegExp(`${tier.tier}.*sword`, 'i');
            const buyResult = await ctx.bot.buyFromShop(swordPattern, 1);
            if (buyResult.success) {
                ctx.log(`Bought ${tier.tier} sword!`);
                stats.gearUpgrades.push(`${tier.tier} sword`);
                stats.gpSpent += tier.swordPrice;

                // Equip it
                const newSword = ctx.sdk.findInventoryItem(swordPattern);
                if (newSword) {
                    await ctx.bot.equipItem(newSword);
                }
            }
            await ctx.bot.closeShop();
        }
    }

    // Buy armour if we have enough coins
    const coinsAfterSword = getCoins(ctx);
    if (coinsAfterSword >= tier.armourPrice) {
        ctx.log('Walking to Varrock armour shop...');
        await ctx.bot.walkTo(LOCATIONS.VARROCK_ARMOUR_SHOP.x, LOCATIONS.VARROCK_ARMOUR_SHOP.z);
        markProgress(ctx, stats);

        const armourShop = await ctx.bot.openShop(/horvik|armour/i);
        if (armourShop.success) {
            // Try to buy platebody
            const bodyPattern = new RegExp(`${tier.tier}.*platebody|chainbody`, 'i');
            const buyBody = await ctx.bot.buyFromShop(bodyPattern, 1);
            if (buyBody.success) {
                ctx.log(`Bought ${tier.tier} body armour!`);
                stats.gearUpgrades.push(`${tier.tier} platebody`);

                const newBody = ctx.sdk.findInventoryItem(bodyPattern);
                if (newBody) await ctx.bot.equipItem(newBody);
            }
            await ctx.bot.closeShop();
        }
    }

    markProgress(ctx, stats);
    return true;
}

// ==================== MAIN LOOP ====================

async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let styleIndex = 0;
    const styleRotation = ['Strength', 'Attack', 'Defence'];

    // Set initial style to train lowest stat
    const lowestStat = getLowestCombatStat(ctx);
    await setCombatStyle(ctx, lowestStat.name);

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) break;

        // Log status every 50 loops
        if (loopCount % 50 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            ctx.log(`Loop ${loopCount}: Atk=${atk} Str=${str} Def=${def}, Kills=${stats.kills}, Hides=${countItem(ctx, /cow\s*hide/i)}, GP=${getCoins(ctx)}`);
        }

        // Rotate combat style every 100 loops (train lowest stat more)
        if (loopCount % 100 === 0) {
            const lowest = getLowestCombatStat(ctx);
            await setCombatStyle(ctx, lowest.name);
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Check HP and eat if low
        const currentHP = getCurrentHP(ctx);
        const maxHP = getMaxHP(ctx);
        if (currentHP < LOW_HP_THRESHOLD && currentHP > 0) {
            const ate = await eatFood(ctx, stats);
            if (!ate && currentHP < RETREAT_HP_THRESHOLD) {
                ctx.warn(`CRITICAL: HP at ${currentHP}/${maxHP}, no food! Waiting for natural regen...`);
                // Don't attack while HP is critical - just wait for HP to regenerate
                // HP regenerates 1 point every ~60 game ticks (~36 seconds)
                await new Promise(r => setTimeout(r, 10000));
                markProgress(ctx, stats);
                continue;
            } else if (!ate) {
                ctx.log(`Low HP (${currentHP}/${maxHP}), no food - continuing carefully`);
            }
        }

        // Check if we should bank hides
        const hideCount = countItem(ctx, /cow\s*hide/i);
        if (hideCount >= HIDE_BANK_THRESHOLD) {
            await bankHides(ctx, stats);
            continue;
        }

        // Drop non-essential items if inventory full
        if (currentState.inventory.length >= 26) {
            // Count raw beef - drop excess if we have too much (keep max 5)
            const rawBeefItems = currentState.inventory.filter(i => /raw\s*beef/i.test(i.name));
            if (rawBeefItems.length > 5) {
                ctx.log(`Dropping excess raw beef (${rawBeefItems.length} -> 5)...`);
                for (const item of rawBeefItems.slice(5, 15)) {
                    await ctx.sdk.sendDropItem(item.slot);
                    await new Promise(r => setTimeout(r, 150));
                }
                markProgress(ctx, stats);
                continue;
            }

            // Keep: weapons, shields, food (but not excess beef), hides, coins, tools
            const junk = currentState.inventory.filter(i => {
                const name = i.name.toLowerCase();
                if (/sword|scimitar|dagger|shield|axe|pickaxe|cow\s*hide|coins|cooked|bread|shrimp/i.test(name)) return false;
                return true;
            });

            if (junk.length > 0) {
                for (const item of junk.slice(0, 5)) {
                    await ctx.sdk.sendDropItem(item.slot);
                    await new Promise(r => setTimeout(r, 150));
                }
                markProgress(ctx, stats);
                continue;
            }
        }

        // Check for drift from cow field
        // Must check BOTH coordinates are valid (> 100) to avoid state sync issues
        const player = currentState.player;
        const isValidPosition = player && player.worldX > 100 && player.worldZ > 100;

        if (isValidPosition) {
            const dist = Math.sqrt(
                Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
                Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
            );
            if (dist > 40 && dist < 200) {  // Only walk back if reasonably close
                ctx.log(`Drifted ${dist.toFixed(0)} tiles, returning...`);
                await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
                await ctx.bot.openDoor(/gate/i);
                markProgress(ctx, stats);
                continue;
            } else if (dist >= 200) {
                // Too far - likely a position glitch or we died, just continue with combat
                ctx.warn(`Position anomaly (${dist.toFixed(0)} tiles from cow field) - ignoring`);
            }
        } else {
            // Invalid position - state sync issue, wait and continue
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Check if idle
        const isIdle = player?.animId === -1;

        if (isIdle) {
            // Try to loot first
            const looted = await pickupLoot(ctx, stats);
            if (looted > 0) continue;

            // Find and attack cow
            const cow = findCow(ctx);
            if (cow) {
                const result = await ctx.bot.attackNpc(cow);
                if (result.success) {
                    stats.kills++;
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 2000));
                } else if (result.reason === 'out_of_reach') {
                    await ctx.bot.openDoor(/gate/i);
                    markProgress(ctx, stats);
                }
            } else {
                // No cows, wander a bit
                await ctx.sdk.sendWalk(
                    LOCATIONS.COW_FIELD.x + (Math.random() * 10 - 5),
                    LOCATIONS.COW_FIELD.z + (Math.random() * 10 - 5),
                    true
                );
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }
}

// ==================== FINAL STATS ====================

function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');
    const hp = getSkillLevel(ctx, 'Hitpoints');
    const totalLevel = getTotalLevel(ctx);
    const coins = getCoins(ctx);

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Kills: ${stats.kills}`);
    ctx.log(`Hides: collected=${stats.hidesCollected}, banked=${stats.hidesBanked}, sold=${stats.hidesSold}`);
    ctx.log(`Meat: collected=${stats.meatCollected}, cooked=${stats.meatCooked}`);
    ctx.log(`Food eaten: ${stats.foodEaten}`);
    ctx.log(`GP: earned=${stats.gpEarned}, spent=${stats.gpSpent}, current=${coins}`);
    ctx.log(`Gear upgrades: ${stats.gearUpgrades.length > 0 ? stats.gearUpgrades.join(', ') : 'none'}`);
    ctx.log(`Bank trips: ${stats.bankTrips}, Shop trips: ${stats.shopTrips}`);
    ctx.log(`Combat: Attack=${atk}, Strength=${str}, Defence=${def}, HP=${hp}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');
}

// ==================== MAIN ====================

runArc({
    characterName: 'Adam_2',
    arcName: 'combat-progression',
    goal: 'Train combat to 70+, bank hides, upgrade gear',
    timeLimit: 15 * 60 * 1000,  // 15 minutes
    stallTimeout: 120_000,  // 2 minutes - connection can be slow
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        hidesCollected: 0,
        hidesBanked: 0,
        hidesSold: 0,
        meatCollected: 0,
        meatCooked: 0,
        foodEaten: 0,
        gpEarned: 0,
        gpSpent: 0,
        gearUpgrades: [],
        bankTrips: 0,
        shopTrips: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: combat-progression (Adam_2) ===');

    // Wait for game state to fully settle (position 0,0 means state not loaded yet)
    // Use a longer timeout and also check for skills as backup indicator
    ctx.log('Waiting for game state to load...');
    let stateLoaded = false;
    for (let i = 0; i < 60; i++) {
        const pos = ctx.state()?.player;
        const skills = ctx.state()?.skills?.filter(s => s.baseLevel > 1) ?? [];

        if (pos && pos.worldX > 0 && pos.worldZ > 0) {
            ctx.log(`State loaded: position (${pos.worldX}, ${pos.worldZ}), ${skills.length} trained skills`);
            stateLoaded = true;
            break;
        }

        // Also check if SDK has skill data (backup check)
        const atkSkill = ctx.sdk.getSkill('Attack');
        if (atkSkill && atkSkill.baseLevel > 1) {
            ctx.log(`State loaded via SDK: Attack=${atkSkill.baseLevel}`);
            // Give a moment for position to also load
            await new Promise(r => setTimeout(r, 2000));
            stateLoaded = true;
            break;
        }

        await new Promise(r => setTimeout(r, 500));
        markProgress(ctx, stats);
    }

    if (!stateLoaded) {
        ctx.warn('WARNING: State may not be fully loaded! Proceeding anyway...');
    }

    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');
    ctx.log(`Starting: Attack=${atk}, Strength=${str}, Defence=${def}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
    ctx.log(`GP: ${getCoins(ctx)}`);

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Equip best available weapon
    const weapon = ctx.sdk.getInventory().find(i =>
        /scimitar|sword/i.test(i.name) && !/pickaxe/i.test(i.name)
    );
    if (weapon) {
        ctx.log(`Equipping ${weapon.name}...`);
        await ctx.bot.equipItem(weapon);
        markProgress(ctx, stats);
    }

    // Walk to cow field if far away (but skip if state shows 0,0 - that's invalid)
    const player = ctx.state()?.player;
    if (player && player.worldX > 0) {
        const dist = Math.sqrt(
            Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
            Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
        );
        if (dist > 30 && dist < 200) {
            ctx.log(`Walking to cow field (${dist.toFixed(0)} tiles away)...`);
            await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
            markProgress(ctx, stats);
        } else if (dist > 200) {
            ctx.warn(`Position seems wrong (${dist.toFixed(0)} tiles from cow field), skipping walk`);
        }
        await ctx.bot.openDoor(/gate/i);
        markProgress(ctx, stats);
    } else {
        ctx.warn('No valid player position, proceeding to combat loop anyway...');
    }

    try {
        await combatLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error(`Arc aborted: ${e.message}`);
        } else {
            throw e;
        }
    } finally {
        logFinalStats(ctx, stats);
    }
});
