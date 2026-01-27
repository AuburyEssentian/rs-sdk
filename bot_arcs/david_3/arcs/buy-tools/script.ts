/**
 * Arc: buy-tools
 * Character: david_3
 *
 * Goal: Buy a bronze axe from Bob's Axes in Lumbridge.
 */

import { runArc } from '../../../arc-runner';

// Bob's Axes in Lumbridge
const BOBS_AXES = { x: 3230, z: 3203 };

runArc({
    characterName: 'david_3',
    arcName: 'buy-tools',
    goal: 'Buy bronze axe from Bob\'s Axes',
    timeLimit: 3 * 60 * 1000,
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Buy Axe Arc ===');

    // Wait for state
    await new Promise(r => setTimeout(r, 2000));
    ctx.progress();

    const state = ctx.state();
    if (!state?.player) {
        ctx.error('No player state');
        return;
    }

    ctx.log(`Starting at (${state.player.worldX}, ${state.player.worldZ})`);

    // Check if we already have an axe
    const hasAxe = state.inventory.some(i => /axe/i.test(i.name));
    if (hasAxe) {
        ctx.log('Already have an axe!');
        return;
    }

    // Check GP
    const coins = state.inventory.find(i => /coins/i.test(i.name));
    const gp = coins?.count ?? 0;
    ctx.log(`Current GP: ${gp}`);

    if (gp < 16) {
        ctx.warn('Not enough GP for bronze axe (need 16gp)');
        return;
    }

    // Walk to Bob's Axes - from Draynor need to go through Lumbridge
    // But must avoid Dark Wizards at ~3220,3220
    const waypoints = [
        { x: 3120, z: 3250 },  // East toward Lumbridge (staying north)
        { x: 3180, z: 3260 },  // Further east, still north of wizards
        { x: 3230, z: 3240 },  // South toward Lumbridge
        { x: BOBS_AXES.x, z: BOBS_AXES.z },  // Bob's Axes
    ];

    for (const wp of waypoints) {
        ctx.log(`Walking to (${wp.x}, ${wp.z})...`);
        const walkResult = await ctx.bot.walkTo(wp.x, wp.z);
        ctx.log(`Walk result: ${walkResult.success ? 'success' : 'failed'}`);
        ctx.progress();
        await new Promise(r => setTimeout(r, 500));
    }

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    // Log position and nearby NPCs
    const afterWalkState = ctx.state();
    ctx.log(`Position: (${afterWalkState?.player?.worldX}, ${afterWalkState?.player?.worldZ})`);
    ctx.log('Nearby NPCs:');
    for (const npc of (afterWalkState?.nearbyNpcs ?? []).slice(0, 8)) {
        ctx.log(`  - ${npc.name} (dist ${npc.distance.toFixed(1)}) [${npc.options.join(', ')}]`);
    }

    // Open Bob's shop
    ctx.log('Looking for Bob...');
    let shopResult = await ctx.bot.openShop(/bob/i);
    ctx.progress();

    if (!shopResult.success) {
        ctx.log('Bob not found by name, trying any shopkeeper...');
        const npcWithTrade = afterWalkState?.nearbyNpcs.find(n =>
            n.optionsWithIndex.some(o => /trade/i.test(o.text))
        );
        if (npcWithTrade) {
            ctx.log(`Found: ${npcWithTrade.name}`);
            const tradeOpt = npcWithTrade.optionsWithIndex.find(o => /trade/i.test(o.text));
            if (tradeOpt) {
                await ctx.sdk.sendInteractNpc(npcWithTrade.index, tradeOpt.opIndex);
                await new Promise(r => setTimeout(r, 1500));
                ctx.progress();
                shopResult = { success: ctx.state()?.shop?.isOpen ?? false, message: 'Manual trade' };
            }
        }
    }

    if (!shopResult.success) {
        ctx.warn(`Failed to open shop`);
        return;
    }

    await new Promise(r => setTimeout(r, 500));

    // Check shop inventory
    const shopState = ctx.state()?.shop;
    if (shopState?.isOpen) {
        ctx.log(`Shop open with ${shopState.shopItems.length} items:`);
        for (const item of shopState.shopItems) {
            if (/axe/i.test(item.name)) {
                ctx.log(`  ${item.name} - ${item.price}gp (stock: ${item.count})`);
            }
        }
    }

    // Buy bronze axe
    ctx.log('Buying bronze axe...');
    const buyResult = await ctx.bot.buyFromShop(/bronze axe/i, 1);
    ctx.progress();
    ctx.log(`Buy result: ${buyResult.message}`);

    await new Promise(r => setTimeout(r, 500));

    // Walk away to close shop
    await ctx.sdk.sendWalk(3225, 3210, true);
    await new Promise(r => setTimeout(r, 1000));

    // Check result
    const finalState = ctx.state();
    const finalHasAxe = finalState?.inventory.some(i => /bronze axe/i.test(i.name));
    ctx.log(`Final inventory: ${finalState?.inventory.map(i => i.name).join(', ')}`);

    if (finalHasAxe) {
        ctx.log('SUCCESS: Got bronze axe!');
    } else {
        ctx.warn('Could not get axe');
    }
});
