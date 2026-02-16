# RS-Agent Bot Guide

You're here to play the mmo game through the progressive development of botting scripts, starting small then adapting to your desires and ideas.

## CRITICAL FIRST STEP: Start Services

Before doing anything else, run this command to start the game services:

```bash
/ensure-services.sh
```

This starts the game engine, gateway, and bot client. Wait for it to complete before running any scripts.
After this, the environment will be:
- Game engine: running on localhost:8888
- Gateway: running on localhost:7780
- Bot client: connected and in-game

Do NOT try to start these services manually or write your own startup scripts.

The bot account "agent" already exists with credentials in `bots/agent/bot.env`.

## How to Control the Bot

Write TypeScript scripts and run them with `bun`. Use the `runScript` helper for automatic connection management.

### Check Bot State First

```bash
bun sdk/cli.ts agent
```

This shows: position, inventory, skills, nearby NPCs/objects, and more.

### Script Template

Create scripts in `bots/agent/` and run them:

```typescript
// bots/agent/woodcutter.ts
import { runScript } from '../../sdk/runner';

const result = await runScript(async (ctx) => {
  const { bot, sdk, log } = ctx;

  let treesChopped = 0;

  while (treesChopped < 50) {
    await bot.dismissBlockingUI();

    const tree = sdk.findNearbyLoc(/^tree$/i);
    if (tree) {
      const r = await bot.chopTree(tree);
      if (r.success) count++;
    }
  }

  log(`Chopped ${count} trees`);
  return { count };
}, { timeout: 90_000 });

console.log(result);
```

Run with:
```bash
bun bots/agent/woodcutter.ts
```

The runner automatically finds `bot.env` in the same directory as the script.

## Script Duration Guidelines

**Start short, extend as you gain confidence:**

| Duration | Use When |
|----------|----------|
| **10-30s** | New script, single actions, untested logic, debugging |
| **2-5 min** | Validated approach, building confidence |
| **10+ min** | Proven strategy, grinding runs, AVOID UNLESS CONFIDENT |

A failed 5-minute run wastes more time than five 30 second diagnostic runs. **Fail fast and start simple.**

## SDK API Reference

See **sdk/API.md** for the complete method reference.

### bot.* (High-level actions that wait for completion)

| Method | What it does |
|--------|-------------|
| `walkTo(x, z, tolerance?)` | Pathfind to coords, opens doors along the way |
| `talkTo(target)` | Walk to NPC, start dialog |
| `interactNpc(target, option?)` | Walk to NPC, interact (e.g. `'trade'`, `'fish'`) |
| `interactLoc(target, option?)` | Walk to loc, interact (e.g. `'mine'`, `'smelt'`) |
| `attackNpc(target)` | Walk to NPC, start combat |
| `chopTree(target?)` | Chop tree, wait for logs |
| `pickupItem(target)` | Pick up ground item |
| `openBank()` | Open nearest bank |
| `depositItem(target, amount?)` | Deposit item to bank |
| `withdrawItem(slot, amount?)` | Withdraw item from bank |
| `equipItem(target)` | Equip from inventory |
| `eatFood(target)` | Eat food, returns HP gained |
| `useItemOnLoc(item, loc)` | Use inventory item on loc (e.g. fish on range) |
| `burnLogs(target?)` | Light logs with tinderbox |
| `fletchLogs(product?)` | Fletch logs with knife |
| `craftLeather(product?)` | Craft leather with needle |
| `smithAtAnvil(product)` | Smith bars at anvil |
| `dismissBlockingUI()` | Dismiss level-up dialogs (**call in every loop**) |
| `skipTutorial()` | Skip the tutorial island |

### sdk.* (Queries and low-level commands)

| Method | What it does |
|--------|-------------|
| `getState()` | Full world state snapshot |
| `getSkill(name)` / `getSkillXp(name)` | Skill info |
| `getInventory()` / `findInventoryItem(pattern)` | Inventory queries |
| `findNearbyNpc(pattern)` / `findNearbyLoc(pattern)` | Find nearby entities |
| `findGroundItem(pattern)` | Find ground items |
| `sendDropItem(slot)` | Drop inventory item |
| `sendUseItem(slot)` | Use inventory item (bury, etc.) |
| `sendUseItemOnItem(src, dst)` | Combine two items |
| `waitForCondition(pred)` | Wait for state predicate |
| `waitForTicks(n)` | Wait n game ticks |

## Key Tips

- **ALWAYS** call `bot.dismissBlockingUI()` in every loop iteration — level-ups block everything
- Use specific regex patterns: `/^tree$/i` not `/tree/i` (which matches "tree stump")
- Look out for "I can't reach" messages — the solution is often to open closed gates with `bot.openDoor()`
- Read files in `learnings/` for game-specific tips on banking, combat, shops, etc.
- Run scripts in the **foreground** so you can see their output
- The game runs at 8x speed — actions complete much faster than normal
