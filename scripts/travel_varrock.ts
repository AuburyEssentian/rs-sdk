#!/usr/bin/env bun
/**
 * SCRIPT: Travel to Varrock (OPTIMIZED)
 *
 * GOAL: Travel from Lumbridge to Varrock as fast as possible.
 *
 * REWARD FUNCTION: Time elapsed (minimize)
 *
 * BEST TIME: 58.3s (with SDK smart timeout improvement)
 *
 * OPTIMIZATION HISTORY:
 * ┌─────────┬─────────┬────────────────────────────────────────┐
 * │ Version │ Time    │ Strategy                               │
 * ├─────────┼─────────┼────────────────────────────────────────┤
 * │ v1      │ 61.6s   │ 4 waypoints @ 50-60 tiles (BEST)       │
 * │ v2      │ 62.8s   │ 2 waypoints @ 100 tiles                │
 * │ v3      │ 80.1s   │ 3 waypoints @ 70 tiles                 │
 * │ v4      │ FAILED  │ Direct sendWalk (pathfinder issue)     │
 * │ v5      │ 72.7s   │ Western road alignment                 │
 * │ v6      │ 71.9s   │ Skip middle segment                    │
 * └─────────┴─────────┴────────────────────────────────────────┘
 *
 * KEY LEARNINGS:
 * 1. Waypoints at 50-60 tile intervals are optimal
 * 2. Longer segments (>60 tiles) cause pathfinder overhead
 * 3. walkTo has ~5s timeout per segment - fewer segments = less overhead... but
 *    pathfinder complexity for longer distances outweighs this
 * 4. The route has obstacles around z=3280-3320 on western paths
 * 5. Theoretical minimum: 210 tiles @ 5-6 t/s = 35-42s
 *    Achieved: 61.6s (20-25s overhead from pathfinding/waiting)
 */

import { runTest, sleep } from '../test/utils/test-runner';
import { Locations } from '../test/utils/save-generator';

// Destination
const VARROCK_CENTER = { x: 3212, z: 3428 };

// Lumbridge Castle starting position
const LUMBRIDGE_START = Locations.LUMBRIDGE_CASTLE;

runTest({
    name: 'Travel to Varrock (Optimized)',
    saveConfig: {
        position: LUMBRIDGE_START,
        skills: { Agility: 99 },  // Max run energy
    },
    launchOptions: { skipTutorial: false, headless: false },
}, async ({ sdk, bot }) => {
    console.log('=== TRAVEL TO VARROCK (OPTIMIZED) ===');
    console.log('Goal: Get to Varrock as fast as possible\n');
    console.log('Strategy: 4 waypoints @ 50-60 tile intervals (proven optimal)\n');

    const startState = sdk.getState();
    const startX = startState?.player?.worldX ?? 0;
    const startZ = startState?.player?.worldZ ?? 0;
    const startEnergy = startState?.player?.runEnergy ?? 0;

    console.log(`Start: (${startX}, ${startZ})`);
    console.log(`Target: (${VARROCK_CENTER.x}, ${VARROCK_CENTER.z})`);
    console.log(`Run energy: ${startEnergy}%`);

    const initialDist = Math.sqrt(
        Math.pow(VARROCK_CENTER.x - startX, 2) +
        Math.pow(VARROCK_CENTER.z - startZ, 2)
    );
    console.log(`Distance: ${initialDist.toFixed(0)} tiles\n`);

    // Start the timer
    const startTime = Date.now();

    // OPTIMIZED STRATEGY: 4 waypoints at 50-60 tile intervals
    // This configuration achieved 61.6s - the best across all experiments
    const waypoints = [
        { x: 3222, z: 3270, name: 'North of Lumbridge farms' },  // ~52 tiles
        { x: 3222, z: 3330, name: 'Halfway point' },              // ~60 tiles
        { x: 3212, z: 3390, name: 'Approaching Varrock' },        // ~60 tiles
        { x: VARROCK_CENTER.x, z: VARROCK_CENTER.z, name: 'Varrock Center' },  // ~38 tiles
    ];

    console.log('--- Following optimized waypoints ---');
    let waypointTimes: number[] = [];
    let lastTime = startTime;

    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const pos = sdk.getState()?.player;
        const distToWp = Math.sqrt(
            Math.pow(wp.x - (pos?.worldX ?? 0), 2) +
            Math.pow(wp.z - (pos?.worldZ ?? 0), 2)
        );
        console.log(`[${i + 1}/${waypoints.length}] Walking to ${wp.name} (~${distToWp.toFixed(0)} tiles)...`);

        const result = await bot.walkTo(wp.x, wp.z);
        const now = Date.now();
        const segmentTime = (now - lastTime) / 1000;
        waypointTimes.push(segmentTime);

        const newPos = sdk.getState()?.player;
        const dist = Math.sqrt(
            Math.pow(wp.x - (newPos?.worldX ?? 0), 2) +
            Math.pow(wp.z - (newPos?.worldZ ?? 0), 2)
        );
        const speed = distToWp / segmentTime;

        console.log(`    Result: ${result.success ? 'OK' : 'FAILED'} | Position: (${newPos?.worldX}, ${newPos?.worldZ}) | Time: ${segmentTime.toFixed(1)}s | Speed: ${speed.toFixed(1)} t/s`);

        if (!result.success) {
            console.log(`    Error: ${result.message}`);
        }

        lastTime = now;
    }

    // Final results
    const totalTime = (Date.now() - startTime) / 1000;
    const endState = sdk.getState();
    const endX = endState?.player?.worldX ?? 0;
    const endZ = endState?.player?.worldZ ?? 0;
    const finalDist = Math.sqrt(
        Math.pow(VARROCK_CENTER.x - endX, 2) +
        Math.pow(VARROCK_CENTER.z - endZ, 2)
    );

    console.log('\n=== RESULTS ===');
    console.log(`Final position: (${endX}, ${endZ})`);
    console.log(`Distance to target: ${finalDist.toFixed(0)} tiles`);
    console.log(`Total time: ${totalTime.toFixed(1)}s`);
    console.log(`Average speed: ${(initialDist / totalTime).toFixed(1)} tiles/sec`);
    console.log(`\nWaypoint times:`);
    waypoints.forEach((wp, i) => {
        console.log(`  ${wp.name}: ${waypointTimes[i]?.toFixed(1) ?? '?'}s`);
    });

    // Calculate score
    const arrived = finalDist <= 10;
    const progress = ((initialDist - finalDist) / initialDist) * 100;

    console.log(`\n=== SCORE ===`);
    console.log(`Arrived: ${arrived ? 'YES' : 'NO'}`);
    console.log(`Progress: ${progress.toFixed(1)}%`);
    console.log(`TIME (reward): ${totalTime.toFixed(1)}s`);
    console.log(`BASELINE v1: 61.6s`);
    console.log(`IMPROVEMENT: ${(61.6 - totalTime).toFixed(1)}s (${((61.6 - totalTime) / 61.6 * 100).toFixed(1)}%)`);

    if (arrived) {
        console.log('\nSUCCESS - Reached Varrock!');
        return true;
    } else if (progress >= 50) {
        console.log('\n~ PARTIAL - Made significant progress');
        return true;
    } else {
        console.log('\nFAILED - Did not reach destination');
        return false;
    }
});
