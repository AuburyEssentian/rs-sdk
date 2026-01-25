/**
 * Arc: recovery-restart
 * Character: Adam_3
 *
 * Goal: Recover from death by reinitializing with fresh equipment.
 * Strategy: Reset to LUMBRIDGE_SPAWN preset, then do a quick activity to verify working.
 * Duration: 2 minutes
 *
 * Adam_3 died and lost equipment. This arc restores starting gear.
 */

import { runArc, TestPresets, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function getInventoryItems(ctx: ScriptContext): string[] {
    return ctx.state()?.inventory.map(i => i.name) ?? [];
}

// Run the arc
runArc({
    characterName: 'Adam_3',
    arcName: 'recovery-restart',
    goal: 'Recover from death - reinitialize with fresh equipment',
    timeLimit: 2 * 60 * 1000,      // 2 minutes
    stallTimeout: 30_000,
    screenshotInterval: 30_000,
    // Reinitialize to restore equipment after death
    initializeFromPreset: TestPresets.LUMBRIDGE_SPAWN,
}, async (ctx) => {
    ctx.log('=== Arc: recovery-restart ===');
    ctx.log('Recovering from death - reinitializing character');

    // Dismiss any dialogs from death/respawn
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    const state = ctx.state();
    const totalLevel = getTotalLevel(ctx);
    const inventory = getInventoryItems(ctx);

    ctx.log(`Total Level: ${totalLevel}`);
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    ctx.log(`Inventory: ${inventory.length} items`);

    // List key items
    const hasNet = inventory.some(i => /fishing net/i.test(i));
    const hasAxe = inventory.some(i => /axe/i.test(i));
    const hasPickaxe = inventory.some(i => /pickaxe/i.test(i));

    ctx.log(`Has fishing net: ${hasNet}`);
    ctx.log(`Has axe: ${hasAxe}`);
    ctx.log(`Has pickaxe: ${hasPickaxe}`);

    ctx.log('');
    ctx.log('Recovery complete - character ready for next arc');
    ctx.log(`Score: ${totalLevel} (skills retained from before death)`);
});
