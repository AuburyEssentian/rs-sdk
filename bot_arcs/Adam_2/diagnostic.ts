import { runArc } from '../arc-runner.ts';

runArc({
    characterName: 'Adam_2',
    arcName: 'diagnostic',
    goal: 'Check current state',
    timeLimit: 120_000,
    stallTimeout: 120_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,
    },
}, async (ctx) => {
    ctx.log('=== Diagnostic ===');

    // Wait for state to stabilize with extended timeout (state can take 40+ seconds to sync)
    ctx.log('Waiting for game state to load (may take up to 60s)...');
    for (let i = 0; i < 60; i++) {
        const state = ctx.state();
        if (state?.player && state.player.worldX > 100 && state.player.worldZ > 100) {
            ctx.log('State loaded at attempt ' + i + ' (~' + (i * 1) + ' seconds)');
            break;
        }
        if (i % 10 === 0) {
            ctx.log('Attempt ' + i + ': position = (' + (state?.player?.worldX ?? 0) + ', ' + (state?.player?.worldZ ?? 0) + ')');
        }
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();
    }

    const state = ctx.state();

    ctx.log('Position: (' + state?.player?.worldX + ', ' + state?.player?.worldZ + ')');

    const hpSkill = ctx.sdk.getSkill('Hitpoints');
    ctx.log('HP: ' + (hpSkill?.level ?? 'unknown'));

    // Skills
    const skills = state?.skills.filter(s => s.baseLevel > 1) ?? [];
    ctx.log('Trained skills: ' + skills.map(s => s.name + ':' + s.baseLevel).join(', '));
    ctx.log('Total Level: ' + (skills.reduce((sum, s) => sum + s.baseLevel, 0) + (23 - skills.length)));

    // Inventory
    ctx.log('Inventory (' + (state?.inventory.length ?? 0) + ' items):');
    for (const item of state?.inventory ?? []) {
        ctx.log('  - ' + item.name + ' x' + (item.count ?? 1));
    }

    // Equipment
    const equipped = state?.equipment.filter(e => e !== null) ?? [];
    ctx.log('Equipment: ' + (equipped.map(e => e?.name).join(', ') || 'none'));

    // Nearby
    ctx.log('Nearby NPCs: ' + (state?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', ')));
    ctx.log('Nearby objects: ' + (state?.nearbyLocs.slice(0, 5).map(l => l.name).join(', ')));

    // Messages
    ctx.log('Recent messages: ' + (state?.gameMessages.slice(-3).map(m => m.text).join(' | ')));

    await new Promise(r => setTimeout(r, 5000));
});
