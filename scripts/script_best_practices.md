# Script Best Practices

Lessons learned from developing automation scripts. Reference this when writing new scripts to avoid common pitfalls.

## Dialogs & UI Blocking

### Level-Up Dialogs
When a player gains enough XP to level up, a congratulations dialog appears that **blocks all actions**. Your script must handle this:

```typescript
// Check for and dismiss dialogs in your main loop
if (currentState.dialog.isOpen) {
    ctx.log('Dismissing dialog...');
    await ctx.sdk.sendClickDialog(0);
    ctx.progress();
    continue;
}
```

Also dismiss any blocking UI at the start of your script:
```typescript
await ctx.bot.dismissBlockingUI();
```

### Other Blocking Dialogs
- Welcome messages on login
- NPC conversation dialogs
- Shop interfaces
- Bank interfaces

## Fishing Spots

### Fishing Spots are NPCs, Not Locations
Fishing spots appear in `state.nearbyNpcs`, not `state.nearbyLocs`:

```typescript
// CORRECT
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
await ctx.sdk.sendInteractNpc(spot.index, optionIndex);

// WRONG - fishing spots are not locations
const spot = state.nearbyLocs.find(loc => /fishing/i.test(loc.name));
```

### Two Types of "Net" Fishing
Not all "Net" options are the same:

| Spot Options | Fish Type | Level Requirement |
|--------------|-----------|-------------------|
| Net, Bait | Small net (shrimp, anchovies) | **None** |
| Net, Harpoon | Big net (mackerel, cod, bass) | **Level 16+** |

When fishing at level 1, filter for "Net, Bait" spots:
```typescript
const smallNetSpots = fishingSpots.filter(npc =>
    npc.options.some(opt => /^bait$/i.test(opt))
);
```

### Recommended Fishing Locations
- **Draynor Village** (~3087, 3230) - Level 1 friendly, safe area
- **Catherby** (~2844, 3429) - Has both types, watch for level requirements

## State & Activity Detection

### Animation State
The SDK exposes animation IDs for both player and NPCs:

```typescript
// Player animation (-1 = idle/none)
state.player?.animId      // Current animation sequence ID
state.player?.spotanimId  // Spot animation (spell effects, combat hits, etc.)

// NPC animation
const npc = state.nearbyNpcs[0];
npc.animId      // -1 = idle
npc.spotanimId  // -1 = none
```

**Common animation checks:**
```typescript
// Check if player is doing something (not idle)
const isActive = state.player?.animId !== -1;

// Check if player is idle
const isIdle = state.player?.animId === -1;
```

Note: Animation IDs are raw sequence IDs from the game. -1 always means idle/none.

### Other Ways to Detect Player Activity
Animation state is useful, but you can also detect activity through:
- **XP changes** - check if skill XP increased
- **Inventory changes** - check if items appeared/disappeared
- **Game messages** - check `state.gameMessages` for "You catch...", "You mine...", etc.
- **Just keep clicking** - the game queues actions, so continuous clicking often works best

### State Updates
The SDK state is updated via WebSocket. At low FPS (fps=5 in tests), state updates are infrequent. Don't rely on real-time state for fast actions.

## Action Patterns

### Continuous Clicking Works
For many skills, continuously sending the action works better than waiting:

```typescript
// Simple and effective
while (true) {
    await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
    ctx.progress();
    await new Promise(r => setTimeout(r, 300));  // Small delay
}
```

The game handles queuing and won't break if you click multiple times.

### Don't Over-Engineer Wait Conditions
Complex wait conditions often cause more problems than they solve:
- State might not update fast enough
- Conditions might have edge cases
- Simple polling loops are more reliable

## Inventory Management

### Drop Items to Make Space
For gathering skills, drop items when inventory fills:

```typescript
if (currentState.inventory.length > 20) {
    for (const item of itemsToDrop) {
        await ctx.sdk.sendDropItem(item.slot);
        await new Promise(r => setTimeout(r, 100));
    }
}
```

## Stuckness Detection

### Custom Stuckness Checks
Add script-specific stuckness detection beyond the default stall timeout:

```typescript
const STUCK_CONFIG = {
    noProgressTimeoutMs: 15_000,  // 15 seconds without progress
    noXpTimeoutMs: 20_000,        // 20 seconds without XP gain
};

function checkStuck(ctx, stats) {
    const now = Date.now();
    if (now - stats.lastProgressTime > STUCK_CONFIG.noProgressTimeoutMs) {
        return 'No progress for 15s';
    }
    return null;  // Not stuck
}
```

### Throw StallError to Abort Cleanly
```typescript
import { StallError } from '../script-runner';

if (stuckReason) {
    throw new StallError(`STUCK: ${stuckReason}`);
}
```

## Location & Spawning

### Verify Spawn Location
Always log the spawn position to verify you're in the right place:
```typescript
ctx.log(`Position: (${state.player?.worldX}, ${state.player?.worldZ})`);
```
