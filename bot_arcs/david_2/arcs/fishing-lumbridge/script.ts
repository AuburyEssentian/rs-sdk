import { runArc } from '../../../arc-runner';

/**
 * Fishing Arc - Lumbridge Swamp
 *
 * Train fishing at Lumbridge Swamp for variety.
 * Location: ~(3239, 3147) - safe area near Lumbridge
 *
 * Strategy:
 * - Walk to fishing spot area
 * - Fish with small net (Net option)
 * - Drop fish when inventory fills (power fishing)
 */

// Lumbridge Swamp fishing area
const FISHING_AREA = { x: 3239, z: 3147 };
const MAX_DRIFT = 20;

runArc({
    characterName: 'david_2',
    arcName: 'fishing-lumbridge',
    goal: 'Train fishing at Lumbridge Swamp for variety.',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Fishing Arc - Lumbridge Swamp ===');

    // Get initial state
    const initialState = ctx.state();
    if (!initialState?.player) {
        ctx.error('No player state available');
        return;
    }

    const fishingLevel = initialState.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
    ctx.log(`Starting Fishing level: ${fishingLevel}`);
    ctx.log(`Position: (${initialState.player.worldX}, ${initialState.player.worldZ})`);

    // Check if we have a fishing net
    const hasNet = initialState.inventory.some(i => /net/i.test(i.name));
    if (!hasNet) {
        ctx.warn('No fishing net in inventory! This might not work.');
    }

    // Walk to fishing area
    ctx.log(`Walking to fishing area (${FISHING_AREA.x}, ${FISHING_AREA.z})`);
    await ctx.bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
    await new Promise(r => setTimeout(r, 2000));

    // Main fishing loop
    let fishCaught = 0;
    let lastLoggedFish = 0;

    while (true) {
        ctx.progress();

        const state = ctx.state();
        if (!state?.player) {
            ctx.log('Waiting for state...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Validate position
        if (state.player.worldX === 0 || state.player.worldZ === 0) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // Handle dialogs (level-ups)
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if we've drifted too far from fishing area
        const player = state.player;
        const drift = Math.sqrt(
            Math.pow(player.worldX - FISHING_AREA.x, 2) +
            Math.pow(player.worldZ - FISHING_AREA.z, 2)
        );

        if (drift > MAX_DRIFT) {
            ctx.log(`Drifted ${drift.toFixed(0)} tiles, walking back to fishing area`);
            await ctx.bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // Drop fish if inventory is getting full (power fishing)
        const inventoryCount = state.inventory.length;
        if (inventoryCount > 25) {
            ctx.log('Inventory nearly full, dropping fish...');
            for (const item of state.inventory) {
                if (/shrimp|anchovies|raw|fish/i.test(item.name)) {
                    await ctx.sdk.sendDropItem(item.slot);
                    await new Promise(r => setTimeout(r, 150));
                }
            }
            continue;
        }

        // Find a fishing spot (they are NPCs)
        const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));

        if (spot) {
            // Find the "Net" option
            const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));

            if (netOpt) {
                try {
                    await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
                    fishCaught++;
                } catch (err) {
                    // Fishing failed, try again
                }
            } else {
                ctx.log(`No Net option on spot, available: ${spot.options.join(', ')}`);
            }
        } else {
            ctx.log('No fishing spots nearby, waiting...');
        }

        // Log progress periodically
        if (fishCaught >= lastLoggedFish + 10) {
            const currentLevel = state.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
            ctx.log(`Progress: ${fishCaught} fishing attempts, Fishing level: ${currentLevel}`);
            lastLoggedFish = fishCaught;
        }

        await new Promise(r => setTimeout(r, 1500));
    }
});
