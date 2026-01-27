/**
 * Arc: alkharid-combat
 * Character: calk
 *
 * Goal: Train combat skills in Al Kharid
 * Strategy:
 * 1. Fight Al Kharid warriors (level 9) or Men
 * 2. Cycle combat styles for balanced training
 * 3. Use kebabs for healing
 * 4. Upgrade scimitar when Attack levels up
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// === LOCATIONS ===
const LOCATIONS = {
    ALKHARID_WARRIORS: { x: 3293, z: 3175 },   // Warriors near palace
    ALKHARID_KEBAB: { x: 3273, z: 3180 },      // Karim the kebab seller
    ZEKE_SHOP: { x: 3287, z: 3186 },           // Scimitar shop
};

// === COMBAT STYLES ===
const COMBAT_STYLES = {
    ACCURATE: 0,    // Trains Attack
    AGGRESSIVE: 1,  // Trains Strength
    CONTROLLED: 2,  // Trains all three
    DEFENSIVE: 3,   // Trains Defence
};

const STYLE_ROTATION = [
    { style: COMBAT_STYLES.ACCURATE, name: 'Accurate (Attack)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' },
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },
];

let lastStyleChange = 0;
let currentStyleIndex = 0;
let lastSetStyle = -1;
const STYLE_CYCLE_MS = 30_000;

// === STATS ===
interface Stats {
    kills: number;
    kebabsEaten: number;
    kebabsBought: number;
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

function isInAlKharid(ctx: ScriptContext): boolean {
    const player = ctx.state()?.player;
    if (!player) return false;
    return player.worldX >= 3267 && player.worldZ < 3220;
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

// === COMBAT HELPERS ===
function findCombatTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    // Prefer Al Kharid warriors (level 9), fall back to men
    const targets = state.nearbyNpcs
        .filter(npc => /^(al.?kharid warrior|warrior|man)$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /attack/i.test(opt)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => {
            // Prefer warriors over men
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
    if (now - lastStyleChange >= STYLE_CYCLE_MS) {
        currentStyleIndex = (currentStyleIndex + 1) % STYLE_ROTATION.length;
        lastStyleChange = now;
    }

    const target = STYLE_ROTATION[currentStyleIndex]!;
    if (lastSetStyle !== target.style) {
        ctx.log('Setting combat style: ' + target.name);
        await ctx.sdk.sendSetCombatStyle(target.style);
        lastSetStyle = target.style;
    }
}

// === FOOD MANAGEMENT ===
async function eatFoodIfNeeded(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const hp = getHP(ctx);
    if (hp.current >= hp.max * 0.5) return false;

    const food = ctx.state()?.inventory.find(i =>
        /kebab|bread|shrimp|cooked|meat/i.test(i.name)
    );

    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (eatOpt) {
            ctx.log('Eating ' + food.name + ' (HP: ' + hp.current + '/' + hp.max + ')');
            await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
            stats.kebabsEaten++;
            markProgress(ctx, stats);
            return true;
        }
    }
    return false;
}

async function buyKebab(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('Walking to kebab seller...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_KEBAB.x, LOCATIONS.ALKHARID_KEBAB.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    const seller = ctx.state()?.nearbyNpcs.find(n => /kebab/i.test(n.name));
    if (!seller) {
        ctx.warn('No kebab seller found!');
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

    // Dismiss remaining dialogs
    for (let i = 0; i < 5; i++) {
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }
    }

    return true;
}

// === SCIMITAR UPGRADE ===
async function checkScimitarUpgrade(ctx: ScriptContext, stats: Stats): Promise<void> {
    const attackLevel = getSkillLevel(ctx, 'Attack');
    const gp = getCoins(ctx);

    // Check equipped weapon
    const weapon = ctx.state()?.equipment?.find(e => e && /scimitar|sword/i.test(e.name));
    const currentTier = weapon?.name?.toLowerCase().includes('iron') ? 'iron'
        : weapon?.name?.toLowerCase().includes('steel') ? 'steel'
        : weapon?.name?.toLowerCase().includes('mithril') ? 'mithril'
        : 'bronze';

    // Determine best upgrade available
    let targetTier: string | null = null;
    let targetCost = 0;
    let targetReq = 0;

    if (attackLevel >= 20 && gp >= 1040 && currentTier !== 'mithril') {
        targetTier = 'mithril';
        targetCost = 1040;
        targetReq = 20;
    } else if (attackLevel >= 10 && gp >= 400 && !['steel', 'mithril'].includes(currentTier)) {
        targetTier = 'steel';
        targetCost = 400;
        targetReq = 10;
    } else if (attackLevel >= 5 && gp >= 112 && !['iron', 'steel', 'mithril'].includes(currentTier)) {
        targetTier = 'iron';
        targetCost = 112;
        targetReq = 5;
    }

    if (!targetTier) return;

    ctx.log('Upgrading to ' + targetTier + ' scimitar! (Attack ' + attackLevel + ', GP ' + gp + ')');

    // Walk to Zeke
    await ctx.bot.walkTo(LOCATIONS.ZEKE_SHOP.x, LOCATIONS.ZEKE_SHOP.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    // Open shop
    const zeke = ctx.sdk.findNearbyNpc(/zeke/i);
    if (!zeke) {
        ctx.warn('Zeke not found!');
        return;
    }

    const tradeOpt = zeke.optionsWithIndex.find(o => /trade/i.test(o.text));
    if (!tradeOpt) return;

    await ctx.sdk.sendInteractNpc(zeke.index, tradeOpt.opIndex);
    await new Promise(r => setTimeout(r, 1500));

    for (let i = 0; i < 10; i++) {
        if (ctx.state()?.shop?.isOpen) break;
        await new Promise(r => setTimeout(r, 300));
    }

    if (!ctx.state()?.shop?.isOpen) return;

    await new Promise(r => setTimeout(r, 500));
    const shopItems = ctx.state()?.shop?.shopItems || [];
    const scimitar = shopItems.find(i => i.name.toLowerCase().includes(targetTier!));

    if (scimitar) {
        await ctx.sdk.sendShopBuy(scimitar.slot, 1);
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 500));

        // Equip new scimitar
        const newScim = ctx.state()?.inventory.find(i => i.name.toLowerCase().includes(targetTier!));
        if (newScim) {
            ctx.log('Equipped ' + newScim.name + '!');
            await ctx.bot.equipItem(newScim);
            markProgress(ctx, stats);
        }
    }

    await ctx.bot.closeShop();
}

// === MAIN COMBAT LOOP ===
async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    lastStyleChange = Date.now();
    currentStyleIndex = 0;
    lastSetStyle = -1;
    let loopCount = 0;

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) break;

        // Periodic status logging
        if (loopCount % 30 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getHP(ctx);
            ctx.log('Loop ' + loopCount + ': Atk ' + atk + ', Str ' + str + ', Def ' + def +
                ' | HP: ' + hp.current + '/' + hp.max + ' | Kills: ' + stats.kills +
                ' | GP: ' + getCoins(ctx));
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Eat food if needed
        await eatFoodIfNeeded(ctx, stats);

        // Check if we need more food
        const hp = getHP(ctx);
        const kebabs = getKebabCount(ctx);
        if (hp.current < 5 && kebabs === 0 && getCoins(ctx) >= 1) {
            ctx.log('Low HP and no kebabs - buying food!');
            await buyKebab(ctx, stats);
            await eatFoodIfNeeded(ctx, stats);
            continue;
        }

        // Restock kebabs if low
        if (kebabs < 2 && getCoins(ctx) >= 3) {
            ctx.log('Restocking kebabs...');
            await buyKebab(ctx, stats);
            continue;
        }

        // Check for scimitar upgrade
        if (loopCount % 50 === 0) {
            await checkScimitarUpgrade(ctx, stats);
        }

        // Cycle combat style
        await cycleCombatStyle(ctx);

        // Walk to combat area if needed
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

        // Find and attack target
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
                    ctx.log('Attacking ' + target.name + ' (dist: ' + target.distance.toFixed(0) + ')');
                    stats.kills++;
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                if (!errorMsg.includes('timeout')) {
                    ctx.log('Attack error: ' + errorMsg);
                }
                markProgress(ctx, stats);
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }
}

// === FINAL STATS ===
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log('Duration: ' + Math.round(duration) + 's');
    ctx.log('Attack: ' + getSkillLevel(ctx, 'Attack'));
    ctx.log('Strength: ' + getSkillLevel(ctx, 'Strength'));
    ctx.log('Defence: ' + getSkillLevel(ctx, 'Defence'));
    ctx.log('Hitpoints: ' + getSkillLevel(ctx, 'Hitpoints'));
    ctx.log('Kills: ' + stats.kills);
    ctx.log('Kebabs eaten: ' + stats.kebabsEaten);
    ctx.log('GP: ' + getCoins(ctx));
    ctx.log('Total Level: ' + getTotalLevel(ctx));

    const equipment = ctx.state()?.equipment || [];
    ctx.log('Equipment:');
    for (const item of equipment) {
        if (item) ctx.log('  - ' + item.name);
    }
}

// === RUN THE ARC ===
runArc({
    characterName: 'calk',
    arcName: 'alkharid-combat',
    goal: 'Train combat skills in Al Kharid',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        kebabsEaten: 0,
        kebabsBought: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: alkharid-combat ===');
    ctx.log('Goal: Train combat, cycle styles, upgrade scimitars');

    const stateReady = await waitForState(ctx);
    if (!stateReady || ctx.state()?.player?.worldX === 0) {
        ctx.error('Cannot proceed without valid game state');
        return;
    }

    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    ctx.log('Starting position: (' + ctx.state()?.player?.worldX + ', ' + ctx.state()?.player?.worldZ + ')');
    ctx.log('Attack: ' + getSkillLevel(ctx, 'Attack') + ', Strength: ' + getSkillLevel(ctx, 'Strength') + ', Defence: ' + getSkillLevel(ctx, 'Defence'));
    ctx.log('GP: ' + getCoins(ctx));

    // Log current equipment
    const equipment = ctx.state()?.equipment || [];
    ctx.log('Equipment:');
    for (const item of equipment) {
        if (item) ctx.log('  - ' + item.name);
    }

    if (!isInAlKharid(ctx)) {
        ctx.warn('Not in Al Kharid!');
    }

    try {
        await combatLoop(ctx, stats);
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
