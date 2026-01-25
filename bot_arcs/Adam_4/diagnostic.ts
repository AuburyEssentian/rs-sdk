/**
 * Quick diagnostic to check current character state
 */

import { runArc } from '../arc-runner.ts';

runArc({
    characterName: 'Adam_4',
    arcName: 'diagnostic',
    goal: 'Check current state',
    timeLimit: 60_000,  // 60 seconds
    stallTimeout: 50_000,
    screenshotInterval: 10_000,
    launchOptions: {
        useSharedBrowser: false,  // Use dedicated browser
        headless: false,          // Show browser for debugging
    },
}, async (ctx) => {
    // Wait for valid game state (with extended timeout)
    ctx.log('Waiting for game state to load...');
    for (let i = 0; i < 60; i++) {
        const state = ctx.state();
        if (state?.player?.worldX !== 0 && state?.player?.worldZ !== 0) {
            ctx.log(`State loaded after ${i * 500}ms`);
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();

        // Log raw state every 5 seconds
        if (i % 10 === 0) {
            ctx.log(`Waiting... player=${JSON.stringify(state?.player)?.slice(0, 100)}`);
        }
    }

    const state = ctx.state();

    ctx.log('');
    ctx.log('=== CHARACTER STATE ===');
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    ctx.log(`Floor: ${state?.player?.level}`);
    ctx.log(`Animation: ${state?.player?.animId}`);
    ctx.log('');

    // Combat stats
    const atk = ctx.sdk.getSkill('Attack');
    const str = ctx.sdk.getSkill('Strength');
    const def = ctx.sdk.getSkill('Defence');
    const hp = ctx.sdk.getSkill('Hitpoints');
    ctx.log('=== COMBAT STATS ===');
    ctx.log(`Attack: ${atk?.baseLevel}`);
    ctx.log(`Strength: ${str?.baseLevel}`);
    ctx.log(`Defence: ${def?.baseLevel}`);
    ctx.log(`HP: ${hp?.level}/${hp?.baseLevel}`);
    ctx.log('');

    // Total level
    const totalLevel = state?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0;
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');

    // Equipment
    ctx.log('=== EQUIPMENT ===');
    const equipment = state?.equipment ?? [];
    if (equipment.length === 0) {
        ctx.log('No equipment');
    } else {
        for (const e of equipment) {
            ctx.log(`  ${e.name}`);
        }
    }
    ctx.log('');

    // Inventory
    ctx.log('=== INVENTORY ===');
    const inventory = state?.inventory ?? [];
    ctx.log(`Items: ${inventory.length}`);
    for (const item of inventory) {
        ctx.log(`  - ${item.name} x${item.count}`);
    }

    // Coins
    const coins = inventory.find(i => /coins/i.test(i.name));
    ctx.log(`GP: ${coins?.count ?? 0}`);
    ctx.log('');

    // Nearby NPCs
    ctx.log('=== NEARBY NPCS ===');
    const npcs = state?.nearbyNpcs.slice(0, 10) ?? [];
    for (const npc of npcs) {
        ctx.log(`  ${npc.name} (dist: ${npc.distance}, combat: ${npc.inCombat ? 'yes' : 'no'})`);
    }
    ctx.log('');

    // Nearby locations
    ctx.log('=== NEARBY LOCS ===');
    const locs = state?.nearbyLocs.slice(0, 10) ?? [];
    for (const loc of locs) {
        ctx.log(`  ${loc.name} (dist: ${loc.distance})`);
    }

    ctx.log('');
    ctx.log('=== SCORE ===');
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log(`GP: ${coins?.count ?? 0}`);
    ctx.log(`Score: ${totalLevel + (coins?.count ?? 0)}`);

    // Test a simple attack on a cow
    ctx.log('');
    ctx.log('=== TEST ATTACK ===');
    const cows = state?.nearbyNpcs.filter(n => /^cow$/i.test(n.name) && !n.inCombat) ?? [];
    ctx.log(`Available cows: ${cows.length}`);

    const cow = cows[0];
    if (cow) {
        ctx.log(`Targeting cow at distance ${cow.distance}`);
        const attackOpt = cow.optionsWithIndex.find(o => /attack/i.test(o.text));
        if (attackOpt) {
            ctx.log(`Sending attack...`);
            const result = await ctx.sdk.sendInteractNpc(cow.index, attackOpt.opIndex);
            ctx.log(`Attack result: ${JSON.stringify(result)}`);

            // Wait and observe
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 1000));
                ctx.progress();

                const newState = ctx.state();
                ctx.log(`t=${i}s: animId=${newState?.player?.animId}, inCombat=${newState?.player?.combat?.inCombat}`);
            }
        } else {
            ctx.log(`No attack option on cow! Options: ${cow.optionsWithIndex.map(o => o.text).join(', ')}`);
        }
    } else {
        ctx.log('No cows available to attack');
    }

    ctx.log('=== DIAGNOSTIC COMPLETE ===');
});
