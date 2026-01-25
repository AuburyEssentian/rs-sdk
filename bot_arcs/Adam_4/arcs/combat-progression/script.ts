/**
 * Arc: combat-progression
 * Character: Adam_4
 *
 * Goal: Train combat (70+ atk/str/def), collect cowhides for GP, bank them.
 *
 * Strategy:
 * 1. Fight cows at Lumbridge cow field
 * 2. Collect cowhides + raw beef
 * 3. When inventory near full, bank at Lumbridge Castle (2nd floor)
 * 4. Eat food when HP < 50%
 * 5. Rotate combat styles for balanced training (focus on lowest skill)
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc, NearbyLoc } from '../../../../agent/types.ts';

// Locations
const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3270 },           // Lumbridge cow field (inside)
    COW_FIELD_GATE: { x: 3253, z: 3255 },      // Gate to enter cow field
    CASTLE_ENTRANCE: { x: 3210, z: 3217 },     // Castle main entrance
    STAIRS_GROUND: { x: 3206, z: 3208 },       // Stairs inside castle ground floor
    BANK: { x: 3208, z: 3220 },                // Lumbridge Castle bank (top floor)
};

// Thresholds
const BANK_THRESHOLD = 27;      // Bank when inventory has this many items (max is 28)
const HP_EAT_THRESHOLD = 0.5;   // Eat when HP below 50%
const MAX_FAILED_BANK_TRIPS = 0; // Set to 0 to always drop (skip banking for now - causes crashes)

interface Stats {
    kills: number;
    hidesCollected: number;
    hidesBanked: number;
    hidesDropped: number;
    beefCollected: number;
    foodEaten: number;
    bankTrips: number;
    failedBankTrips: number;
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
    // If z < 3257, we're south of the fence (outside)
    return player.worldZ < 3257 && player.worldX > 3240 && player.worldX < 3270;
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
    if (!state || state.inventory.length >= 26) return 0;

    // Pick up cowhides, raw beef, coins (skip bones)
    // Only try items that are VERY close (distance <= 3) to avoid pathing issues
    const groundItems = ctx.sdk.getGroundItems()
        .filter(i => /cow\s*hide|raw\s*beef|coins/i.test(i.name))
        .filter(i => i.distance <= 3)
        .sort((a, b) => a.distance - b.distance);

    // Only try ONE item per tick to avoid timeouts
    const item = groundItems[0];
    if (!item) return 0;

    // Use raw SDK call instead of bot.pickupItem to avoid waiting
    await ctx.sdk.sendPickup(item.x, item.z, item.id);
    await new Promise(r => setTimeout(r, 600));  // Brief wait

    // Check if we got it (opportunistic)
    const newCount = countItem(ctx, /cow\s*hide/i);
    if (newCount > stats.hidesCollected) {
        pickedUp = newCount - stats.hidesCollected;
        stats.hidesCollected = newCount;
        ctx.log(`Picked up cowhide! (total: ${stats.hidesCollected})`);
    }
    markProgress(ctx, stats);

    return pickedUp;
}

// ============ Banking ============

async function climbStairs(ctx: ScriptContext, direction: 'up' | 'down'): Promise<boolean> {
    const stairs = ctx.state()?.nearbyLocs.find(l => /staircase/i.test(l.name));
    if (!stairs) {
        ctx.warn('No staircase found nearby');
        return false;
    }

    const pattern = direction === 'up' ? /climb.?up/i : /climb.?down/i;
    const climbOpt = stairs.optionsWithIndex.find(o => pattern.test(o.text));
    if (!climbOpt) {
        ctx.warn(`No ${direction} option on stairs`);
        return false;
    }

    ctx.log(`Climbing ${direction}...`);
    await ctx.sdk.sendInteractLoc(stairs.x, stairs.z, stairs.id, climbOpt.opIndex);
    await new Promise(r => setTimeout(r, 2000));
    ctx.progress();
    return true;
}

async function dropHidesToContinue(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('=== Dropping hides to continue training ===');
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];

    for (const hide of hides) {
        await ctx.sdk.sendDropItem(hide.slot);
        stats.hidesDropped += hide.count;
        await new Promise(r => setTimeout(r, 100));
    }

    ctx.log(`Dropped ${hides.length} hides. Total dropped: ${stats.hidesDropped}`);
    markProgress(ctx, stats);
}

async function bankHides(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    // Check if we should just drop instead
    if (stats.failedBankTrips >= MAX_FAILED_BANK_TRIPS) {
        ctx.log(`Banking failed ${stats.failedBankTrips} times, falling back to dropping hides`);
        await dropHidesToContinue(ctx, stats);
        return true;
    }

    ctx.log('=== Banking Trip ===');
    stats.bankTrips++;

    const hidesBeforeTrip = countItem(ctx, /cow\s*hide/i);
    if (hidesBeforeTrip === 0) {
        ctx.log('No hides to bank, skipping');
        return true;
    }

    // Walk to castle entrance
    ctx.log('Walking to castle...');
    await ctx.bot.walkTo(LOCATIONS.CASTLE_ENTRANCE.x, LOCATIONS.CASTLE_ENTRANCE.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 500));

    // Walk inside to stairs (need to be closer to find them)
    ctx.log('Walking inside to stairs...');
    await ctx.bot.walkTo(LOCATIONS.STAIRS_GROUND.x, LOCATIONS.STAIRS_GROUND.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 500));

    // Debug: Log what's nearby
    const nearbyLocs = ctx.state()?.nearbyLocs.slice(0, 10) ?? [];
    ctx.log(`Nearby locs: ${nearbyLocs.map(l => `${l.name}(${l.distance})`).join(', ')}`);

    // Climb to first floor
    const currentLevel = ctx.state()?.player?.level ?? 0;
    ctx.log(`Current floor: ${currentLevel}`);

    if (currentLevel === 0) {
        if (!await climbStairs(ctx, 'up')) {
            ctx.warn('Failed to climb first stairs - banking failed');
            stats.failedBankTrips++;
            await returnToCowField(ctx, stats);
            return false;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Climb to second floor
    const midLevel = ctx.state()?.player?.level ?? 0;
    ctx.log(`After first climb, floor: ${midLevel}`);

    if (midLevel === 1) {
        if (!await climbStairs(ctx, 'up')) {
            ctx.warn('Failed to climb second stairs - banking failed');
            stats.failedBankTrips++;
            await returnToCowField(ctx, stats);
            return false;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Walk to bank area
    ctx.log('Walking to bank...');
    await ctx.bot.walkTo(LOCATIONS.BANK.x, LOCATIONS.BANK.z);
    markProgress(ctx, stats);

    // Debug: Log what's nearby
    const nearbyAtBank = ctx.state()?.nearbyLocs.slice(0, 10) ?? [];
    const nearbyNpcs = ctx.state()?.nearbyNpcs.slice(0, 10) ?? [];
    ctx.log(`At bank - Locs: ${nearbyAtBank.map(l => `${l.name}(${l.distance})`).join(', ')}`);
    ctx.log(`At bank - NPCs: ${nearbyNpcs.map(n => `${n.name}(${n.distance})`).join(', ')}`);

    // Open bank
    let bankOpened = false;

    // Try bank booth first
    const bankBooth = ctx.state()?.nearbyLocs.find(l => /bank booth|bank chest/i.test(l.name));
    if (bankBooth) {
        const bankOpt = bankBooth.optionsWithIndex.find(o => /^bank$/i.test(o.text)) ||
                       bankBooth.optionsWithIndex[0];
        if (bankOpt) {
            ctx.log(`Using bank booth (${bankOpt.text})...`);
            await ctx.sdk.sendInteractLoc(bankBooth.x, bankBooth.z, bankBooth.id, bankOpt.opIndex);
            await new Promise(r => setTimeout(r, 1500));

            // Wait for bank interface
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

    // Try banker NPC if booth didn't work
    if (!bankOpened) {
        const banker = ctx.sdk.findNearbyNpc(/banker/i);
        if (banker) {
            const bankOpt = banker.optionsWithIndex.find(o => /bank/i.test(o.text));
            if (bankOpt) {
                ctx.log(`Using banker (${banker.name})...`);
                await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
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
        ctx.warn('Failed to open bank');
        stats.failedBankTrips++;
        await returnToCowField(ctx, stats);
        return false;
    }

    // Reset failed count on success
    stats.failedBankTrips = 0;

    // Deposit cowhides
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    ctx.log(`Depositing ${hides.length} cowhides...`);

    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count);
        await new Promise(r => setTimeout(r, 200));
    }
    await new Promise(r => setTimeout(r, 500));

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

    // Return to cow field
    await returnToCowField(ctx, stats);
    return true;
}

async function returnToCowField(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('Returning to cow field...');

    // Climb down stairs
    const currentLevel = ctx.state()?.player?.level ?? 0;
    if (currentLevel >= 2) {
        await climbStairs(ctx, 'down');
    }
    if ((ctx.state()?.player?.level ?? 0) >= 1) {
        await climbStairs(ctx, 'down');
    }

    // Walk back to cow field
    await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
    markProgress(ctx, stats);
    ctx.log('Back at cow field!');
}

// ============ Main Loop ============

async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    ctx.log('=== Combat Progression Started ===');
    let loopCount = 0;
    let lastStyleUpdate = 0;
    let invalidStateCount = 0;

    while (true) {
        loopCount++;

        // Periodic logging
        if (loopCount % 50 === 0) {
            const hp = getHP(ctx);
            ctx.log(`Loop ${loopCount}: Kills=${stats.kills}, Hides=${stats.hidesCollected}, Banked=${stats.hidesBanked}, HP=${hp.current}/${hp.max}`);
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

        // Check if we should drop non-essentials when inventory is getting full
        const invCount = getInventoryCount(ctx);
        if (invCount >= BANK_THRESHOLD) {
            // Drop bones, raw beef, and hides to make space (we're not banking, just training)
            const droppable = currentState.inventory.filter(i => /bones|raw\s*beef|cow\s*hide/i.test(i.name));
            if (droppable.length > 0) {
                ctx.log(`Dropping ${droppable.length} items to make space...`);
                for (const item of droppable.slice(0, 5)) {
                    await ctx.sdk.sendDropItem(item.slot);
                    stats.hidesDropped += /cow\s*hide/i.test(item.name) ? item.count : 0;
                    await new Promise(r => setTimeout(r, 150));
                }
                markProgress(ctx, stats);
                continue;
            }
            // Inventory full but nothing droppable - just continue combat
        }

        // Check if we're outside the cow field fence
        if (isOutsideCowField(ctx)) {
            ctx.log('Outside cow field fence, entering through gate...');
            await enterCowFieldThroughGate(ctx, stats);
            continue;
        }

        // Check drift from cow field
        const player = currentState.player;
        if (player && player.worldX > 0 && player.worldZ > 0) {
            const dist = Math.sqrt(
                Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
                Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
            );
            if (dist > 35) {
                ctx.log(`Drifted ${dist.toFixed(0)} tiles, returning to cow field...`);
                await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
                markProgress(ctx, stats);
                continue;
            }
        } else if (!player || player.worldX === 0) {
            // Invalid state - wait a bit for state to stabilize
            invalidStateCount++;
            if (invalidStateCount > 30) {  // Allow up to 30 seconds of invalid state
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
        // Reset invalid state counter on valid state
        invalidStateCount = 0;

        // Find cow to attack
        const cow = findCow(ctx);
        if (!cow) {
            // No cows - walk around a bit
            const px = player?.worldX ?? LOCATIONS.COW_FIELD.x;
            const pz = player?.worldZ ?? LOCATIONS.COW_FIELD.z;
            await ctx.sdk.sendWalk(px + (Math.random() * 10 - 5), pz + (Math.random() * 10 - 5), true);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check if actively attacking (animation playing)
        const animId = player?.animId;
        const isAttacking = animId !== -1 && animId !== 808; // 808 = idle standing

        // Debug log every 200 loops
        if (loopCount % 200 === 1) {
            ctx.log(`DEBUG: animId=${animId}, isAttacking=${isAttacking}, cow=${cow?.name} dist=${cow?.distance}`);
        }

        // If not actively animating, try to attack
        if (!isAttacking) {
            // First, opportunistically try to pickup loot if very close
            await pickupLoot(ctx, stats);

            // Attack cow
            const attackOpt = cow.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                await ctx.sdk.sendInteractNpc(cow.index, attackOpt.opIndex);
                stats.kills++;
                markProgress(ctx, stats);

                // Wait for attack to connect (game tick is 600ms)
                await new Promise(r => setTimeout(r, 1200));
                continue;
            }
        }

        // Wait while attacking - check periodically
        await new Promise(r => setTimeout(r, 600));
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
    ctx.log(`Hides: Collected=${stats.hidesCollected}, Banked=${stats.hidesBanked}, Dropped=${stats.hidesDropped}`);
    ctx.log(`Food eaten: ${stats.foodEaten}`);
    ctx.log(`Bank trips: ${stats.bankTrips}`);
    ctx.log(`Combat: Attack=${atk}, Strength=${str}, Defence=${def}, HP=${hp.max}`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log(`GP: ${coins}`);
    ctx.log(`Score: ${totalLevel + coins}`);
    ctx.log('');
}

// ============ Run Arc ============

runArc({
    characterName: 'Adam_4',
    arcName: 'combat-progression',
    goal: 'Train combat, bank cowhides for GP',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,  // Use dedicated browser to fix state sync
        headless: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        hidesCollected: 0,
        hidesBanked: 0,
        hidesDropped: 0,
        beefCollected: 0,
        foodEaten: 0,
        bankTrips: 0,
        failedBankTrips: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    // Wait for valid game state (position != 0,0) - with extended timeout
    ctx.log('Waiting for game state...');
    let stateLoaded = false;
    for (let i = 0; i < 60; i++) {  // 30 seconds max
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

    ctx.log('=== Arc: combat-progression (Adam_4) ===');
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
    ctx.log(`Combat: Atk=${getAttackLevel(ctx)} Str=${getStrengthLevel(ctx)} Def=${getDefenceLevel(ctx)}`);
    ctx.log(`Inventory: ${getInventoryCount(ctx)} items`);

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

    // Clear inventory of non-essential items if full
    const invCount = getInventoryCount(ctx);
    if (invCount >= 20) {
        ctx.log(`Inventory has ${invCount} items, clearing non-essentials...`);

        // Drop bones first
        const bones = ctx.state()?.inventory.filter(i => /bones/i.test(i.name)) ?? [];
        for (const bone of bones) {
            await ctx.sdk.sendDropItem(bone.slot);
            await new Promise(r => setTimeout(r, 100));
        }

        // If still too full, drop hides
        if (getInventoryCount(ctx) >= 24) {
            await dropHidesToContinue(ctx, stats);
        }
    }

    // Set initial combat style
    await setOptimalCombatStyle(ctx);

    // Walk to cow field if not already there (skip if invalid state)
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
    } else {
        ctx.log('Waiting for valid state before walking...');
        await new Promise(r => setTimeout(r, 2000));
        markProgress(ctx, stats);
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
