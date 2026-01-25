import { runArc } from '../arc-runner';

runArc({
    characterName: 'Adam_4',
    arcName: 'test',
    goal: 'Quick test',
    timeLimit: 30_000,
    stallTimeout: 30_000,
}, async (ctx) => {
    ctx.log('Testing Adam_4 state...');
    const state = ctx.state();
    ctx.log('Position: (' + state?.player?.worldX + ', ' + state?.player?.worldZ + ')');
    const totalLevel = state?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0;
    ctx.log('Total Level: ' + totalLevel);
    ctx.log('Inventory items: ' + (state?.inventory.length ?? 0));
});
