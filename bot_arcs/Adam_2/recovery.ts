/**
 * Recovery script - Walk to Lumbridge and sell hides using SDK directly
 * Uses sendWalk instead of bot.walkTo to avoid timeout issues
 */

import { runArc } from '../arc-runner.ts';

const LUMBRIDGE_GENERAL_STORE = { x: 3211, z: 3247 };

// Shorter waypoints from cow field to Lumbridge (closer together)
const WAYPOINTS = [
    { x: 3240, z: 3275 },
    { x: 3230, z: 3265 },
    { x: 3220, z: 3255 },
    { x: 3215, z: 3250 },
    { x: 3211, z: 3247 },
];

runArc({
    characterName: 'Adam_2',
    arcName: 'recovery',
    goal: 'Walk to Lumbridge and sell hides',
    timeLimit: 10 * 60 * 1000,
    stallTimeout: 120_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    ctx.log('=== Recovery: Sell hides at Lumbridge ===');

    // Extended wait for state
    ctx.log('Waiting for state...');
    for (let i = 0; i < 60; i++) {
        const state = ctx.state();
        if (state?.player && state.player.worldX > 100) {
            ctx.log('State ready at (' + state.player.worldX + ', ' + state.player.worldZ + ')');
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();
    }

    const state = ctx.state();
    const hides = state?.inventory.filter(i => /cow\s*hide/i.test(i.name)).length ?? 0;
    ctx.log('Hides in inventory: ' + hides);
    ctx.log('Position: (' + (state?.player?.worldX ?? 0) + ', ' + (state?.player?.worldZ ?? 0) + ')');

    if (hides === 0) {
        ctx.log('No hides to sell!');
        return;
    }

    // Walk to Lumbridge using SDK directly (no bot wrapper)
    ctx.log('Walking to Lumbridge...');

    for (const wp of WAYPOINTS) {
        // Check if we need to walk to this waypoint
        const pos = ctx.state()?.player;
        if (!pos) {
            ctx.log('Lost player state, waiting...');
            await new Promise(r => setTimeout(r, 5000));
            ctx.progress();
            continue;
        }

        const dist = Math.sqrt(
            Math.pow(pos.worldX - wp.x, 2) +
            Math.pow(pos.worldZ - wp.z, 2)
        );

        if (dist < 10) {
            ctx.log('Already at waypoint (' + wp.x + ', ' + wp.z + ')');
            continue;
        }

        ctx.log('Walking to (' + wp.x + ', ' + wp.z + ')...');

        // Fire the walk command - don't await the full action, just wait for it to send
        ctx.sdk.sendWalk(wp.x, wp.z, true).catch(() => {});

        // Wait for arrival (or timeout)
        let arrived = false;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1500));
            ctx.progress();

            // Dismiss dialogs
            if (ctx.state()?.dialog?.isOpen) {
                try {
                    await ctx.sdk.sendClickDialog(0);
                } catch {}
            }

            const curPos = ctx.state()?.player;
            if (curPos && curPos.worldX > 100) {
                const curDist = Math.sqrt(
                    Math.pow(curPos.worldX - wp.x, 2) +
                    Math.pow(curPos.worldZ - wp.z, 2)
                );
                ctx.log('  At (' + curPos.worldX + ', ' + curPos.worldZ + '), dist=' + curDist.toFixed(0));
                if (curDist < 10) {
                    ctx.log('Reached waypoint');
                    arrived = true;
                    break;
                }
            }
        }

        if (!arrived) {
            ctx.log('Failed to reach waypoint, trying next...');
        }
    }

    // Check if we're near the shop
    const finalPos = ctx.state()?.player;
    if (finalPos) {
        const distToShop = Math.sqrt(
            Math.pow(finalPos.worldX - LUMBRIDGE_GENERAL_STORE.x, 2) +
            Math.pow(finalPos.worldZ - LUMBRIDGE_GENERAL_STORE.z, 2)
        );
        ctx.log('Distance to shop: ' + distToShop.toFixed(0) + ' tiles');

        if (distToShop < 20) {
            ctx.log('Near shop! Opening...');

            const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop.?keeper/i.test(n.name));
            if (shopkeeper) {
                const tradeOpt = shopkeeper.optionsWithIndex?.find(o => /trade/i.test(o.text));
                if (tradeOpt) {
                    await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);
                    await new Promise(r => setTimeout(r, 3000));

                    // Sell hides
                    const inv = ctx.state()?.inventory ?? [];
                    let sold = 0;
                    for (const item of inv) {
                        if (/cow\s*hide/i.test(item.name)) {
                            const sellOpt = item.optionsWithIndex?.find(o => /sell/i.test(o.text));
                            if (sellOpt) {
                                await ctx.sdk.sendUseItem(item.slot, sellOpt.opIndex);
                                sold++;
                                await new Promise(r => setTimeout(r, 300));
                                ctx.progress();
                            }
                        }
                    }
                    ctx.log('Sold ' + sold + ' hides');
                }
            } else {
                ctx.log('Nearby NPCs: ' + ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', '));
            }
        }
    }

    // Final state
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name))?.count ?? 0;
    ctx.log('Final GP: ' + coins);
    ctx.log('Position: (' + (ctx.state()?.player?.worldX ?? 0) + ', ' + (ctx.state()?.player?.worldZ ?? 0) + ')');
});
