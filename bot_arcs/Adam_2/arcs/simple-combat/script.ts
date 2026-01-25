/**
 * Arc: simple-combat
 * Character: Adam_2
 *
 * Ultra-simple combat script - just attack cows, nothing else.
 * Designed for maximum stability with connection issues.
 */

import { runArc } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

const COW_FIELD = { x: 3253, z: 3269 };

function getSkillLevel(ctx: ScriptContext, skillName: string): number {
    return ctx.sdk.getSkill(skillName)?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

runArc({
    characterName: 'Adam_2',
    arcName: 'simple-combat',
    goal: 'Just attack cows, minimal logic',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 60_000,
}, async (ctx) => {
    ctx.log('=== Arc: simple-combat ===');

    // Wait for state
    for (let i = 0; i < 30; i++) {
        const player = ctx.state()?.player;
        if (player && player.worldX > 100) break;
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();
    }

    // Log starting state
    const startLevel = getTotalLevel(ctx);
    const hides = countItem(ctx, /cow\s*hide/i);
    ctx.log(`Start: Level=${startLevel}, Hides=${hides}`);
    ctx.log(`Combat: Atk=${getSkillLevel(ctx, 'Attack')} Str=${getSkillLevel(ctx, 'Strength')} Def=${getSkillLevel(ctx, 'Defence')}`);

    // Dismiss dialogs
    await ctx.bot.dismissBlockingUI();

    // Set combat style to train Strength (lowest stat)
    const lowestStat = (() => {
        const atk = getSkillLevel(ctx, 'Attack');
        const str = getSkillLevel(ctx, 'Strength');
        const def = getSkillLevel(ctx, 'Defence');
        if (str <= atk && str <= def) return 'Strength';
        if (def <= atk) return 'Defence';
        return 'Attack';
    })();

    const styleState = ctx.sdk.getState()?.combatStyle;
    if (styleState) {
        const style = styleState.styles.find(s => s.trainedSkill === lowestStat);
        if (style && styleState.currentStyle !== style.index) {
            await ctx.sdk.sendSetCombatStyle(style.index);
            ctx.log(`Combat style: ${lowestStat}`);
        }
    }

    let kills = 0;
    let loops = 0;

    while (true) {
        loops++;
        ctx.progress();

        const state = ctx.state();
        if (!state || !state.player) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Dismiss dialogs (level-up)
        if (state.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check if idle
        const isIdle = state.player.animId === -1;
        if (!isIdle) {
            await new Promise(r => setTimeout(r, 600));
            continue;
        }

        // Find and attack cow
        const cow = state.nearbyNpcs
            .filter(n => /^cow$/i.test(n.name))
            .filter(n => !n.inCombat)
            .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];

        if (cow) {
            const attackOpt = cow.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                await ctx.sdk.sendInteractNpc(cow.index, attackOpt.opIndex);
                kills++;
                ctx.log(`Attack cow #${kills} (dist=${cow.distance.toFixed(0)})`);
            }
        }

        await new Promise(r => setTimeout(r, 1000));

        // Log progress every 20 loops
        if (loops % 20 === 0) {
            ctx.log(`Loop ${loops}: Kills=${kills}, Atk=${getSkillLevel(ctx, 'Attack')} Str=${getSkillLevel(ctx, 'Strength')} Def=${getSkillLevel(ctx, 'Defence')}`);
        }
    }
});
