# Walking & Navigation

Successful patterns for movement and pathfinding.

## Basic Walking

For short distances (<30 tiles), `bot.walkTo()` works directly:

```typescript
await ctx.bot.walkTo(3222, 3218);  // Walk to Lumbridge
```

## Long Distance Walking

For distances >30 tiles, use waypoints with 20-25 tile segments:

```typescript
const WAYPOINTS_TO_BANK = [
    { x: 3270, z: 3380 },  // Step 1
    { x: 3250, z: 3395 },  // Step 2
    { x: 3230, z: 3410 },  // Step 3
    { x: 3210, z: 3425 },  // Step 4
    { x: 3185, z: 3436 },  // Final destination
];

async function walkWaypoints(ctx, waypoints) {
    for (const wp of waypoints) {
        // Try up to 3 times per waypoint
        for (let attempt = 0; attempt < 3; attempt++) {
            await ctx.bot.walkTo(wp.x, wp.z);
            await new Promise(r => setTimeout(r, 500));

            const player = ctx.state()?.player;
            const dist = Math.sqrt(
                Math.pow(player.worldX - wp.x, 2) +
                Math.pow(player.worldZ - wp.z, 2)
            );

            if (dist <= 5) break;  // Close enough
        }
        ctx.progress();
    }
}
```

## Verifying Arrival

Always check if you actually arrived:

```typescript
const result = await ctx.bot.walkTo(targetX, targetZ);

const player = ctx.state()?.player;
const dist = Math.sqrt(
    Math.pow(player.worldX - targetX, 2) +
    Math.pow(player.worldZ - targetZ, 2)
);

if (dist > 5) {
    ctx.warn(`Walk failed: still ${dist.toFixed(0)} tiles away`);
}
```

## Known Routes

### Varrock Mine to Varrock West Bank (~100 tiles)

```typescript
const MINE_TO_BANK = [
    { x: 3270, z: 3380 },
    { x: 3250, z: 3395 },
    { x: 3230, z: 3410 },
    { x: 3210, z: 3425 },
    { x: 3185, z: 3436 },
];

const BANK_TO_MINE = [
    { x: 3210, z: 3425 },
    { x: 3230, z: 3410 },
    { x: 3250, z: 3395 },
    { x: 3270, z: 3380 },
    { x: 3285, z: 3365 },
];
```

## Opening Obstacles

Doors and gates block paths. Open them first:

```typescript
const door = state.nearbyLocs.find(l => /door|gate/i.test(l.name));
if (door) {
    const result = await ctx.bot.openDoor(door);
    if (result.success) {
        // Now walk through
        await ctx.bot.walkTo(targetX, targetZ);
    }
}
```

## Key Coordinates

| Location | Coordinates |
|----------|-------------|
| Lumbridge spawn | (3222, 3218) |
| Lumbridge cows | (3253, 3255) |
| Draynor fishing | (3087, 3230) |
| Varrock West bank | (3185, 3436) |
| SE Varrock mine | (3285, 3365) |
| Al Kharid gate | (3268, 3228) |
