/**
 * Arc: debug-nearby
 * Character: Adam_3
 *
 * Debug: List all nearby objects to see what resources are available.
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

runArc({
    characterName: 'Adam_3',
    arcName: 'debug-nearby',
    goal: 'Debug nearby objects',
    timeLimit: 30 * 1000,      // 30 seconds
    stallTimeout: 30_000,
    screenshotInterval: 10_000,
}, async (ctx) => {
    const state = ctx.state();
    if (!state) {
        ctx.error('No game state');
        return;
    }

    ctx.log('=== DEBUG: Nearby Objects ===');
    ctx.log(`Position: (${state.player?.worldX}, ${state.player?.worldZ})`);
    ctx.log('');

    // List nearby locations (trees, rocks, etc.)
    ctx.log('=== Nearby Locations ===');
    for (const loc of state.nearbyLocs.slice(0, 20)) {
        ctx.log(`  ${loc.name} at (${loc.x}, ${loc.z}) - options: ${loc.options.join(', ')}`);
    }

    // List nearby NPCs (fishing spots, etc.)
    ctx.log('');
    ctx.log('=== Nearby NPCs ===');
    for (const npc of state.nearbyNpcs.slice(0, 20)) {
        ctx.log(`  ${npc.name} at dist=${npc.distance.toFixed(0)} - options: ${npc.options.join(', ')}`);
    }

    // List inventory
    ctx.log('');
    ctx.log('=== Inventory ===');
    for (const item of state.inventory) {
        ctx.log(`  [${item.slot}] ${item.name} x${item.count}`);
    }

    // List skills
    ctx.log('');
    ctx.log('=== Skills ===');
    for (const skill of state.skills.filter(s => s.baseLevel > 1)) {
        ctx.log(`  ${skill.name}: ${skill.baseLevel} (${skill.experience} xp)`);
    }

    ctx.progress();

    ctx.log('');
    ctx.log('=== Debug Complete ===');
});
