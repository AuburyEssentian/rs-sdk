/**
 * Arc: woodcutting
 * Character: david_3
 *
 * Goal: Train woodcutting. Start with regular trees, then move to willows at 30+.
 * Locations:
 * - Regular trees: Lumbridge (3200, 3220)
 * - Willows: Draynor (3087, 3235) - requires level 30
 */

import { runArc } from '../../../arc-runner';

const LUMBRIDGE_TREES = { x: 3200, z: 3220 };
const DRAYNOR_WILLOWS = { x: 3087, z: 3235 };

runArc({
    characterName: 'david_3',
    arcName: 'woodcutting',
    goal: 'Train woodcutting at nearby trees',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false,  // Visible browser more stable
    },
}, async (ctx) => {
    ctx.log('=== Woodcutting Arc ===');

    // Wait for state to populate properly - browser is flaky
    ctx.log('Waiting for game state...');
    let state = ctx.state();
    for (let i = 0; i < 40; i++) {  // Up to 20 seconds
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
        state = ctx.state();
        if (state?.player && state.player.worldX > 0) {
            break;
        }
        if (i % 10 === 9) {
            ctx.log(`Still waiting for state... (${i+1}s)`);
        }
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.error('No valid player state after waiting');
        return;
    }

    ctx.log(`Position: (${state.player.worldX}, ${state.player.worldZ})`);

    // Check for axe
    const hasAxe = state.inventory.some(i => /axe/i.test(i.name));
    if (!hasAxe) {
        ctx.error('No axe in inventory!');
        return;
    }
    ctx.log('Have axe, ready to chop!');

    // Check woodcutting level
    const wcLevel = state.skills.find(s => s.name === 'Woodcutting')?.baseLevel ?? 1;
    ctx.log(`Woodcutting level: ${wcLevel}`);

    // Drop fish to make room
    ctx.log('Dropping fish to make room...');
    for (const item of state.inventory) {
        if (/raw shrimp|raw anchov/i.test(item.name)) {
            await ctx.sdk.sendDropItem(item.slot);
            await new Promise(r => setTimeout(r, 100));
        }
    }
    ctx.progress();
    await new Promise(r => setTimeout(r, 500));

    // Decide which trees to cut based on level
    let treeTarget: { x: number; z: number };
    let treePattern: RegExp;

    if (wcLevel >= 30) {
        treeTarget = DRAYNOR_WILLOWS;
        treePattern = /^willow$/i;
        ctx.log('Level 30+, heading to willows at Draynor');
    } else {
        treeTarget = LUMBRIDGE_TREES;
        treePattern = /^tree$/i;
        ctx.log('Level 1-29, heading to regular trees at Lumbridge');
    }

    // Walk to tree area if needed
    const currentX = state.player.worldX;
    const currentZ = state.player.worldZ;
    const distToTrees = Math.sqrt(
        Math.pow(currentX - treeTarget.x, 2) +
        Math.pow(currentZ - treeTarget.z, 2)
    );

    if (distToTrees > 15) {
        ctx.log(`Walking to tree area (${distToTrees.toFixed(0)} tiles away)...`);
        // Safe waypoints to Draynor from anywhere (avoid Dark Wizards at ~3220, 3220)
        const safeWaypoints = [
            { x: 3260, z: 3310 },  // North route
            { x: 3200, z: 3310 },  // West
            { x: 3150, z: 3280 },  // Southwest
            { x: 3100, z: 3260 },  // Near Draynor
            { x: 3087, z: 3235 },  // Willows
        ];
        for (const wp of safeWaypoints) {
            const currState = ctx.state();
            if (!currState?.player) continue;
            const distToWp = Math.sqrt(
                Math.pow(currState.player.worldX - wp.x, 2) +
                Math.pow(currState.player.worldZ - wp.z, 2)
            );
            if (distToWp < 15) continue;  // Skip waypoints we've passed
            ctx.log(`Walking to waypoint (${wp.x}, ${wp.z})...`);
            await ctx.sdk.sendWalk(wp.x, wp.z, true);
            ctx.progress();
            // Wait to arrive
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const s = ctx.state();
                if (!s?.player) continue;
                const dist = Math.sqrt(
                    Math.pow(s.player.worldX - wp.x, 2) +
                    Math.pow(s.player.worldZ - wp.z, 2)
                );
                if (dist < 5) break;
                ctx.progress();
            }
        }
        ctx.log('Arrived at tree area!');
    }

    // Main woodcutting loop
    let loopCount = 0;
    const startXp = ctx.state()?.skills.find(s => s.name === 'Woodcutting')?.experience || 0;

    ctx.log('Starting woodcutting...');

    while (true) {
        loopCount++;
        ctx.progress();

        const currentState = ctx.state();
        if (!currentState) continue;

        // Handle dialogs (level-ups)
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if we need to switch to willows
        const currentWcLevel = currentState.skills.find(s => s.name === 'Woodcutting')?.baseLevel ?? 1;
        if (currentWcLevel >= 30 && treePattern.source === '^tree$') {
            ctx.log('Reached level 30! Switching to willows...');
            treeTarget = DRAYNOR_WILLOWS;
            treePattern = /^willow$/i;

            // Walk with progress markers (long walk from Lumbridge to Draynor)
            const waypoints = [
                { x: 3180, z: 3260 },  // North of dark wizards
                { x: 3120, z: 3250 },  // West
                { x: 3087, z: 3235 },  // Draynor willows
            ];
            for (const wp of waypoints) {
                ctx.log(`Walking to (${wp.x}, ${wp.z})...`);
                await ctx.bot.walkTo(wp.x, wp.z);
                ctx.progress();
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // Find a tree
        const tree = currentState.nearbyLocs
            .filter(loc => treePattern.test(loc.name))
            .filter(loc => loc.optionsWithIndex.some(o => /chop/i.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];

        if (tree) {
            const chopOpt = tree.optionsWithIndex.find(o => /chop/i.test(o.text));
            if (chopOpt) {
                // Walk closer if needed
                if (tree.distance > 3) {
                    await ctx.sdk.sendWalk(tree.x, tree.z, true);
                    await new Promise(r => setTimeout(r, 500));
                }

                await ctx.sdk.sendInteractLoc(tree.x, tree.z, tree.id, chopOpt.opIndex);
                ctx.progress();
            }
        } else {
            // No trees nearby, walk to tree area
            ctx.log('No trees nearby, walking to tree area...');
            await ctx.bot.walkTo(treeTarget.x, treeTarget.z);
            ctx.progress();
        }

        // Drop logs when inventory gets full
        if (currentState.inventory.length >= 27) {
            ctx.log('Dropping logs...');
            const logs = currentState.inventory.filter(i => /logs$/i.test(i.name));
            for (const log of logs) {
                await ctx.sdk.sendDropItem(log.slot);
                await new Promise(r => setTimeout(r, 100));
            }
            ctx.progress();
        }

        // Progress report every 20 loops
        if (loopCount % 20 === 0) {
            const xpGained = (currentState.skills.find(s => s.name === 'Woodcutting')?.experience || 0) - startXp;
            ctx.log(`Loop ${loopCount}: WC level ${currentWcLevel}, +${xpGained} XP`);
        }

        await new Promise(r => setTimeout(r, 1500));
    }
});
