import { runArc } from '../../../arc-runner';

/**
 * Quick 2-minute combat training to verify stability
 */

runArc({
    characterName: 'david_2',
    arcName: 'quick-train',
    goal: 'Quick combat training - 2 minutes',
    timeLimit: 2 * 60 * 1000,  // 2 minutes
    stallTimeout: 30_000,
}, async (ctx) => {
    ctx.log('=== Quick Training Run ===');

    let state = ctx.state();
    for (let i = 0; i < 30; i++) {
        state = ctx.state();
        if (state?.player?.worldX > 0) break;
        ctx.progress();
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.error('No valid state');
        return;
    }

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);
    const targets = /rat|man|woman/i;
    let attacks = 0;

    while (true) {
        ctx.progress();
        state = ctx.state();

        if (!state?.player || state.player.worldX === 0) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Dismiss dialogs with try/catch
        if (state.dialog.isOpen) {
            try {
                await ctx.sdk.sendClickDialog(0);
            } catch (e) { /* ignore */ }
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Skip if already in combat
        if (state.combat?.inCombat || state.player?.animId !== -1) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Attack nearby target
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
                    if (attacks % 10 === 0) {
                        const atk = state.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
                        ctx.log(`Attacks: ${attacks}, Attack level: ${atk}`);
                    }
                }
            } catch (e) { /* ignore */ }
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
