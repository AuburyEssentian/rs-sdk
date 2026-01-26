/**
 * Arc: cowhide-training
 * Character: Adam_2
 *
 * Goal: Train combat while collecting cowhides, then bank at Draynor Bank.
 * Strategy:
 * - Kill cows and loot cowhides
 * - When inventory is full (~18 hides), walk to Draynor Bank
 * - Deposit hides, return to cows
 * - Cycle combat styles for balanced training
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// === LOCATIONS ===
const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3270 },
    DRAYNOR_BANK: { x: 3092, z: 3243 },
};

// Waypoints from cow field to Draynor Bank (avoiding Dark Wizards at ~3220,3220)
// Path goes: cow field -> west past Lumbridge -> northwest to Draynor
const WAYPOINTS_TO_BANK = [
    { x: 3253, z: 3270 },  // Cow field center
    { x: 3230, z: 3270 },  // West
    { x: 3200, z: 3260 },  // Continue west, staying north of Dark Wizards
    { x: 3170, z: 3250 },  // Continue west
    { x: 3140, z: 3245 },  // Approach Draynor
    { x: 3110, z: 3243 },  // Near Draynor
    { x: 3092, z: 3243 },  // Draynor Bank
];

const WAYPOINTS_TO_COWS = [
    { x: 3110, z: 3243 },  // East from Draynor
    { x: 3140, z: 3245 },  // Continue east
    { x: 3170, z: 3250 },  // Past swamp
    { x: 3200, z: 3260 },  // North of Dark Wizards
    { x: 3230, z: 3270 },  // Towards cow field
    { x: 3253, z: 3270 },  // Cow field
];

// === COMBAT STYLES ===
const COMBAT_STYLES = {
    ACCURATE: 0,    // Trains Attack
    AGGRESSIVE: 1,  // Trains Strength
    DEFENSIVE: 3,   // Trains Defence
};

// Style rotation: balanced training
const STYLE_ROTATION = [
    { style: COMBAT_STYLES.ACCURATE, name: 'Accurate (Attack)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' },
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },
];

let lastStyleChange = 0;
let currentStyleIndex = 0;
let lastSetStyle = -1;
const STYLE_CYCLE_MS = 30_000;  // 30 seconds per style

// === STATS ===
interface Stats {
    kills: number;
    hidesLooted: number;
    hidesBanked: number;
    bankTrips: number;
    startTime: number;
}

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
    return { current: hp?.level ?? 10, max: hp?.baseLevel ?? 10 };
}

function countHides(ctx: ScriptContext): number {
    const inv = ctx.state()?.inventory ?? [];
    return inv.filter(i => /cow\s*hide/i.test(i.name)).length;
}

function getInventorySpace(ctx: ScriptContext): number {
    return 28 - (ctx.state()?.inventory?.length ?? 0);
}

// === WALKING ===
// Walk using bot.walkTo which handles pathfinding
async function walkWaypoints(ctx: ScriptContext, waypoints: {x: number, z: number}[]): Promise<boolean> {
    for (let wpIdx = 0; wpIdx < waypoints.length; wpIdx++) {
        const wp = waypoints[wpIdx]!;
        const player = ctx.state()?.player;
        const startDist = player ? Math.sqrt(
            Math.pow(player.worldX - wp.x, 2) +
            Math.pow(player.worldZ - wp.z, 2)
        ) : 999;

        ctx.log(`Walking to waypoint ${wpIdx + 1}/${waypoints.length}: (${wp.x}, ${wp.z}) - ${Math.round(startDist)} tiles away`);

        // Dismiss dialogs first
        if (ctx.state()?.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
        }

        // Use bot.walkTo which handles pathfinding
        const result = await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx);

        if (!result.success) {
            ctx.warn(`Walk failed: ${result.message}`);
            // Try opening any nearby doors/gates and retry
            await ctx.bot.openDoor(/gate|door/i);
            await new Promise(r => setTimeout(r, 500));
            const retry = await ctx.bot.walkTo(wp.x, wp.z);
            if (!retry.success) {
                ctx.warn(`Walk retry failed: ${retry.message}`);
            }
        }

        const afterPlayer = ctx.state()?.player;
        if (afterPlayer) {
            ctx.log(`Now at: (${afterPlayer.worldX}, ${afterPlayer.worldZ})`);
        }
    }
    return true;
}

// === BANKING ===
async function bankHides(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('=== Banking Trip ===');
    stats.bankTrips++;

    const hidesBefore = countHides(ctx);
    ctx.log(`Hides to bank: ${hidesBefore}`);

    // Exit cow field
    await ctx.bot.openDoor(/gate/i);
    await new Promise(r => setTimeout(r, 500));
    markProgress(ctx);

    // Walk to Draynor Bank
    ctx.log('Walking to Draynor Bank...');
    await walkWaypoints(ctx, WAYPOINTS_TO_BANK);

    // Open bank
    ctx.log('Opening bank...');
    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (!banker) {
        ctx.warn('No banker found!');
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', ');
        ctx.log('Nearby NPCs: ' + nearby);
        return false;
    }

    const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
    if (!bankOpt) {
        ctx.warn('No bank option on banker');
        return false;
    }

    await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

    // Wait for bank to open
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) {
            ctx.log('Bank opened!');
            break;
        }
        markProgress(ctx);
    }

    if (!ctx.state()?.interface?.isOpen) {
        ctx.warn('Bank did not open');
        return false;
    }

    // Deposit all hides
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
        await new Promise(r => setTimeout(r, 150));
        markProgress(ctx);
    }

    // Also deposit raw beef and bones to clear space
    const junk = ctx.state()?.inventory.filter(i => /raw\s*beef|^bones$/i.test(i.name)) ?? [];
    for (const item of junk) {
        await ctx.sdk.sendBankDeposit(item.slot, item.count ?? 1);
        await new Promise(r => setTimeout(r, 150));
        markProgress(ctx);
    }

    await new Promise(r => setTimeout(r, 500));

    const hidesAfter = countHides(ctx);
    const deposited = hidesBefore - hidesAfter;
    stats.hidesBanked += deposited;
    ctx.log(`Deposited ${deposited} hides (total banked: ${stats.hidesBanked})`);

    // Close bank (walking away works too)
    await ctx.bot.closeShop();

    // Return to cow field
    ctx.log('Returning to cow field...');
    await walkWaypoints(ctx, WAYPOINTS_TO_COWS);

    // Open gate to enter
    await ctx.bot.openDoor(/gate/i);
    await new Promise(r => setTimeout(r, 500));
    markProgress(ctx);

    ctx.log('=== Back at cows ===');
    return true;
}

// === COMBAT ===
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

async function cycleCombatStyle(ctx: ScriptContext): Promise<void> {
    const now = Date.now();
    if (now - lastStyleChange >= STYLE_CYCLE_MS) {
        currentStyleIndex = (currentStyleIndex + 1) % STYLE_ROTATION.length;
        lastStyleChange = now;
    }

    const target = STYLE_ROTATION[currentStyleIndex]!;
    if (lastSetStyle !== target.style) {
        ctx.log('Combat style: ' + target.name);
        await ctx.sdk.sendSetCombatStyle(target.style);
        lastSetStyle = target.style;
    }
}

async function lootHide(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const space = getInventorySpace(ctx);
    if (space <= 0) return false;

    const groundItems = ctx.sdk.getGroundItems();
    const hide = groundItems
        .filter(i => /cow\s*hide/i.test(i.name))
        .filter(i => i.distance <= 5)
        .sort((a, b) => a.distance - b.distance)[0];

    if (hide) {
        const result = await ctx.bot.pickupItem(hide);
        if (result.success) {
            stats.hidesLooted++;
            ctx.log(`Looted cowhide (${countHides(ctx)} in inv)`);
            markProgress(ctx);
            return true;
        }
    }
    return false;
}

async function eatFoodIfNeeded(ctx: ScriptContext): Promise<boolean> {
    const hp = getHP(ctx);
    if (hp.current >= hp.max * 0.5) return false;

    const food = ctx.state()?.inventory.find(i =>
        /cooked|bread|shrimp|trout|salmon|lobster|meat/i.test(i.name)
    );

    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (eatOpt) {
            ctx.log('Eating ' + food.name);
            await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
            markProgress(ctx);
            return true;
        }
    }
    return false;
}

// === MAIN LOOP ===
async function trainingLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    lastStyleChange = Date.now();
    currentStyleIndex = 0;
    lastSetStyle = -1;
    let noCowCount = 0;
    let loopCount = 0;

    const BANK_THRESHOLD = 18;  // Bank when we have this many hides

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) break;

        // Periodic status
        if (loopCount % 40 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getHP(ctx);
            const hides = countHides(ctx);
            ctx.log(`Loop ${loopCount}: Atk ${atk}, Str ${str}, Def ${def} | HP: ${hp.current}/${hp.max} | Kills: ${stats.kills} | Hides: ${hides}`);
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if we should bank
        const hides = countHides(ctx);
        if (hides >= BANK_THRESHOLD) {
            ctx.log(`Inventory has ${hides} hides - time to bank!`);
            await bankHides(ctx, stats);
            continue;
        }

        // Eat if needed
        await eatFoodIfNeeded(ctx);

        // Cycle combat style
        await cycleCombatStyle(ctx);

        // Try to loot nearby hides first
        const space = getInventorySpace(ctx);
        if (space > 0) {
            await lootHide(ctx, stats);
        }

        // Check if idle
        const player = currentState.player;
        const isIdle = player?.animId === -1;

        if (isIdle) {
            const cow = findCow(ctx);
            if (!cow) {
                noCowCount++;
                if (noCowCount % 20 === 0) {
                    ctx.log('No cows found, walking to field center...');
                    await ctx.sdk.sendWalk(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z, true);
                    await new Promise(r => setTimeout(r, 2000));
                    markProgress(ctx);
                }
                await new Promise(r => setTimeout(r, 200));
                markProgress(ctx);
                continue;
            }

            noCowCount = 0;

            const attackResult = await ctx.bot.attackNpc(cow);
            if (attackResult.success) {
                stats.kills++;
                markProgress(ctx);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                if (attackResult.reason === 'out_of_reach') {
                    await ctx.bot.openDoor(/gate/i);
                    markProgress(ctx);
                }
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx);
    }
}

// === RUN THE ARC ===
runArc({
    characterName: 'Adam_2',
    arcName: 'cowhide-training',
    goal: 'Train combat, collect hides, bank at Draynor',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        hidesLooted: 0,
        hidesBanked: 0,
        bankTrips: 0,
        startTime: Date.now(),
    };

    ctx.log('=== Arc: cowhide-training ===');
    ctx.log('Goal: Train combat + collect hides + bank at Draynor');

    // Wait for state
    ctx.log('Waiting for state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.error('State did not populate');
        return;
    }
    await new Promise(r => setTimeout(r, 500));

    const state = ctx.state();
    if (!state?.player || state.player.worldX === 0) {
        ctx.error('Invalid state');
        return;
    }

    ctx.log('Position: (' + state.player.worldX + ', ' + state.player.worldZ + ')');
    ctx.log('Stats: Attack ' + getSkillLevel(ctx, 'Attack') + ', Strength ' + getSkillLevel(ctx, 'Strength') + ', Defence ' + getSkillLevel(ctx, 'Defence'));
    ctx.log('Hides in inventory: ' + countHides(ctx));

    // Equip gear
    const inv = state.inventory;
    const equip = state.equipment;

    const hasWeapon = equip.some(e => e && /sword|axe|mace|dagger|scimitar/i.test(e.name));
    if (!hasWeapon) {
        const weapon = inv.find(i => /sword|mace|scimitar/i.test(i.name) && !/pickaxe/i.test(i.name));
        if (weapon) {
            ctx.log('Equipping ' + weapon.name);
            await ctx.bot.equipItem(weapon);
            markProgress(ctx);
        }
    }

    const shield = inv.find(i => /shield/i.test(i.name));
    if (shield) {
        ctx.log('Equipping ' + shield.name);
        await ctx.bot.equipItem(shield);
        markProgress(ctx);
    }

    // Dismiss dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx);

    // Check if we're near the cow field
    const player = ctx.state()?.player;
    const distToCows = player ? Math.sqrt(
        Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
        Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
    ) : 999;

    // If far from cow field, walk there first
    if (distToCows > 50) {
        ctx.log(`Not near cow field (${Math.round(distToCows)} tiles away), walking there...`);
        await walkWaypoints(ctx, WAYPOINTS_TO_COWS);
    }

    // Open gate if at cow field
    await ctx.bot.openDoor(/gate/i);
    await new Promise(r => setTimeout(r, 500));
    markProgress(ctx);

    // Main loop
    try {
        await trainingLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error('Arc stalled: ' + e.message);
        } else {
            throw e;
        }
    }

    // Final stats
    const duration = (Date.now() - stats.startTime) / 1000;
    ctx.log('');
    ctx.log('=== Final Stats ===');
    ctx.log('Duration: ' + Math.round(duration) + 's');
    ctx.log('Kills: ' + stats.kills);
    ctx.log('Hides looted: ' + stats.hidesLooted);
    ctx.log('Hides banked: ' + stats.hidesBanked);
    ctx.log('Bank trips: ' + stats.bankTrips);
    ctx.log('Attack: ' + getSkillLevel(ctx, 'Attack'));
    ctx.log('Strength: ' + getSkillLevel(ctx, 'Strength'));
    ctx.log('Defence: ' + getSkillLevel(ctx, 'Defence'));
    ctx.log('Total Level: ' + (ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0));
});
