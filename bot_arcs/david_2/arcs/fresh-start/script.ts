import { runArc, TestPresets } from '../../../arc-runner';

/**
 * Fresh Start - Rebuild from scratch!
 *
 * After save corruption, starting over with a fresh character.
 * No equipment, no inventory, all skills at 1.
 *
 * Plan:
 * 1. Find and attack weak enemies (rats, men)
 * 2. No need to equip weapons - fists work for low level enemies
 * 3. Train combat naturally with balanced style cycling
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
    arcName: 'fresh-start',
    goal: 'Rebuild from scratch - combat training with starter gear',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,
    // CRITICAL: Reinitialize the save file from preset!
    initializeFromPreset: TestPresets.LUMBRIDGE_SPAWN,
}, async (ctx) => {
    ctx.log('=== Fresh Start - Rebuilding! ===');
    ctx.log('Save file reinitialized with starter gear!');

    // Wait for valid state
    let state = ctx.state();
    for (let i = 0; i < 30; i++) {
        state = ctx.state();
        if (state?.player?.worldX > 0) break;
        ctx.progress();
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.error('No valid state available');
        return;
    }

    // Log initial stats
    const getSkillLevel = (name: string) =>
        state.skills.find(s => s.name === name)?.baseLevel ?? 1;

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);
    ctx.log(`Starting stats - Attack: ${getSkillLevel('Attack')}, Strength: ${getSkillLevel('Strength')}, Defence: ${getSkillLevel('Defence')}`);
    ctx.log(`HP: ${getSkillLevel('Hitpoints')}`);
    ctx.log(`Inventory: ${state.inventory.length} items`);

    // Equip weapons if we have them
    const sword = state.inventory.find(i => /bronze sword/i.test(i.name));
    if (sword) {
        const wieldOpt = sword.optionsWithIndex?.find(o => /wield|equip/i.test(o.text));
        if (wieldOpt) {
            ctx.log('Equipping bronze sword...');
            try {
                await ctx.sdk.sendUseItem(sword.slot, wieldOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
            } catch (err) {
                ctx.warn(`Failed to equip sword: ${err}`);
            }
        }
    }

    const shield = state.inventory.find(i => /wooden shield/i.test(i.name));
    if (shield) {
        const wieldOpt = shield.optionsWithIndex?.find(o => /wield|equip/i.test(o.text));
        if (wieldOpt) {
            ctx.log('Equipping wooden shield...');
            try {
                await ctx.sdk.sendUseItem(shield.slot, wieldOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
            } catch (err) {
                ctx.warn(`Failed to equip shield: ${err}`);
            }
        }
    }

    // Set initial combat style
    let currentTraining = getLowestCombatStat(state);
    ctx.log(`Training ${currentTraining.stat} first (level ${currentTraining.level})`);
    try {
        await ctx.sdk.sendSetCombatStyle(currentTraining.style);
    } catch (err) {
        ctx.warn(`Failed to set style: ${err}`);
    }

    // Main combat loop
    let attacks = 0;
    let lastStyleCheck = Date.now();
    let lastLog = Date.now();
    const STYLE_CHECK_INTERVAL = 60_000;
    const targets = /rat|goblin|man|woman|chicken|spider/i;  // Low level targets

    while (true) {
        ctx.progress();
        state = ctx.state();

        if (!state?.player || state.player.worldX === 0) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs with timeout protection
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog (level up!)');
            try {
                await Promise.race([
                    ctx.sdk.sendClickDialog(0),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Dialog timeout')), 5000))
                ]);
            } catch (err) {
                ctx.warn(`Dialog dismiss issue: ${err} - continuing anyway`);
            }
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if we should switch combat styles
        if (Date.now() - lastStyleCheck > STYLE_CHECK_INTERVAL) {
            const newTraining = getLowestCombatStat(state);
            if (newTraining.stat !== currentTraining.stat) {
                ctx.log(`Switching from ${currentTraining.stat} to ${newTraining.stat} (level ${newTraining.level})`);
                try {
                    await ctx.sdk.sendSetCombatStyle(newTraining.style);
                    currentTraining = newTraining;
                } catch (err) {
                    ctx.warn(`Failed to switch style: ${err}`);
                }
            }
            lastStyleCheck = Date.now();
        }

        // Check if in combat
        const inCombat = state.combat?.inCombat ?? false;
        const isAnimating = state.player?.animId !== -1;

        if (inCombat || isAnimating) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
        }

        // Find a target
        const potentialTargets = state.nearbyNpcs
            .filter(n => targets.test(n.name))
            .filter(n => n.optionsWithIndex?.some(o => /attack/i.test(o.text)))
            .filter(n => !n.inCombat)
            .filter(n => n.distance < 15)
            .sort((a, b) => a.distance - b.distance);

        if (potentialTargets.length > 0) {
            const target = potentialTargets[0];
            try {
                const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                if (attackOpt) {
                    await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    attacks++;
                }
            } catch (err) {
                // Ignore
            }
            await new Promise(r => setTimeout(r, 1000));
        } else {
            // No targets - walk to Lumbridge castle area
            ctx.log('No targets nearby, walking to find some...');
            await ctx.sdk.sendWalk(3222, 3218);  // Lumbridge castle
            await new Promise(r => setTimeout(r, 3000));
        }

        // Periodic progress log
        if (Date.now() - lastLog > 30_000) {
            const atk = state.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
            const str = state.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
            const def = state.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;
            const hp = state.skills.find(s => s.name === 'Hitpoints')?.baseLevel ?? 10;
            ctx.log(`Progress: ${attacks} attacks | Atk ${atk}, Str ${str}, Def ${def}, HP ${hp} | Training: ${currentTraining.stat}`);
            lastLog = Date.now();
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
