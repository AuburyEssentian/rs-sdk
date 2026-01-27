import { runArc } from '../../../arc-runner';

/**
 * Fishing Shrimp Arc
 *
 * Travel to Lumbridge Swamp and fish shrimp with small net.
 * A relaxing change of pace from combat training!
 */

const FISHING_SPOT = { x: 3239, z: 3147, name: 'Lumbridge Swamp' };
const MAX_DRIFT = 20;  // How far to drift before walking back

runArc({
    characterName: 'david_2',
    arcName: 'fishing-shrimp',
    goal: 'Fish shrimp at Lumbridge Swamp for variety and levels.',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Fishing Shrimp Arc ===');

    // Wait for valid state
    ctx.log('Waiting for valid game state...');
    let state = ctx.state();
    for (let i = 0; i < 30; i++) {
        state = ctx.state();
        if (state?.player?.worldX > 0 && state?.player?.worldZ > 0) {
            break;
        }
        ctx.progress();
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.error('No valid player state available after waiting');
        return;
    }

    // Check we have a fishing net
    const hasNet = state.inventory.some(i => /small fishing net/i.test(i.name));
    if (!hasNet) {
        ctx.error('No small fishing net in inventory!');
        return;
    }

    ctx.log(`Starting position: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Target: ${FISHING_SPOT.name} (${FISHING_SPOT.x}, ${FISHING_SPOT.z})`);

    // Walk to fishing spot if not already there
    const distToSpot = Math.sqrt(
        Math.pow(state.player.worldX - FISHING_SPOT.x, 2) +
        Math.pow(state.player.worldZ - FISHING_SPOT.z, 2)
    );

    if (distToSpot > 20) {
        ctx.log(`Walking to fishing spot (${distToSpot.toFixed(0)} tiles away)...`);
        try {
            await ctx.bot.walkTo(FISHING_SPOT.x, FISHING_SPOT.z);
            ctx.log('Arrived at fishing spot!');
        } catch (err) {
            ctx.warn(`Walk failed: ${err} - will try fishing from here`);
        }
    }

    // Log initial fishing level
    const getSkillLevel = (name: string) =>
        ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
    const startFishing = getSkillLevel('Fishing');
    const startCooking = getSkillLevel('Cooking');
    ctx.log(`Starting Fishing level: ${startFishing}`);

    // Main fishing loop
    let fishCount = 0;
    let lastLoggedCount = 0;

    while (true) {
        ctx.progress();

        const state = ctx.state();
        if (!state?.player || state.player.worldX === 0) {
            ctx.log('Waiting for state...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs (level-ups)
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check inventory space
        if (state.inventory.length >= 28) {
            ctx.log('Inventory full! Dropping shrimp...');
            const shrimp = state.inventory.filter(i => /shrimp|anchov/i.test(i.name));
            for (const item of shrimp.slice(0, 10)) {  // Drop up to 10 at a time
                try {
                    const dropOpt = item.optionsWithIndex.find(o => /drop/i.test(o.text));
                    if (dropOpt) {
                        await ctx.sdk.sendUseItem(item.slot, dropOpt.opIndex);
                        await new Promise(r => setTimeout(r, 300));
                    }
                } catch (err) {
                    // Continue dropping
                }
            }
            continue;
        }

        // Check drift from fishing area - but only walk if we can see no fishing spots
        const drift = Math.sqrt(
            Math.pow(state.player.worldX - FISHING_SPOT.x, 2) +
            Math.pow(state.player.worldZ - FISHING_SPOT.z, 2)
        );

        const nearbyFishingSpots = state.nearbyNpcs.filter(npc =>
            /fishing\s*spot/i.test(npc.name) && npc.distance < 15
        );

        // Only try to walk back if we've drifted AND there's no fishing spot nearby
        if (drift > MAX_DRIFT && nearbyFishingSpots.length === 0) {
            ctx.log(`Drifted ${drift.toFixed(0)} tiles and no spots nearby, walking back`);
            try {
                // Try SDK walk directly instead of bot.walkTo
                await ctx.sdk.sendWalk(FISHING_SPOT.x, FISHING_SPOT.z);
                await new Promise(r => setTimeout(r, 3000));  // Wait for walk
            } catch (err) {
                ctx.warn(`Walk failed: ${err} - will fish where we are`);
            }
            continue;
        }

        // Check if already fishing (animating)
        const isAnimating = state.player?.animId !== -1;
        if (isAnimating) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // Find fishing spot NPC
        const fishingSpot = state.nearbyNpcs.find(npc =>
            /fishing\s*spot/i.test(npc.name) &&
            npc.distance < 15
        );

        if (fishingSpot) {
            // Find "Net" option for small net fishing
            const netOpt = fishingSpot.optionsWithIndex.find(o => /^net$/i.test(o.text));
            if (netOpt) {
                try {
                    await ctx.sdk.sendInteractNpc(fishingSpot.index, netOpt.opIndex);
                    fishCount++;
                } catch (err) {
                    // Keep trying
                }
            } else {
                ctx.log(`Spot options: ${fishingSpot.options.join(', ')}`);
            }
        } else {
            ctx.log('No fishing spots nearby, waiting...');
        }

        // Log progress periodically
        if (fishCount >= lastLoggedCount + 10) {
            const fishing = getSkillLevel('Fishing');
            ctx.log(`Progress: ${fishCount} actions | Fishing: ${fishing}`);
            lastLoggedCount = fishCount;
        }

        await new Promise(r => setTimeout(r, 1000));
    }
});
