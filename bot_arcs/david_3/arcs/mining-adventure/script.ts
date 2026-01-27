/**
 * Arc: mining-adventure
 * Character: david_3
 *
 * Goal: Train Mining from level 1!
 * Strategy:
 * 1. Buy pickaxe from Bob's Axes (1gp) - avoiding Dark Wizards
 * 2. Walk to SE Varrock mine (copper/tin, safe area)
 * 3. Mine and drop ore when full
 */

import { runArc } from '../../../arc-runner';

// Locations
const BOBS_AXES = { x: 3230, z: 3203 };
const SE_VARROCK_MINE = { x: 3285, z: 3365 };

// Safe waypoints to avoid Dark Wizards at ~(3220, 3220)
const SAFE_WAYPOINTS_TO_BOB = [
    { x: 3200, z: 3250 },  // West of dark wizards
    { x: 3230, z: 3250 },  // North of dark wizards
    { x: 3230, z: 3203 },  // Bob's Axes
];

const WAYPOINTS_TO_MINE = [
    { x: 3250, z: 3250 },  // East of Lumbridge
    { x: 3285, z: 3300 },  // South of mine
    { x: 3285, z: 3365 },  // SE Varrock mine
];

runArc({
    characterName: 'david_3',
    arcName: 'mining-adventure',
    goal: 'Buy pickaxe and train Mining at SE Varrock mine',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,  // Long timeout for walking
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Mining Adventure Arc ===');

    // Wait for state
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.warn('State did not fully populate');
    }
    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();

    const state = ctx.state();
    if (!state?.player) {
        ctx.error('No player state');
        return;
    }

    // Helpers
    const getSkillLevel = (name: string) =>
        ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;

    const getCoins = () =>
        ctx.state()?.inventory.find(i => i.name === 'Coins')?.count ?? 0;

    const hasPickaxe = () =>
        ctx.state()?.inventory.some(i => /pickaxe/i.test(i.name)) ?? false;

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Mining level: ${getSkillLevel('Mining')}`);
    ctx.log(`Coins: ${getCoins()}`);
    ctx.log(`Has pickaxe: ${hasPickaxe()}`);

    // Dismiss any dialogs
    if (state.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 500));
    }

    // Step 1: Buy pickaxe if we don't have one
    if (!hasPickaxe()) {
        ctx.log('Need to buy a pickaxe from Bob\'s Axes!');

        if (getCoins() < 1) {
            ctx.error('Not enough coins for pickaxe!');
            return;
        }

        // Walk to Bob's Axes using safe waypoints
        ctx.log('Walking to Bob\'s Axes (avoiding Dark Wizards)...');
        for (const wp of SAFE_WAYPOINTS_TO_BOB) {
            ctx.log(`Walking to (${wp.x}, ${wp.z})...`);
            await ctx.bot.walkTo(wp.x, wp.z);
            ctx.progress();
            await new Promise(r => setTimeout(r, 500));

            // Check HP - if low, wait a bit (we might be in combat)
            const currentHp = ctx.state()?.skills.find(s => s.name === 'Hitpoints')?.level ?? 10;
            const maxHp = ctx.state()?.skills.find(s => s.name === 'Hitpoints')?.baseLevel ?? 10;
            if (currentHp < maxHp / 2) {
                ctx.warn(`Low HP (${currentHp}/${maxHp}), waiting...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        // Find Bob (the shopkeeper)
        ctx.log('Looking for Bob...');
        await new Promise(r => setTimeout(r, 1000));

        const bob = ctx.state()?.nearbyNpcs.find(n => /bob/i.test(n.name));
        if (!bob) {
            ctx.error('Cannot find Bob!');
            // Log nearby NPCs for debugging
            const npcs = ctx.state()?.nearbyNpcs.slice(0, 5) ?? [];
            ctx.log('Nearby NPCs: ' + npcs.map(n => n.name).join(', '));
            return;
        }

        // Open shop
        ctx.log(`Found Bob at distance ${bob.distance.toFixed(1)}`);
        const tradeOpt = bob.optionsWithIndex.find(o => /trade/i.test(o.text));
        if (tradeOpt) {
            await ctx.sdk.sendInteractNpc(bob.index, tradeOpt.opIndex);
            ctx.progress();

            // Wait for shop to open
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 500));
                if (ctx.state()?.shop?.isOpen) {
                    ctx.log('Shop opened!');
                    break;
                }
            }
        }

        // Buy bronze pickaxe
        const shop = ctx.state()?.shop;
        if (shop?.isOpen) {
            const pickaxe = shop.shopItems?.find(i => /bronze pickaxe/i.test(i.name));
            if (pickaxe && pickaxe.count > 0) {
                ctx.log(`Buying ${pickaxe.name} for ${pickaxe.price ?? '?'} gp...`);
                await ctx.sdk.sendShopBuy(pickaxe.slot, 1);
                await new Promise(r => setTimeout(r, 500));
                ctx.progress();
            } else {
                ctx.error('No bronze pickaxe in stock!');
                // Log shop items
                const items = shop.shopItems?.slice(0, 10) ?? [];
                ctx.log('Shop items: ' + items.map(i => `${i.name} x${i.count}`).join(', '));
            }

            // Close shop
            await ctx.sdk.sendCloseShop();
            await new Promise(r => setTimeout(r, 500));
        }

        if (!hasPickaxe()) {
            ctx.error('Failed to get pickaxe!');
            return;
        }
        ctx.log('Got pickaxe!');
    }

    // Step 2: Walk to SE Varrock mine
    ctx.log('Walking to SE Varrock mine...');
    for (const wp of WAYPOINTS_TO_MINE) {
        ctx.log(`Walking to (${wp.x}, ${wp.z})...`);
        await ctx.bot.walkTo(wp.x, wp.z);
        ctx.progress();
        await new Promise(r => setTimeout(r, 500));

        // Dismiss dialogs
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }
    }

    ctx.log('Arrived at SE Varrock mine!');
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);

    // Step 3: Mining loop
    let oresMined = 0;
    let startLevel = getSkillLevel('Mining');
    ctx.log(`Starting mining at level ${startLevel}`);

    while (true) {
        ctx.progress();
        const currentState = ctx.state();
        if (!currentState?.player) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs (level-up)
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing level-up dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Drop ore if inventory full
        if (currentState.inventory.length >= 28) {
            ctx.log('Inventory full - dropping ores...');
            const ores = currentState.inventory.filter(i => /ore|clay/i.test(i.name));
            for (const ore of ores) {
                await ctx.sdk.sendDropItem(ore.slot);
                ctx.progress();
                await new Promise(r => setTimeout(r, 100));
            }
            continue;
        }

        // Find rock to mine
        const rock = currentState.nearbyLocs
            .filter(loc => /rocks?$/i.test(loc.name) && !/rockslide/i.test(loc.name))
            .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];

        if (rock) {
            const mineOpt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text));
            if (mineOpt) {
                const prevInvCount = currentState.inventory.length;
                await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
                ctx.progress();

                // Wait for mining
                await new Promise(r => setTimeout(r, 3000));

                // Check if we got ore
                const newInvCount = ctx.state()?.inventory.length ?? prevInvCount;
                if (newInvCount > prevInvCount) {
                    oresMined++;
                    if (oresMined % 10 === 0) {
                        const level = getSkillLevel('Mining');
                        ctx.log(`Mined ${oresMined} ores, Mining level: ${level}`);
                    }
                }
            }
        } else {
            // No rocks nearby - wander around mine area
            const dx = Math.floor(Math.random() * 8) - 4;
            const dz = Math.floor(Math.random() * 8) - 4;
            await ctx.sdk.sendWalk(SE_VARROCK_MINE.x + dx, SE_VARROCK_MINE.z + dz);
            ctx.progress();
            await new Promise(r => setTimeout(r, 2000));
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
