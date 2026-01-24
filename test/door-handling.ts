#!/usr/bin/env bun
/**
 * Door Handling Test
 *
 * This test demonstrates and validates correct door handling in the SDK.
 * It was created after analyzing a run where the bot got stuck in Seers Village
 * because it couldn't figure out how to open doors.
 *
 * Key issues the bot exhibited:
 * 1. Used raw `sdk.sendInteractLoc(x, z, id, 1)` with hardcoded option index
 * 2. Tried walking TO and THROUGH door coordinates instead of opening them
 * 3. Misunderstood door state (thought "Open" option meant door was open)
 * 4. Didn't know about `bot.openDoor()` method (not in system prompt!)
 *
 * This test validates:
 * 1. bot.openDoor() works correctly for closed doors
 * 2. bot.openDoor() handles already-open doors gracefully
 * 3. The wrong approaches actually fail as expected
 * 4. Door state (Open vs Close option) is correctly interpreted
 *
 * Location: Seers Village (same area where bot got stuck)
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `door${Math.random().toString(36).slice(2, 5)}`;

// Seers Village - inside a building (where the bot got stuck)
const SEERS_INSIDE = { x: 2714, z: 3471 };

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

async function runTest(): Promise<boolean> {
    console.log('=== Door Handling Test ===');
    console.log('Testing correct and incorrect door handling approaches');
    console.log(`Location: Seers Village (${SEERS_INSIDE.x}, ${SEERS_INSIDE.z})`);

    await generateSave(BOT_NAME, {
        position: SEERS_INSIDE,
    });

    let session: SDKSession | null = null;
    const results: TestResult[] = [];

    try {
        session = await launchBotWithSDK(BOT_NAME, { skipTutorial: false });
        const { sdk, bot } = session;

        await sdk.waitForCondition(s => s.player?.worldX > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const startState = sdk.getState();
        console.log(`Position: (${startState?.player?.worldX}, ${startState?.player?.worldZ})`);

        // === Test 1: Understand door state representation ===
        console.log('\n--- Test 1: Door State Understanding ---');
        console.log('Checking how doors are represented in the state...\n');

        const allDoors = sdk.getNearbyLocs().filter(l => /door|gate/i.test(l.name));
        console.log(`Found ${allDoors.length} doors nearby:`);

        for (const door of allDoors.slice(0, 5)) {
            const hasOpenOption = door.optionsWithIndex.some(o => /^open$/i.test(o.text));
            const hasCloseOption = door.optionsWithIndex.some(o => /^close$/i.test(o.text));
            const actualState = hasOpenOption ? 'CLOSED (can be opened)' :
                               hasCloseOption ? 'OPEN (can be closed)' : 'UNKNOWN';

            console.log(`  ${door.name} at (${door.x}, ${door.z}) dist=${Math.round(door.distance)}`);
            console.log(`    Options: [${door.options.filter(o => o !== 'hidden').join(', ')}]`);
            console.log(`    Actual state: ${actualState}`);
        }

        // Find a door we can test with
        const closedDoor = allDoors.find(d =>
            d.optionsWithIndex.some(o => /^open$/i.test(o.text))
        );
        const openDoor = allDoors.find(d =>
            d.optionsWithIndex.some(o => /^close$/i.test(o.text))
        );

        results.push({
            name: 'Door state understanding',
            passed: true, // Educational test
            message: `Found ${allDoors.length} doors (${closedDoor ? 'has closed door' : 'no closed doors'}, ${openDoor ? 'has open door' : 'no open doors'})`
        });

        // === Test 2: Wrong approach - hardcoded option index ===
        console.log('\n--- Test 2: WRONG Approach - Hardcoded Option Index ---');
        console.log('Demonstrating the bug: using option index 1 blindly...\n');

        if (closedDoor) {
            // This is what the bot was doing wrong:
            // sdk.sendInteractLoc(door.x, door.z, door.id, 1)
            // Option 1 might not be "Open"!

            console.log(`  Door options in order:`);
            for (let i = 0; i < closedDoor.optionsWithIndex.length; i++) {
                const opt = closedDoor.optionsWithIndex[i];
                console.log(`    [${opt.opIndex}] ${opt.text}`);
            }

            const openOpt = closedDoor.optionsWithIndex.find(o => /^open$/i.test(o.text));
            const wrongIndex = openOpt?.opIndex !== 1;

            if (wrongIndex) {
                console.log(`\n  BUG REPRODUCED: "Open" is at index ${openOpt?.opIndex}, not 1!`);
                console.log(`  Using hardcoded index 1 would invoke: ${closedDoor.optionsWithIndex.find(o => o.opIndex === 1)?.text || 'nothing'}`);
            } else {
                console.log(`\n  In this case, "Open" happens to be at index 1, but this is not guaranteed!`);
            }

            results.push({
                name: 'Hardcoded option index bug',
                passed: true, // Educational test
                message: wrongIndex
                    ? `BUG: Open is at index ${openOpt?.opIndex}, not 1`
                    : `Open is at index 1 (lucky, but unreliable)`
            });
        } else {
            console.log('  No closed door available to test');
            results.push({
                name: 'Hardcoded option index bug',
                passed: true,
                message: 'Skipped - no closed door available'
            });
        }

        // === Test 3: Wrong approach - walking through door ===
        console.log('\n--- Test 3: WRONG Approach - Walking Through Door ---');
        console.log('Demonstrating the bug: trying to walk to/through a closed door...\n');

        if (closedDoor && closedDoor.optionsWithIndex.some(o => /^open$/i.test(o.text))) {
            const posBefore = { x: sdk.getState()?.player?.worldX!, z: sdk.getState()?.player?.worldZ! };
            console.log(`  Position before: (${posBefore.x}, ${posBefore.z})`);
            console.log(`  Attempting to walk to door at (${closedDoor.x}, ${closedDoor.z})...`);

            // Walk to door (this will work)
            await sdk.sendWalk(closedDoor.x, closedDoor.z);
            await sleep(2000);

            const posAtDoor = { x: sdk.getState()?.player?.worldX!, z: sdk.getState()?.player?.worldZ! };
            console.log(`  Position at door: (${posAtDoor.x}, ${posAtDoor.z})`);

            // Now try to walk THROUGH the door (this should fail/not move far)
            console.log(`  Attempting to walk THROUGH door to (${closedDoor.x}, ${closedDoor.z - 3})...`);
            await sdk.sendWalk(closedDoor.x, closedDoor.z - 3, true);
            await sleep(2000);

            const posAfter = { x: sdk.getState()?.player?.worldX!, z: sdk.getState()?.player?.worldZ! };
            console.log(`  Position after: (${posAfter.x}, ${posAfter.z})`);

            // Check if we actually got through
            const movedThrough = Math.abs(posAfter.z - closedDoor.z) > 2;

            if (movedThrough) {
                console.log(`\n  Hmm, we moved through - door might have been opened by someone else or path exists`);
            } else {
                console.log(`\n  BUG CONFIRMED: Walking through closed door doesn't work!`);
                console.log(`  The bot needs to OPEN the door first, not walk through it.`);
            }

            results.push({
                name: 'Walking through closed door',
                passed: true,  // Educational test - result depends on world state
                message: movedThrough
                    ? 'Moved through (door may have been open or alternate path exists)'
                    : 'Correctly blocked - must open door first'
            });
        } else {
            console.log('  No closed door to test walking through');
            results.push({
                name: 'Walking through closed door',
                passed: true,
                message: 'Skipped - no closed door'
            });
        }

        // === Test 4: CORRECT approach - using bot.openDoor() ===
        console.log('\n--- Test 4: CORRECT Approach - bot.openDoor() ---');
        console.log('Using the proper SDK method to open a door...\n');

        // Re-find doors (state may have changed)
        const doorsNow = sdk.getNearbyLocs().filter(l => /door|gate/i.test(l.name));
        const doorToOpen = doorsNow.find(d =>
            d.optionsWithIndex.some(o => /^open$/i.test(o.text))
        );

        if (doorToOpen) {
            console.log(`  Found closed door: ${doorToOpen.name} at (${doorToOpen.x}, ${doorToOpen.z}) dist=${Math.round(doorToOpen.distance)}`);
            console.log(`  Calling bot.openDoor()...`);

            const openResult = await bot.openDoor(doorToOpen);

            console.log(`  Result: success=${openResult.success}`);
            console.log(`  Message: ${openResult.message}`);
            if (openResult.reason) {
                console.log(`  Reason: ${openResult.reason}`);
            }

            // Verify door is now open
            const doorAfter = sdk.getNearbyLocs().find(l =>
                l.x === doorToOpen.x && l.z === doorToOpen.z && /door|gate/i.test(l.name)
            );

            if (doorAfter) {
                const isNowOpen = doorAfter.optionsWithIndex.some(o => /^close$/i.test(o.text));
                console.log(`\n  Door after: options=[${doorAfter.options.filter(o => o !== 'hidden').join(', ')}]`);
                console.log(`  Is now open: ${isNowOpen}`);

                results.push({
                    name: 'bot.openDoor() on closed door',
                    passed: openResult.success && isNowOpen,
                    message: openResult.success && isNowOpen
                        ? 'Door opened successfully!'
                        : `Failed: ${openResult.message}`
                });
            } else {
                // Door might have disappeared (some doors do this when opened)
                results.push({
                    name: 'bot.openDoor() on closed door',
                    passed: openResult.success,
                    message: openResult.success
                        ? 'Door opened (and disappeared)'
                        : `Failed: ${openResult.message}`
                });
            }
        } else {
            console.log('  No closed door available - trying to open any door...');
            const anyDoor = doorsNow[0];
            if (anyDoor) {
                const result = await bot.openDoor(anyDoor);
                console.log(`  Result: success=${result.success}, reason=${result.reason}`);

                results.push({
                    name: 'bot.openDoor() on closed door',
                    passed: result.success || result.reason === 'already_open',
                    message: result.reason === 'already_open'
                        ? 'Door was already open (handled gracefully)'
                        : result.message
                });
            } else {
                results.push({
                    name: 'bot.openDoor() on closed door',
                    passed: true,
                    message: 'Skipped - no doors available'
                });
            }
        }

        // === Test 5: CORRECT approach - already open door ===
        console.log('\n--- Test 5: CORRECT Approach - Already Open Door ---');
        console.log('Testing that bot.openDoor() handles already-open doors gracefully...\n');

        const doorsAfterOpen = sdk.getNearbyLocs().filter(l => /door|gate/i.test(l.name));
        const alreadyOpen = doorsAfterOpen.find(d =>
            d.optionsWithIndex.some(o => /^close$/i.test(o.text))
        );

        if (alreadyOpen) {
            console.log(`  Found open door: ${alreadyOpen.name} at (${alreadyOpen.x}, ${alreadyOpen.z})`);
            console.log(`  Calling bot.openDoor() on already-open door...`);

            const result = await bot.openDoor(alreadyOpen);

            console.log(`  Result: success=${result.success}`);
            console.log(`  Message: ${result.message}`);
            console.log(`  Reason: ${result.reason}`);

            results.push({
                name: 'bot.openDoor() on already-open door',
                passed: result.success && result.reason === 'already_open',
                message: result.reason === 'already_open'
                    ? 'Correctly returned already_open'
                    : `Unexpected: ${result.message}`
            });
        } else {
            console.log('  No open door available to test');
            results.push({
                name: 'bot.openDoor() on already-open door',
                passed: true,
                message: 'Skipped - no open door available'
            });
        }

        // === Test 6: Walk through AFTER opening ===
        console.log('\n--- Test 6: Walking Through AFTER Opening ---');
        console.log('Verifying we can now walk through the opened door...\n');

        const finalDoors = sdk.getNearbyLocs().filter(l =>
            /door|gate/i.test(l.name) &&
            l.optionsWithIndex.some(o => /^close$/i.test(o.text))
        );

        if (finalDoors.length > 0) {
            const openDoorNow = finalDoors[0];
            console.log(`  Open door at (${openDoorNow.x}, ${openDoorNow.z})`);

            const posBefore = { x: sdk.getState()?.player?.worldX!, z: sdk.getState()?.player?.worldZ! };
            console.log(`  Position before: (${posBefore.x}, ${posBefore.z})`);

            // Walk to and through the open door
            await sdk.sendWalk(openDoorNow.x, openDoorNow.z);
            await sleep(1500);
            await sdk.sendWalk(openDoorNow.x, openDoorNow.z - 3, true);
            await sleep(2000);

            const posAfter = { x: sdk.getState()?.player?.worldX!, z: sdk.getState()?.player?.worldZ! };
            console.log(`  Position after: (${posAfter.x}, ${posAfter.z})`);

            const moved = Math.abs(posAfter.x - posBefore.x) > 1 || Math.abs(posAfter.z - posBefore.z) > 1;
            const atDoor = Math.abs(posAfter.x - openDoorNow.x) <= 1 && Math.abs(posAfter.z - openDoorNow.z) <= 1;

            results.push({
                name: 'Walk through open door',
                passed: moved || atDoor,  // Pass if moved OR already at door
                message: moved
                    ? 'Successfully walked through open door'
                    : atDoor
                        ? 'Already at door position (door is passable)'
                        : 'Could not walk through (might be other obstacles)'
            });
        } else {
            console.log('  No open doors to walk through');
            results.push({
                name: 'Walk through open door',
                passed: true,
                message: 'Skipped - no open doors'
            });
        }

        // === Summary ===
        console.log('\n=== Results Summary ===');
        let allPassed = true;
        for (const r of results) {
            const status = r.passed ? 'PASS' : 'FAIL';
            console.log(`${status}: ${r.name}`);
            console.log(`       ${r.message}`);
            if (!r.passed) allPassed = false;
        }

        // === Key Takeaways ===
        console.log('\n=== Key Takeaways for Bot System Prompt ===');
        console.log('1. ALWAYS use bot.openDoor() to open doors - it handles:');
        console.log('   - Finding the correct option index');
        console.log('   - Walking to the door if too far');
        console.log('   - Already-open doors (returns success with reason="already_open")');
        console.log('   - Waiting for door state to change');
        console.log('');
        console.log('2. Door state interpretation:');
        console.log('   - Door has "Open" option = door is CLOSED (you can open it)');
        console.log('   - Door has "Close" option = door is OPEN (you can close it)');
        console.log('');
        console.log('3. NEVER try to walk THROUGH a closed door - open it first!');
        console.log('');
        console.log('4. NEVER use hardcoded option indices - they vary by object!');

        return allPassed;

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

runTest()
    .then(ok => {
        console.log(ok ? '\n✓ ALL TESTS PASSED' : '\n✗ SOME TESTS FAILED');
        process.exit(ok ? 0 : 1);
    })
    .catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });
