import { runArc } from '../../../arc-runner';
import { TestPresets } from '../../../../test/utils/save-generator';

/**
 * Reinitialize david_2 with a fresh save
 *
 * The current save seems corrupted (position always 0,0).
 * This will reset the character to Tutorial Island with tutorial skipped.
 */

runArc({
    characterName: 'david_2',
    arcName: 'reinit',
    goal: 'Reinitialize character with fresh save',
    timeLimit: 2 * 60 * 1000,
    stallTimeout: 60_000,
    initializeFromPreset: {
        ...TestPresets.freshSpawn,
        skipTutorial: true,
    },
}, async (ctx) => {
    ctx.log('=== Character Reinitialized ===');

    // Wait for state
    let state = ctx.state();
    for (let i = 0; i < 30; i++) {
        ctx.progress();
        state = ctx.state();
        if (state?.player?.worldX > 0) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (state?.player?.worldX > 0) {
        ctx.log(`SUCCESS! Position: (${state.player.worldX}, ${state.player.worldZ})`);
        ctx.log(`Total Level: ${state.skills.reduce((sum, s) => sum + s.baseLevel, 0)}`);
        ctx.log(`Inventory: ${state.inventory.length} items`);
    } else {
        ctx.error('Failed to reinitialize - still no valid state');
    }
});
