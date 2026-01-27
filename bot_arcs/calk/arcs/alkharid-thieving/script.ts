/**
 * Arc: alkharid-thieving
 * Character: calk
 *
 * Goal: Train thieving in Al Kharid, earn GP, buy kebabs for healing
 * Strategy:
 * 1. Find men near Al Kharid palace to pickpocket (3gp each)
 * 2. When HP low, buy kebabs from Karim (1gp each, heals 1-10)
 * 3. Bank GP periodically at Al Kharid bank
 * 4. Level thieving for Warriors (level 25+, 18gp each)
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// === LOCATIONS ===
const LOCATIONS = {
    ALKHARID_MEN: { x: 3293, z: 3175 },        // Men near palace
    ALKHARID_KEBAB: { x: 3273, z: 3180 },      // Karim the kebab seller
    ALKHARID_BANK: { x: 3269, z: 3167 },       // Al Kharid bank
    ALKHARID_SCIMITAR: { x: 3287, z: 3186 },   // Zeke's scimitar shop
};

// === CONFIG ===
const CONFIG = {
    BUY_KEBAB_THRESHOLD: 5,      // Buy kebab when HP <= this
    EAT_KEBAB_THRESHOLD: 7,      // Eat kebab when HP <= this
    BANK_GP_THRESHOLD: 99999,    // Disabled for now - focus on thieving
    MIN_KEBABS_IN_INV: 3,        // Try to keep at least this many kebabs
};

// === STATS ===
interface Stats {
    pickpocketAttempts: number;
    successes: number;
    failures: number;
    gpEarned: number;
    kebabsBought: number;
    kebabsEaten: number;
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

function getSkillXp(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.experience ?? 0;
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
    // Al Kharid is roughly x >= 3267 (bank is at 3269)
    // Also check z to make sure we're in the right area (south of toll gate at ~3228)
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

// === PICKPOCKETING ===
function findPickpocketTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const thievingLevel = getSkillLevel(ctx, 'Thieving');

    // At level 25+, prefer warriors (18gp). Otherwise, men (3gp)
    const targetPattern = thievingLevel >= 25 ? /^(man|warrior)$/i : /^man$/i;

    const targets = state.nearbyNpcs
        .filter(npc => targetPattern.test(npc.name))
        .filter(npc => npc.options.some(opt => /pickpocket/i.test(opt)))
        .sort((a, b) => a.distance - b.distance);

    return targets[0] ?? null;
}

async function pickpocket(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const target = findPickpocketTarget(ctx);
    if (!target) {
        return false;
    }

    const pickpocketOpt = target.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
    if (!pickpocketOpt) {
        return false;
    }

    stats.pickpocketAttempts++;
    const gpBefore = getCoins(ctx);

    await ctx.sdk.sendInteractNpc(target.index, pickpocketOpt.opIndex);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1500));

    // Check result
    const gpAfter = getCoins(ctx);
    const gpGained = gpAfter - gpBefore;

    if (gpGained > 0) {
        stats.successes++;
        stats.gpEarned += gpGained;
        return true;
    } else {
        stats.failures++;
        // Might be stunned - wait for recovery
        await new Promise(r => setTimeout(r, 3000));
        return false;
    }
}

// === KEBAB BUYING ===
async function buyKebab(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('Walking to kebab seller (Karim)...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_KEBAB.x, LOCATIONS.ALKHARID_KEBAB.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    // Find kebab seller
    const seller = ctx.state()?.nearbyNpcs.find(n => /kebab/i.test(n.name));
    if (!seller) {
        ctx.warn('No kebab seller found nearby!');
        return false;
    }

    const talkOpt = seller.optionsWithIndex.find(o => /talk/i.test(o.text));
    if (!talkOpt) {
        ctx.warn('No talk option on kebab seller!');
        return false;
    }

    ctx.log('Talking to kebab seller...');
    await ctx.sdk.sendInteractNpc(seller.index, talkOpt.opIndex);
    await new Promise(r => setTimeout(r, 1000));

    // Handle dialog to buy kebab
    for (let i = 0; i < 15; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        const buyOpt = s.dialog.options.find(o => /yes/i.test(o.text));
        if (buyOpt) {
            ctx.log('Buying kebab...');
            await ctx.sdk.sendClickDialog(buyOpt.index);
            stats.kebabsBought++;
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 500));
            break;
        }

        await ctx.sdk.sendClickDialog(0);  // Click to continue
        await new Promise(r => setTimeout(r, 300));
    }

    // Close any remaining dialog
    await dismissDialogs(ctx);

    return true;
}

// === EATING ===
async function eatFood(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const food = ctx.state()?.inventory.find(i =>
        /kebab|bread|shrimp|cooked/i.test(i.name)
    );

    if (!food) {
        return false;
    }

    const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
    if (!eatOpt) {
        return false;
    }

    const hp = getHP(ctx);
    ctx.log('Eating ' + food.name + ' (HP: ' + hp.current + '/' + hp.max + ')');
    await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
    stats.kebabsEaten++;
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 600));
    return true;
}

// === BANKING ===
async function bankGP(ctx: ScriptContext, stats: Stats): Promise<void> {
    const gp = getCoins(ctx);
    if (gp < CONFIG.BANK_GP_THRESHOLD) return;

    ctx.log('Banking ' + gp + ' GP...');
    await ctx.bot.walkTo(LOCATIONS.ALKHARID_BANK.x, LOCATIONS.ALKHARID_BANK.z);
    markProgress(ctx, stats);
    await new Promise(r => setTimeout(r, 1000));

    // Find banker NPC
    const banker = ctx.sdk.findNearbyNpc(/banker/i);
    if (!banker) {
        ctx.warn('No banker found nearby!');
        return;
    }

    const bankOpt = banker.optionsWithIndex.find(o => /bank/i.test(o.text));
    if (!bankOpt) {
        ctx.warn('No bank option on banker!');
        return;
    }

    // Open bank interface
    ctx.log('Opening bank...');
    await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
    await new Promise(r => setTimeout(r, 1500));

    // Wait for bank to open (bank uses modalInterface)
    for (let i = 0; i < 10; i++) {
        if (ctx.state()?.modalOpen) break;
        await new Promise(r => setTimeout(r, 300));
    }

    if (!ctx.state()?.modalOpen) {
        ctx.warn('Bank did not open!');
        return;
    }

    // Deposit coins using -1 for all
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    if (coins) {
        await ctx.sdk.sendBankDeposit(coins.slot, -1);
        ctx.log('Deposited all GP');
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 500));
    }

    // Close bank
    await ctx.bot.closeShop();  // Works for bank interface too
    await new Promise(r => setTimeout(r, 500));
}

// === MAIN LOOP ===
async function thievingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) break;

        // Periodic status logging
        if (loopCount % 20 === 0) {
            const thieving = getSkillLevel(ctx, 'Thieving');
            const hp = getHP(ctx);
            const gp = getCoins(ctx);
            const kebabs = getKebabCount(ctx);
            ctx.log('Loop ' + loopCount + ': Thieving ' + thieving +
                ' | HP: ' + hp.current + '/' + hp.max +
                ' | GP: ' + gp + ' | Kebabs: ' + kebabs +
                ' | Success rate: ' + Math.round(stats.successes / Math.max(1, stats.pickpocketAttempts) * 100) + '%');
        }

        // Dismiss dialogs (level-ups, etc.)
        if (currentState.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check HP and eat/buy kebabs
        const hp = getHP(ctx);
        if (hp.current <= CONFIG.EAT_KEBAB_THRESHOLD) {
            const hasFood = await eatFood(ctx, stats);
            if (!hasFood && getCoins(ctx) >= 1) {
                ctx.log('Low HP and no food - buying kebab!');
                await buyKebab(ctx, stats);
                await eatFood(ctx, stats);
            }
            continue;
        }

        // Buy kebabs if we're running low and have GP
        const kebabCount = getKebabCount(ctx);
        const gp = getCoins(ctx);
        if (kebabCount < CONFIG.MIN_KEBABS_IN_INV && gp >= 3) {
            ctx.log('Restocking kebabs (' + kebabCount + ' left, ' + gp + ' GP)...');
            await buyKebab(ctx, stats);
            continue;
        }

        // Bank if we have lots of GP
        if (gp >= CONFIG.BANK_GP_THRESHOLD) {
            await bankGP(ctx, stats);
            continue;
        }

        // Find and pickpocket target
        const target = findPickpocketTarget(ctx);
        if (!target) {
            // Walk to thieving spot (men near palace)
            const player = currentState.player;
            if (player) {
                const distToMen = Math.sqrt(
                    Math.pow(player.worldX - LOCATIONS.ALKHARID_MEN.x, 2) +
                    Math.pow(player.worldZ - LOCATIONS.ALKHARID_MEN.z, 2)
                );
                if (distToMen > 15) {
                    ctx.log('No men nearby - walking to thieving spot (dist: ' + distToMen.toFixed(0) + ')...');
                    await ctx.bot.walkTo(LOCATIONS.ALKHARID_MEN.x, LOCATIONS.ALKHARID_MEN.z);
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
            }

            // Already at spot but no target - wait for respawn
            ctx.log('At thieving spot but no targets - waiting...');
            await new Promise(r => setTimeout(r, 1000));
            markProgress(ctx, stats);
            continue;
        }

        // Pickpocket!
        await pickpocket(ctx, stats);
        await new Promise(r => setTimeout(r, 300));
    }
}

// === FINAL STATS ===
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;
    const successRate = stats.pickpocketAttempts > 0
        ? Math.round(stats.successes / stats.pickpocketAttempts * 100)
        : 0;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log('Duration: ' + Math.round(duration) + 's');
    ctx.log('Thieving Level: ' + getSkillLevel(ctx, 'Thieving'));
    ctx.log('Thieving XP: ' + getSkillXp(ctx, 'Thieving'));
    ctx.log('Pickpocket Attempts: ' + stats.pickpocketAttempts);
    ctx.log('Successes: ' + stats.successes + ' (' + successRate + '%)');
    ctx.log('Failures: ' + stats.failures);
    ctx.log('GP Earned: ' + stats.gpEarned);
    ctx.log('Kebabs Bought: ' + stats.kebabsBought);
    ctx.log('Kebabs Eaten: ' + stats.kebabsEaten);
    ctx.log('Current GP: ' + getCoins(ctx));
    ctx.log('Total Level: ' + getTotalLevel(ctx));

    const player = ctx.state()?.player;
    ctx.log('Position: (' + player?.worldX + ', ' + player?.worldZ + ')');
}

// === RUN THE ARC ===
runArc({
    characterName: 'calk',
    arcName: 'alkharid-thieving',
    goal: 'Train thieving in Al Kharid, earn GP',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        pickpocketAttempts: 0,
        successes: 0,
        failures: 0,
        gpEarned: 0,
        kebabsBought: 0,
        kebabsEaten: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: alkharid-thieving ===');
    ctx.log('Goal: Train thieving, earn GP, use kebabs for healing');

    const stateReady = await waitForState(ctx);
    if (!stateReady || ctx.state()?.player?.worldX === 0) {
        ctx.error('Cannot proceed without valid game state');
        return;
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    const player = ctx.state()?.player;
    ctx.log('Starting position: (' + player?.worldX + ', ' + player?.worldZ + ')');
    ctx.log('Starting GP: ' + getCoins(ctx));
    ctx.log('Thieving level: ' + getSkillLevel(ctx, 'Thieving'));

    // Check if in Al Kharid
    if (!isInAlKharid(ctx)) {
        ctx.error('Not in Al Kharid! Run get-to-alkharid arc first.');
        logFinalStats(ctx, stats);
        return;
    }

    try {
        await thievingLoop(ctx, stats);
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
