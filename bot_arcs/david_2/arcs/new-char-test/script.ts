import { runArc, TestPresets } from '../../../arc-runner';

/**
 * Test with a completely fresh character name to see if david_2 is the issue
 */

runArc({
    characterName: 'david_2x',  // NEW NAME!
    arcName: 'new-char-test',
    goal: 'Test if david_2 name is the issue',
    timeLimit: 2 * 60 * 1000,  // 2 minutes
    stallTimeout: 30_000,
    initializeFromPreset: TestPresets.LUMBRIDGE_SPAWN,
}, async (ctx) => {
    ctx.log('=== Testing with new character name: david_2x ===');

    let state = ctx.state();
    for (let i = 0; i < 30; i++) {
        state = ctx.state();
        if (state?.player?.worldX > 0) break;
        ctx.progress();
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.error('No valid state - issue persists with new name!');
        return;
    }

    ctx.log(`SUCCESS! Position: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Total Level: ${state.skills.reduce((s, sk) => s + sk.baseLevel, 0)}`);
    ctx.log(`Inventory: ${state.inventory.length} items`);

    // Quick combat test
    const targets = /rat|man/i;
    let attacks = 0;

    while (attacks < 10) {
        ctx.progress();
        state = ctx.state();

        if (!state?.player || state.player.worldX === 0) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        if (state.dialog.isOpen) {
            try { await ctx.sdk.sendClickDialog(0); } catch (e) { }
            continue;
        }

        if (state.combat?.inCombat || state.player?.animId !== -1) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        const target = state.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex?.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat && n.distance < 10)[0];

        if (target) {
            try {
                const opt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                if (opt) {
                    await ctx.sdk.sendInteractNpc(target.index, opt.opIndex);
                    attacks++;
                    ctx.log(`Attack ${attacks}/10`);
                }
            } catch (e) { }
        }

        await new Promise(r => setTimeout(r, 500));
    }

    ctx.log('Test complete! New character works!');
});
