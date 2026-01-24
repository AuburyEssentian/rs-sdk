# Script Improvement Methodology

A scientific approach to developing and iterating on automation scripts.

## Core Principles

1. **Fail Fast** - Detect stagnation early. If no progress for 30s, abort and log why.

2. **Inspectable Runs** - Every run produces artifacts that answer: what happened, why did it fail, what could improve?

3. **Horizontal Structure** - Each script is independent. Its runs, logs, and improvements live together so it can evolve on its own.

4. **Insights Over Data** - Log meaningful events (actions taken, outcomes) not noise. The goal is to extract learnings like "this approach worked" or "this caused failure."

5. **Robustness at depth** - Scripts improve via the lab log cycle: run → observe → hypothesize → fix → repeat. We want to stay simple but scale towards success at longer goal time horizons.

## The Iteration Cycle

```
Hypothesize → Implement → Run → Observe → Record in lab_log → Improve → Repeat
```

1. **Define Goal** - What does success look like? What's the reward function?
2. **Write Script** - Implement v1 using `runScript()`
3. **Run** - Execute with automatic instrumentation
4. **Analyze** - Review events.jsonl, screenshots, state snapshots
5. **Document** - Record insights in lab_log.md
6. **Improve** - Fix issues, optimize approach
7. **Repeat**

## Directory Structure

```
scripts/
├── METHODOLOGY.md              # This file
├── script-runner.ts            # Shared runner infrastructure
└── <script-name>/              # Each script is self-contained
    ├── script.ts               # The automation code
    ├── lab_log.md              # Observations & improvements
    └── runs/
        └── <timestamp>/
            ├── metadata.json   # Goal, duration, outcome
            ├── events.jsonl    # All logged events
            └── screenshots/
```

## Using the Script Runner

The `runScript()` function provides automatic instrumentation - no manual logging needed.

```typescript
import { runScript, TestPresets } from './script-runner';

runScript({
  name: 'goblin-killer',           // Creates scripts/goblin-killer/
  goal: 'Kill goblins to level 10', // Recorded in metadata
  preset: TestPresets.LUMBRIDGE_SPAWN,
  timeLimit: 10 * 60 * 1000,       // 10 minutes (default: 5 min)
  stallTimeout: 30_000,            // 30 seconds (default)
}, async (ctx) => {

  while (ctx.state()?.player?.combatLevel < 10) {
    const goblin = ctx.sdk.findNearbyNpc(/goblin/i);
    if (goblin) {
      ctx.log(`Attacking ${goblin.name}`);    // → console + events.jsonl
      await ctx.bot.attackNpc(goblin);         // Auto-logged with result
      ctx.progress();                          // Reset stall timer
    }
  }

  ctx.log('Goal achieved!');
});
```

### Context API

| Method | Purpose |
|--------|---------|
| `ctx.bot.*` | Instrumented BotActions - all calls auto-logged |
| `ctx.sdk.*` | Raw SDK - not logged |
| `ctx.log(msg)` | Log to console AND events.jsonl |
| `ctx.progress()` | Reset stall timer (call after meaningful progress) |
| `ctx.screenshot(label?)` | Take manual screenshot |
| `ctx.state()` | Get current world state |

### What Gets Logged Automatically

| Event Type | Contents |
|------------|----------|
| `action` | BotActions calls with args, result, duration |
| `console` | Script's log/warn/error output |
| `state` | Periodic state snapshots (every 10s) |
| `screenshot` | Visual state (every 30s) |
| `error` | Failures with context |

### Configuration

```typescript
interface ScriptConfig {
  name: string;              // Script folder name
  goal: string;              // What success looks like
  preset?: TestPreset;       // Starting save state
  timeLimit?: number;        // Max runtime (default: 5 min)
  stallTimeout?: number;     // No-progress timeout (default: 30s)
  screenshotInterval?: number; // Screenshot frequency (default: 30s)
}
```

## Lab Log Format

Document insights in `lab_log.md`:

```markdown
# Lab Log: goblin-killer

## Run 001 - 2026-01-24 12:30

**Outcome**: stall
**Duration**: 45s

### What Happened
- Found goblin, started combat
- Goblin died, loot dropped
- Script didn't pick up loot, kept looking for goblins

### Root Cause
Missing loot pickup after kills

### Fix
Add `await bot.pickupItem(/bones|coins/)` after combat ends

---

## Run 002 - 2026-01-24 12:45

**Outcome**: success
**Duration**: 8m 32s

### What Worked
- Loot pickup fix resolved stall
- Reached level 10 successfully

### Optimization Ideas
- Could prioritize goblins by distance
- Add eating when HP low
```

## Best Practices

1. **Call `ctx.progress()`** after meaningful actions to reset stall timer
2. **Use `ctx.log()`** for key decisions - it goes to events.jsonl for later analysis
3. **Review events.jsonl** to understand what happened
4. **Document insights** in lab_log.md - patterns that work, issues that fail
5. **One change at a time** - easier to attribute improvements/regressions
6. **Commit working versions** before major changes
