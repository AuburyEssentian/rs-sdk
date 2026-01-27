/**
 * Arc: diagnostic
 * Character: david_2
 *
 * Goal: Observe current state - location, inventory, skills, surroundings
 * Duration: 1 minute (observation only)
 */

import { runArc } from '../../../arc-runner.ts';

runArc({
    characterName: 'david_2',
    arcName: 'diagnostic',
    goal: 'Observe current state and understand the situation',
    timeLimit: 60_000,  // 1 minute
    stallTimeout: 30_000,
}, async (ctx) => {
    const state = ctx.state();

    if (!state?.player) {
        ctx.error('No player state available!');
        return;
    }

    ctx.log('');
    ctx.log('========== DIAGNOSTIC REPORT ==========');
    ctx.log('');

    // Position
    ctx.log(`POSITION: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Combat Level: ${state.player.combatLevel}`);
    ctx.log('');

    // HP
    const hp = state.skills.find(s => s.name === 'Hitpoints');
    ctx.log(`HP: ${hp?.level ?? '?'}/${hp?.baseLevel ?? '?'}`);
    ctx.log('');

    // Skills above level 1
    ctx.log('SKILLS (above level 1):');
    const trainedSkills = state.skills.filter(s => s.baseLevel > 1);
    if (trainedSkills.length === 0) {
        ctx.log('  All skills at level 1 (fresh character)');
    } else {
        for (const skill of trainedSkills) {
            ctx.log(`  ${skill.name}: ${skill.baseLevel} (${skill.experience} XP)`);
        }
    }
    const totalLevel = state.skills.reduce((sum, s) => sum + s.baseLevel, 0);
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('');

    // Equipment
    ctx.log('EQUIPMENT:');
    const equipped = state.equipment.filter(e => e && e.name);
    if (equipped.length === 0) {
        ctx.log('  Nothing equipped');
    } else {
        for (const item of equipped) {
            if (item) ctx.log(`  ${item.slot}: ${item.name}`);
        }
    }
    ctx.log('');

    // Inventory
    ctx.log(`INVENTORY (${state.inventory.length} items):`);
    if (state.inventory.length === 0) {
        ctx.log('  Empty');
    } else {
        for (const item of state.inventory) {
            ctx.log(`  - ${item.name}${item.count > 1 ? ` x${item.count}` : ''}`);
        }
    }
    ctx.log('');

    // Nearby NPCs
    ctx.log('NEARBY NPCs (closest 10):');
    const npcs = state.nearbyNpcs.slice(0, 10);
    if (npcs.length === 0) {
        ctx.log('  None');
    } else {
        for (const npc of npcs) {
            const opts = npc.options.filter(o => o && o !== 'null').join(', ');
            ctx.log(`  ${npc.name} (lvl ${npc.combatLevel}, dist ${npc.distance}) - [${opts}]`);
        }
    }
    ctx.log('');

    // Nearby objects/locations
    ctx.log('NEARBY OBJECTS (closest 10):');
    const locs = state.nearbyLocs.slice(0, 10);
    if (locs.length === 0) {
        ctx.log('  None');
    } else {
        for (const loc of locs) {
            const opts = loc.options.filter(o => o && o !== 'null').join(', ');
            ctx.log(`  ${loc.name} (dist ${loc.distance}) - [${opts}]`);
        }
    }
    ctx.log('');

    // Ground items
    ctx.log('GROUND ITEMS (closest 10):');
    const groundItems = state.groundItems?.slice(0, 10) ?? [];
    if (groundItems.length === 0) {
        ctx.log('  None');
    } else {
        for (const item of groundItems) {
            ctx.log(`  ${item.name}${item.count > 1 ? ` x${item.count}` : ''} (dist ${item.distance})`);
        }
    }
    ctx.log('');

    // Recent game messages
    ctx.log('RECENT MESSAGES:');
    const messages = state.gameMessages.slice(-5);
    if (messages.length === 0) {
        ctx.log('  None');
    } else {
        for (const msg of messages) {
            ctx.log(`  "${msg.text}"`);
        }
    }
    ctx.log('');

    ctx.log('========================================');
    ctx.log('');

    // Take a screenshot for visual reference
    await ctx.screenshot('diagnostic');

    ctx.progress();
});
