# Combat

Successful patterns for combat training.

## Attacking NPCs

Use `bot.attackNpc()` for cleaner code, or raw SDK for more control:

```typescript
// Porcelain method (recommended)
await ctx.bot.attackNpc(/cow/i);

// Raw SDK method
const npc = state.nearbyNpcs.find(n => /cow/i.test(n.name));
const attackOpt = npc.optionsWithIndex.find(o => /attack/i.test(o.text));
await ctx.sdk.sendInteractNpc(npc.index, attackOpt.opIndex);
```

## Combat Style Cycling

Rotate styles for balanced training:

```typescript
// Combat style indices
const STYLES = {
    ATTACK: 0,    // Train Attack
    STRENGTH: 1,  // Train Strength
    STRENGTH2: 2, // Also Strength (some weapons)
    DEFENCE: 3,   // Train Defence
};

// Cycle every 30 seconds or on level-up
let lastStyleChange = Date.now();
const CYCLE_INTERVAL = 30_000;

if (Date.now() - lastStyleChange > CYCLE_INTERVAL) {
    currentStyle = (currentStyle + 1) % 4;
    if (currentStyle === 2) currentStyle = 3; // Skip duplicate strength
    await ctx.sdk.sendSetCombatStyle(currentStyle);
    lastStyleChange = Date.now();
}
```

## Checking Combat State

```typescript
// Optional chaining needed - combat can be undefined
const inCombat = state.combat?.inCombat ?? false;

// Or check if we're animating (attacking)
const isAttacking = state.player?.animId !== -1;
```

## Safe Training Locations

| Location | Coordinates | Targets | Notes |
|----------|-------------|---------|-------|
| Lumbridge cows | (3253, 3255) | Cows | Safe, good for all levels |
| Lumbridge goblins | (3240, 3220) | Goblins, rats | Mixed enemies |
| Lumbridge chickens | (3237, 3295) | Chickens | Very safe, feathers drop |

## Opening Gates

Cow field and chicken coop have fenced gates:

```typescript
// Check for gate blocking path
const gate = state.nearbyLocs.find(l => /gate/i.test(l.name));
if (gate) {
    const openOpt = gate.optionsWithIndex.find(o => /^open$/i.test(o.text));
    if (openOpt) {
        await ctx.bot.openDoor(gate);
    }
}
```

## Finding New Targets

After killing an NPC, find the next one quickly:

```typescript
async function findTarget(ctx: ScriptContext, pattern: RegExp): Promise<NearbyNpc | null> {
    const state = ctx.state();
    if (!state) return null;

    return state.nearbyNpcs
        .filter(n => pattern.test(n.name))
        .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}
```

## Looting

Pick up valuable drops:

```typescript
const loot = state.groundItems
    .filter(i => /bones|hide|feather|coins/i.test(i.name))
    .sort((a, b) => a.distance - b.distance)[0];

if (loot && loot.distance < 5) {
    await ctx.bot.pickupItem(loot);
}
```
