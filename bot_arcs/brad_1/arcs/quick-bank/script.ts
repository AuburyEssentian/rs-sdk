/**
 * Arc: quick-bank
 * Character: Brad_1
 *
 * Goal: Bank hides at Varrock West Bank
 *
 * Current position: (3243, 3294) - inside cow field
 *
 * Strategy:
 * 1. Open gate to exit cow field
 * 2. Use bot.walkTo (with pathfinding) in stages
 * 3. Bank and deposit hides
 * 4. Return to cows
 */

import { runArc } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

function getPosition(ctx: ScriptContext): { x: number, z: number } {
    const player = ctx.state()?.player;
    return { x: player?.worldX ?? 0, z: player?.worldZ ?? 0 };
}

runArc({
    characterName: 'brad_1',
    arcName: 'quick-bank',
    goal: 'Bank hides at Varrock',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 60_000,
    screenshotInterval: 15_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Quick Bank Arc ===');

    // Wait for state to populate properly
    ctx.log('Waiting for state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0);
        }, 45000);
        ctx.log('State ready!');
    } catch {
        ctx.warn('State did not populate fully');
    }
    await new Promise(r => setTimeout(r, 1000));
    markProgress(ctx);

    const startHides = countItem(ctx, /cow\s*hide/i);
    let pos = getPosition(ctx);
    ctx.log(`Start position: (${pos.x}, ${pos.z})`);
    ctx.log(`Hides: ${startHides}`);

    // Step 0: Exit cow field
    ctx.log('');
    ctx.log('=== Step 0: Exit cow field ===');

    // Open gate first
    ctx.log('Opening gate...');
    const gateResult = await ctx.bot.openDoor(/gate/i);
    ctx.log(`Gate: ${gateResult.success} - ${gateResult.message}`);
    await new Promise(r => setTimeout(r, 800));
    markProgress(ctx);

    // Walk to just outside gate
    ctx.log('Walking out of cow field...');
    const exitResult = await ctx.bot.walkTo(3253, 3300);
    ctx.log(`Exit: ${exitResult.success} - ${exitResult.message}`);
    pos = getPosition(ctx);
    ctx.log(`Position: (${pos.x}, ${pos.z})`);
    markProgress(ctx);

    // Open gate again if still inside (z < 3295 means inside cow field)
    if (pos.z < 3295) {
        ctx.log('Still inside cow field, trying gate again...');
        await ctx.bot.openDoor(/gate/i);
        await new Promise(r => setTimeout(r, 500));
        await ctx.bot.walkTo(3253, 3302);
        pos = getPosition(ctx);
        ctx.log(`Position after retry: (${pos.x}, ${pos.z})`);
    } else {
        ctx.log('Successfully exited cow field');
    }

    // Step 1: Walk to bank in smaller stages (browser crashes on long walks)
    ctx.log('');
    ctx.log('=== Step 1: Walk to Varrock West Bank ===');

    // Break into ~30 tile steps to avoid browser timeout
    const waypoints = [
        { x: 3240, z: 3330, name: 'stage1' },
        { x: 3230, z: 3360, name: 'stage2' },
        { x: 3215, z: 3390, name: 'stage3' },
        { x: 3200, z: 3420, name: 'stage4' },
        { x: 3185, z: 3436, name: 'bank' },
    ];

    for (const wp of waypoints) {
        ctx.log(`Walking to ${wp.name} (${wp.x}, ${wp.z})...`);
        const result = await ctx.bot.walkTo(wp.x, wp.z);
        ctx.log(`  Result: ${result.success} - ${result.message}`);
        pos = getPosition(ctx);
        ctx.log(`  Position: (${pos.x}, ${pos.z})`);
        markProgress(ctx);

        // Check if we're close to bank
        const distToBank = Math.sqrt(Math.pow(pos.x - 3185, 2) + Math.pow(pos.z - 3436, 2));
        if (distToBank < 10) {
            ctx.log('Close enough to bank!');
            break;
        }
    }

    // Step 2: Bank
    ctx.log('');
    ctx.log('=== Step 2: Bank hides ===');
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    const nearbyNpcs = ctx.state()?.nearbyNpcs.slice(0, 8).map(n => `${n.name} (${n.distance.toFixed(0)})`).join(', ');
    ctx.log(`Nearby NPCs: ${nearbyNpcs || 'none'}`);

    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));

    if (banker) {
        ctx.log(`Found banker at distance ${banker.distance.toFixed(0)}`);
        const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));

        if (bankOpt) {
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 400));
                if (ctx.state()?.interface?.isOpen) {
                    ctx.log('Bank opened!');
                    break;
                }
                markProgress(ctx);
            }

            if (ctx.state()?.interface?.isOpen) {
                // Deposit hides
                const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
                for (const hide of hides) {
                    await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
                    await new Promise(r => setTimeout(r, 150));
                }
                ctx.log(`Deposited ${hides.length} cowhides`);

                // Deposit raw beef
                const beef = ctx.state()?.inventory.filter(i => /raw\s*beef/i.test(i.name)) ?? [];
                for (const item of beef) {
                    await ctx.sdk.sendBankDeposit(item.slot, item.count ?? 1);
                    await new Promise(r => setTimeout(r, 150));
                }
                if (beef.length > 0) ctx.log(`Deposited ${beef.length} raw beef`);

                // Deposit bones
                const bones = ctx.state()?.inventory.filter(i => /bones/i.test(i.name)) ?? [];
                for (const item of bones) {
                    await ctx.sdk.sendBankDeposit(item.slot, item.count ?? 1);
                    await new Promise(r => setTimeout(r, 150));
                }
                if (bones.length > 0) ctx.log(`Deposited ${bones.length} bones`);

                await ctx.bot.closeShop();
                ctx.log('Bank closed');
            } else {
                ctx.warn('Bank did not open');
            }
        }
    } else {
        ctx.warn('No banker found nearby');

        // Look for bank booth
        const nearbyLocs = ctx.state()?.nearbyLocs.slice(0, 8).map(l => `${l.name} (${l.distance.toFixed(0)})`).join(', ');
        ctx.log(`Nearby objects: ${nearbyLocs || 'none'}`);

        const booth = ctx.state()?.nearbyLocs.find(l => /bank\s*booth/i.test(l.name));
        if (booth) {
            ctx.log(`Found bank booth at distance ${booth.distance.toFixed(0)}`);
            const bankOpt = booth.optionsWithIndex?.find(o => /bank/i.test(o.text));
            if (bankOpt) {
                await ctx.sdk.sendInteractLoc(booth.x, booth.z, booth.id, bankOpt.opIndex);
                await new Promise(r => setTimeout(r, 2000));

                if (ctx.state()?.interface?.isOpen) {
                    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
                    for (const hide of hides) {
                        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
                        await new Promise(r => setTimeout(r, 150));
                    }
                    ctx.log(`Deposited ${hides.length} hides via booth`);
                    await ctx.bot.closeShop();
                }
            }
        }
    }

    // Step 3: Return to cow field
    ctx.log('');
    ctx.log('=== Step 3: Return to cow field ===');

    // Stage 1: Head southeast
    let result = await ctx.bot.walkTo(3210, 3380);
    ctx.log(`Return stage 1: ${result.success} - ${result.message}`);
    markProgress(ctx);

    // Stage 2: Continue southeast
    result = await ctx.bot.walkTo(3235, 3330);
    ctx.log(`Return stage 2: ${result.success} - ${result.message}`);
    markProgress(ctx);

    // Stage 3: Back to cow field area
    result = await ctx.bot.walkTo(3250, 3290);
    ctx.log(`Return stage 3: ${result.success} - ${result.message}`);
    markProgress(ctx);

    // Open gate to enter
    await ctx.bot.openDoor(/gate/i);
    markProgress(ctx);

    // Final state
    ctx.log('');
    ctx.log('=== Final State ===');
    const finalHides = countItem(ctx, /cow\s*hide/i);
    pos = getPosition(ctx);
    ctx.log(`Position: (${pos.x}, ${pos.z})`);
    ctx.log(`Hides in inventory: ${finalHides} (banked ${startHides - finalHides})`);
});
