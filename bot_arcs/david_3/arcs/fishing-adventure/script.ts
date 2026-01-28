import { runArc } from '../../../arc-runner';

// Draynor Village fishing area - level 1 friendly, decent location
const FISHING_AREA = { x: 3087, z: 3230 };

runArc({
    characterName: 'david_3',
    arcName: 'fishing-adventure',
    goal: 'Fish at Draynor Village to level up fishing',
    timeLimit: 5 * 60_000, // 5 minutes
    stallTimeout: 30_000,  // Longer stall timeout
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Fishing Adventure ===');

    // Wait for state to stabilize
    ctx.log('Waiting for game state...');
    await new Promise(r => setTimeout(r, 2000));
    ctx.progress();

    const state0 = ctx.state();
    if (!state0?.player || state0.player.worldX === 0) {
        ctx.error('No valid player state');
        return;
    }

    const startX = state0.player.worldX;
    const startZ = state0.player.worldZ;
    ctx.log(`Starting at (${startX}, ${startZ})`);

    // Check if we have fishing net
    const hasNet = state0.inventory.some(i => /small fishing net/i.test(i.name));
    if (!hasNet) {
        ctx.error('No fishing net in inventory!');
        return;
    }
    ctx.log('Have fishing net, ready to fish!');

    // Check if we need to walk to fishing area
    const distToFishing = Math.sqrt(
        Math.pow(startX - FISHING_AREA.x, 2) +
        Math.pow(startZ - FISHING_AREA.z, 2)
    );

    if (distToFishing > 10) {
        ctx.log(`Walking to fishing area (${distToFishing.toFixed(0)} tiles away)...`);
        await ctx.bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
        ctx.progress();
        await new Promise(r => setTimeout(r, 1000));
    }

    let loopCount = 0;
    const startXp = ctx.state()?.skills.find(s => s.name === 'Fishing')?.experience || 0;

    ctx.log('Looking for fishing spots...');

    while (true) {
        loopCount++;
        const state = ctx.state();
        if (!state) continue;

        // Dismiss level-up dialogs
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog (probably level up!)');
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Find fishing spots - they're NPCs with "Net" option
        const fishingSpots = state.nearbyNpcs.filter(npc =>
            /fishing\s*spot/i.test(npc.name)
        );

        // Look for small net spots (has "Bait" option - level 1 friendly)
        const smallNetSpot = fishingSpots.find(npc =>
            npc.options.some(opt => /^bait$/i.test(opt))
        );

        if (smallNetSpot) {
            const netOpt = smallNetSpot.optionsWithIndex.find(o => /^net$/i.test(o.text));
            if (netOpt) {
                await ctx.sdk.sendInteractNpc(smallNetSpot.index, netOpt.opIndex);
                ctx.progress();
            }
        } else if (fishingSpots.length > 0) {
            // Any fishing spot will do
            const spot = fishingSpots[0]!;
            const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
            if (netOpt) {
                await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
                ctx.progress();
            }
        } else {
            // No spots visible - walk back to fishing area
            ctx.log('No fishing spots nearby, walking to fishing area...');
            await ctx.bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
            ctx.progress();
        }

        // Check progress every 10 loops
        if (loopCount % 10 === 0) {
            const currentXp = state.skills.find(s => s.name === 'Fishing')?.experience || 0;
            const xpGained = currentXp - startXp;
            const fishingLevel = state.skills.find(s => s.name === 'Fishing')?.baseLevel || 1;

            // Count fish in inventory
            const fishCount = state.inventory.filter(i =>
                /shrimp|anchov/i.test(i.name)
            ).reduce((sum, i) => sum + i.count, 0);

            ctx.log(`Loop ${loopCount}: Fishing lvl ${fishingLevel}, +${xpGained} XP, ${fishCount} fish in inventory`);
        }

        // Drop fish if inventory gets full (keep fishing tools)
        if (state.inventory.length >= 27) {
            ctx.log('Inventory getting full, dropping some fish...');
            const fishToDrop = state.inventory.filter(i =>
                /shrimp|anchov/i.test(i.name)
            );
            for (const fish of fishToDrop.slice(0, 5)) {
                await ctx.sdk.sendDropItem(fish.slot);
                await new Promise(r => setTimeout(r, 100));
            }
            ctx.progress();
        }

        await new Promise(r => setTimeout(r, 1500));
    }
});
