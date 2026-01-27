import { runArc } from '../../../arc-runner';

/**
 * Short mining run - 2 minutes to ensure progress saves!
 *
 * Strategy:
 * - Walk to SE Varrock mine (3285, 3365) avoiding Dark Wizards
 * - Mine copper/tin ore
 * - Drop ore when inventory full
 * - Short timeout = more frequent saves
 */

const SE_VARROCK_MINE = { x: 3285, z: 3365 };

// Safe waypoints avoiding Dark Wizards at ~(3220, 3220)
const SAFE_WAYPOINTS = [
    { x: 3240, z: 3300 },  // North from cow farm
    { x: 3260, z: 3320 },  // Continue north
    { x: 3280, z: 3340 },  // Toward mine
    { x: 3285, z: 3365 },  // SE Varrock mine
];

runArc({
    characterName: 'david_3',
    arcName: 'mine-short',
    goal: 'Mine at SE Varrock - SHORT 2min run for progress save',
    timeLimit: 2 * 60 * 1000,  // 2 MINUTES - back to short runs
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
        headless: false  // Visible browser is more stable for state sync
    },
}, async (ctx) => {
    // Wait longer for state to populate - the browser is flaky
    ctx.log('Waiting for state to sync...');
    let state = ctx.state();
    for (let i = 0; i < 40 && (!state?.player?.worldX || state.player.worldX === 0); i++) {
        await new Promise(r => setTimeout(r, 500));
        state = ctx.state();
        ctx.progress();
        if (i % 10 === 9) {
            ctx.log(`Still waiting for state... (${i+1}s)`);
        }
    }

    if (!state?.player || state.player.worldX === 0) {
        ctx.warn('No player state after 20s, trying anyway...');
        // Re-fetch one more time
        state = ctx.state();
        if (!state?.player || state.player.worldX === 0) {
            ctx.error('No player state! Browser may need restart.');
            return;
        }
    }

    ctx.log(`Starting at (${state.player.worldX}, ${state.player.worldZ})`);

    // Check for pickaxe
    const hasPickaxe = state.inventory.some(i => /pickaxe/i.test(i.name));
    if (!hasPickaxe) {
        ctx.error('No pickaxe in inventory! Need to buy one first.');
        return;
    }
    ctx.log('Have pickaxe - ready to mine!');

    // Current mining level
    const miningSkill = state.skills.find(s => s.name === 'Mining');
    ctx.log(`Current Mining level: ${miningSkill?.baseLevel ?? 1}`);

    // Walk to mine if not there
    const distToMine = Math.sqrt(
        Math.pow(state.player.worldX - SE_VARROCK_MINE.x, 2) +
        Math.pow(state.player.worldZ - SE_VARROCK_MINE.z, 2)
    );

    if (distToMine > 20) {
        ctx.log(`Walking to SE Varrock mine (${distToMine.toFixed(0)} tiles away)...`);

        for (const waypoint of SAFE_WAYPOINTS) {
            const currState = ctx.state();
            if (!currState?.player) continue;

            const distToWp = Math.sqrt(
                Math.pow(currState.player.worldX - waypoint.x, 2) +
                Math.pow(currState.player.worldZ - waypoint.z, 2)
            );

            // Skip waypoints we've passed
            if (distToWp < 15) continue;

            ctx.log(`Walking to waypoint (${waypoint.x}, ${waypoint.z})...`);
            await ctx.sdk.sendWalk(waypoint.x, waypoint.z, true);
            ctx.progress();

            // Wait to arrive
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const s = ctx.state();
                if (!s?.player) continue;

                const dist = Math.sqrt(
                    Math.pow(s.player.worldX - waypoint.x, 2) +
                    Math.pow(s.player.worldZ - waypoint.z, 2)
                );
                if (dist < 5) break;
                ctx.progress();
            }
        }
        ctx.log('Arrived at mine area!');
    }

    // Mining loop
    ctx.log('Starting mining loop...');
    let mineAttempts = 0;

    while (true) {
        const s = ctx.state();
        if (!s?.player) {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Dismiss any dialogs (level-ups)
        if (s.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.bot.dismissBlockingUI();
            ctx.progress();
            continue;
        }

        // Drop ore if inventory full
        if (s.inventory.length >= 28) {
            ctx.log('Inventory full - dropping ore...');
            const ores = s.inventory.filter(i => /ore$/i.test(i.name));
            for (const ore of ores) {
                await ctx.sdk.sendDropItem(ore.slot);
                await new Promise(r => setTimeout(r, 150));
                ctx.progress();
            }
            continue;
        }

        // Check if currently mining (anim 625)
        if (s.player.animId === 625) {
            ctx.progress();
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Find a rock to mine
        const rock = s.nearbyLocs
            .filter(loc => /rocks?$/i.test(loc.name))
            .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];

        if (!rock) {
            // No rocks nearby - might need to wait for respawn or walk
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
            continue;
        }

        // Walk closer if needed
        if (rock.distance > 3) {
            await ctx.sdk.sendWalk(rock.x, rock.z, true);
            await new Promise(r => setTimeout(r, 800));
        }

        // Mine the rock
        const mineOpt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text));
        if (mineOpt) {
            mineAttempts++;
            if (mineAttempts % 10 === 1) {
                const currMining = ctx.state()?.skills.find(s => s.name === 'Mining');
                ctx.log(`Mining attempt #${mineAttempts} (Mining level: ${currMining?.baseLevel ?? 1})`);
            }
            await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
            ctx.progress();
        }

        await new Promise(r => setTimeout(r, 600));
    }
});
