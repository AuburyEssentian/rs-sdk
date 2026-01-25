/**
 * Simple combat test - just attack one cow and observe
 */

import { runArc } from '../arc-runner';

runArc({
    characterName: 'Adam_4',
    arcName: 'simple-combat-test',
    goal: 'Attack one cow and observe',
    timeLimit: 60_000,  // 1 minute
    stallTimeout: 30_000,
    screenshotInterval: 10_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    ctx.log('=== Simple Combat Test ===');

    // Log initial state
    const state = ctx.state();
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    ctx.log(`HP: ${ctx.sdk.getSkill('Hitpoints')?.level}/${ctx.sdk.getSkill('Hitpoints')?.baseLevel}`);

    // Find a cow
    const cow = state?.nearbyNpcs.find(n => /^cow$/i.test(n.name));
    if (!cow) {
        ctx.log('No cow found nearby!');
        return;
    }

    ctx.log(`Found cow at distance ${cow.distance}`);

    // Attack it
    const attackOpt = cow.optionsWithIndex.find(o => /attack/i.test(o.text));
    if (attackOpt) {
        ctx.log('Attacking cow...');
        await ctx.sdk.sendInteractNpc(cow.index, attackOpt.opIndex);
        ctx.progress();
    }

    // Wait and observe for 30 seconds
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();

        const s = ctx.state();
        const hp = ctx.sdk.getSkill('Hitpoints');
        const pos = s?.player;
        const inCombat = pos?.combat?.inCombat ?? false;
        const anim = pos?.animId ?? -1;

        ctx.log(`[${i}s] Pos=(${pos?.worldX},${pos?.worldZ}) HP=${hp?.level}/${hp?.baseLevel} InCombat=${inCombat} Anim=${anim}`);

        // Check for disconnect
        if (pos?.worldX === 0 || !pos) {
            ctx.log('DISCONNECTED - position is 0,0');
            break;
        }
    }

    ctx.log('=== Test Complete ===');
});
