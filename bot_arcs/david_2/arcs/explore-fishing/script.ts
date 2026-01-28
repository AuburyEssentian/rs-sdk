import { runArc } from '../../../arc-runner';

/**
 * Explore Fishing - Find small net fishing spots
 *
 * Looking for fishing spots with "Net" option (not Lure/Bait).
 * Will walk around and log all fishing spots found with their options.
 *
 * I'm at Lumbridge Castle (3226, 3222). Let me explore:
 * 1. South to Lumbridge river area
 * 2. Check around for any fishing spots
 */

runArc({
    characterName: 'david_2',
    arcName: 'explore-fishing',
    goal: 'Explore area to find small net fishing spots',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 30_000,
}, async (ctx) => {
    ctx.log('=== Exploring for Small Net Fishing Spots ===');

    // Wait for valid state
    let state = ctx.state();
    while (!state?.player || state.player.worldX === 0) {
        await new Promise(r => setTimeout(r, 1000));
        state = ctx.state();
        ctx.progress();
    }

    ctx.log(`Starting at (${state.player.worldX}, ${state.player.worldZ})`);

    // Define exploration waypoints around Lumbridge
    const explorationPoints = [
        { x: 3240, z: 3250, name: 'East Lumbridge' },
        { x: 3240, z: 3200, name: 'Southeast Lumbridge' },
        { x: 3210, z: 3210, name: 'Lumbridge center' },
        { x: 3200, z: 3180, name: 'South Lumbridge' },
        { x: 3180, z: 3150, name: 'Lumbridge Swamp north' },
        { x: 3150, z: 3200, name: 'West Lumbridge' },
        { x: 3100, z: 3240, name: 'Toward Draynor (partial)' },
    ];

    const spotLog: Array<{ location: string, coords: { x: number, z: number }, options: string[] }> = [];

    for (const point of explorationPoints) {
        ctx.progress();
        state = ctx.state();

        if (!state?.player || state.player.worldX === 0) {
            ctx.log('Invalid state, waiting...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs
        if (state.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        ctx.log(`Exploring: ${point.name} at (${point.x}, ${point.z})`);
        await ctx.sdk.sendWalk(point.x, point.z);
        await new Promise(r => setTimeout(r, 5000));  // Wait for walk

        // Check for fishing spots
        state = ctx.state();
        if (!state) continue;
        const fishingSpots = state.nearbyNpcs.filter(npc => /fishing\s*spot/i.test(npc.name));

        if (fishingSpots.length > 0) {
            ctx.log(`Found ${fishingSpots.length} fishing spots at ${point.name}!`);
            for (const spot of fishingSpots) {
                const hasNet = spot.options.some(opt => /^net$/i.test(opt));
                ctx.log(`  - Distance: ${spot.distance.toFixed(0)}, Options: [${spot.options.join(', ')}] ${hasNet ? '*** HAS NET! ***' : ''}`);
                spotLog.push({
                    location: point.name,
                    coords: { x: point.x, z: point.z },
                    options: spot.options
                });

                if (hasNet) {
                    ctx.log('FOUND NET FISHING SPOT!');
                    ctx.log(`Location: ${point.name}`);
                    ctx.log(`Approximate coords: (${point.x}, ${point.z})`);
                    ctx.log('Options: ' + spot.options.join(', '));
                }
            }
        } else {
            ctx.log(`No fishing spots at ${point.name}`);
        }
    }

    // Summary
    ctx.log('');
    ctx.log('=== Exploration Summary ===');
    ctx.log(`Total spots found: ${spotLog.length}`);
    for (const s of spotLog) {
        ctx.log(`  ${s.location}: [${s.options.join(', ')}]`);
    }

    // Check current inventory
    state = ctx.state();
    ctx.log('');
    ctx.log('=== Current Status ===');
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    ctx.log(`Fishing level: ${state?.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1}`);
    ctx.log(`Inventory has net: ${state?.inventory.some(i => /fishing net/i.test(i.name))}`);
});
