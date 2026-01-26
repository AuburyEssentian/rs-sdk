/**
 * Arc: cowhide-grind
 * Character: Adam_4
 *
 * Goal: Combat training + BANK cowhides at Varrock West Bank (ground floor, no stairs)
 *
 * Strategy:
 * 1. Fight cows at Lumbridge cow field
 * 2. Collect cowhides
 * 3. When inventory full, walk to Varrock West Bank and deposit hides
 * 4. Walk back to cow field and repeat
 * 5. Rotate combat styles for balanced training
 *
 * Alternative: Can sell at Lumbridge general store if banking fails
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// Locations
const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3270 },           // Lumbridge cow field (inside)
    COW_FIELD_GATE: { x: 3253, z: 3255 },      // Gate to enter cow field
    VARROCK_WEST_BANK: { x: 3185, z: 3436 },   // Varrock West Bank (ground floor, no stairs!)
    LUMBRIDGE_GENERAL_STORE: { x: 3212, z: 3246 }, // Lumbridge general store (backup for selling)
};

// Waypoints from Lumbridge cows to Varrock West Bank
// Route: Cow field -> North through Varrock -> West bank
const WAYPOINTS_COWS_TO_BANK = [
    { x: 3253, z: 3280 },  // North of cow field
    { x: 3250, z: 3310 },  // Continue north
    { x: 3250, z: 3340 },  // North towards Varrock
    { x: 3245, z: 3370 },  // Approaching Varrock south
    { x: 3230, z: 3400 },  // Varrock south entrance
    { x: 3210, z: 3420 },  // Into Varrock
    { x: 3185, z: 3436 },  // Varrock West Bank
];

// Waypoints from Varrock West Bank back to cows
const WAYPOINTS_BANK_TO_COWS = [
    { x: 3210, z: 3420 },  // East from bank
    { x: 3230, z: 3400 },  // Varrock south
    { x: 3245, z: 3370 },  // South of Varrock
    { x: 3250, z: 3340 },  // Continue south
    { x: 3250, z: 3310 },  // Approaching Lumbridge
    { x: 3253, z: 3280 },  // North of cow field
    { x: 3253, z: 3270 },  // Cow field center
];

// Thresholds
const BANK_THRESHOLD = 10;      // Bank when inventory has this many hides (lowered for faster trips)
const HP_EAT_THRESHOLD = 0.5;   // Eat when HP below 50%
const MAX_INVENTORY_SIZE = 24;  // Drop junk when inventory exceeds this

interface Stats {
    kills: number;
    hidesCollected: number;
    hidesBanked: number;
    bankTrips: number;
    failedBankTrips: number;
    foodEaten: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

// ============ Combat Stats ============

function getSkillLevel(ctx: ScriptContext, skillName: string): number {
    return ctx.sdk.getSkill(skillName)?.baseLevel ?? 1;
}

function getAttackLevel(ctx: ScriptContext): number { return getSkillLevel(ctx, 'Attack'); }
function getStrengthLevel(ctx: ScriptContext): number { return getSkillLevel(ctx, 'Strength'); }
function getDefenceLevel(ctx: ScriptContext): number { return getSkillLevel(ctx, 'Defence'); }

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 30;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return { current: hp?.level ?? 10, max: hp?.baseLevel ?? 10 };
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

// ============ Inventory Helpers ============

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const state = ctx.state();
    if (!state) return 0;
    return state.inventory.filter(i => pattern.test(i.name)).reduce((sum, i) => sum + i.count, 0);
}

function getInventoryCount(ctx: ScriptContext): number {
    return ctx.state()?.inventory.length ?? 0;
}

// ============ Combat Style ============

async function setOptimalCombatStyle(ctx: ScriptContext): Promise<void> {
    const atk = getAttackLevel(ctx);
    const str = getStrengthLevel(ctx);
    const def = getDefenceLevel(ctx);

    // Train the lowest skill
    let targetSkill = 'Strength';
    if (atk <= str && atk <= def) targetSkill = 'Attack';
    else if (def < str) targetSkill = 'Defence';

    const styleState = ctx.sdk.getState()?.combatStyle;
    if (styleState) {
        const style = styleState.styles.find(s => s.trainedSkill === targetSkill);
        if (style && style.index !== styleState.currentStyle) {
            ctx.log(`Setting combat style to train ${targetSkill} (Atk:${atk} Str:${str} Def:${def})`);
            await ctx.sdk.sendSetCombatStyle(style.index);
        }
    }
}

// ============ Find Targets ============

function findCow(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const cows = state.nearbyNpcs
        .filter(npc => /^cow$/i.test(npc.name))
        .filter(npc => npc.optionsWithIndex.some(o => /attack/i.test(o.text)))
        .filter(npc => !npc.inCombat || npc.targetIndex === -1)
        .sort((a, b) => a.distance - b.distance);

    return cows[0] ?? null;
}

// ============ Gate Handling ============

function isOutsideCowField(ctx: ScriptContext): boolean {
    const player = ctx.state()?.player;
    if (!player || player.worldX === 0 || player.worldZ === 0) return false;
    // If z < 3255, we're definitely south of the fence (outside)
    // The fence runs roughly at z=3256-3257, gate is at 3255
    return player.worldZ < 3255 && player.worldX > 3240 && player.worldX < 3270;
}

async function enterCowFieldThroughGate(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('Attempting to enter cow field through gate...');

    // Walk to gate area
    await ctx.bot.walkTo(LOCATIONS.COW_FIELD_GATE.x, LOCATIONS.COW_FIELD_GATE.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 500));

    // Find and open gate
    const gate = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name));
    if (gate) {
        const openOpt = gate.optionsWithIndex.find(o => /open/i.test(o.text));
        if (openOpt) {
            ctx.log(`Opening gate: ${gate.name}`);
            await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, openOpt.opIndex);
            await new Promise(r => setTimeout(r, 800));
            markProgress(ctx, stats);
        }
    }

    // Walk inside the cow field
    await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
    markProgress(ctx, stats);

    return !isOutsideCowField(ctx);
}

// ============ Food Management ============

async function eatFoodIfNeeded(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const { current, max } = getHP(ctx);
    if (current >= max * HP_EAT_THRESHOLD) return false;

    // Find food in inventory
    const food = ctx.sdk.findInventoryItem(/^(cooked meat|bread|shrimps?|anchovies|trout|salmon|lobster|swordfish|kebab|cooked chicken)$/i);
    if (!food) {
        if (current < max * 0.3) {
            ctx.warn(`HP critically low (${current}/${max}) but no food!`);
        }
        return false;
    }

    ctx.log(`HP low (${current}/${max}) - eating ${food.name}`);
    await ctx.bot.eatFood(food);
    stats.foodEaten++;
    markProgress(ctx, stats);
    return true;
}

// ============ Loot Collection ============

async function pickupLoot(ctx: ScriptContext, stats: Stats): Promise<number> {
    let pickedUp = 0;
    const state = ctx.state();
    if (!state) return 0;

    // Check inventory space
    if (state.inventory.length >= 26) {
        return 0;
    }

    // Get all ground items
    const allGroundItems = ctx.sdk.getGroundItems();

    // Find cowhides specifically - use case-insensitive "hide" matching
    const lootItems = allGroundItems
        .filter(i => i.name.toLowerCase().includes('hide'))
        .filter(i => i.distance <= 12)
        .sort((a, b) => a.distance - b.distance);

    // Debug: log every 10th call
    if (stats.kills % 10 === 0 && allGroundItems.length > 0) {
        const names = allGroundItems.slice(0, 3).map(i => `"${i.name}"(${i.distance.toFixed(0)})`).join(', ');
        ctx.log(`[LOOT DEBUG] Items nearby: ${names}, hides found: ${lootItems.length}`);
    }

    // Only try ONE item per tick to avoid timeouts
    const item = lootItems[0];
    if (!item) return 0;

    // Walk to item if it's far
    if (item.distance > 2) {
        ctx.log(`Walking to hide at (${item.x}, ${item.z}) dist=${item.distance.toFixed(1)}`);
        await ctx.sdk.sendWalk(item.x, item.z, true);
        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }

    // Log what we're trying to pick up
    ctx.log(`Picking up: "${item.name}" at (${item.x}, ${item.z}) dist=${item.distance.toFixed(1)}`);

    // Use raw SDK call instead of bot.pickupItem to avoid waiting
    await ctx.sdk.sendPickup(item.x, item.z, item.id);
    await new Promise(r => setTimeout(r, 800));  // Brief wait for pickup animation

    // Check if we got it (opportunistic)
    const newCount = countItem(ctx, /hide/i);
    if (newCount > stats.hidesCollected) {
        pickedUp = newCount - stats.hidesCollected;
        stats.hidesCollected = newCount;
        ctx.log(`Got hide! (total: ${stats.hidesCollected})`);
    }
    markProgress(ctx, stats);

    return pickedUp;
}

// ============ Walking ============

async function walkWaypoints(ctx: ScriptContext, waypoints: { x: number; z: number }[], stats: Stats): Promise<boolean> {
    for (const wp of waypoints) {
        // Try up to 3 times per waypoint
        for (let attempt = 0; attempt < 3; attempt++) {
            await ctx.bot.walkTo(wp.x, wp.z);
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);

            const player = ctx.state()?.player;
            if (!player || player.worldX === 0) continue;

            const dist = Math.sqrt(
                Math.pow(player.worldX - wp.x, 2) +
                Math.pow(player.worldZ - wp.z, 2)
            );

            if (dist <= 8) break;  // Close enough
            ctx.log(`Waypoint retry ${attempt + 1} - still ${dist.toFixed(0)} tiles away`);
        }

        // Dismiss any dialogs that might appear during walk
        if (ctx.state()?.dialog?.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
        }
    }
    return true;
}

// ============ Banking at Varrock West ============

async function bankAtVarrockWest(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const hidesBeforeTrip = countItem(ctx, /cow\s*hide/i);
    if (hidesBeforeTrip === 0) {
        ctx.log('No hides to bank, skipping');
        return true;
    }

    ctx.log(`=== Banking Trip (${hidesBeforeTrip} hides) ===`);
    stats.bankTrips++;

    // Walk to Varrock West Bank using waypoints
    ctx.log('Walking to Varrock West Bank...');
    await walkWaypoints(ctx, WAYPOINTS_COWS_TO_BANK, stats);

    // Debug: Log position and nearby objects
    const player = ctx.state()?.player;
    ctx.log(`At bank area: (${player?.worldX}, ${player?.worldZ})`);

    const nearbyNpcs = ctx.state()?.nearbyNpcs.slice(0, 10) ?? [];
    ctx.log(`Nearby NPCs: ${nearbyNpcs.map(n => `${n.name}(${n.distance})`).join(', ')}`);

    // Open bank via banker NPC (more reliable)
    let bankOpened = false;
    const banker = ctx.sdk.findNearbyNpc(/banker/i);

    if (banker) {
        const bankOpt = banker.optionsWithIndex.find(o => /bank/i.test(o.text));
        if (bankOpt) {
            ctx.log(`Using banker (${banker.name})...`);
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
            await new Promise(r => setTimeout(r, 1500));

            // Wait for bank interface
            for (let i = 0; i < 20 && !bankOpened; i++) {
                const state = ctx.state();
                if (state?.interface?.isOpen) {
                    bankOpened = true;
                    ctx.log('Bank opened!');
                    break;
                }
                if (state?.dialog?.isOpen) {
                    await ctx.sdk.sendClickDialog(0);
                    await new Promise(r => setTimeout(r, 200));
                }
                await new Promise(r => setTimeout(r, 300));
                markProgress(ctx, stats);
            }
        }
    } else {
        ctx.warn('No banker found nearby!');
    }

    // Try bank booth as fallback
    if (!bankOpened) {
        const bankBooth = ctx.state()?.nearbyLocs.find(l => /bank booth|bank chest/i.test(l.name));
        if (bankBooth) {
            const bankOpt = bankBooth.optionsWithIndex.find(o => /bank/i.test(o.text)) ||
                           bankBooth.optionsWithIndex[0];
            if (bankOpt) {
                ctx.log(`Using bank booth fallback...`);
                await ctx.sdk.sendInteractLoc(bankBooth.x, bankBooth.z, bankBooth.id, bankOpt.opIndex);
                await new Promise(r => setTimeout(r, 1500));

                for (let i = 0; i < 15 && !bankOpened; i++) {
                    const state = ctx.state();
                    if (state?.interface?.isOpen) {
                        bankOpened = true;
                        ctx.log('Bank opened!');
                        break;
                    }
                    if (state?.dialog?.isOpen) {
                        await ctx.sdk.sendClickDialog(0);
                        await new Promise(r => setTimeout(r, 200));
                    }
                    await new Promise(r => setTimeout(r, 300));
                    markProgress(ctx, stats);
                }
            }
        }
    }

    if (!bankOpened) {
        ctx.warn('Failed to open bank - will drop hides instead');
        stats.failedBankTrips++;

        // Drop hides as fallback
        const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
        for (const hide of hides) {
            await ctx.sdk.sendDropItem(hide.slot);
            await new Promise(r => setTimeout(r, 100));
        }
        ctx.log(`Dropped ${hides.length} hides (bank failed)`);

        // Return to cow field
        await returnToCowField(ctx, stats);
        return false;
    }

    // Deposit cowhides
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    ctx.log(`Depositing ${hides.length} cowhides...`);

    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count);
        await new Promise(r => setTimeout(r, 200));
    }
    await new Promise(r => setTimeout(r, 500));

    // Also deposit raw beef (can cook later)
    const beef = ctx.state()?.inventory.filter(i => /raw\s*beef/i.test(i.name)) ?? [];
    for (const item of beef) {
        await ctx.sdk.sendBankDeposit(item.slot, item.count);
        await new Promise(r => setTimeout(r, 200));
    }

    // Verify deposit
    const hidesAfter = countItem(ctx, /cow\s*hide/i);
    const deposited = hidesBeforeTrip - hidesAfter;
    if (deposited > 0) {
        stats.hidesBanked += deposited;
        ctx.log(`Deposited ${deposited} hides. Total banked: ${stats.hidesBanked}`);
    } else {
        ctx.warn('Deposit may have failed - hides still in inventory');
    }

    markProgress(ctx, stats);

    // Close bank
    await ctx.bot.closeShop();
    await new Promise(r => setTimeout(r, 500));

    // Return to cow field
    await returnToCowField(ctx, stats);
    return true;
}

async function returnToCowField(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('Returning to cow field...');
    await walkWaypoints(ctx, WAYPOINTS_BANK_TO_COWS, stats);
    ctx.log('Back at cow field!');
}

// ============ Main Loop ============

async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('=== Cowhide Grind Started ===');
    let loopCount = 0;
    let lastStyleUpdate = 0;
    let invalidStateCount = 0;

    while (true) {
        loopCount++;

        // Periodic logging
        if (loopCount % 50 === 0) {
            const hp = getHP(ctx);
            const groundItems = ctx.sdk.getGroundItems().slice(0, 5);
            const groundSummary = groundItems.length > 0
                ? groundItems.map(i => `${i.name}(${i.distance.toFixed(0)})`).join(', ')
                : 'none';
            ctx.log(`Loop ${loopCount}: Kills=${stats.kills}, Hides=${stats.hidesCollected}, Banked=${stats.hidesBanked}, HP=${hp.current}/${hp.max}`);
            ctx.log(`  Ground items: ${groundSummary}`);
        }

        // Update combat style periodically
        if (loopCount - lastStyleUpdate >= 200) {
            await setOptimalCombatStyle(ctx);
            lastStyleUpdate = loopCount;
        }

        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Eat food if needed
        if (await eatFoodIfNeeded(ctx, stats)) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Drop junk to make space for hides (bones, raw beef)
        const invSize = getInventoryCount(ctx);
        if (invSize >= MAX_INVENTORY_SIZE) {
            const junk = currentState.inventory.find(i => /^(bones|raw beef)$/i.test(i.name));
            if (junk) {
                await ctx.sdk.sendDropItem(junk.slot);
                await new Promise(r => setTimeout(r, 100));
                markProgress(ctx, stats);
                continue;
            }
        }

        // Check if we should bank (count hides specifically)
        const hideCount = countItem(ctx, /hide/i);
        if (hideCount >= BANK_THRESHOLD) {
            ctx.log(`Inventory has ${hideCount} hides - time to bank!`);
            await bankAtVarrockWest(ctx, stats);
            continue;
        }

        // Check if we're outside the cow field fence
        if (isOutsideCowField(ctx)) {
            ctx.log('Outside cow field fence, entering through gate...');
            await enterCowFieldThroughGate(ctx, stats);
            continue;
        }

        // Check player state
        const player = currentState.player;
        if (!player || player.worldX === 0) {
            // Invalid state - wait a bit for state to stabilize
            invalidStateCount++;
            if (invalidStateCount > 30) {
                ctx.error('Too many invalid player states - connection likely lost');
                break;
            }
            if (invalidStateCount % 5 === 1) {
                ctx.warn(`Invalid player state (${invalidStateCount}/30), waiting...`);
            }
            await new Promise(r => setTimeout(r, 1000));
            markProgress(ctx, stats);
            continue;
        }
        invalidStateCount = 0;

        // Check drift from cow field
        const dist = Math.sqrt(
            Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
            Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
        );
        if (dist > 50) {
            ctx.log(`Drifted ${dist.toFixed(0)} tiles, walking to cow field via waypoints...`);
            // Use waypoints for long distance walking
            await walkWaypoints(ctx, WAYPOINTS_BANK_TO_COWS.slice(-4), stats);  // Use last 4 waypoints
            markProgress(ctx, stats);
            continue;
        }

        // Find cow to attack
        const cow = findCow(ctx);
        if (!cow) {
            // No cows - walk around a bit
            const px = player.worldX;
            const pz = player.worldZ;
            await ctx.sdk.sendWalk(px + (Math.random() * 10 - 5), pz + (Math.random() * 10 - 5), true);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // ALWAYS try to pick up loot first (priority over attacking)
        // Debug every 100 loops
        if (loopCount % 100 === 1) {
            const items = ctx.sdk.getGroundItems();
            const hides = items.filter(i => i.name.toLowerCase().includes('hide'));
            ctx.log(`[DEBUG L${loopCount}] Ground items: ${items.length}, hides: ${hides.length}, inv size: ${currentState.inventory.length}`);
            const firstHide = hides[0];
            if (firstHide) {
                ctx.log(`  First hide: "${firstHide.name}" at dist=${firstHide.distance.toFixed(1)}`);
            }
        }

        const hidesBefore = stats.hidesCollected;
        await pickupLoot(ctx, stats);
        if (stats.hidesCollected > hidesBefore) {
            // Successfully picked up loot, continue
            continue;
        }

        // Check if actively attacking (animation playing)
        const animId = player.animId;
        const isAttacking = animId !== -1 && animId !== 808; // 808 = idle standing

        // If not actively animating, attack a cow
        if (!isAttacking) {
            // Attack cow
            const attackOpt = cow.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                await ctx.sdk.sendInteractNpc(cow.index, attackOpt.opIndex);
                stats.kills++;
                markProgress(ctx, stats);

                // Wait for attack to connect (game tick is 600ms)
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
        }

        // Wait while attacking - check periodically
        await new Promise(r => setTimeout(r, 400));
        markProgress(ctx, stats);
    }
}

function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;
    const atk = getAttackLevel(ctx);
    const str = getStrengthLevel(ctx);
    const def = getDefenceLevel(ctx);
    const hp = getHP(ctx);
    const coins = getCoins(ctx);
    const totalLevel = getTotalLevel(ctx);

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Kills: ${stats.kills}`);
    ctx.log(`Hides: Collected=${stats.hidesCollected}, Banked=${stats.hidesBanked}`);
    ctx.log(`Bank trips: ${stats.bankTrips} (failed: ${stats.failedBankTrips})`);
    ctx.log(`Food eaten: ${stats.foodEaten}`);
    ctx.log(`Combat: Attack=${atk}, Strength=${str}, Defence=${def}, HP=${hp.max}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log(`GP: ${coins}`);
    ctx.log(`Score: ${totalLevel + coins}`);
    ctx.log('');
}

// ============ Run Arc ============

runArc({
    characterName: 'Adam_4',
    arcName: 'cowhide-grind',
    goal: 'Combat training + bank cowhides at Varrock West Bank',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 120_000,  // 120s stall timeout (Varrock walk is longer)
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
        bankTrips: 0,
        failedBankTrips: 0,
        foodEaten: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    // Wait for valid game state (position != 0,0)
    ctx.log('Waiting for game state...');
    let stateLoaded = false;
    for (let i = 0; i < 60; i++) {
        const state = ctx.state();
        if (state?.player?.worldX !== 0 && state?.player?.worldZ !== 0) {
            ctx.log(`State loaded after ${i * 500}ms`);
            stateLoaded = true;
            break;
        }
        if (i % 10 === 0) {
            ctx.log(`Waiting for state... (${i * 500}ms)`);
        }
        await new Promise(r => setTimeout(r, 500));
        markProgress(ctx, stats);
    }
    if (!stateLoaded) {
        ctx.warn('State never loaded - will attempt to continue anyway');
    }

    ctx.log('=== Arc: cowhide-grind (Adam_4) ===');
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
    ctx.log(`Combat: Atk=${getAttackLevel(ctx)} Str=${getStrengthLevel(ctx)} Def=${getDefenceLevel(ctx)}`);
    ctx.log(`Inventory: ${getInventoryCount(ctx)} items, ${countItem(ctx, /cow\s*hide/i)} hides`);

    // Equip any weapon in inventory
    const weapon = ctx.sdk.getInventory().find(i => /sword|scimitar|dagger/i.test(i.name));
    if (weapon) {
        const wieldOpt = weapon.optionsWithIndex.find(o => /wield|wear/i.test(o.text));
        if (wieldOpt) {
            ctx.log(`Equipping ${weapon.name}...`);
            await ctx.sdk.sendUseItem(weapon.slot, wieldOpt.opIndex);
            markProgress(ctx, stats);
        }
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Drop junk items to make inventory space for cowhides
    const invCount = getInventoryCount(ctx);
    if (invCount >= 20) {
        ctx.log(`Inventory has ${invCount} items - dropping non-essentials to make space...`);

        // Items to drop (low value, not useful)
        const junkPatterns = [
            /bones/i,        // Bones (from cows)
            /raw beef/i,     // Raw beef
            /bucket/i,       // Bucket
            /pot$/i,         // Pot
            /tinderbox/i,    // Tinderbox
            /bronze axe/i,   // Bronze axe
            /bronze pickaxe/i, // Bronze pickaxe
            /wooden shield/i, // Wooden shield
            /shortbow/i,     // Shortbow
            /bronze arrow/i, // Bronze arrows
            /air rune/i,     // Air runes
            /mind rune/i,    // Mind runes
            /water rune/i,   // Water runes
            /earth rune/i,   // Earth runes
            /body rune/i,    // Body runes
            /fishing net/i,  // Fishing net
        ];

        const inventory = ctx.state()?.inventory ?? [];
        for (const item of inventory) {
            if (junkPatterns.some(p => p.test(item.name))) {
                ctx.log(`Dropping: ${item.name}`);
                await ctx.sdk.sendDropItem(item.slot);
                await new Promise(r => setTimeout(r, 150));
                markProgress(ctx, stats);

                // Stop when we have enough space (keep ~10 items free)
                if (getInventoryCount(ctx) <= 18) break;
            }
        }

        ctx.log(`Inventory now has ${getInventoryCount(ctx)} items`);
    }

    // Set initial combat style
    await setOptimalCombatStyle(ctx);

    // Walk to cow field if not already there
    const player = ctx.state()?.player;
    if (player && player.worldX > 0 && player.worldZ > 0) {
        const dist = Math.sqrt(
            Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
            Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
        );
        if (dist > 20) {
            ctx.log('Walking to cow field...');
            await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
            markProgress(ctx, stats);
        } else {
            ctx.log('Already at cow field, starting combat...');
        }
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
