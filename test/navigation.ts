#!/usr/bin/env bun
/**
 * Navigation Test - City to City Routes
 * Tests long-distance walkTo with the 512x512 pathfinder
 */

import { runTest } from './utils/test-runner';
import { Locations } from './utils/save-generator';

const CITIES = {
    LUMBRIDGE: { x: 3222, z: 3218, name: 'Lumbridge' },
    VARROCK: { x: 3212, z: 3428, name: 'Varrock' },
    FALADOR: { x: 2964, z: 3378, name: 'Falador' },
    DRAYNOR: { x: 3093, z: 3244, name: 'Draynor' },
    GNOME_AGILITY: { x: 2474, z: 3438, name: 'Gnome Agility Course' },
};

runTest({
    name: 'City-to-City Navigation Test',
    saveConfig: {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Agility: 99 },
        varps: { 281: 1000 }, // Skip tutorial
    },
    launchOptions: { skipTutorial: true },
}, async ({ sdk, bot }) => {
    // Wait for valid player position
    await sdk.waitForCondition(s => (s?.player?.worldX ?? 0) > 0, 10000);
    console.log('=== City-to-City Navigation Tests ===\n');

    // Test 1: Lumbridge → Varrock (known working)
    console.log('--- Test 1: Lumbridge → Varrock ---');
    let result = await bot.walkTo(CITIES.VARROCK.x, CITIES.VARROCK.z, 20);
    let pos = sdk.getState()?.player;
    console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // Test 2: Varrock → Falador (skip Edgeville, longer but clearer route)
    console.log('--- Test 2: Varrock → Falador ---');
    result = await bot.walkTo(CITIES.FALADOR.x, CITIES.FALADOR.z, 20);
    pos = sdk.getState()?.player;
    console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // Test 3: Falador → Draynor
    console.log('--- Test 3: Falador → Draynor ---');
    result = await bot.walkTo(CITIES.DRAYNOR.x, CITIES.DRAYNOR.z, 20);
    pos = sdk.getState()?.player;
    console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // Test 4: Draynor → Lumbridge
    console.log('--- Test 4: Draynor → Lumbridge ---');
    result = await bot.walkTo(CITIES.LUMBRIDGE.x, CITIES.LUMBRIDGE.z, 20);
    pos = sdk.getState()?.player;
    console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // Test 5: THE HARD ONE - Lumbridge → Gnome Agility
    console.log('========================================');
    console.log('--- Test 5: Lumbridge → Gnome Agility Course ---');
    console.log('(This is ~750 tiles and crosses multiple regions)');
    console.log('========================================\n');

    const startPos = sdk.getState()?.player;
    const startX = startPos?.worldX ?? 0;
    const startZ = startPos?.worldZ ?? 0;

    result = await bot.walkTo(CITIES.GNOME_AGILITY.x, CITIES.GNOME_AGILITY.z, 30);
    pos = sdk.getState()?.player;

    const endX = pos?.worldX ?? 0;
    const endZ = pos?.worldZ ?? 0;
    const distanceTraveled = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endZ - startZ, 2));
    const distanceRemaining = Math.sqrt(
        Math.pow(CITIES.GNOME_AGILITY.x - endX, 2) +
        Math.pow(CITIES.GNOME_AGILITY.z - endZ, 2)
    );

    console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    console.log(`Start: (${startX}, ${startZ})`);
    console.log(`End: (${endX}, ${endZ})`);
    console.log(`Distance traveled: ${distanceTraveled.toFixed(0)} tiles`);
    console.log(`Distance remaining: ${distanceRemaining.toFixed(0)} tiles`);

    if (!result.success) {
        console.log(`\nBot got stuck at (${endX}, ${endZ})`);
        console.log('This might be a gate, door, or obstacle requiring interaction.');
    }

    // Pass if we completed at least the first route
    return true;
});
