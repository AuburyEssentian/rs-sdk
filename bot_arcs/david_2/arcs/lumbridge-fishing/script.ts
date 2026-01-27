/**
 * Arc: lumbridge-fishing
 * Character: david_2
 *
 * Goal: Fish shrimp at Lumbridge Swamp for variety
 * Duration: 10 minutes
 */

import { runArc } from '../../../arc-runner.ts';

// Lumbridge Swamp fishing spot area
const FISHING_AREA = { x: 3239, z: 3147 };
const MAX_DRIFT = 20;

runArc({
    characterName: 'david_2',
    arcName: 'lumbridge-fishing',
    goal: 'Fish shrimp at Lumbridge Swamp',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
}, async (ctx) => {
    ctx.log('Starting fishing arc at Lumbridge Swamp!');

    // Stats tracking
    let fishCaught = 0;
    let startTime = Date.now();

    function getSkillLevel(name: string): number {
        return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
    }

    ctx.progress();

    // Main loop
    const duration = 10 * 60 * 1000;

    while (Date.now() - startTime < duration - 5000) {
        const state = ctx.state();

        // Check for bad state
        if (!state?.player || (state.player.worldX === 0 && state.player.worldZ === 0)) {
            ctx.log('Waiting for valid state...');
            await new Promise(r => setTimeout(r, 2000));
            ctx.progress();
            continue;
        }

        // Dismiss any dialogs (level-up, etc.)
        if (state.dialog.isOpen) {
            ctx.log('Dialog open, dismissing...');
            try {
                const dialogPromise = ctx.sdk.sendClickDialog(0);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Dialog timeout')), 5_000)
                );
                await Promise.race([dialogPromise, timeoutPromise]);
            } catch (err) {
                ctx.log('Dialog dismiss failed');
            }
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();
            continue;
        }

        // Check drift - walk toward fishing area if too far
        const drift = Math.sqrt(
            Math.pow(state.player.worldX - FISHING_AREA.x, 2) +
            Math.pow(state.player.worldZ - FISHING_AREA.z, 2)
        );

        if (drift > MAX_DRIFT) {
            ctx.log(`At (${state.player.worldX}, ${state.player.worldZ}), ${drift.toFixed(0)} tiles from fishing spot...`);

            // Walk in smaller steps toward the target
            const dx = FISHING_AREA.x - state.player.worldX;
            const dz = FISHING_AREA.z - state.player.worldZ;
            const stepSize = Math.min(15, drift);  // Max 15 tiles per step
            const ratio = stepSize / drift;
            const targetX = Math.round(state.player.worldX + dx * ratio);
            const targetZ = Math.round(state.player.worldZ + dz * ratio);

            ctx.log(`Walking toward (${targetX}, ${targetZ})...`);
            try {
                await ctx.bot.walkTo(targetX, targetZ);
            } catch (err) {
                ctx.log('Walk failed, trying click walk...');
                // Try clicking to walk
                try {
                    await ctx.sdk.sendWalkHere(targetX, targetZ);
                } catch (e) {
                    ctx.log('Click walk also failed');
                }
            }
            await new Promise(r => setTimeout(r, 3000));  // Wait for movement
            ctx.progress();
            continue;
        }

        // Find a fishing spot
        const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));

        if (spot) {
            // Look for "Net" option for small net fishing
            const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));

            if (netOpt) {
                ctx.log(`Fishing at spot (distance: ${spot.distance.toFixed(0)})...`);
                try {
                    const fishPromise = ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Fishing timeout')), 10_000)
                    );
                    await Promise.race([fishPromise, timeoutPromise]);
                    fishCaught++;
                } catch (err) {
                    ctx.log('Fishing action failed');
                }
                await new Promise(r => setTimeout(r, 3000));  // Wait for fishing animation
                ctx.progress();
                continue;
            }
        }

        // No spot found - walk toward fishing area
        ctx.log('Looking for fishing spots...');
        if (drift > 5) {
            try {
                await ctx.bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
            } catch (err) {
                // ignore
            }
        }
        await new Promise(r => setTimeout(r, 2000));
        ctx.progress();
    }

    // Final stats
    ctx.log('');
    ctx.log('========== FISHING ARC COMPLETE ==========');
    ctx.log(`Fishing actions: ${fishCaught}`);
    ctx.log(`Fishing level: ${getSkillLevel('Fishing')}`);
    ctx.log(`Cooking level: ${getSkillLevel('Cooking')}`);
    const totalLevel = ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0;
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('==========================================');

    await ctx.screenshot('final');
});
