import { runArc } from '../../../arc-runner';

/**
 * Goblin Grind Arc
 *
 * Goal: Drop bones to make space, then grind goblins for XP
 * Location: Current position (near goblins at ~3153, 3237)
 *
 * Strategy:
 * - Drop all bones (worthless)
 * - Set combat style to lowest melee stat
 * - Attack goblins continuously
 * - Pick up coins and valuable loot
 */

runArc({
    characterName: 'david_3',
    arcName: 'goblin-grind',
    goal: 'Drop bones and grind goblins for XP. Train lowest combat stat.',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,  // Longer stall timeout for combat
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Goblin Grind Arc ===');

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

    const initialState = ctx.state();
    if (!initialState?.player) {
        ctx.error('No player state available');
        return;
    }

    // Helper to get skill level
    const getSkillLevel = (name: string) =>
        ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;

    // Log initial stats
    const attack = getSkillLevel('Attack');
    const strength = getSkillLevel('Strength');
    const defence = getSkillLevel('Defence');
    const hp = getSkillLevel('Hitpoints');

    ctx.log('Starting stats:');
    ctx.log('  Attack: ' + attack + ', Strength: ' + strength + ', Defence: ' + defence + ', HP: ' + hp);
    ctx.log('  Position: (' + initialState.player.worldX + ', ' + initialState.player.worldZ + ')');

    // Bury bones to make inventory space (also gives Prayer XP!)
    ctx.log('Burying bones to make inventory space...');
    let bonesBuried = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
        ctx.progress();
        const state = ctx.state();
        if (!state) break;

        const bone = state.inventory.find(i => i.name.toLowerCase() === 'bones');
        if (!bone) {
            ctx.log('No more bones to bury (buried ' + bonesBuried + ')');
            break;
        }

        // Log options for debugging on first bone
        if (bonesBuried === 0) {
            ctx.log('Bone options: ' + bone.optionsWithIndex.map(o => o.text).join(', '));
        }

        // Try "Bury" option (gives Prayer XP) or "Drop" as fallback
        let actionOpt = bone.optionsWithIndex.find(o => o.text.toLowerCase().includes('bury'));
        if (!actionOpt) {
            actionOpt = bone.optionsWithIndex.find(o => o.text.toLowerCase().includes('drop'));
        }

        if (actionOpt) {
            await ctx.sdk.sendUseItem(bone.slot, actionOpt.opIndex);
            bonesBuried++;
            await new Promise(r => setTimeout(r, 600));  // Burying takes a moment
        } else {
            ctx.log('No bury/drop option for bones - options: ' + bone.options.join(', '));
            break;
        }
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

        ctx.log('Training ' + statName + ' (Atk: ' + atk + ', Str: ' + str + ', Def: ' + def + ')');
        await ctx.sdk.sendSetCombatStyle(style);
    };

    await setLowestCombatStyle();
    await new Promise(r => setTimeout(r, 500));

    // Main combat loop
    let kills = 0;
    let lastStyleCheck = Date.now();
    const targets = /goblin|rat|spider/i;

    while (true) {
        ctx.progress();

        const state = ctx.state();
        if (!state?.player) {
            ctx.log('Waiting for state...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Validate position
        if (state.player.worldX === 0 || state.player.worldZ === 0) {
            ctx.log('Invalid position, waiting...');
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // Handle dialogs (level-up)
        if (state.dialog.isOpen) {
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

        // Check if in combat
        const isAnimating = state.player?.animId !== -1;

        if (isAnimating) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find goblin to attack
        const potentialTargets = state.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)
            .filter(n => n.distance < 15)
            .sort((a, b) => a.distance - b.distance);

        if (potentialTargets.length > 0) {
            const target = potentialTargets[0];
            if (target) {
                try {
                    const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                    if (attackOpt) {
                        ctx.log('Attacking ' + target.name + ' (dist: ' + target.distance.toFixed(1) + ')');
                        await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                        kills++;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } catch (err) {
                    ctx.log('Attack failed, trying again...');
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        } else {
            ctx.log('No targets nearby, waiting...');
            await new Promise(r => setTimeout(r, 2000));
        }

        // Log progress every 20 kills
        if (kills > 0 && kills % 20 === 0) {
            const currentAtk = getSkillLevel('Attack');
            const currentStr = getSkillLevel('Strength');
            const currentDef = getSkillLevel('Defence');
            ctx.log('Progress: ' + kills + ' attacks, Atk ' + currentAtk + ', Str ' + currentStr + ', Def ' + currentDef);
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
