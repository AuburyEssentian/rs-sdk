/**
 * Arc: combat-thief-drip
 * Character: Brad_3
 *
 * Goal: Combat training + Thieving for GP + Varrock armor upgrades
 *
 * Strategy:
 * 1. Check current gear vs what we can afford
 * 2. If we can upgrade: thieve until we have enough GP, then shop in Varrock
 * 3. Otherwise: train combat at cow field
 * 4. Cycle combat styles to train lowest stat
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

// ==================== LOCATIONS ====================

const LOCATIONS = {
    LUMBRIDGE_SPAWN: { x: 3222, z: 3218 },
    COW_FIELD: { x: 3253, z: 3269 },
    COW_GATE: { x: 3253, z: 3267 },
    LUMBRIDGE_MEN: { x: 3235, z: 3218 },  // Near Lumbridge castle
    VARROCK_CENTER: { x: 3212, z: 3428 },
    VARROCK_SWORD_SHOP: { x: 3205, z: 3398 },
    VARROCK_ARMOUR_SHOP: { x: 3195, z: 3427 },
};

// Gear tiers with prices
const GEAR_TIERS = [
    { level: 1, tier: 'Bronze', swordPrice: 26, bodyPrice: 80, legPrice: 65, totalCost: 171 },
    { level: 5, tier: 'Iron', swordPrice: 91, bodyPrice: 280, legPrice: 210, totalCost: 581 },
    { level: 10, tier: 'Steel', swordPrice: 325, bodyPrice: 1000, legPrice: 750, totalCost: 2075 },
    { level: 20, tier: 'Mithril', swordPrice: 845, bodyPrice: 2600, legPrice: 1950, totalCost: 5395 },
    { level: 30, tier: 'Adamant', swordPrice: 2080, bodyPrice: 6400, legPrice: 4800, totalCost: 13280 },
];

// ==================== STATS ====================

interface Stats {
    kills: number;
    pickpockets: number;
    coinsGained: number;
    gearPurchased: string[];
    startTime: number;
    lastProgressTime: number;
    startAttack: number;
    startStrength: number;
    startDefence: number;
    startThieving: number;
    startTotalLevel: number;
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

function getCurrentHP(ctx: ScriptContext): number {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return hp?.level ?? hp?.baseLevel ?? 10;
}

function getMaxHP(ctx: ScriptContext): number {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return hp?.baseLevel ?? 10;
}

function getLowestCombatStat(ctx: ScriptContext): { name: string; level: number; style: number } {
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');

    if (def <= atk && def <= str) return { name: 'Defence', level: def, style: 3 };
    if (atk <= str) return { name: 'Attack', level: atk, style: 0 };
    return { name: 'Strength', level: str, style: 1 };
}

function getEquippedGear(ctx: ScriptContext): { sword: string | null; body: string | null; legs: string | null } {
    const equip = ctx.state()?.equipment ?? [];
    return {
        sword: equip.find(e => e && /sword|scimitar/i.test(e.name))?.name ?? null,
        body: equip.find(e => e && /platebody|chainbody/i.test(e.name))?.name ?? null,
        legs: equip.find(e => e && /platelegs|plateskirt/i.test(e.name))?.name ?? null,
    };
}

function getAffordableTier(ctx: ScriptContext): typeof GEAR_TIERS[0] | null {
    const lowestCombat = getLowestCombatStat(ctx).level;
    const available = GEAR_TIERS.filter(t => t.level <= lowestCombat);
    return available[available.length - 1] ?? null;
}

function needsGearUpgrade(ctx: ScriptContext): { needed: boolean; tier: typeof GEAR_TIERS[0] | null; cost: number } {
    const tier = getAffordableTier(ctx);
    if (!tier) return { needed: false, tier: null, cost: 0 };

    const equipped = getEquippedGear(ctx);
    const tierPattern = new RegExp(tier.tier, 'i');

    const needsSword = !equipped.sword || !tierPattern.test(equipped.sword);
    const needsBody = !equipped.body || !tierPattern.test(equipped.body);
    const needsLegs = !equipped.legs || !tierPattern.test(equipped.legs);

    if (!needsSword && !needsBody && !needsLegs) {
        return { needed: false, tier, cost: 0 };
    }

    let cost = 0;
    if (needsSword) cost += tier.swordPrice;
    if (needsBody) cost += tier.bodyPrice;
    if (needsLegs) cost += tier.legPrice;

    return { needed: true, tier, cost };
}

// ==================== WALKING ====================

async function walkTo(ctx: ScriptContext, stats: Stats, x: number, z: number, label: string): Promise<boolean> {
    ctx.log(`Walking to ${label}...`);
    try {
        await ctx.bot.walkTo(x, z);
        markProgress(ctx, stats);

        // Wait for arrival
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);

            // Dismiss dialogs
            if (ctx.state()?.dialog?.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }

            const player = ctx.state()?.player;
            if (player) {
                const dist = Math.sqrt(Math.pow(player.worldX - x, 2) + Math.pow(player.worldZ - z, 2));
                if (dist < 8) {
                    ctx.log(`Arrived at ${label}`);
                    return true;
                }
            }
        }
    } catch (e) {
        ctx.warn(`Walk failed: ${e}`);
    }
    return false;
}

// ==================== THIEVING ====================

async function thieveForGP(ctx: ScriptContext, stats: Stats, targetGP: number): Promise<boolean> {
    ctx.log(`=== Thieving Phase: Need ${targetGP} GP ===`);

    // Walk to Lumbridge men area
    await walkTo(ctx, stats, LOCATIONS.LUMBRIDGE_MEN.x, LOCATIONS.LUMBRIDGE_MEN.z, 'Lumbridge (men)');

    let loopCount = 0;
    const startCoins = getCoins(ctx);

    while (getCoins(ctx) < targetGP && loopCount < 200) {
        loopCount++;
        const state = ctx.state();
        if (!state) break;

        // Progress log
        if (loopCount % 20 === 0) {
            ctx.log(`Thieving loop ${loopCount}: GP=${getCoins(ctx)}/${targetGP}, Thieving=${getSkillLevel(ctx, 'Thieving')}`);
        }

        // Dismiss dialogs
        if (state.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Find a man/woman
        const target = state.nearbyNpcs
            .filter(npc => /^(man|woman)$/i.test(npc.name))
            .filter(npc => npc.options.some(opt => /pickpocket/i.test(opt)))
            .sort((a, b) => a.distance - b.distance)[0];

        if (!target) {
            // Wander to find targets
            const player = state.player;
            if (player) {
                await ctx.sdk.sendWalk(
                    LOCATIONS.LUMBRIDGE_MEN.x + (Math.random() * 20 - 10),
                    LOCATIONS.LUMBRIDGE_MEN.z + (Math.random() * 20 - 10),
                    true
                );
                markProgress(ctx, stats);
            }
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Pickpocket
        const pickpocketOpt = target.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
        if (pickpocketOpt) {
            const coinsBefore = getCoins(ctx);
            await ctx.sdk.sendInteractNpc(target.index, pickpocketOpt.opIndex);
            stats.pickpockets++;
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 1500));

            const coinsAfter = getCoins(ctx);
            if (coinsAfter > coinsBefore) {
                stats.coinsGained += (coinsAfter - coinsBefore);
            }
        }
    }

    const totalGained = getCoins(ctx) - startCoins;
    ctx.log(`Thieving complete: +${totalGained} GP, now have ${getCoins(ctx)} GP`);
    return getCoins(ctx) >= targetGP;
}

// ==================== SHOPPING ====================

async function buyGear(ctx: ScriptContext, stats: Stats, tier: typeof GEAR_TIERS[0]): Promise<boolean> {
    ctx.log(`=== Shopping Phase: Buying ${tier.tier} gear in Varrock ===`);

    const equipped = getEquippedGear(ctx);
    const tierPattern = new RegExp(tier.tier, 'i');

    const needsSword = !equipped.sword || !tierPattern.test(equipped.sword);
    const needsBody = !equipped.body || !tierPattern.test(equipped.body);
    const needsLegs = !equipped.legs || !tierPattern.test(equipped.legs);

    // Buy sword if needed
    if (needsSword && getCoins(ctx) >= tier.swordPrice) {
        ctx.log(`Buying ${tier.tier} sword...`);
        await walkTo(ctx, stats, LOCATIONS.VARROCK_SWORD_SHOP.x, LOCATIONS.VARROCK_SWORD_SHOP.z, 'Varrock Sword Shop');

        const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop.?keeper|zaff/i.test(n.name));
        if (shopkeeper) {
            const tradeOpt = shopkeeper.optionsWithIndex?.find(o => /trade/i.test(o.text));
            if (tradeOpt) {
                await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);

                // Wait for shop
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 400));
                    if (ctx.state()?.shop?.isOpen) break;
                    markProgress(ctx, stats);
                }

                if (ctx.state()?.shop?.isOpen) {
                    const items = ctx.state()?.shop?.shopItems ?? [];
                    const sword = items.find(i => new RegExp(`${tier.tier}.*sword`, 'i').test(i.name));
                    if (sword) {
                        await ctx.sdk.sendShopBuy(sword.slot, 1);
                        await new Promise(r => setTimeout(r, 500));

                        // Equip it
                        const newSword = ctx.state()?.inventory.find(i => /sword/i.test(i.name));
                        if (newSword) {
                            ctx.log(`Bought ${newSword.name}!`);
                            stats.gearPurchased.push(newSword.name);
                            await ctx.bot.equipItem(newSword);
                            markProgress(ctx, stats);
                        }
                    }
                    await ctx.bot.closeShop();
                }
            }
        }
    }

    // Buy armor if needed
    if ((needsBody || needsLegs) && getCoins(ctx) >= Math.min(tier.bodyPrice, tier.legPrice)) {
        ctx.log(`Buying ${tier.tier} armor...`);
        await walkTo(ctx, stats, LOCATIONS.VARROCK_ARMOUR_SHOP.x, LOCATIONS.VARROCK_ARMOUR_SHOP.z, "Horvik's Armour");

        const horvik = ctx.state()?.nearbyNpcs.find(n => /horvik|armour|shop/i.test(n.name));
        if (horvik) {
            const tradeOpt = horvik.optionsWithIndex?.find(o => /trade/i.test(o.text));
            if (tradeOpt) {
                await ctx.sdk.sendInteractNpc(horvik.index, tradeOpt.opIndex);

                // Wait for shop
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 400));
                    if (ctx.state()?.shop?.isOpen) break;
                    markProgress(ctx, stats);
                }

                if (ctx.state()?.shop?.isOpen) {
                    const items = ctx.state()?.shop?.shopItems ?? [];

                    // Buy platebody
                    if (needsBody && getCoins(ctx) >= tier.bodyPrice) {
                        const body = items.find(i => new RegExp(`${tier.tier}.*(platebody|chainbody)`, 'i').test(i.name));
                        if (body) {
                            await ctx.sdk.sendShopBuy(body.slot, 1);
                            await new Promise(r => setTimeout(r, 500));
                            const newBody = ctx.state()?.inventory.find(i => /platebody|chainbody/i.test(i.name));
                            if (newBody) {
                                ctx.log(`Bought ${newBody.name}!`);
                                stats.gearPurchased.push(newBody.name);
                                await ctx.bot.equipItem(newBody);
                                markProgress(ctx, stats);
                            }
                        }
                    }

                    // Buy platelegs
                    if (needsLegs && getCoins(ctx) >= tier.legPrice) {
                        const legs = items.find(i => new RegExp(`${tier.tier}.*(platelegs|plateskirt)`, 'i').test(i.name));
                        if (legs) {
                            await ctx.sdk.sendShopBuy(legs.slot, 1);
                            await new Promise(r => setTimeout(r, 500));
                            const newLegs = ctx.state()?.inventory.find(i => /platelegs|plateskirt/i.test(i.name));
                            if (newLegs) {
                                ctx.log(`Bought ${newLegs.name}!`);
                                stats.gearPurchased.push(newLegs.name);
                                await ctx.bot.equipItem(newLegs);
                                markProgress(ctx, stats);
                            }
                        }
                    }

                    await ctx.bot.closeShop();
                }
            }
        }
    }

    ctx.log(`Shopping complete. Purchased: ${stats.gearPurchased.join(', ') || 'nothing'}`);
    return true;
}

// ==================== COMBAT ====================

async function trainCombat(ctx: ScriptContext, stats: Stats, durationMs: number): Promise<void> {
    ctx.log(`=== Combat Phase: Training for ${durationMs / 1000}s ===`);

    // Walk to cow field
    await walkTo(ctx, stats, LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z, 'Cow Field');

    // Try to open gate
    await ctx.bot.openDoor(/gate/i);
    markProgress(ctx, stats);

    // Set combat style to train lowest stat
    const lowestStat = getLowestCombatStat(ctx);
    await ctx.sdk.sendSetCombatStyle(lowestStat.style);
    ctx.log(`Training ${lowestStat.name} (level ${lowestStat.level})`);

    const endTime = Date.now() + durationMs;
    let loopCount = 0;

    while (Date.now() < endTime) {
        loopCount++;
        const state = ctx.state();
        if (!state) break;

        // Progress log
        if (loopCount % 50 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            ctx.log(`Combat loop ${loopCount}: Atk=${atk} Str=${str} Def=${def}, Kills=${stats.kills}`);

            // Rotate style
            const lowest = getLowestCombatStat(ctx);
            await ctx.sdk.sendSetCombatStyle(lowest.style);
        }

        // Dismiss dialogs
        if (state.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            continue;
        }

        // Drop junk if inventory getting full
        if (state.inventory.length >= 25) {
            const droppable = state.inventory.filter(i => {
                const name = i.name.toLowerCase();
                if (/sword|scimitar|coins|shield/i.test(name)) return false;
                return true;
            });
            for (const item of droppable.slice(0, 5)) {
                await ctx.sdk.sendDropItem(item.slot);
                await new Promise(r => setTimeout(r, 100));
            }
            markProgress(ctx, stats);
            continue;
        }

        // Check if idle
        const player = state.player;
        const isIdle = !player || player.animId === -1 || player.animId === 808;

        if (isIdle) {
            // Find and attack cow
            const cow = state.nearbyNpcs
                .filter(npc => /^cow$/i.test(npc.name))
                .filter(npc => npc.optionsWithIndex.some(o => /attack/i.test(o.text)))
                .filter(npc => !npc.inCombat)
                .sort((a, b) => a.distance - b.distance)[0];

            if (cow) {
                try {
                    const result = await ctx.bot.attackNpc(cow);
                    if (result.success) {
                        stats.kills++;
                        markProgress(ctx, stats);
                    } else if (result.reason === 'out_of_reach') {
                        await ctx.bot.openDoor(/gate/i);
                        markProgress(ctx, stats);
                    }
                } catch (e) {
                    // Attack timed out, continue
                }
                await new Promise(r => setTimeout(r, 1500));
            } else {
                // Wander to find cows
                await ctx.sdk.sendWalk(
                    LOCATIONS.COW_FIELD.x + (Math.random() * 10 - 5),
                    LOCATIONS.COW_FIELD.z + (Math.random() * 10 - 5),
                    true
                );
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 1000));
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
    const thieving = getSkillLevel(ctx, 'Thieving');
    const totalLevel = getTotalLevel(ctx);
    const coins = getCoins(ctx);
    const equipped = getEquippedGear(ctx);

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Kills: ${stats.kills}`);
    ctx.log(`Pickpockets: ${stats.pickpockets}`);
    ctx.log(`Coins Gained: ${stats.coinsGained}`);
    ctx.log(`Current GP: ${coins}`);
    ctx.log(`Gear Purchased: ${stats.gearPurchased.join(', ') || 'none'}`);
    ctx.log(`Combat: Attack=${atk} (+${atk - stats.startAttack}), Strength=${str} (+${str - stats.startStrength}), Defence=${def} (+${def - stats.startDefence})`);
    ctx.log(`Thieving: ${thieving} (+${thieving - stats.startThieving})`);
    ctx.log(`Total Level: ${totalLevel} (+${totalLevel - stats.startTotalLevel})`);
    ctx.log(`Equipped: Sword=${equipped.sword || 'none'}, Body=${equipped.body || 'none'}, Legs=${equipped.legs || 'none'}`);
    ctx.log('');
}

// ==================== MAIN ====================

runArc({
    characterName: 'brad_3',
    arcName: 'combat-thief-drip',
    goal: 'Combat training + Thieving for GP + Varrock gear upgrades',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 90_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        pickpockets: 0,
        coinsGained: 0,
        gearPurchased: [],
        startTime: Date.now(),
        lastProgressTime: Date.now(),
        startAttack: getSkillLevel(ctx, 'Attack'),
        startStrength: getSkillLevel(ctx, 'Strength'),
        startDefence: getSkillLevel(ctx, 'Defence'),
        startThieving: getSkillLevel(ctx, 'Thieving'),
        startTotalLevel: getTotalLevel(ctx),
    };

    ctx.log('=== Arc: combat-thief-drip (Brad_3) ===');
    ctx.log(`Starting: Atk=${stats.startAttack} Str=${stats.startStrength} Def=${stats.startDefence} Thieving=${stats.startThieving}`);
    ctx.log(`GP: ${getCoins(ctx)}`);
    ctx.log(`Total Level: ${stats.startTotalLevel}`);

    const equipped = getEquippedGear(ctx);
    ctx.log(`Equipped: Sword=${equipped.sword || 'none'}, Body=${equipped.body || 'none'}, Legs=${equipped.legs || 'none'}`);

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    try {
        // Main loop: Check if we need gear, thieve for GP if needed, then combat train
        const upgrade = needsGearUpgrade(ctx);

        if (upgrade.needed && upgrade.tier) {
            ctx.log(`Need ${upgrade.tier.tier} gear upgrade, cost: ${upgrade.cost} GP`);
            const currentGP = getCoins(ctx);

            if (currentGP < upgrade.cost) {
                // Thieve for GP
                await thieveForGP(ctx, stats, upgrade.cost);
            }

            // Buy gear
            if (getCoins(ctx) >= upgrade.cost / 2) {  // Buy what we can afford
                await buyGear(ctx, stats, upgrade.tier);
            }
        }

        // Combat training for remaining time
        const elapsedMs = Date.now() - stats.startTime;
        const remainingMs = Math.max(5 * 60 * 1000, 10 * 60 * 1000 - elapsedMs);  // At least 5 min combat
        await trainCombat(ctx, stats, remainingMs);

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
