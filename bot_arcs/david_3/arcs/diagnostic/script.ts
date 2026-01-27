/**
 * Arc: diagnostic
 * Character: david_3
 *
 * Goal: Observe current state and understand where we are
 * Duration: 1 minute
 */

import { runArc } from '../../../arc-runner.ts';

runArc({
    characterName: 'david_3',
    arcName: 'diagnostic',
    goal: 'Observe current state and understand the situation',
    timeLimit: 60_000,  // 1 minute
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Diagnostic Arc ===');
    ctx.log('Goal: Understand current state');
    ctx.log('');

    // Wait for state to populate
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.warn('State did not fully populate');
    }

    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();

    const state = ctx.state();
    if (!state) {
        ctx.error('No state available!');
        return;
    }

    // Position
    const player = state.player;
    ctx.log(`Position: (${player?.worldX}, ${player?.worldZ})`);
    ctx.log(`Combat Level: ${player?.combatLevel}`);
    ctx.log('');

    // HP
    const hp = state.skills.find(s => s.name === 'Hitpoints');
    ctx.log(`HP: ${hp?.level ?? '?'}/${hp?.baseLevel ?? '?'}`);
    ctx.log('');

    // Skills
    ctx.log('=== Skills ===');
    const trainedSkills = state.skills.filter(s => s.baseLevel > 1);
    if (trainedSkills.length === 0) {
        ctx.log('No skills trained yet (all level 1)');
    } else {
        for (const skill of trainedSkills) {
            ctx.log(`  ${skill.name}: ${skill.baseLevel} (${skill.experience} XP)`);
        }
    }
    const totalLevel = state.skills.reduce((sum, s) => sum + s.baseLevel, 0);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');

    // Inventory
    ctx.log('=== Inventory ===');
    if (state.inventory.length === 0) {
        ctx.log('Empty inventory');
    } else {
        for (const item of state.inventory) {
            ctx.log(`  - ${item.name} x${item.count}`);
        }
    }
    ctx.log('');

    // Equipment
    ctx.log('=== Equipment ===');
    const equipped = state.equipment.filter(e => e);
    if (equipped.length === 0) {
        ctx.log('Nothing equipped');
    } else {
        for (const item of equipped) {
            if (item) {
                ctx.log(`  - ${item.slot}: ${item.name}`);
            }
        }
    }
    ctx.log('');

    // Nearby NPCs
    ctx.log('=== Nearby NPCs (first 10) ===');
    const npcs = state.nearbyNpcs.slice(0, 10);
    for (const npc of npcs) {
        ctx.log(`  - ${npc.name} (lvl ${npc.combatLevel}, dist ${npc.distance.toFixed(1)}) [${npc.options.join(', ')}]`);
    }
    ctx.log('');

    // Nearby objects
    ctx.log('=== Nearby Objects (first 10) ===');
    const locs = state.nearbyLocs.slice(0, 10);
    for (const loc of locs) {
        ctx.log(`  - ${loc.name} at (${loc.x}, ${loc.z}) dist ${loc.distance.toFixed(1)}`);
    }
    ctx.log('');

    // Recent messages
    ctx.log('=== Recent Messages ===');
    const messages = state.gameMessages.slice(-5);
    for (const msg of messages) {
        ctx.log(`  "${msg.text}"`);
    }
    ctx.log('');

    // Dialog state
    if (state.dialog.isOpen) {
        ctx.log('=== Dialog Open ===');
        ctx.log(`Options: ${state.dialog.options.map(o => o.text).join(', ')}`);
    }

    // Take a screenshot
    await ctx.screenshot('diagnostic-state');

    ctx.log('');
    ctx.log('=== Summary ===');
    ctx.log(`Position: (${player?.worldX}, ${player?.worldZ})`);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log(`Inventory items: ${state.inventory.length}`);
    ctx.log(`Equipped items: ${equipped.length}`);

    // Location hints
    const x = player?.worldX ?? 0;
    const z = player?.worldZ ?? 0;

    if (x >= 3218 && x <= 3230 && z >= 3210 && z <= 3230) {
        ctx.log('Location: Near Lumbridge spawn');
    } else if (x >= 3267 && z < 3220) {
        ctx.log('Location: In Al Kharid');
    } else if (x >= 3080 && x <= 3110 && z >= 3240 && z <= 3260) {
        ctx.log('Location: Near Draynor');
    } else {
        ctx.log('Location: Unknown area');
    }

    ctx.log('');
    ctx.log('=== Diagnostic Complete ===');
});
