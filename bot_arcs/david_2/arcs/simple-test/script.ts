import { runArc } from '../../../arc-runner';

/**
 * Simple Test - Just wait and observe the game state
 */

runArc({
    characterName: 'david_2',
    arcName: 'simple-test',
    goal: 'Simple test - observe game state for 2 minutes',
    timeLimit: 2 * 60 * 1000,  // 2 minutes
    stallTimeout: 60_000,  // 1 minute stall timeout
}, async (ctx) => {
    ctx.log('=== Simple Test - Observing Game State ===');

    // Just wait and observe
    for (let i = 0; i < 60; i++) {
        ctx.progress();
        const state = ctx.state();

        if (i % 10 === 0) {
            ctx.log(`Check ${i}:`);
            ctx.log(`  Player: ${state?.player ? `(${state.player.worldX}, ${state.player.worldZ})` : 'null'}`);
            ctx.log(`  Skills: ${state?.skills?.length || 0} skills`);
            ctx.log(`  Inventory: ${state?.inventory?.length || 0} items`);
            ctx.log(`  InGame: ${state?.inGame}`);

            if (state?.player && state.player.worldX > 0) {
                const atk = state.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
                const str = state.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
                const def = state.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;
                ctx.log(`  Combat: Atk ${atk}, Str ${str}, Def ${def}`);
            }
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    ctx.log('Test complete!');
});
