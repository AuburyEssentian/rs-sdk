/**
 * Arc: farm-combat
 * Character: david_3
 *
 * Goal: Train combat at the cow/chicken farm!
 * Trains lowest melee stat, fights anything nearby.
 */

import { runArc } from '../../../arc-runner';

runArc({
    characterName: 'david_3',
    arcName: 'farm-combat',
    goal: 'Train combat at farm - cows and chickens',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Farm Combat Arc ===');

    // Wait for state
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
    if (!state?.player) {
        ctx.error('No player state');
        return;
    }

    // Helpers
    const getSkillLevel = (name: string) =>
        ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Combat Level: ${state.player.combatLevel}`);
    ctx.log(`Attack: ${getSkillLevel('Attack')}, Strength: ${getSkillLevel('Strength')}, Defence: ${getSkillLevel('Defence')}`);

    // Equip sword if not equipped
    const equipped = state.equipment.find(e => e?.name && /sword/i.test(e.name));
    if (!equipped) {
        const sword = state.inventory.find(i => /sword/i.test(i.name));
        if (sword) {
            ctx.log('Equipping sword...');
            const equipOpt = sword.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
            if (equipOpt) {
                await ctx.sdk.sendUseItem(sword.slot, equipOpt.opIndex);
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }

    // Dismiss any dialogs
    if (state.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 500));
    }

    // Set combat style to train lowest stat
    const setLowestCombatStyle = async () => {
        const atk = getSkillLevel('Attack');
        const str = getSkillLevel('Strength');
        const def = getSkillLevel('Defence');

        let style: number;
        let statName: string;

        if (def <= atk && def <= str) {
            style = 3;
            statName = 'Defence';
        } else if (str <= atk) {
            style = 1;
            statName = 'Strength';
        } else {
            style = 0;
            statName = 'Attack';
        }

        ctx.log(`Training ${statName} (Atk: ${atk}, Str: ${str}, Def: ${def})`);
        await ctx.sdk.sendSetCombatStyle(style);
    };

    await setLowestCombatStyle();
    await new Promise(r => setTimeout(r, 500));

    // Combat targets
    const targets = /cow|chicken|goblin|rat|spider/i;
    let attacks = 0;
    let lastStyleCheck = Date.now();

    while (true) {
        ctx.progress();

        const currentState = ctx.state();
        if (!currentState?.player) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs (level-up)
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Rotate combat style every 30 seconds
        if (Date.now() - lastStyleCheck > 30000) {
            await setLowestCombatStyle();
            lastStyleCheck = Date.now();
        }

        // Check if already in combat/animating
        const isAnimating = currentState.player?.animId !== -1;
        if (isAnimating) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find target
        const potentialTargets = currentState.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)
            .filter(n => n.distance < 15)
            .sort((a, b) => a.distance - b.distance);

        if (potentialTargets.length > 0) {
            const target = potentialTargets[0];
            if (target) {
                const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                if (attackOpt) {
                    ctx.log(`Attacking ${target.name} (dist: ${target.distance.toFixed(1)})`);
                    await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    attacks++;
                    await new Promise(r => setTimeout(r, 1000));

                    // Log progress every 20 attacks
                    if (attacks % 20 === 0) {
                        const atk = getSkillLevel('Attack');
                        const str = getSkillLevel('Strength');
                        const def = getSkillLevel('Defence');
                        ctx.log(`Progress: ${attacks} attacks, Atk ${atk}, Str ${str}, Def ${def}`);
                    }
                }
            }
        } else {
            ctx.log('No targets nearby, waiting...');
            await new Promise(r => setTimeout(r, 2000));
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
