import { runArc } from '../../../arc-runner';

/**
 * Check State - Wait longer for state to populate
 */
runArc({
    characterName: 'david_3',
    arcName: 'check-state',
    goal: 'Wait for state to fully load and report',
    timeLimit: 90_000,  // 90 seconds
    stallTimeout: 60_000,  // 60 second stall timeout
    launchOptions: {
        useSharedBrowser: false,
        headless: false,  // See what's actually happening
    },
}, async (ctx) => {
    ctx.log('Waiting for state to populate...');

    // Try multiple times over 30 seconds
    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();

        const state = ctx.state();
        if (state?.player?.worldX && state.player.worldX > 0) {
            ctx.log(`State loaded after ${attempt + 1} seconds!`);

            // Log everything
            ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);
            ctx.log(`Combat Level: ${state.player.combatLevel}`);

            // Skills
            const skills = state.skills.filter(s => s.baseLevel > 1);
            ctx.log('--- Skills ---');
            for (const skill of skills) {
                ctx.log(`  ${skill.name}: ${skill.baseLevel}`);
            }
            const totalLevel = state.skills.reduce((sum, s) => sum + s.baseLevel, 0);
            ctx.log(`Total Level: ${totalLevel}`);

            // Inventory
            ctx.log('--- Inventory ---');
            for (const item of state.inventory) {
                ctx.log(`  ${item.name} x${item.count}`);
            }

            // Equipment
            ctx.log('--- Equipment ---');
            const equipped = state.equipment.filter(e => e);
            for (const item of equipped) {
                if (item) ctx.log(`  ${item.name}`);
            }

            // HP
            const hp = state.skills.find(s => s.name === 'Hitpoints');
            ctx.log(`HP: ${hp?.level}/${hp?.baseLevel}`);

            // Nearby
            ctx.log('--- Nearby NPCs (5) ---');
            for (const npc of state.nearbyNpcs.slice(0, 5)) {
                ctx.log(`  ${npc.name} (lvl ${npc.combatLevel})`);
            }

            ctx.log('--- Nearby Objects (5) ---');
            for (const loc of state.nearbyLocs.slice(0, 5)) {
                ctx.log(`  ${loc.name}`);
            }

            return;
        }

        if (attempt % 5 === 0) {
            ctx.log(`Still waiting... (${attempt}s, pos=${state?.player?.worldX ?? 0})`);
        }
    }

    ctx.warn('State never fully populated after 30 seconds');
    const state = ctx.state();
    ctx.log(`Final state: pos=(${state?.player?.worldX}, ${state?.player?.worldZ}), skills=${state?.skills?.filter(s => s.baseLevel > 1).length}`);
});
