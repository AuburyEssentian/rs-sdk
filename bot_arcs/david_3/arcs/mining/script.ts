/**
 * Arc: mining
 * Character: david_3
 *
 * Goal: Buy a bronze pickaxe and train mining.
 * Location: SE Varrock mine (3285, 3365) - copper/tin rocks
 */

import { runArc } from '../../../arc-runner';

const BOBS_AXES = { x: 3230, z: 3203 };
const VARROCK_MINE = { x: 3285, z: 3365 };

runArc({
    characterName: 'david_3',
    arcName: 'mining',
    goal: 'Buy pickaxe and train mining',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Mining Arc ===');

    // Wait for state
    ctx.log('Waiting for game state...');
    let state = ctx.state();
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
        state = ctx.state();
        if (state?.player && state.player.worldX > 0 && state.inventory.length > 0) {
            break;
        }
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.error('No valid player state');
        return;
    }

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);

    // Check for pickaxe
    let hasPickaxe = state.inventory.some(i => /pickaxe/i.test(i.name));
    ctx.log(`Has pickaxe: ${hasPickaxe}`);

    // If no pickaxe, go buy one from Bob's Axes
    if (!hasPickaxe) {
        const coins = state.inventory.find(i => /coins/i.test(i.name));
        const gp = coins?.count ?? 0;
        ctx.log(`GP: ${gp}`);

        if (gp < 1) {
            ctx.error('Not enough GP for pickaxe!');
            return;
        }

        ctx.log('Walking to Bob\'s Axes to buy pickaxe...');

        // Walk to Bob's (avoiding dark wizards)
        const waypoints = [
            { x: 3120, z: 3250 },  // From Draynor go east
            { x: 3180, z: 3260 },  // North of dark wizards
            { x: 3230, z: 3240 },  // South toward Lumbridge
            { x: BOBS_AXES.x, z: BOBS_AXES.z },
        ];

        for (const wp of waypoints) {
            await ctx.bot.walkTo(wp.x, wp.z);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
        }

        // Open Bob's shop
        ctx.log('Opening Bob\'s shop...');
        const shopResult = await ctx.bot.openShop(/bob/i);
        ctx.progress();

        if (!shopResult.success) {
            ctx.warn('Could not open shop');
            return;
        }

        await new Promise(r => setTimeout(r, 500));

        // Buy bronze pickaxe (1gp)
        ctx.log('Buying bronze pickaxe...');
        const buyResult = await ctx.bot.buyFromShop(/bronze pickaxe/i, 1);
        ctx.log(`Buy result: ${buyResult.message}`);
        ctx.progress();

        await new Promise(r => setTimeout(r, 500));

        hasPickaxe = ctx.state()?.inventory.some(i => /pickaxe/i.test(i.name)) ?? false;
        if (!hasPickaxe) {
            ctx.warn('Failed to buy pickaxe');
            return;
        }
    }

    ctx.log('Have pickaxe, heading to mine...');

    // Drop logs to make room
    ctx.log('Dropping logs to make room...');
    const currentState = ctx.state();
    for (const item of (currentState?.inventory ?? [])) {
        if (/logs$/i.test(item.name)) {
            await ctx.sdk.sendDropItem(item.slot);
            await new Promise(r => setTimeout(r, 100));
        }
    }
    ctx.progress();

    // Walk to Varrock mine - need waypoints from Lumbridge
    ctx.log('Walking to SE Varrock mine...');
    const mineWaypoints = [
        { x: 3250, z: 3240 },  // East of Lumbridge
        { x: 3275, z: 3290 },  // Northeast
        { x: 3280, z: 3340 },  // Further north
        { x: VARROCK_MINE.x, z: VARROCK_MINE.z },  // Mine
    ];

    for (const wp of mineWaypoints) {
        ctx.log(`Walking to (${wp.x}, ${wp.z})...`);
        await ctx.bot.walkTo(wp.x, wp.z);
        ctx.progress();
        await new Promise(r => setTimeout(r, 300));
    }

    // Main mining loop
    let loopCount = 0;
    const startXp = ctx.state()?.skills.find(s => s.name === 'Mining')?.experience || 0;

    ctx.log('Starting mining...');

    while (true) {
        loopCount++;
        ctx.progress();

        const miningState = ctx.state();
        if (!miningState) continue;

        // Handle dialogs
        if (miningState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if animating (mining animation = 625)
        const isMining = miningState.player?.animId === 625;
        if (isMining) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find a rock to mine
        const rock = miningState.nearbyLocs
            .filter(loc => /rocks?$/i.test(loc.name))
            .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];

        if (rock) {
            const mineOpt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text));
            if (mineOpt) {
                if (rock.distance > 3) {
                    await ctx.sdk.sendWalk(rock.x, rock.z, true);
                    await new Promise(r => setTimeout(r, 500));
                }
                await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
                ctx.progress();
            }
        } else {
            ctx.log('No rocks nearby, walking to mine...');
            await ctx.bot.walkTo(VARROCK_MINE.x, VARROCK_MINE.z);
            ctx.progress();
        }

        // Drop ore when inventory gets full
        if (miningState.inventory.length >= 27) {
            ctx.log('Dropping ore...');
            const ores = miningState.inventory.filter(i => /ore$/i.test(i.name));
            for (const ore of ores) {
                await ctx.sdk.sendDropItem(ore.slot);
                await new Promise(r => setTimeout(r, 100));
            }
            ctx.progress();
        }

        // Progress report every 20 loops
        if (loopCount % 20 === 0) {
            const miningLevel = miningState.skills.find(s => s.name === 'Mining')?.baseLevel ?? 1;
            const xpGained = (miningState.skills.find(s => s.name === 'Mining')?.experience || 0) - startXp;
            ctx.log(`Loop ${loopCount}: Mining level ${miningLevel}, +${xpGained} XP`);
        }

        await new Promise(r => setTimeout(r, 1500));
    }
});
