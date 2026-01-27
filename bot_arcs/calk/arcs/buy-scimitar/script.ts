/**
 * Arc: buy-scimitar
 * Character: calk
 *
 * Goal: Buy scimitar from Zeke's shop in Al Kharid
 * Strategy:
 * 1. Walk to Zeke's Scimitar Shop (3287, 3186)
 * 2. Buy the best scimitar we can afford and use
 * 3. Equip it
 *
 * Duration: 2 minutes (quick shopping arc)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// === LOCATIONS ===
const LOCATIONS = {
    ZEKE_SHOP: { x: 3287, z: 3186 },
};

// === SCIMITAR INFO ===
const SCIMITARS = [
    { name: 'bronze scimitar', cost: 32, attackReq: 1 },
    { name: 'iron scimitar', cost: 112, attackReq: 5 },
    { name: 'steel scimitar', cost: 400, attackReq: 10 },
    { name: 'mithril scimitar', cost: 1040, attackReq: 20 },
    { name: 'adamant scimitar', cost: 2560, attackReq: 30 },
];

// === HELPERS ===
function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
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

// === MAIN LOGIC ===
async function buyBestScimitar(ctx: ScriptContext): Promise<string | null> {
    const gp = getCoins(ctx);
    const attackLevel = getSkillLevel(ctx, 'Attack');

    ctx.log('Current GP: ' + gp + ', Attack level: ' + attackLevel);

    // Find best scimitar we can afford and use
    const affordableScimitars = SCIMITARS
        .filter(s => s.cost <= gp && s.attackReq <= attackLevel)
        .sort((a, b) => b.attackReq - a.attackReq);  // Best first

    if (affordableScimitars.length === 0) {
        ctx.warn('Cannot afford any scimitar we can use!');
        ctx.log('Need either more GP or higher Attack level');
        return null;
    }

    const targetScimitar = affordableScimitars[0]!;
    ctx.log('Target: ' + targetScimitar.name + ' (' + targetScimitar.cost + ' gp)');

    // Walk to Zeke's shop
    ctx.log('Walking to Zeke\'s Scimitar Shop...');
    await ctx.bot.walkTo(LOCATIONS.ZEKE_SHOP.x, LOCATIONS.ZEKE_SHOP.z);
    ctx.progress();
    await new Promise(r => setTimeout(r, 1000));

    // Find Zeke and open shop
    ctx.log('Looking for Zeke...');
    const zeke = ctx.sdk.findNearbyNpc(/zeke/i);
    if (!zeke) {
        ctx.warn('Zeke not found nearby!');
        return null;
    }

    const tradeOpt = zeke.optionsWithIndex.find(o => /trade/i.test(o.text));
    if (!tradeOpt) {
        ctx.warn('No trade option on Zeke!');
        return null;
    }

    ctx.log('Opening shop...');
    await ctx.sdk.sendInteractNpc(zeke.index, tradeOpt.opIndex);
    ctx.progress();
    await new Promise(r => setTimeout(r, 1500));

    // Wait for shop to open
    for (let i = 0; i < 15; i++) {
        if (ctx.state()?.shop?.isOpen) break;
        await new Promise(r => setTimeout(r, 300));
    }

    if (!ctx.state()?.shop?.isOpen) {
        ctx.warn('Shop did not open!');
        return null;
    }

    // Wait a bit more for shop items to load
    await new Promise(r => setTimeout(r, 1000));

    ctx.log('Shop opened! Looking for ' + targetScimitar.name + '...');

    // Find the scimitar in shop
    const shop = ctx.state()?.shop;
    const shopItems = shop?.shopItems || [];
    ctx.log('Shop: ' + shop?.title);
    ctx.log('Shop has ' + shopItems.length + ' items');

    // Debug: log all shop items
    for (const item of shopItems) {
        ctx.log('  Shop item: ' + item.name + ' (slot ' + item.slot + ', count ' + item.count + ')');
    }

    const scimitarItem = shopItems.find(item =>
        item.name.toLowerCase().includes(targetScimitar.name.split(' ')[0]!)  // Match "bronze" etc
    );

    if (!scimitarItem) {
        ctx.warn('Could not find ' + targetScimitar.name + ' in shop!');
        // Try finding any scimitar
        const anyScimitar = shopItems.find(item => /scimitar/i.test(item.name));
        if (anyScimitar) {
            ctx.log('Found alternative: ' + anyScimitar.name);
        }
        await ctx.bot.closeShop();
        return null;
    }

    ctx.log('Found ' + scimitarItem.name + ' at slot ' + scimitarItem.slot + ', buying...');
    await ctx.sdk.sendShopBuy(scimitarItem.slot, 1);
    ctx.progress();
    await new Promise(r => setTimeout(r, 500));

    // Close shop
    await ctx.bot.closeShop();
    await new Promise(r => setTimeout(r, 500));

    // Check if we got it
    const inventory = ctx.state()?.inventory || [];
    const boughtScimitar = inventory.find(i =>
        i.name.toLowerCase().includes('scimitar')
    );

    if (boughtScimitar) {
        ctx.log('Successfully bought ' + boughtScimitar.name + '!');
        return boughtScimitar.name;
    }

    ctx.warn('Failed to buy scimitar');
    return null;
}

async function equipScimitar(ctx: ScriptContext): Promise<boolean> {
    const scimitar = ctx.state()?.inventory.find(i => /scimitar/i.test(i.name));
    if (!scimitar) {
        ctx.warn('No scimitar in inventory to equip');
        return false;
    }

    ctx.log('Equipping ' + scimitar.name + '...');
    const result = await ctx.bot.equipItem(scimitar);
    ctx.progress();

    if (result.success) {
        ctx.log('Equipped ' + scimitar.name + '!');
        return true;
    } else {
        ctx.warn('Failed to equip: ' + result.message);
        return false;
    }
}

// === RUN THE ARC ===
runArc({
    characterName: 'calk',
    arcName: 'buy-scimitar',
    goal: 'Buy and equip best affordable scimitar',
    timeLimit: 2 * 60 * 1000,  // 2 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Arc: buy-scimitar ===');
    ctx.log('Goal: Buy best affordable scimitar from Zeke');

    const stateReady = await waitForState(ctx);
    if (!stateReady || ctx.state()?.player?.worldX === 0) {
        ctx.error('Cannot proceed without valid game state');
        return;
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    const player = ctx.state()?.player;
    ctx.log('Starting position: (' + player?.worldX + ', ' + player?.worldZ + ')');
    ctx.log('Starting GP: ' + getCoins(ctx));
    ctx.log('Attack level: ' + getSkillLevel(ctx, 'Attack'));

    // Check if in Al Kharid
    if (!isInAlKharid(ctx)) {
        ctx.warn('Not in Al Kharid! Running anyway...');
    }

    try {
        // Buy scimitar
        const boughtScimitar = await buyBestScimitar(ctx);
        if (!boughtScimitar) {
            ctx.error('Failed to buy scimitar');
            return;
        }

        // Equip it
        await equipScimitar(ctx);

        ctx.log('');
        ctx.log('=== Arc Complete ===');
        ctx.log('Bought and equipped: ' + boughtScimitar);
        ctx.log('Remaining GP: ' + getCoins(ctx));
        ctx.log('Attack level: ' + getSkillLevel(ctx, 'Attack'));

        // Log equipment
        const equipment = ctx.state()?.equipment || [];
        ctx.log('Current equipment:');
        for (const item of equipment) {
            if (item) ctx.log('  - ' + item.name);
        }

    } catch (e) {
        if (e instanceof StallError) {
            ctx.error('Arc aborted: ' + e.message);
        } else {
            throw e;
        }
    }
});
