/**
 * Arc: lumbridge-starter
 * Character: david_2
 *
 * Goal: Build up gold through thieving and level combat skills
 * Strategy:
 * 1. Equip bronze sword + wooden shield
 * 2. Pickpocket men for GP (3gp each success)
 * 3. Fight rats/goblins to level combat
 * 4. Cycle combat styles for balanced training
 * 5. Eat food when HP low
 *
 * Duration: 5 minutes
 */

import { runArc } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// Combat style indices
const COMBAT_STYLES = {
    ATTACK: 0,
    STRENGTH: 1,
    DEFENCE: 3,
};

const STYLE_NAMES = ['Attack', 'Strength', 'Defence'];
const STYLE_ROTATION = [COMBAT_STYLES.ATTACK, COMBAT_STYLES.STRENGTH, COMBAT_STYLES.STRENGTH, COMBAT_STYLES.DEFENCE];
const STYLE_NAME_ROTATION = ['Attack', 'Strength', 'Strength', 'Defence'];

runArc({
    characterName: 'david_2',
    arcName: 'lumbridge-starter',
    goal: 'Thieve men for GP and fight rats for combat XP',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 25_000,
}, async (ctx) => {
    ctx.log('Starting Lumbridge training arc!');

    // Stats tracking
    let pickpocketAttempts = 0;
    let killCount = 0;
    let foodEaten = 0;
    let lastStyleChange = Date.now();
    let currentStyleIndex = 0;

    // Helper functions
    function getSkillLevel(name: string): number {
        return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
    }

    function getCoins(): number {
        return ctx.state()?.inventory.find(i => /coins/i.test(i.name))?.count ?? 0;
    }

    function getHP(): { current: number; max: number } {
        const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
        return { current: hp?.level ?? 10, max: hp?.baseLevel ?? 10 };
    }

    function getLowestCombatStat(): { stat: string; style: number } {
        const atk = getSkillLevel('Attack');
        const str = getSkillLevel('Strength');
        const def = getSkillLevel('Defence');

        if (def <= atk && def <= str) return { stat: 'Defence', style: COMBAT_STYLES.DEFENCE };
        if (str <= atk) return { stat: 'Strength', style: COMBAT_STYLES.STRENGTH };
        return { stat: 'Attack', style: COMBAT_STYLES.ATTACK };
    }

    async function eatFood(): Promise<boolean> {
        const food = ctx.state()?.inventory.find(i =>
            /shrimp|bread|meat|fish|cake|pie|cooked/i.test(i.name)
        );
        if (food) {
            const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
            if (eatOpt) {
                ctx.log(`Eating ${food.name}...`);
                await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
                foodEaten++;
                return true;
            }
        }
        return false;
    }

    // Step 1: Equip weapons if not already equipped
    ctx.log('Checking equipment...');
    const equipment = ctx.state()?.equipment ?? [];
    const hasWeapon = equipment.some(e => e && /sword|dagger|scimitar/i.test(e.name));
    const hasShield = equipment.some(e => e && /shield/i.test(e.name));

    if (!hasWeapon) {
        const sword = ctx.state()?.inventory.find(i => /bronze sword/i.test(i.name));
        if (sword) {
            const wieldOpt = sword.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
            if (wieldOpt) {
                await ctx.sdk.sendUseItem(sword.slot, wieldOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
                ctx.log('Equipped bronze sword!');
            }
        }
    }

    if (!hasShield) {
        const shield = ctx.state()?.inventory.find(i => /wooden shield/i.test(i.name));
        if (shield) {
            const wieldOpt = shield.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
            if (wieldOpt) {
                await ctx.sdk.sendUseItem(shield.slot, wieldOpt.opIndex);
                await new Promise(r => setTimeout(r, 600));
                ctx.log('Equipped wooden shield!');
            }
        }
    }

    // Set initial combat style to train lowest stat
    const initial = getLowestCombatStat();
    await ctx.sdk.sendSetCombatStyle(initial.style);
    ctx.log(`Initial style: ${initial.stat} (lowest stat)`);

    ctx.progress();

    // Main loop
    const startTime = Date.now();
    const duration = 10 * 60 * 1000;  // Match timeLimit

    while (Date.now() - startTime < duration - 5000) {  // Stop 5s early
        const state = ctx.state();

        // Check for bad state (disconnection/loading issue)
        if (!state?.player || (state.player.worldX === 0 && state.player.worldZ === 0)) {
            ctx.log('Waiting for valid state...');
            await new Promise(r => setTimeout(r, 2000));
            ctx.progress();
            continue;
        }

        // Log state health periodically
        const hp = getHP();
        if (hp.max === 0) {
            ctx.log(`Warning: Skills not loaded properly (HP shows 0/0). Waiting...`);
            await new Promise(r => setTimeout(r, 2000));
            ctx.progress();
            continue;
        }

        // Dismiss any dialogs (level-up, etc.)
        if (state.dialog.isOpen) {
            ctx.log('Dialog open, dismissing...');
            try {
                const dialogPromise = ctx.sdk.sendClickDialog(0);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Dialog click timeout')), 5_000)
                );
                await Promise.race([dialogPromise, timeoutPromise]);
            } catch (err) {
                ctx.log('Dialog dismiss failed or timed out');
            }
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();  // Mark progress to avoid stall during dialog handling
            continue;
        }

        // Check HP and eat if needed
        if (hp.current <= 5) {
            ctx.log(`Low HP (${hp.current}/${hp.max}) - eating food...`);
            const ate = await eatFood();
            if (!ate) {
                ctx.log('No food! Be careful...');
            }
        }

        // Check if we're in combat
        const inCombat = state.combat?.inCombat ?? false;

        if (inCombat) {
            // Cycle styles every 20 seconds for more balanced training
            if (Date.now() - lastStyleChange > 20_000) {
                currentStyleIndex = (currentStyleIndex + 1) % STYLE_ROTATION.length;
                const style = STYLE_ROTATION[currentStyleIndex]!;
                const styleName = STYLE_NAME_ROTATION[currentStyleIndex];
                await ctx.sdk.sendSetCombatStyle(style);
                ctx.log(`Switched to ${styleName} style`);
                lastStyleChange = Date.now();
            }
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
            continue;
        }

        // Not in combat - decide: thieve or attack?
        const gp = getCoins();

        // Thieve if low on GP (need some gold for later)
        if (gp < 100 && pickpocketAttempts < 30) {
            const man = state.nearbyNpcs.find(n => /^man$/i.test(n.name));
            if (man) {
                const pickpocketOpt = man.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
                if (pickpocketOpt) {
                    ctx.log(`Pickpocketing man (attempt ${pickpocketAttempts + 1}, GP: ${gp})`);
                    try {
                        await ctx.sdk.sendInteractNpc(man.index, pickpocketOpt.opIndex);
                        pickpocketAttempts++;
                        await new Promise(r => setTimeout(r, 1500));
                        ctx.progress();
                    } catch (err) {
                        ctx.log('Pickpocket failed');
                    }
                    continue;
                }
            }
        }

        // Try to attack a rat or goblin
        const target = state.nearbyNpcs.find(n =>
            /^(rat|goblin)$/i.test(n.name) &&
            n.optionsWithIndex.some(o => /attack/i.test(o.text)) &&
            !n.inCombat  // Don't attack if already fighting someone
        );

        if (target) {
            const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                ctx.log(`Attacking ${target.name}...`);
                try {
                    // Wrap in timeout to avoid hanging on bad connection
                    const attackPromise = ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Attack timeout')), 10_000)
                    );
                    await Promise.race([attackPromise, timeoutPromise]);
                } catch (err) {
                    ctx.log('Attack failed, trying another target...');
                }
                // Always wait after attempting attack, even on error
                await new Promise(r => setTimeout(r, 2000));
                ctx.progress();
                continue;
            }
        }

        // No targets found, walk around a bit to find more
        ctx.log('Looking for targets...');
        await new Promise(r => setTimeout(r, 2000));
        ctx.progress();
    }

    // Final stats
    ctx.log('');
    ctx.log('========== ARC COMPLETE ==========');
    ctx.log(`Pickpocket attempts: ${pickpocketAttempts}`);
    ctx.log(`Food eaten: ${foodEaten}`);
    ctx.log(`Final GP: ${getCoins()}`);
    ctx.log(`Combat stats: Atk ${getSkillLevel('Attack')}, Str ${getSkillLevel('Strength')}, Def ${getSkillLevel('Defence')}`);
    ctx.log(`Thieving: ${getSkillLevel('Thieving')}`);
    ctx.log(`HP: ${getHP().current}/${getHP().max}`);
    const totalLevel = ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0;
    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log('==================================');

    await ctx.screenshot('final');
});
