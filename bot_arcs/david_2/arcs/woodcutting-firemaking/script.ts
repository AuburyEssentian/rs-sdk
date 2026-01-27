import { runArc } from '../../../arc-runner';

/**
 * Woodcutting + Firemaking - Try a new skill combo!
 *
 * I have:
 * - Bronze axe (for chopping)
 * - Tinderbox (for burning)
 *
 * Plan: Chop trees, burn logs, level both skills!
 * Starting at (3248, 3226) near goblins/trees
 */

runArc({
    characterName: 'david_2',
    arcName: 'woodcutting-firemaking',
    goal: 'Chop trees and burn logs - try new skills!',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
}, async (ctx) => {
    ctx.log('=== Woodcutting + Firemaking Adventure ===');
    ctx.log('Time to try something new - chopping trees and making fires!');

    // Wait for valid state
    let state = ctx.state();
    while (!state.player || state.player.worldX === 0) {
        await new Promise(r => setTimeout(r, 1000));
        state = ctx.state();
        ctx.progress();
    }

    ctx.log(`Starting at (${state.player?.worldX}, ${state.player?.worldZ})`);

    // Check inventory
    const hasAxe = state.inventory.some(i => /axe/i.test(i.name));
    const hasTinderbox = state.inventory.some(i => /tinderbox/i.test(i.name));
    ctx.log(`Have axe: ${hasAxe}, Have tinderbox: ${hasTinderbox}`);

    if (!hasAxe) {
        ctx.error('No axe in inventory!');
        return;
    }

    // Stats tracking
    let logsChopped = 0;
    let logsBurned = 0;
    let lastStatusTime = Date.now();
    const startWcLvl = state.skills.find(s => s.name === 'Woodcutting')?.baseLevel ?? 1;
    const startFmLvl = state.skills.find(s => s.name === 'Firemaking')?.baseLevel ?? 1;

    ctx.log(`Starting levels - Woodcutting: ${startWcLvl}, Firemaking: ${startFmLvl}`);

    // Main loop
    while (true) {
        ctx.progress();
        state = ctx.state();

        // Skip invalid states
        if (!state.player || state.player.worldX === 0) {
            ctx.log('Invalid state, waiting...');
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Handle dialogs
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check if inventory has logs to burn
        const logs = state.inventory.filter(i => /logs$/i.test(i.name));
        const tinderbox = state.inventory.find(i => /tinderbox/i.test(i.name));

        if (logs.length > 0 && tinderbox && hasTinderbox) {
            // Burn some logs!
            const logItem = logs[0];
            ctx.log(`Burning ${logItem.name}...`);

            // Use tinderbox on logs
            // First use tinderbox, then use on logs
            try {
                await ctx.sdk.sendUseItem(tinderbox.slot);
                await new Promise(r => setTimeout(r, 300));
                await ctx.sdk.sendUseItemOn(logItem.slot);
                await new Promise(r => setTimeout(r, 3000));  // Wait for burning animation
                logsBurned++;
            } catch (e) {
                ctx.warn(`Burn failed: ${e}`);
            }
        } else {
            // Find and chop a tree
            const tree = state.nearbyLocs
                .filter(loc => /^tree$/i.test(loc.name))
                .filter(loc => loc.optionsWithIndex?.some(o => /chop/i.test(o.text)))
                .sort((a, b) => a.distance - b.distance)[0];

            if (tree) {
                const chopOpt = tree.optionsWithIndex?.find(o => /chop/i.test(o.text));
                if (chopOpt) {
                    await ctx.sdk.sendInteractLoc(tree.x, tree.z, tree.id, chopOpt.opIndex);
                    await new Promise(r => setTimeout(r, 2000));  // Wait for chopping
                    logsChopped++;
                }
            } else {
                // No trees nearby - walk a bit
                ctx.log('No trees nearby, looking around...');
                await ctx.sdk.sendWalk(
                    state.player.worldX + Math.random() * 10 - 5,
                    state.player.worldZ + Math.random() * 10 - 5
                );
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Drop logs if inventory is full and we don't want to keep them
        if (state.inventory.length >= 27) {
            const logsToKeep = 5;  // Keep some for burning
            const allLogs = state.inventory.filter(i => /logs$/i.test(i.name));
            if (allLogs.length > logsToKeep) {
                const logsToDrop = allLogs.slice(logsToKeep);
                ctx.log(`Inventory full, dropping ${logsToDrop.length} logs`);
                for (const log of logsToDrop) {
                    await ctx.sdk.sendDropItem(log.slot);
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }

        // Status update every 30 seconds
        if (Date.now() - lastStatusTime > 30_000) {
            const wcLvl = state.skills.find(s => s.name === 'Woodcutting')?.baseLevel ?? 1;
            const fmLvl = state.skills.find(s => s.name === 'Firemaking')?.baseLevel ?? 1;
            ctx.log(`Status: WC ${wcLvl} (was ${startWcLvl}), FM ${fmLvl} (was ${startFmLvl})`);
            ctx.log(`  Logs chopped: ${logsChopped}, Logs burned: ${logsBurned}`);
            lastStatusTime = Date.now();
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
