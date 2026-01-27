/**
 * Arc: cow-hides
 * Character: david_3
 *
 * Goal: Farm cowhides at Lumbridge cow field
 * Strategy:
 * 1. Drop bones to make inventory space
 * 2. Walk to cow field (3253, 3290)
 * 3. Open gate if needed (at 3253, 3270)
 * 4. Kill cows, cycle combat styles for balanced training
 * 5. Pick up cowhides ONLY (bones are worthless)
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// Combat style indices
const STYLES = {
    ATTACK: 0,
    STRENGTH: 1,
    DEFENCE: 3,
};

// Cow field coordinates
const COW_FIELD = {
    center: { x: 3253, z: 3290 },
    gate: { x: 3253, z: 3270 },
    // Bounding box for inside pen
    minX: 3242, maxX: 3265,
    minZ: 3275, maxZ: 3298,
};

interface Stats {
    kills: number;
    hidesCollected: number;
    bonesDropped: number;
    startTime: number;
}

function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
    return {
        current: hp?.level ?? 10,
        max: hp?.baseLevel ?? 10,
    };
}

function getLowestCombatStat(ctx: ScriptContext): { stat: string; style: number } {
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');

    if (def <= atk && def <= str) return { stat: 'Defence', style: STYLES.DEFENCE };
    if (str <= atk) return { stat: 'Strength', style: STYLES.STRENGTH };
    return { stat: 'Attack', style: STYLES.ATTACK };
}

function isInsideCowPen(x: number, z: number): boolean {
    return x >= COW_FIELD.minX && x <= COW_FIELD.maxX &&
           z >= COW_FIELD.minZ && z <= COW_FIELD.maxZ;
}

function findCow(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const cows = state.nearbyNpcs
        .filter(npc => /^cow$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /attack/i.test(opt)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => a.distance - b.distance);

    return cows[0] ?? null;
}

async function equipItems(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state) return;

    // Check if already equipped
    const hasWeapon = state.equipment.some(e => e && /sword|dagger/i.test(e.name));
    const hasShield = state.equipment.some(e => e && /shield/i.test(e.name));

    if (!hasWeapon) {
        const sword = state.inventory.find(i => /bronze sword/i.test(i.name));
        if (sword) {
            ctx.log('Equipping Bronze sword');
            await ctx.bot.equipItem(sword);
            await new Promise(r => setTimeout(r, 600));
        }
    }

    if (!hasShield) {
        const shield = state.inventory.find(i => /wooden shield/i.test(i.name));
        if (shield) {
            ctx.log('Equipping Wooden shield');
            await ctx.bot.equipItem(shield);
            await new Promise(r => setTimeout(r, 600));
        }
    }
}

async function dropBones(ctx: ScriptContext, stats: Stats): Promise<number> {
    let dropped = 0;

    // Log inventory for debugging
    const invItems = ctx.state()?.inventory ?? [];
    ctx.log(`Checking ${invItems.length} inventory items for bones...`);

    // Keep dropping until no more bones (case-insensitive partial match)
    for (let attempt = 0; attempt < 30; attempt++) {
        const state = ctx.state();
        if (!state) break;

        // Match "Bones" with any capitalization
        const bone = state.inventory.find(i => i.name.toLowerCase() === 'bones');
        if (!bone) {
            ctx.log(`No more bones found after ${dropped} drops`);
            break;
        }

        const dropOpt = bone.optionsWithIndex.find(o => o.text.toLowerCase().includes('drop'));
        if (dropOpt) {
            ctx.log(`Dropping ${bone.name} from slot ${bone.slot}`);
            await ctx.sdk.sendUseItem(bone.slot, dropOpt.opIndex);
            dropped++;
            stats.bonesDropped++;
            ctx.progress();
            await new Promise(r => setTimeout(r, 400));
        } else {
            ctx.log(`No drop option for ${bone.name}!`);
            break;
        }
    }

    return dropped;
}

async function pickupHides(ctx: ScriptContext, stats: Stats): Promise<void> {
    const groundItems = await ctx.sdk.getGroundItems();

    // Only pick up cowhides - they're valuable!
    const hides = groundItems
        .filter(i => /cowhide/i.test(i.name))
        .filter(i => i.distance < 8)
        .slice(0, 3);

    for (const item of hides) {
        // Check inventory space
        const currentInv = ctx.state()?.inventory ?? [];
        if (currentInv.length >= 28) {
            ctx.log('Inventory full of cowhides!');
            break;
        }

        try {
            ctx.log(`Picking up ${item.name}`);
            await ctx.bot.pickupItem(item);
            stats.hidesCollected++;
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();
        } catch (err) {
            ctx.log('Pickup failed, continuing...');
        }
    }
}

async function walkToCowField(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state?.player) return;

    const player = state.player;
    ctx.log(`Current position: (${player.worldX}, ${player.worldZ})`);

    // Check if already inside cow pen
    if (isInsideCowPen(player.worldX, player.worldZ)) {
        ctx.log('Already inside cow pen!');
        return;
    }

    // Walk toward cow field gate
    ctx.log('Walking to cow field gate...');
    await ctx.bot.walkTo(COW_FIELD.gate.x, COW_FIELD.gate.z);
    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();

    // Open gate if nearby
    const gate = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name));
    if (gate) {
        const openOpt = gate.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (openOpt) {
            ctx.log('Opening gate...');
            await ctx.bot.openDoor(gate);
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
        }
    }

    // Walk into the pen
    ctx.log('Walking into cow field...');
    await ctx.bot.walkTo(COW_FIELD.center.x, COW_FIELD.center.z);
    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();
}

runArc({
    characterName: 'david_3',
    arcName: 'cow-hides',
    goal: 'Farm cowhides at Lumbridge cow field',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        hidesCollected: 0,
        bonesDropped: 0,
        startTime: Date.now(),
    };

    ctx.log('=== Cow Field Cowhide Farming ===');
    ctx.log('Goal: Collect cowhides! (drop bones, they are worthless)');
    ctx.log('');

    // Wait for state
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.warn('State did not fully populate');
    }

    await new Promise(r => setTimeout(r, 500));
    ctx.progress();

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();

    // Log starting stats
    const startAtk = getSkillLevel(ctx, 'Attack');
    const startStr = getSkillLevel(ctx, 'Strength');
    const startDef = getSkillLevel(ctx, 'Defence');
    const startHp = getSkillLevel(ctx, 'Hitpoints');
    ctx.log(`Starting: Atk ${startAtk}, Str ${startStr}, Def ${startDef}, HP ${startHp}`);

    // Check inventory and drop bones if full
    const invCount = ctx.state()?.inventory.length ?? 0;
    ctx.log(`Inventory: ${invCount}/28 items`);

    if (invCount >= 20) {
        ctx.log('Inventory nearly full - dropping bones to make space...');
        const dropped = await dropBones(ctx, stats);
        ctx.log(`Dropped ${dropped} bones`);
    }

    // Equip weapon and shield
    await equipItems(ctx);
    ctx.progress();

    // Walk to cow field
    await walkToCowField(ctx);

    // Set initial combat style (train lowest stat)
    let currentStyle = getLowestCombatStat(ctx);
    ctx.log(`Training ${currentStyle.stat} (lowest)`);
    await ctx.sdk.sendSetCombatStyle(currentStyle.style);

    let loopCount = 0;
    let lastStyleCheck = Date.now();
    let lastLootCheck = Date.now();

    // Main combat loop
    while (true) {
        loopCount++;
        const state = ctx.state();
        if (!state) continue;

        // Status update every 20 loops
        if (loopCount % 20 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getHP(ctx);
            ctx.log(`Loop ${loopCount}: Atk ${atk}, Str ${str}, Def ${def} | HP ${hp.current}/${hp.max} | Kills: ${stats.kills} | Hides: ${stats.hidesCollected}`);
        }

        // Dismiss dialogs
        if (state.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check HP - at 40+ combat stats, cows are easy but still check
        const hp = getHP(ctx);
        if (hp.current <= 10) {
            ctx.warn(`Low HP (${hp.current}/${hp.max})! Waiting for regen...`);
            await new Promise(r => setTimeout(r, 5000));
            ctx.progress();
            continue;
        }

        // Rotate combat style every 30 seconds
        if (Date.now() - lastStyleCheck > 30_000) {
            currentStyle = getLowestCombatStat(ctx);
            ctx.log(`Switching to ${currentStyle.stat}`);
            await ctx.sdk.sendSetCombatStyle(currentStyle.style);
            lastStyleCheck = Date.now();
        }

        // Pickup cowhides every 10 seconds
        if (Date.now() - lastLootCheck > 10_000) {
            await pickupHides(ctx, stats);
            lastLootCheck = Date.now();
        }

        // Check if we're in combat or idle
        const player = state.player;
        const isIdle = player?.animId === -1;

        // Check if we've drifted out of the cow pen
        if (!isInsideCowPen(player.worldX, player.worldZ)) {
            ctx.log('Drifted out of cow pen, walking back...');
            await ctx.bot.walkTo(COW_FIELD.center.x, COW_FIELD.center.z);
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
            continue;
        }

        if (isIdle) {
            // Find a cow to attack
            const cow = findCow(ctx);
            if (!cow) {
                ctx.log('No cows nearby, waiting...');
                await new Promise(r => setTimeout(r, 1000));
                ctx.progress();
                continue;
            }

            try {
                ctx.log(`Attacking ${cow.name} (dist ${cow.distance.toFixed(1)})`);
                const result = await ctx.bot.attackNpc(cow);
                if (result.success) {
                    stats.kills++;
                    ctx.progress();
                }
            } catch (err) {
                // Attack timed out or failed, try another target
                ctx.log('Attack failed, trying again...');
                ctx.progress();
            }

            await new Promise(r => setTimeout(r, 1500));
        } else {
            // In combat, just wait
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();
        }
    }
});
