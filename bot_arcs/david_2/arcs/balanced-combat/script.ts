import { runArc } from '../../../arc-runner';

/**
 * Balanced Combat Training Arc
 *
 * Automatically trains the lowest combat stat (Attack, Strength, or Defence).
 * Re-checks which stat is lowest every minute and switches styles accordingly.
 *
 * Goal: Get all melee stats to 50+
 */

const COMBAT_STYLES = {
    ATTACK: 0,
    STRENGTH: 1,
    DEFENCE: 3,
} as const;

function getLowestCombatStat(state: any): { stat: string; style: number; level: number } {
    const skills = state.skills;
    const atk = skills.find((s: any) => s.name === 'Attack')?.baseLevel ?? 1;
    const str = skills.find((s: any) => s.name === 'Strength')?.baseLevel ?? 1;
    const def = skills.find((s: any) => s.name === 'Defence')?.baseLevel ?? 1;

    if (def <= atk && def <= str) return { stat: 'Defence', style: COMBAT_STYLES.DEFENCE, level: def };
    if (str <= atk) return { stat: 'Strength', style: COMBAT_STYLES.STRENGTH, level: str };
    return { stat: 'Attack', style: COMBAT_STYLES.ATTACK, level: atk };
}

runArc({
    characterName: 'david_2',
    arcName: 'balanced-combat',
    goal: 'Train all melee stats toward 50, focusing on whichever is lowest.',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Balanced Combat Training Arc ===');

    // Wait for valid state with proper position (extended timeout)
    ctx.log('Waiting for valid game state...');
    let initialState = ctx.state();
    for (let i = 0; i < 60; i++) {  // Wait up to 60 seconds
        initialState = ctx.state();
        if (initialState?.player && initialState.player.worldX > 0 && initialState.player.worldZ > 0) {
            ctx.log(`State loaded after ${i+1} seconds`);
            break;
        }
        if (i % 10 === 0) {
            ctx.log(`Still waiting for state... (${i}s)`);
        }
        ctx.progress();
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!initialState?.player || initialState.player.worldX === 0) {
        ctx.error('No valid player state available after 60 seconds');
        return;
    }

    // Auto-equip weapon and shield if in inventory
    const sword = initialState.inventory.find(i => /bronze sword/i.test(i.name));
    const shield = initialState.inventory.find(i => /wooden shield/i.test(i.name));
    if (sword) {
        ctx.log('Equipping Bronze sword...');
        const wieldOpt = sword.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
        if (wieldOpt) {
            try {
                await ctx.sdk.sendUseItem(sword.slot, wieldOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
            } catch (err) {
                ctx.warn(`Failed to equip sword: ${err}`);
            }
        }
    }
    if (shield) {
        ctx.log('Equipping Wooden shield...');
        const wieldOpt = shield.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
        if (wieldOpt) {
            try {
                await ctx.sdk.sendUseItem(shield.slot, wieldOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
            } catch (err) {
                ctx.warn(`Failed to equip shield: ${err}`);
            }
        }
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

    // Set initial combat style based on lowest stat
    let currentTraining = getLowestCombatStat(initialState);
    ctx.log(`Training ${currentTraining.stat} (lowest at ${currentTraining.level})`);
    try {
        await ctx.sdk.sendSetCombatStyle(currentTraining.style);
    } catch (err) {
        ctx.warn(`Failed to set combat style: ${err} - continuing anyway`);
    }
    await new Promise(r => setTimeout(r, 500));

    // Main combat loop
    let attacks = 0;
    let lastLoggedAttacks = 0;
    let lastStyleCheck = Date.now();
    let noTargetCounter = 0;  // Track consecutive no-target iterations
    const STYLE_CHECK_INTERVAL = 60_000;  // Check every minute
    const targets = /rat|goblin|spider|chicken|cow/i;

    // Good training locations in Lumbridge
    const TRAINING_SPOTS = [
        { x: 3222, z: 3218, name: 'Lumbridge Castle' },  // Men, rats
        { x: 3205, z: 3228, name: 'Lumbridge basement' },  // Rats
        { x: 3253, z: 3290, name: 'Cow field' },  // Cows
    ];

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
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // Handle dialogs (level-up, etc.) directly - with error handling
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            try {
                await ctx.sdk.sendClickDialog(0);
            } catch (err) {
                ctx.warn(`Dialog dismiss failed: ${err} - continuing`);
            }
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check if we should switch combat styles
        if (Date.now() - lastStyleCheck > STYLE_CHECK_INTERVAL) {
            const newTraining = getLowestCombatStat(state);
            if (newTraining.stat !== currentTraining.stat) {
                ctx.log(`Switching from ${currentTraining.stat} to ${newTraining.stat} (now lowest at ${newTraining.level})`);
                try {
                    await ctx.sdk.sendSetCombatStyle(newTraining.style);
                    currentTraining = newTraining;
                } catch (err) {
                    ctx.warn(`Failed to switch style: ${err}`);
                }
            }
            lastStyleCheck = Date.now();
        }

        // Check HP and eat if low
        const currentHp = state.skills.find(s => s.name === 'Hitpoints')?.level ?? 10;
        const maxHp = state.skills.find(s => s.name === 'Hitpoints')?.baseLevel ?? 10;

        if (currentHp < maxHp * 0.4) {
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
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find a target to attack
        const potentialTargets = state.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)
            .filter(n => n.distance < 15)
            .sort((a, b) => a.distance - b.distance);

        if (potentialTargets.length > 0) {
            noTargetCounter = 0;  // Reset counter
            const target = potentialTargets[0]!;
            try {
                const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                if (attackOpt) {
                    await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    attacks++;
                }
            } catch (err) {
                // Attack failed, will try again next loop
            }
            await new Promise(r => setTimeout(r, 1000));
        } else {
            noTargetCounter++;

            // If no targets for 5 iterations (~10 seconds), walk to a training spot
            if (noTargetCounter >= 5) {
                const spot = TRAINING_SPOTS[Math.floor(Math.random() * TRAINING_SPOTS.length)]!;
                ctx.log(`No targets for a while - walking to ${spot.name} (${spot.x}, ${spot.z})`);
                try {
                    await ctx.bot.walkTo(spot.x, spot.z);
                } catch (err) {
                    ctx.warn(`Walk failed: ${err}`);
                }
                noTargetCounter = 0;
                await new Promise(r => setTimeout(r, 1000));
            } else {
                ctx.log('No targets nearby, waiting...');
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Periodically log progress
        if (attacks >= lastLoggedAttacks + 20) {
            const atk = state.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
            const str = state.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
            const def = state.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;
            ctx.log(`Progress: ${attacks} attacks | Atk ${atk}, Str ${str}, Def ${def} | Training: ${currentTraining.stat}`);
            lastLoggedAttacks = attacks;
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
