/**
 * Arc: mine-here
 * Character: david_3
 *
 * Goal: Mine at current location - no walking required!
 * Just mine rocks nearby and drop ore when full.
 */

import { runArc } from '../../../arc-runner';

runArc({
    characterName: 'david_3',
    arcName: 'mine-here',
    goal: 'Mine at current location',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Mine Here Arc ===');

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

    const hasPickaxe = () =>
        ctx.state()?.inventory.some(i => /pickaxe/i.test(i.name)) ?? false;

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Mining level: ${getSkillLevel('Mining')}`);
    ctx.log(`Has pickaxe: ${hasPickaxe()}`);

    if (!hasPickaxe()) {
        ctx.error('No pickaxe in inventory!');
        return;
    }

    // Dismiss any dialogs
    if (state.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 500));
    }

    // Mining loop
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
            // No rocks nearby - wander a bit to find some
            const player = currentState.player;
            const dx = Math.floor(Math.random() * 10) - 5;
            const dz = Math.floor(Math.random() * 10) - 5;
            ctx.log(`No rocks found, wandering to (${player.worldX + dx}, ${player.worldZ + dz})...`);
            await ctx.sdk.sendWalk(player.worldX + dx, player.worldZ + dz);
            ctx.progress();
            await new Promise(r => setTimeout(r, 2000));
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
