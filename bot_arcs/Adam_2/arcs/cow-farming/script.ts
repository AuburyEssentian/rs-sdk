/**
 * Arc: cow-farming
 * Character: Adam_2
 *
 * Kill cows, collect hides, sell to Lumbridge general store when full.
 * Short walks only - designed for connection stability.
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

const COW_FIELD = { x: 3253, z: 3269 };
const LUMBRIDGE_STORE = { x: 3211, z: 3247 };
const HIDE_THRESHOLD = 20;  // Sell when we have this many hides

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function getSkillLevel(ctx: ScriptContext, skillName: string): number {
    return ctx.sdk.getSkill(skillName)?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

function getLowestCombatStat(ctx: ScriptContext): { name: string; level: number } {
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');

    if (def <= atk && def <= str) return { name: 'Defence', level: def };
    if (atk <= str) return { name: 'Attack', level: atk };
    return { name: 'Strength', level: str };
}

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

async function pickupLoot(ctx: ScriptContext): Promise<number> {
    let pickedUp = 0;
    const state = ctx.state();
    if (!state || state.inventory.length >= 28) return 0;

    const groundItems = ctx.sdk.getGroundItems()
        .filter(i => /cow\s*hide/i.test(i.name))  // Only hides, ignore beef
        .filter(i => i.distance <= 8)
        .sort((a, b) => a.distance - b.distance);

    for (const item of groundItems.slice(0, 2)) {
        if (ctx.state()!.inventory.length >= 28) break;

        const result = await ctx.bot.pickupItem(item);
        if (result.success) {
            pickedUp++;
            ctx.log(`Picked up ${item.name}`);
            markProgress(ctx);
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return pickedUp;
}

async function dropJunk(ctx: ScriptContext): Promise<number> {
    const junkItems = ctx.state()?.inventory.filter(i =>
        /raw\s*beef|bones|logs|ore/i.test(i.name)
    ) ?? [];

    let dropped = 0;
    for (const item of junkItems) {
        await ctx.sdk.sendDropItem(item.slot);
        dropped++;
        await new Promise(r => setTimeout(r, 150));
        markProgress(ctx);
    }

    if (dropped > 0) {
        ctx.log(`Dropped ${dropped} junk items`);
    }
    return dropped;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /^coins$/i.test(i.name));
    return coins?.count ?? 0;
}

async function sellHides(ctx: ScriptContext): Promise<number> {
    const hides = countItem(ctx, /cow\s*hide/i);
    ctx.log(`=== Selling ${hides} hides ===`);

    // Walk to Lumbridge store
    ctx.log('Walking to Lumbridge store...');
    await ctx.bot.walkTo(LUMBRIDGE_STORE.x, LUMBRIDGE_STORE.z);
    markProgress(ctx);

    // Wait to arrive
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500));
        markProgress(ctx);

        if (ctx.state()?.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
        }

        const player = ctx.state()?.player;
        if (player) {
            const dist = Math.sqrt(
                Math.pow(player.worldX - LUMBRIDGE_STORE.x, 2) +
                Math.pow(player.worldZ - LUMBRIDGE_STORE.z, 2)
            );
            if (dist < 10) break;
        }
    }

    await new Promise(r => setTimeout(r, 500));

    // Find shopkeeper
    const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop.?keeper/i.test(n.name));
    if (!shopkeeper) {
        ctx.warn('No shopkeeper found');
        return 0;
    }

    const tradeOpt = shopkeeper.optionsWithIndex?.find(o => /trade/i.test(o.text));
    if (!tradeOpt) {
        ctx.warn('No trade option');
        return 0;
    }

    await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);
    markProgress(ctx);

    // Wait for shop to open
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.shop?.isOpen) break;
        markProgress(ctx);
    }

    // Sell hides
    const gpBefore = getCoins(ctx);
    let sold = 0;

    for (let attempt = 0; attempt < 30; attempt++) {
        if (countItem(ctx, /cow\s*hide/i) === 0) break;

        const result = await ctx.bot.sellToShop(/cow\s*hide/i, 1);
        if (result.success) {
            sold++;
        } else {
            ctx.warn(`Sell failed: ${result.message}`);
            break;
        }
        await new Promise(r => setTimeout(r, 150));
        markProgress(ctx);
    }

    const gpAfter = getCoins(ctx);
    ctx.log(`Sold ${sold} hides for ${gpAfter - gpBefore}gp (total: ${gpAfter}gp)`);

    await ctx.bot.closeShop();
    markProgress(ctx);

    // Return to cow field
    ctx.log('Returning to cow field...');
    await ctx.bot.walkTo(COW_FIELD.x, COW_FIELD.z);
    markProgress(ctx);

    // Wait to arrive and open gate
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500));
        markProgress(ctx);

        if (ctx.state()?.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
        }

        const player = ctx.state()?.player;
        if (player) {
            const dist = Math.sqrt(
                Math.pow(player.worldX - COW_FIELD.x, 2) +
                Math.pow(player.worldZ - COW_FIELD.z, 2)
            );
            if (dist < 15) break;
        }
    }

    await ctx.bot.openDoor(/gate/i);
    markProgress(ctx);

    return sold;
}

runArc({
    characterName: 'Adam_2',
    arcName: 'cow-farming',
    goal: 'Farm cows for hides (no banking)',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
}, async (ctx) => {
    ctx.log('=== Arc: cow-farming ===');
    ctx.log('Goal: Kill cows, collect hides, train combat');

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    // Drop junk to make room for hides
    ctx.log('Dropping junk items...');
    await dropJunk(ctx);

    const startLevel = getTotalLevel(ctx);
    const startHides = countItem(ctx, /cow\s*hide/i);
    ctx.log(`Starting: Total Level=${startLevel}, Hides=${startHides}`);

    // Set combat style to train lowest stat
    const lowestStat = getLowestCombatStat(ctx);
    await setCombatStyle(ctx, lowestStat.name);

    // Equip weapon if not equipped
    const weapon = ctx.sdk.getInventory().find(i =>
        /scimitar|sword/i.test(i.name) && !/pickaxe/i.test(i.name)
    );
    if (weapon) {
        ctx.log(`Equipping ${weapon.name}...`);
        await ctx.bot.equipItem(weapon);
    }

    // Make sure we're inside cow field
    await ctx.bot.openDoor(/gate/i);
    markProgress(ctx);

    let kills = 0;
    let loopCount = 0;

    while (true) {
        loopCount++;
        const state = ctx.state();
        if (!state) break;

        // Log status periodically
        if (loopCount % 30 === 0) {
            const hides = countItem(ctx, /cow\s*hide/i);
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            ctx.log(`Loop ${loopCount}: Kills=${kills}, Hides=${hides}, Atk=${atk} Str=${str} Def=${def}`);
        }

        // Rotate combat style every 50 loops
        if (loopCount % 50 === 0) {
            const lowest = getLowestCombatStat(ctx);
            await setCombatStyle(ctx, lowest.name);
        }

        // Dismiss dialogs
        if (state.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx);
            continue;
        }

        // Check if we should sell hides
        const hides = countItem(ctx, /cow\s*hide/i);
        if (hides >= HIDE_THRESHOLD || state.inventory.length >= 28) {
            if (hides > 0) {
                await sellHides(ctx);
                continue;
            } else {
                // Inventory full with no hides - try to drop junk
                const dropped = await dropJunk(ctx);
                if (dropped === 0) {
                    ctx.log('Cannot make more room - stopping arc');
                    break;
                }
                continue;
            }
        }

        // Check if idle
        const player = state.player;
        const isIdle = player?.animId === -1;

        if (isIdle) {
            // Try to loot first
            const looted = await pickupLoot(ctx);
            if (looted > 0) continue;

            // Find and attack cow
            const cow = findCow(ctx);
            if (cow) {
                const result = await ctx.bot.attackNpc(cow);
                if (result.success) {
                    kills++;
                    markProgress(ctx);
                    await new Promise(r => setTimeout(r, 1500));
                } else if (result.reason === 'out_of_reach') {
                    await ctx.bot.openDoor(/gate/i);
                    markProgress(ctx);
                }
            } else {
                // No cows, wander a bit
                await ctx.sdk.sendWalk(
                    COW_FIELD.x + (Math.random() * 10 - 5),
                    COW_FIELD.z + (Math.random() * 10 - 5),
                    true
                );
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx);
    }

    // Final stats
    const endLevel = getTotalLevel(ctx);
    const endHides = countItem(ctx, /cow\s*hide/i);
    ctx.log('');
    ctx.log('=== Results ===');
    ctx.log(`Kills: ${kills}`);
    ctx.log(`Hides: ${startHides} → ${endHides} (+${endHides - startHides})`);
    ctx.log(`Total Level: ${startLevel} → ${endLevel} (+${endLevel - startLevel})`);
});
