import { runArc } from '../../../arc-runner';

/**
 * Strength Training Arc
 *
 * Focus: Train Strength to catch up with Attack (45)
 * Location: Lumbridge area - fight rats/goblins
 *
 * Strategy:
 * - Set combat style to Strength (style 1)
 * - Attack nearby creatures continuously
 * - Handle level-up dialogs properly
 * - Aggressive progress tracking to avoid stalls
 */

runArc({
    characterName: 'david_2',
    arcName: 'strength-training',
    goal: 'Train Strength to catch up with Attack. Focus on Strength XP.',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,  // Longer stall timeout for combat
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Strength Training Arc ===');

    // Get initial state
    const initialState = ctx.state();
    if (!initialState?.player) {
        ctx.error('No player state available');
        return;
    }

    // Log initial stats
    const getSkillLevel = (name: string) =>
        initialState.skills.find(s => s.name === name)?.baseLevel ?? 1;

    const attack = getSkillLevel('Attack');
    const strength = getSkillLevel('Strength');
    const defence = getSkillLevel('Defence');
    const hp = getSkillLevel('Hitpoints');

    ctx.log(`Starting stats - Attack: ${attack}, Strength: ${strength}, Defence: ${defence}, HP: ${hp}`);
    ctx.log(`Position: (${initialState.player.worldX}, ${initialState.player.worldZ})`);

    // Set combat style to Strength (style 1)
    ctx.log('Setting combat style to Strength (style 1)');
    await ctx.sdk.sendSetCombatStyle(1);
    await new Promise(r => setTimeout(r, 500));

    // Main combat loop
    let kills = 0;
    let lastLoggedKills = 0;
    const targets = /rat|goblin|spider|chicken|cow/i;

    while (true) {
        ctx.progress();  // Always mark progress at start of loop

        const state = ctx.state();
        if (!state?.player) {
            ctx.log('Waiting for state...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Validate position (check for glitched state)
        if (state.player.worldX === 0 || state.player.worldZ === 0) {
            ctx.log('Invalid position detected, waiting...');
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // Handle dialogs (level-up, etc.) directly
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check HP and eat if low
        const currentHp = state.skills.find(s => s.name === 'Hitpoints')?.level ?? 10;
        const maxHp = state.skills.find(s => s.name === 'Hitpoints')?.baseLevel ?? 10;

        if (currentHp < maxHp * 0.4) {
            // Try to eat food
            const food = state.inventory.find(i =>
                /shrimp|bread|meat|trout|salmon|lobster|tuna|cake|fish/i.test(i.name)
            );
            if (food) {
                ctx.log(`Eating ${food.name} (HP: ${currentHp}/${maxHp})`);
                await ctx.bot.useItem(food);
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // Check if in combat
        const inCombat = state.combat?.inCombat ?? false;
        const isAnimating = state.player?.animId !== -1;

        if (inCombat || isAnimating) {
            // Already fighting, wait a bit but still mark progress
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find a target to attack - prefer nearby ones
        const potentialTargets = state.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)  // Not already in combat with someone else
            .filter(n => n.distance < 15)  // Reasonable distance
            .sort((a, b) => a.distance - b.distance);

        if (potentialTargets.length > 0) {
            // Try to attack the closest target
            for (const target of potentialTargets.slice(0, 3)) {
                ctx.log(`Attacking ${target.name} (distance: ${target.distance.toFixed(1)})`);
                try {
                    const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                    if (attackOpt) {
                        await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                        kills++;
                        await new Promise(r => setTimeout(r, 1000));
                        break;  // Successfully started attack
                    }
                } catch (err) {
                    ctx.log(`Attack on ${target.name} failed, trying next target`);
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        } else {
            // No targets found, wait and look again
            ctx.log('No targets nearby, waiting...');
            await new Promise(r => setTimeout(r, 2000));
        }

        // Periodically log progress
        if (kills >= lastLoggedKills + 10) {
            const currentStrength = state.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
            ctx.log(`Progress: ${kills} attack attempts, Strength level: ${currentStrength}`);
            lastLoggedKills = kills;
        }

        // Short delay between iterations
        await new Promise(r => setTimeout(r, 500));
    }
});
