import { runArc } from '../../../arc-runner';

/**
 * Fishing Adventure - Go to Draynor Village for small net fishing!
 *
 * Previous attempt: Lumbridge Swamp only has Lure/Bait spots (fly fishing, level 20+)
 * This time: Draynor Village at (3087, 3230) has Net/Bait spots for shrimp!
 */

const DRAYNOR_FISHING = { x: 3087, z: 3230 };

runArc({
    characterName: 'david_2',
    arcName: 'fishing-adventure',
    goal: 'Walk to Draynor Village and fish for shrimp with small net',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
}, async (ctx) => {
    ctx.log('=== Fishing Adventure v2 - Draynor Village ===');

    // Wait for valid game state
    let state = ctx.state();
    let retries = 0;
    while ((!state.player || state.player.worldX === 0) && retries < 30) {
        ctx.log(`Waiting for valid game state... (attempt ${retries + 1})`);
        await new Promise(r => setTimeout(r, 1000));
        state = ctx.state();
        retries++;
        ctx.progress();
    }

    if (!state.player || state.player.worldX === 0) {
        ctx.error('Failed to get valid game state after 30 seconds');
        return;
    }

    ctx.log(`Starting position: (${state.player?.worldX}, ${state.player?.worldZ})`);

    // Verify we have a fishing net
    const hasNet = state.inventory.some(i => /fishing net/i.test(i.name));
    if (!hasNet) {
        ctx.error('No fishing net in inventory! Cannot fish.');
        return;
    }
    ctx.log('Have fishing net - good to go!');

    // Walk to Draynor Village - it's west from Lumbridge
    ctx.log(`Walking to Draynor Village fishing spot at (${DRAYNOR_FISHING.x}, ${DRAYNOR_FISHING.z})...`);

    const waypoints = [
        { x: 3220, z: 3230 },  // West through Lumbridge
        { x: 3180, z: 3230 },  // Continue west
        { x: 3140, z: 3230 },  // Past church
        { x: 3100, z: 3230 },  // Almost there
        DRAYNOR_FISHING,       // Draynor fishing spot
    ];

    for (const waypoint of waypoints) {
        ctx.progress();
        state = ctx.state();

        // Skip invalid states
        if (!state.player || state.player.worldX === 0) {
            ctx.log('Invalid state, waiting...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle any dialogs
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 500));
        }

        const dist = Math.sqrt(
            Math.pow(state.player.worldX - waypoint.x, 2) +
            Math.pow(state.player.worldZ - waypoint.z, 2)
        );

        if (dist > 5) {
            ctx.log(`Walking to waypoint (${waypoint.x}, ${waypoint.z}), distance: ${dist.toFixed(0)}`);
            await ctx.sdk.sendWalk(waypoint.x, waypoint.z);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    ctx.log('Should be near Draynor fishing spots now!');

    // Check what fishing spots are available
    state = ctx.state();
    const allSpots = state.nearbyNpcs.filter(npc => /fishing\s*spot/i.test(npc.name));
    if (allSpots.length > 0) {
        ctx.log(`Found ${allSpots.length} fishing spots:`);
        for (const spot of allSpots.slice(0, 3)) {
            ctx.log(`  - ${spot.name} at distance ${spot.distance.toFixed(0)}, options: ${spot.options.join(', ')}`);
        }
    } else {
        ctx.log('No fishing spots found yet, will keep looking...');
    }

    // Main fishing loop
    let totalAttempts = 0;
    let lastStatusTime = Date.now();

    while (true) {
        ctx.progress();
        state = ctx.state();

        // Skip invalid states
        if (!state.player || state.player.worldX === 0) {
            ctx.log('Invalid state, waiting...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs (level-ups, etc)
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog (probably a level-up!)');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Look for fishing spots with "Net" option
        const fishingSpots = state.nearbyNpcs.filter(npc => /fishing\s*spot/i.test(npc.name));
        const netSpot = fishingSpots.find(spot =>
            spot.options.some(opt => /^net$/i.test(opt))
        );

        if (netSpot) {
            const netOpt = netSpot.optionsWithIndex?.find(o => /^net$/i.test(o.text));

            if (netOpt) {
                await ctx.sdk.sendInteractNpc(netSpot.index, netOpt.opIndex);
                totalAttempts++;

                if (Date.now() - lastStatusTime > 30_000) {
                    const fishingLevel = state.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
                    const shrimpCount = state.inventory
                        .filter(i => /shrimp/i.test(i.name))
                        .reduce((sum, i) => sum + i.count, 0);
                    ctx.log(`Status: Fishing ${fishingLevel}, ${shrimpCount} shrimp, ${totalAttempts} attempts`);
                    lastStatusTime = Date.now();
                }
            }
        } else if (fishingSpots.length > 0) {
            ctx.warn(`Found ${fishingSpots.length} spots but none have "Net" option: ${fishingSpots[0].options.join(', ')}`);
            await ctx.sdk.sendWalk(DRAYNOR_FISHING.x + Math.random() * 10 - 5, DRAYNOR_FISHING.z + Math.random() * 10 - 5);
        } else {
            const driftDist = Math.sqrt(
                Math.pow(state.player.worldX - DRAYNOR_FISHING.x, 2) +
                Math.pow(state.player.worldZ - DRAYNOR_FISHING.z, 2)
            );

            if (driftDist > 10) {
                ctx.log(`No spots nearby, drifted ${driftDist.toFixed(0)} tiles, walking back`);
                await ctx.sdk.sendWalk(DRAYNOR_FISHING.x, DRAYNOR_FISHING.z);
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        await new Promise(r => setTimeout(r, 2000));
    }
});
