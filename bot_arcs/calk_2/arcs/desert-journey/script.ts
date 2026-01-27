/**
 * Arc: desert-journey
 * Character: calk_2
 *
 * Goal: Complete desert progression - travel, thieving, combat, scimitars
 * Strategy:
 * 1. Get to Al Kharid (sell shortbow for toll money, pass gate)
 * 2. Thieve men for GP (3gp per success)
 * 3. Buy kebabs (1gp each) for healing
 * 4. Train combat on warriors with style cycling
 * 5. Buy scimitar upgrades from Zeke as Attack levels
 *
 * The script intelligently switches between thieving and combat based on:
 * - GP level: If low on GP (<50), prioritize thieving
 * - Equipment: If can afford an upgrade, buy it
 * - HP/Food: Always maintain kebab supply
 *
 * Duration: 10 minutes (adjustable)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// === LOCATIONS ===
const LOCATIONS = {
    // Lumbridge
    LUMBRIDGE_SPAWN: { x: 3222, z: 3218 },
    LUMBRIDGE_GENERAL_STORE: { x: 3212, z: 3247 },

    // Al Kharid
    ALKHARID_GATE: { x: 3268, z: 3228 },
    ALKHARID_INSIDE: { x: 3277, z: 3227 },
    ALKHARID_MEN: { x: 3293, z: 3175 },
    // Use more open area to avoid "can't reach" - palace courtyard
    ALKHARID_WARRIORS: { x: 3285, z: 3175 },
    ALKHARID_KEBAB: { x: 3273, z: 3180 },
    ALKHARID_SCIMITAR: { x: 3287, z: 3186 },
    ALKHARID_BANK: { x: 3269, z: 3167 },
};

// === CONFIG ===
const CONFIG = {
    // Thieving thresholds - Mithril is best from Zeke, focus on combat
    MIN_GP_FOR_COMBAT: 100,        // Combat focus - we have Mithril scimitar
    GP_TARGET_INITIAL: 100,        // Initial thieving target before buying scimitar

    // Kebab management
    EAT_HP_THRESHOLD: 7,           // Eat when HP <= this
    MIN_KEBABS: 3,                 // Try to keep at least this many

    // Combat
    STYLE_CYCLE_MS: 30_000,        // Rotate combat styles every 30s
};

// === COMBAT STYLES ===
const COMBAT_STYLES = {
    ACCURATE: 0,    // Attack
    AGGRESSIVE: 1,  // Strength
    DEFENSIVE: 3,   // Defence
};

// Phase 2: Balanced rotation towards 60/60/60 (currently 48/45/42)
const STYLE_ROTATION = [
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },  // 42 - lowest
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' }, // 45
    { style: COMBAT_STYLES.ACCURATE, name: 'Accurate (Attack)' },      // 48
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },  // Extra defence
];

// === STATS TRACKING ===
interface Stats {
    phase: 'travel' | 'thieving' | 'combat';
    pickpocketAttempts: number;
    pickpocketSuccesses: number;
    gpEarned: number;
    kills: number;
    kebabsBought: number;
    kebabsEaten: number;
    scimitarsBought: string[];
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

// === HELPERS ===
function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
    return {
        current: hp?.level ?? 10,
        max: hp?.baseLevel ?? 10,
    };
}

function getKebabCount(ctx: ScriptContext): number {
    const kebabs = ctx.state()?.inventory.filter(i => /kebab/i.test(i.name)) || [];
    return kebabs.reduce((sum, k) => sum + k.count, 0);
}

function getFoodCount(ctx: ScriptContext): number {
    const food = ctx.state()?.inventory.filter(i =>
        /kebab|bread|shrimp|cooked|meat/i.test(i.name)
    ) || [];
    return food.reduce((sum, f) => sum + f.count, 0);
}

function isInAlKharid(ctx: ScriptContext): boolean {
    const player = ctx.state()?.player;
    if (!player) return false;
    return player.worldX >= 3267 && player.worldZ < 3220;
}

function hasScimitar(ctx: ScriptContext): boolean {
    const inv = ctx.state()?.inventory ?? [];
    const equip = ctx.state()?.equipment ?? [];
    return inv.some(i => /scimitar/i.test(i.name)) ||
           equip.some(e => e && /scimitar/i.test(e.name));
}

function getEquippedWeaponTier(ctx: ScriptContext): string {
    const weapon = ctx.state()?.equipment?.find(e => e && /scimitar|sword|dagger/i.test(e.name));
    if (!weapon) return 'none';
    const name = weapon.name.toLowerCase();
    if (name.includes('adamant')) return 'adamant';
    if (name.includes('mithril')) return 'mithril';
    if (name.includes('steel')) return 'steel';
    if (name.includes('iron')) return 'iron';
    if (name.includes('bronze')) return 'bronze';
    return 'other';
}

async function waitForState(ctx: ScriptContext): Promise<boolean> {
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 45000);
        return true;
    } catch (e) {
        ctx.warn('State did not populate');
        return false;
    }
}

async function dismissDialogs(ctx: ScriptContext): Promise<void> {
    for (let i = 0; i < 5; i++) {
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        } else {
            break;
        }
    }
}

// === PHASE 1: TRAVEL TO AL KHARID ===
async function travelToAlKharid(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('=== Phase 1: Travel to Al Kharid ===');
    stats.phase = 'travel';

    // Check if already in Al Kharid
    if (isInAlKharid(ctx)) {
        ctx.log('Already in Al Kharid!');
        return true;
    }

    const gp = getCoins(ctx);
    ctx.log('Current GP: ' + gp);

    // Need at least 10gp for toll
    if (gp < 10) {
        // First check if we have a shortbow to sell
        const shortbow = ctx.state()?.inventory.find(i => /shortbow/i.test(i.name));

        if (shortbow) {
            ctx.log('Need 10gp for toll - selling shortbow at general store...');
            await ctx.bot.walkTo(LOCATIONS.LUMBRIDGE_GENERAL_STORE.x, LOCATIONS.LUMBRIDGE_GENERAL_STORE.z);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 2000));

            // Find shopkeeper - retry a few times
            // NPC can be named "Shop keeper" or "Shopkeeper"
            let shopkeeper = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop\s*keeper/i.test(n.name));
                if (shopkeeper) break;
                ctx.log('Looking for shopkeeper... attempt ' + (attempt + 1));
                await new Promise(r => setTimeout(r, 1000));
            }

            if (shopkeeper) {
                const tradeOpt = shopkeeper.optionsWithIndex.find(o => /trade/i.test(o.text));
                if (tradeOpt) {
                    await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);
                    await new Promise(r => setTimeout(r, 1500));

                    // Wait for shop to open
                    for (let i = 0; i < 15; i++) {
                        if (ctx.state()?.shop?.isOpen) break;
                        await new Promise(r => setTimeout(r, 500));
                    }

                    if (ctx.state()?.shop?.isOpen) {
                        const bow = ctx.state()?.inventory.find(i => /shortbow/i.test(i.name));
                        if (bow) {
                            ctx.log('Selling shortbow...');
                            await ctx.sdk.sendShopSell(bow.slot, 1);
                            await new Promise(r => setTimeout(r, 500));
                        }
                        await ctx.bot.closeShop();
                    }
                }
            }
            markProgress(ctx, stats);
        } else {
            // No shortbow - need to pickpocket for toll money
            ctx.log('No shortbow to sell - pickpocketing for toll money...');

            // Walk to Lumbridge castle area (men spawn there)
            await ctx.bot.walkTo(LOCATIONS.LUMBRIDGE_SPAWN.x, LOCATIONS.LUMBRIDGE_SPAWN.z);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 1500));

            // Pickpocket until we have 10gp
            let attempts = 0;
            while (getCoins(ctx) < 12 && attempts < 50) {  // 12gp to be safe
                attempts++;

                // Dismiss dialogs
                if (ctx.state()?.dialog.isOpen) {
                    await ctx.sdk.sendClickDialog(0);
                    await new Promise(r => setTimeout(r, 300));
                    continue;
                }

                const man = ctx.state()?.nearbyNpcs.find(n => /^man$/i.test(n.name));
                if (!man) {
                    ctx.log('No men found - waiting...');
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                const pickpocketOpt = man.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
                if (pickpocketOpt) {
                    await ctx.sdk.sendInteractNpc(man.index, pickpocketOpt.opIndex);
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 1500));

                    // Check for stun
                    const messages = ctx.state()?.gameMessages ?? [];
                    const wasStunned = messages.slice(-3).some(m => /stunned|caught/i.test(m.text));
                    if (wasStunned) {
                        await new Promise(r => setTimeout(r, 4000));
                    }
                }

                if (attempts % 10 === 0) {
                    ctx.log('Pickpocket progress: ' + getCoins(ctx) + 'gp (attempt ' + attempts + ')');
                }
            }
            ctx.log('Earned ' + getCoins(ctx) + 'gp for toll');
        }
    }

    // Walk to Al Kharid gate
    ctx.log('Walking to Al Kharid toll gate...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_GATE.x, LOCATIONS.ALKHARID_GATE.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    // Find and interact with gate - wait for objects to load
    let gate = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        gate = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name));
        if (gate) break;
        ctx.log('Looking for gate... attempt ' + (attempt + 1));
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!gate) {
        ctx.warn('Gate not found - checking nearby objects:');
        const locs = ctx.state()?.nearbyLocs.slice(0, 15) ?? [];
        for (const loc of locs) {
            ctx.log('  - ' + loc.name + ' at (' + loc.x + ', ' + loc.z + ')');
        }
        // Try alternative - maybe there's a different object name
        gate = ctx.state()?.nearbyLocs.find(l =>
            /toll|barrier|door/i.test(l.name) && l.distance < 10
        );
    }
    if (!gate) {
        ctx.warn('Still no gate found!');
        return false;
    }

    ctx.log('Opening toll gate...');
    await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, 1);
    await new Promise(r => setTimeout(r, 1500));

    // Handle toll dialog
    for (let i = 0; i < 15; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
        if (yesOpt) {
            ctx.log('Paying toll (10gp)...');
            await ctx.sdk.sendClickDialog(yesOpt.index);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 500));
            break;
        }

        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 300));
    }

    await new Promise(r => setTimeout(r, 1000));
    await dismissDialogs(ctx);

    // Walk through gate
    ctx.log('Walking through gate...');
    await ctx.sdk.sendWalk(LOCATIONS.ALKHARID_INSIDE.x, LOCATIONS.ALKHARID_INSIDE.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 2000));

    // Walk further into Al Kharid
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_KEBAB.x, LOCATIONS.ALKHARID_KEBAB.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    const nowInAlKharid = isInAlKharid(ctx);
    ctx.log('Now in Al Kharid: ' + nowInAlKharid);
    return nowInAlKharid;
}

// === KEBAB MANAGEMENT ===
async function buyKebab(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('Buying kebab from Karim...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_KEBAB.x, LOCATIONS.ALKHARID_KEBAB.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    const seller = ctx.state()?.nearbyNpcs.find(n => /kebab/i.test(n.name));
    if (!seller) {
        ctx.warn('Kebab seller not found!');
        return false;
    }

    const talkOpt = seller.optionsWithIndex.find(o => /talk/i.test(o.text));
    if (!talkOpt) return false;

    await ctx.sdk.sendInteractNpc(seller.index, talkOpt.opIndex);
    await new Promise(r => setTimeout(r, 1000));

    for (let i = 0; i < 15; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }
        const buyOpt = s.dialog.options.find(o => /yes/i.test(o.text));
        if (buyOpt) {
            await ctx.sdk.sendClickDialog(buyOpt.index);
            stats.kebabsBought++;
            markProgress(ctx, stats);
            break;
        }
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 300));
    }

    await dismissDialogs(ctx);
    return true;
}

async function eatFood(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const food = ctx.state()?.inventory.find(i =>
        /kebab|bread|shrimp|cooked|meat/i.test(i.name)
    );

    if (!food) return false;

    const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
    if (!eatOpt) return false;

    const hp = getHP(ctx);
    ctx.log('Eating ' + food.name + ' (HP: ' + hp.current + '/' + hp.max + ')');
    await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
    stats.kebabsEaten++;
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 600));
    return true;
}

// === SCIMITAR MANAGEMENT ===
async function buyScimitar(ctx: ScriptContext, stats: Stats, tier: string): Promise<boolean> {
    ctx.log('Buying ' + tier + ' scimitar from Zeke...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_SCIMITAR.x, LOCATIONS.ALKHARID_SCIMITAR.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    const zeke = ctx.sdk.findNearbyNpc(/zeke/i);
    if (!zeke) {
        ctx.warn('Zeke not found!');
        return false;
    }

    const tradeOpt = zeke.optionsWithIndex.find(o => /trade/i.test(o.text));
    if (!tradeOpt) return false;

    await ctx.sdk.sendInteractNpc(zeke.index, tradeOpt.opIndex);
    await new Promise(r => setTimeout(r, 1500));

    for (let i = 0; i < 10; i++) {
        if (ctx.state()?.shop?.isOpen) break;
        await new Promise(r => setTimeout(r, 300));
    }

    if (!ctx.state()?.shop?.isOpen) return false;

    await new Promise(r => setTimeout(r, 500));
    const shopItems = ctx.state()?.shop?.shopItems || [];
    const scimitar = shopItems.find(i => i.name.toLowerCase().includes(tier));

    if (scimitar && scimitar.count > 0) {
        ctx.log('Buying ' + scimitar.name + '...');
        await ctx.sdk.sendShopBuy(scimitar.slot, 1);
        stats.scimitarsBought.push(tier);
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 500));

        // Equip it
        await ctx.bot.closeShop();
        await new Promise(r => setTimeout(r, 500));

        const newScim = ctx.state()?.inventory.find(i => i.name.toLowerCase().includes(tier));
        if (newScim) {
            ctx.log('Equipping ' + newScim.name + '!');
            await ctx.bot.equipItem(newScim);
            markProgress(ctx, stats);
        }
        return true;
    }

    await ctx.bot.closeShop();
    return false;
}

function getBestAffordableScimitar(ctx: ScriptContext): { tier: string; cost: number } | null {
    const gp = getCoins(ctx);
    const attackLevel = getSkillLevel(ctx, 'Attack');
    const currentTier = getEquippedWeaponTier(ctx);

    // Note: Zeke only sells up to Mithril. Adamant requires Champions' Guild.
    const upgrades = [
        { tier: 'mithril', cost: 1040, reqAttack: 20 },
        { tier: 'steel', cost: 400, reqAttack: 10 },
        { tier: 'iron', cost: 112, reqAttack: 5 },
        { tier: 'bronze', cost: 32, reqAttack: 1 },
    ];

    const tierOrder = ['none', 'other', 'bronze', 'iron', 'steel', 'mithril', 'adamant'];
    const currentTierIndex = tierOrder.indexOf(currentTier);

    for (const upgrade of upgrades) {
        const upgradeTierIndex = tierOrder.indexOf(upgrade.tier);
        if (upgradeTierIndex > currentTierIndex &&
            gp >= upgrade.cost &&
            attackLevel >= upgrade.reqAttack) {
            return upgrade;
        }
    }

    return null;
}

// === THIEVING ===
function findPickpocketTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const targets = state.nearbyNpcs
        .filter(npc => /^man$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /pickpocket/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return targets[0] ?? null;
}

async function pickpocket(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const target = findPickpocketTarget(ctx);
    if (!target) return false;

    const pickpocketOpt = target.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
    if (!pickpocketOpt) return false;

    stats.pickpocketAttempts++;
    const gpBefore = getCoins(ctx);

    await ctx.sdk.sendInteractNpc(target.index, pickpocketOpt.opIndex);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1500));

    const gpAfter = getCoins(ctx);
    const gpGained = gpAfter - gpBefore;

    if (gpGained > 0) {
        stats.pickpocketSuccesses++;
        stats.gpEarned += gpGained;
        return true;
    } else {
        // Stunned - wait
        await new Promise(r => setTimeout(r, 3000));
        return false;
    }
}

// === COMBAT ===
let lastStyleChange = 0;
let currentStyleIndex = 0;
let lastSetStyle = -1;
let cantReachCount = 0;
let lastCantReachCheck = 0;

function findCombatTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const targets = state.nearbyNpcs
        .filter(npc => /^(al.?kharid warrior|warrior|man)$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /attack/i.test(opt)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => {
            const aIsWarrior = /warrior/i.test(a.name);
            const bIsWarrior = /warrior/i.test(b.name);
            if (aIsWarrior && !bIsWarrior) return -1;
            if (!aIsWarrior && bIsWarrior) return 1;
            return a.distance - b.distance;
        });

    return targets[0] ?? null;
}

async function cycleCombatStyle(ctx: ScriptContext): Promise<void> {
    const now = Date.now();
    if (now - lastStyleChange >= CONFIG.STYLE_CYCLE_MS) {
        currentStyleIndex = (currentStyleIndex + 1) % STYLE_ROTATION.length;
        lastStyleChange = now;
    }

    const target = STYLE_ROTATION[currentStyleIndex]!;
    if (lastSetStyle !== target.style) {
        ctx.log('Combat style: ' + target.name);
        await ctx.sdk.sendSetCombatStyle(target.style);
        lastSetStyle = target.style;
    }
}

// === MAIN LOOP ===
async function mainLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    lastStyleChange = Date.now();

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) break;

        // Periodic status
        if (loopCount % 30 === 0) {
            const thieving = getSkillLevel(ctx, 'Thieving');
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getHP(ctx);
            const gp = getCoins(ctx);
            ctx.log('Loop ' + loopCount + ' [' + stats.phase + ']: Thiev ' + thieving +
                ' | Atk ' + atk + ' Str ' + str + ' Def ' + def +
                ' | HP ' + hp.current + '/' + hp.max +
                ' | GP ' + gp + ' | Kills ' + stats.kills);
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Food management
        const hp = getHP(ctx);
        if (hp.current <= CONFIG.EAT_HP_THRESHOLD) {
            const ate = await eatFood(ctx, stats);
            if (!ate && getCoins(ctx) >= 1) {
                await buyKebab(ctx, stats);
                await eatFood(ctx, stats);
            }
            continue;
        }

        const kebabs = getKebabCount(ctx);
        const gp = getCoins(ctx);
        if (kebabs < CONFIG.MIN_KEBABS && gp >= 3) {
            await buyKebab(ctx, stats);
            continue;
        }

        // Check for scimitar upgrade
        const upgrade = getBestAffordableScimitar(ctx);
        if (upgrade) {
            await buyScimitar(ctx, stats, upgrade.tier);
            continue;
        }

        // Decide activity: thieving vs combat
        const hasWeapon = hasScimitar(ctx);

        // If no scimitar and can afford one, thieve until we can buy
        if (!hasWeapon && gp < 32) {
            stats.phase = 'thieving';
        }
        // If low on GP, thieve
        else if (gp < CONFIG.MIN_GP_FOR_COMBAT) {
            stats.phase = 'thieving';
        }
        // Otherwise, combat
        else if (hasWeapon) {
            stats.phase = 'combat';
        }
        // Default to thieving
        else {
            stats.phase = 'thieving';
        }

        // Execute activity
        if (stats.phase === 'thieving') {
            const target = findPickpocketTarget(ctx);
            if (!target) {
                const player = currentState.player;
                if (player) {
                    const distToMen = Math.sqrt(
                        Math.pow(player.worldX - LOCATIONS.ALKHARID_MEN.x, 2) +
                        Math.pow(player.worldZ - LOCATIONS.ALKHARID_MEN.z, 2)
                    );
                    if (distToMen > 15) {
                        ctx.log('Walking to thieving spot...');
                        await ctx.bot.walkTo(LOCATIONS.ALKHARID_MEN.x, LOCATIONS.ALKHARID_MEN.z);
                        markProgress(ctx, stats);
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }
                }
                await new Promise(r => setTimeout(r, 500));
                markProgress(ctx, stats);
                continue;
            }
            await pickpocket(ctx, stats);
        }
        else if (stats.phase === 'combat') {
            await cycleCombatStyle(ctx);

            // Check for "can't reach" spam and relocate if stuck
            const now = Date.now();
            if (now - lastCantReachCheck > 5000) {
                const recentMsgs = currentState.gameMessages.slice(-5);
                const cantReachMsgs = recentMsgs.filter(m => /can't reach/i.test(m.text)).length;
                if (cantReachMsgs >= 3) {
                    cantReachCount++;
                    if (cantReachCount >= 2) {
                        // Move to a random nearby spot
                        const player = currentState.player;
                        if (player) {
                            const offsetX = (Math.random() - 0.5) * 10;
                            const offsetZ = (Math.random() - 0.5) * 10;
                            const newX = Math.floor(player.worldX + offsetX);
                            const newZ = Math.floor(player.worldZ + offsetZ);
                            ctx.log('Relocating to avoid obstacles -> (' + newX + ', ' + newZ + ')');
                            await ctx.sdk.sendWalk(newX, newZ);
                            cantReachCount = 0;
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }
                } else {
                    cantReachCount = 0;
                }
                lastCantReachCheck = now;
            }

            const player = currentState.player;
            if (player) {
                const distToWarriors = Math.sqrt(
                    Math.pow(player.worldX - LOCATIONS.ALKHARID_WARRIORS.x, 2) +
                    Math.pow(player.worldZ - LOCATIONS.ALKHARID_WARRIORS.z, 2)
                );
                if (distToWarriors > 30) {
                    ctx.log('Walking to combat area...');
                    await ctx.bot.walkTo(LOCATIONS.ALKHARID_WARRIORS.x, LOCATIONS.ALKHARID_WARRIORS.z);
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
            }

            const isIdle = player?.animId === -1;
            if (isIdle) {
                const target = findCombatTarget(ctx);
                if (!target) {
                    await new Promise(r => setTimeout(r, 500));
                    markProgress(ctx, stats);
                    continue;
                }

                try {
                    const attackResult = await ctx.bot.attackNpc(target);
                    if (attackResult.success) {
                        stats.kills++;
                        markProgress(ctx, stats);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (err) {
                    markProgress(ctx, stats);
                }
            }
        }

        await new Promise(r => setTimeout(r, 400));
        markProgress(ctx, stats);
    }
}

// === FINAL STATS ===
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;
    const successRate = stats.pickpocketAttempts > 0
        ? Math.round(stats.pickpocketSuccesses / stats.pickpocketAttempts * 100)
        : 0;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log('Duration: ' + Math.round(duration) + 's');
    ctx.log('');
    ctx.log('-- Thieving --');
    ctx.log('Thieving Level: ' + getSkillLevel(ctx, 'Thieving'));
    ctx.log('Pickpocket Attempts: ' + stats.pickpocketAttempts);
    ctx.log('Success Rate: ' + successRate + '%');
    ctx.log('GP Earned: ' + stats.gpEarned);
    ctx.log('');
    ctx.log('-- Combat --');
    ctx.log('Attack: ' + getSkillLevel(ctx, 'Attack'));
    ctx.log('Strength: ' + getSkillLevel(ctx, 'Strength'));
    ctx.log('Defence: ' + getSkillLevel(ctx, 'Defence'));
    ctx.log('Hitpoints: ' + getSkillLevel(ctx, 'Hitpoints'));
    ctx.log('Kills: ' + stats.kills);
    ctx.log('');
    ctx.log('-- Resources --');
    ctx.log('Kebabs Bought: ' + stats.kebabsBought);
    ctx.log('Kebabs Eaten: ' + stats.kebabsEaten);
    ctx.log('Scimitars Bought: ' + (stats.scimitarsBought.length > 0 ? stats.scimitarsBought.join(', ') : 'none'));
    ctx.log('Current GP: ' + getCoins(ctx));
    ctx.log('');
    ctx.log('-- Summary --');
    ctx.log('Total Level: ' + getTotalLevel(ctx));
    ctx.log('Position: (' + ctx.state()?.player?.worldX + ', ' + ctx.state()?.player?.worldZ + ')');

    const equipment = ctx.state()?.equipment || [];
    const equippedItems = equipment.filter(e => e).map(e => e!.name);
    if (equippedItems.length > 0) {
        ctx.log('Equipment: ' + equippedItems.join(', '));
    }
}

// === RUN THE ARC ===
runArc({
    characterName: 'calk_2',
    arcName: 'desert-journey',
    goal: 'Al Kharid progression: thieving, combat, scimitars',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        phase: 'travel',
        pickpocketAttempts: 0,
        pickpocketSuccesses: 0,
        gpEarned: 0,
        kills: 0,
        kebabsBought: 0,
        kebabsEaten: 0,
        scimitarsBought: [],
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: desert-journey ===');
    ctx.log('Goal: Complete desert progression in Al Kharid');
    ctx.log('Strategy: Thieve for GP -> Buy kebabs -> Train combat -> Upgrade scimitars');

    const stateReady = await waitForState(ctx);
    if (!stateReady || ctx.state()?.player?.worldX === 0) {
        ctx.error('Cannot proceed without valid game state');
        return;
    }

    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    const player = ctx.state()?.player;
    ctx.log('Starting position: (' + player?.worldX + ', ' + player?.worldZ + ')');
    ctx.log('Starting GP: ' + getCoins(ctx));
    ctx.log('In Al Kharid: ' + isInAlKharid(ctx));

    // Phase 1: Travel to Al Kharid if needed
    if (!isInAlKharid(ctx)) {
        const arrived = await travelToAlKharid(ctx, stats);
        if (!arrived) {
            ctx.error('Failed to reach Al Kharid!');
            logFinalStats(ctx, stats);
            return;
        }
    }

    ctx.log('');
    ctx.log('=== In Al Kharid - Starting Training Loop ===');
    ctx.log('');

    try {
        await mainLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error('Arc aborted: ' + e.message);
        } else {
            throw e;
        }
    } finally {
        logFinalStats(ctx, stats);
    }
});
