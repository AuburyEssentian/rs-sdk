import { runArc } from '../../../arc-runner';

/**
 * Defence Training Arc
 *
 * Focus: Train Defence (currently 35) to catch up with Attack (45)
 * Location: Lumbridge area - fight rats/goblins
 *
 * Strategy:
 * - Set combat style to Defence (style 3)
 * - Attack nearby creatures continuously
 * - Handle level-up dialogs properly
 */

runArc({
    characterName: 'david_2',
    arcName: 'defence-training',
    goal: 'Train Defence to catch up with Attack (45). Defence is currently lowest at 35.',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Defence Training Arc ===');

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

    // Set combat style to Defence (style 3)
    ctx.log('Setting combat style to Defence (style 3)');
    await ctx.sdk.sendSetCombatStyle(3);
    await new Promise(r => setTimeout(r, 500));

    // Main combat loop
    let attacks = 0;
    let lastLoggedAttacks = 0;
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
                await ctx.bot.eatFood(food);
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // Check if in combat
        const inCombat = state.player?.combat?.inCombat ?? false;
        const isAnimating = state.player?.animId !== -1;

        if (inCombat || isAnimating) {
            // Already fighting, wait a bit
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find a target to attack - prefer nearby ones
        const potentialTargets = state.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)
            .filter(n => n.distance < 15)
            .sort((a, b) => a.distance - b.distance);

        if (potentialTargets.length > 0) {
            // Try to attack the closest target
            for (const target of potentialTargets.slice(0, 3)) {
                ctx.log(`Attacking ${target.name} (distance: ${target.distance.toFixed(1)})`);
                try {
                    const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                    if (attackOpt) {
                        await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                        attacks++;
                        await new Promise(r => setTimeout(r, 1000));
                        break;
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
        if (attacks >= lastLoggedAttacks + 10) {
            const currentDefence = state.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;
            ctx.log(`Progress: ${attacks} attacks, Defence level: ${currentDefence}`);
            lastLoggedAttacks = attacks;
        }

        // Short delay between iterations
        await new Promise(r => setTimeout(r, 500));
    }
});
