import { runArc } from '../../../arc-runner';

/**
 * Explore Combat Arc
 *
 * Goal: Fight whatever enemies are nearby for XP
 * Current location: Near jail (3108, 3238) - jail guards are level 26
 *
 * Strategy:
 * - Drop junk items (logs, goblin mail, etc.) to make room
 * - Keep: tools, coins, net, axe
 * - Fight any attackable NPC nearby
 * - Train lowest combat stat
 */

runArc({
    characterName: 'david_3',
    arcName: 'explore-combat',
    goal: 'Explore and fight enemies for XP',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Explore Combat Arc ===');

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

    const initialState = ctx.state();
    if (!initialState?.player) {
        ctx.error('No player state available');
        return;
    }

    // Helper to get skill level
    const getSkillLevel = (name: string) =>
        ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;

    // Log initial stats
    ctx.log('Position: (' + initialState.player.worldX + ', ' + initialState.player.worldZ + ')');
    ctx.log('Combat Level: ' + initialState.player.combatLevel);
    ctx.log('Stats: Atk ' + getSkillLevel('Attack') + ', Str ' + getSkillLevel('Strength') + ', Def ' + getSkillLevel('Defence'));

    // Log nearby NPCs to see what we can fight
    ctx.log('Nearby enemies:');
    for (const npc of initialState.nearbyNpcs.slice(0, 8)) {
        if (npc.optionsWithIndex.some(o => /attack/i.test(o.text))) {
            ctx.log('  - ' + npc.name + ' (lvl ' + npc.combatLevel + ', dist ' + npc.distance.toFixed(1) + ')');
        }
    }

    // Drop junk items to make room
    ctx.log('Dropping junk items...');
    const keepPatterns = /coins|net|axe|shortbow|pickaxe|tinderbox|rune|bolt/i;

    let droppedCount = 0;
    for (let i = 0; i < 3; i++) {  // Multiple passes in case of dialog issues
        ctx.progress();
        const state = ctx.state();
        if (!state) break;

        // Handle dialogs first
        if (state.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        for (const item of state.inventory) {
            if (!keepPatterns.test(item.name)) {
                ctx.log('  Dropping: ' + item.name);
                await ctx.sdk.sendDropItem(item.slot);
                droppedCount++;
                await new Promise(r => setTimeout(r, 150));
            }
        }
    }
    ctx.log('Dropped ' + droppedCount + ' items');
    ctx.progress();

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

    // Main combat loop - fight anything attackable
    let attacks = 0;
    let lastStyleCheck = Date.now();

    while (true) {
        ctx.progress();

        const state = ctx.state();
        if (!state?.player) {
            ctx.log('Waiting for state...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs
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

        // Check if in combat/animating
        const isAnimating = state.player?.animId !== -1;
        if (isAnimating) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find anything attackable - sort by combat level (lower first for safety)
        const targets = state.nearbyNpcs
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)
            .filter(n => n.distance < 15)
            .filter(n => n.combatLevel > 0 && n.combatLevel < 100)  // Avoid high level stuff
            .sort((a, b) => a.distance - b.distance);

        if (targets.length > 0) {
            const target = targets[0];
            const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                ctx.log('Attacking ' + target.name + ' (lvl ' + target.combatLevel + ', dist: ' + target.distance.toFixed(1) + ')');
                await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                attacks++;
                await new Promise(r => setTimeout(r, 1000));
            }
        } else {
            ctx.log('No targets nearby, waiting...');
            await new Promise(r => setTimeout(r, 2000));
        }

        // Log progress every 20 attacks
        if (attacks > 0 && attacks % 20 === 0) {
            const currentAtk = getSkillLevel('Attack');
            const currentStr = getSkillLevel('Strength');
            const currentDef = getSkillLevel('Defence');
            const currentHp = getSkillLevel('Hitpoints');
            ctx.log('Progress: ' + attacks + ' attacks, Atk ' + currentAtk + ', Str ' + currentStr + ', Def ' + currentDef + ', HP ' + currentHp);
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
