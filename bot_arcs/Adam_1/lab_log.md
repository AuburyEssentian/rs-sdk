# Lab Log: Adam_1

A persistent character for long-term progression experiments.

## Character Progress

| Date | Arc | Duration | Score Before | Score After | Delta |
|------|-----|----------|--------------|-------------|-------|
| 01-25 | fishing-basics | 71s | 32 | 46 | +14 |
| 01-25 | fishing-basics | 14s | 46 | 56 | +10 |
| 01-25 | fishing-cooking | 284s | 54 | 77 | +23 |
| 01-25 | wc-fm-lumbridge | 157s | 77 | 117 | +40 |
| 01-25 | mining-varrock | 181s | 117 | 154 | +37 |
| 01-25 | combat-lumbridge | 180s | 154 | 248 | +94 |
| 01-25 | cowhide-combat | 302s | 248 | 293 | +45 |
| 01-25 | mining-banking | 4 runs | 293 | 307 | +14 |

---

## Current State

**Total Level**: 307
**GP**: 0
**Equipment**: Bronze sword
**Equipment Value**: ~10

**Score**: 307

**Key Skills**:
- Fishing: 48
- Woodcutting: 41
- Mining: 52 (!)
- Attack: 27
- Strength: 46 (!)
- Defence: 26
- Hitpoints: ~15

**Inventory**: Bronze sword, Wooden shield, Bronze axe, Tinderbox, Bronze pickaxe, Bread

**Bank**: ~30 Tin ore, ~30 Iron ore

---

## Arc: fishing-basics

### Goal
Fish at Draynor until level 10+ fishing.

### Run 001 - 2026-01-25 07:37
**Duration**: 71s | **Outcome**: SUCCESS | **Score**: +14

- Walked to Draynor, fished shrimp
- Fishing: 1 -> 13, gained 2000 XP

### Run 002 - 2026-01-25 07:54
**Duration**: 14s | **Outcome**: SUCCESS | **Score**: +10

- Started at Draynor (persistence worked!)
- Fishing: 13 -> 23, gained 5000 XP

---

## Arc: fishing-cooking

### Goal
Fish and cook at Draynor for dual skill XP.

### Run 001 - 2026-01-25 08:23
**Duration**: 284s | **Outcome**: PARTIAL | **Score**: +23

- Fishing worked great: 25 -> 48 (+77,000 XP!)
- Cooking failed: couldn't chop trees for logs
- Character drifted during fish drops

---

## Arc: wc-fm-lumbridge

### Goal
Train Woodcutting and Firemaking at Lumbridge.

### Run 001 - 2026-01-25 14:53
**Duration**: 157s | **Outcome**: SUCCESS | **Score**: +40

### What Happened
- Started at Lumbridge tree area (3200, 3220)
- Chopped trees extensively
- **Woodcutting: 1 -> 41** (+45,000 XP!)
- **Total Level: 77 -> 117** (+40 levels!)
- Firemaking: 0 XP (logs consumed by chopping cycle)

### Technical Notes
- Tree chopping works well once character stays in area
- XP gain was massive despite low log counter
- Character drift management improved with 15-tile threshold
- Bot disconnected near end of run

### State After Run
**Levels**: WC 41, Fishing 48, FM 1, Cooking 1
**Total Level**: 117
**Score**: 117

---

## Arc: cowhide-combat

### Goal
Kill cows for combat XP and collect hides (banking disabled due to walk issues).

### Run 001 - 2026-01-25 15:53
**Duration**: 302s | **Outcome**: SUCCESS | **Score**: +45

### What Happened
- Killed cows at Lumbridge cow field
- Collected 16 cowhides (dropped when inventory full)
- **Strength: 27 -> 46** (+19 levels!)
- **Total Level: 248 -> 293** (+45 levels!)
- Kills: 65

### Technical Notes
- Long-distance walking to Varrock bank failed (bot doesn't move)
- Simplified to drop hides instead of banking
- Combat style set to Aggressive for Strength training
- Cows are easy targets for consistent XP

### State After Run
**Levels**: Str 46, Atk 27, Def 26, Fishing 48, WC 41, Mining 38
**Total Level**: 293
**Score**: 293

---

## Arc: mining-banking

### Goal
Mine ore at SE Varrock mine and bank it at Varrock West bank.

### Run 001-004 - 2026-01-25 16:15-16:45
**Duration**: 4 runs (~15m total) | **Outcome**: SUCCESS | **Score**: +14

### What Happened
- First successful banking arc!
- Used waypoint walking (20-25 tile segments) to reach bank
- Mine → Bank route: ~100 tiles, 5 waypoints each direction
- **Mining: 38 → 52** (+14 levels!)
- **Total banked: ~60 ore** (tin and iron)
- Bank trips: 4 successful

### Technical Notes
- `bot.walkTo()` needs waypoints for long distances
- 20-25 tile waypoint segments work reliably
- Retry logic (3 attempts per waypoint) handles occasional failures
- Bank opened via banker NPC (more reliable than booth)
- Depositing ore slot by slot works

### Key Walking Breakthrough
Long walks (100+ tiles) fail silently with single walkTo call. Solution:
```typescript
const WAYPOINTS_TO_BANK = [
    { x: 3270, z: 3380 },  // Step 1: NW from mine
    { x: 3250, z: 3395 },  // Step 2: Continue NW
    { x: 3230, z: 3410 },  // Step 3: Getting closer
    { x: 3210, z: 3425 },  // Step 4: Near bank entrance
    { x: 3185, z: 3436 },  // Step 5: Bank
];
```

### State After Run
**Levels**: Mining 52, Str 46, Atk 27, Def 26, Fishing 48, WC 41
**Total Level**: 307
**Score**: 307
**Bank**: ~60 ore

---

## Arc: combat-lumbridge

### Goal
Train Attack, Strength, Defence at Lumbridge.

### Run 001 - 2026-01-25 15:21
**Duration**: 180s | **Outcome**: SUCCESS | **Score**: +94

### What Happened
- Started at Lumbridge goblin area (3240, 3220)
- Equipped bronze sword, cycled combat styles on level up
- Fought goblins and rats efficiently
- **Attack: 1 -> 27** (+10,000 XP!)
- **Strength: 1 -> 27** (+10,000 XP!)
- **Defence: 1 -> 26** (+8,800 XP!)
- **Total Level: 154 -> 248** (+94 levels!)
- Kills: 53

### Technical Notes
- Combat style cycling works well for balanced training
- sendInteractNpc with "Attack" option for combat
- sendSetCombatStyle(index) to switch training focus
- Need optional chaining for combat?.inCombat (can be undefined)

### State After Run
**Levels**: Atk 27, Str 27, Def 26, Fishing 48, WC 41, Mining 38
**Total Level**: 248
**Score**: 248

---

## Arc: mining-varrock

### Goal
Train Mining at SE Varrock mine.

### Run 001 - 2026-01-25 15:14
**Duration**: 181s | **Outcome**: SUCCESS | **Score**: +37

### What Happened
- Started at SE Varrock mine (3285, 3365)
- Mined copper/tin ore efficiently
- **Mining: 1 -> 38** (+33,250 XP!)
- **Total Level: 117 -> 154** (+37 levels!)
- Ores mined: 19

### Technical Notes
- Lumbridge Swamp mine rocks didn't work (interaction failed)
- SE Varrock mine works perfectly (tested location)
- Animation ID 625 indicates active mining
- Walk closer to rocks before interacting (distance > 3 = walk)
- Rock ID changes when depleted (2094 ore -> 450 empty)

### State After Run
**Levels**: Mining 38, WC 41, Fishing 48
**Total Level**: 154
**Score**: 154

---

## Learnings

### 1. Walking
- Long walks need persistence - keep re-issuing walk commands
- Check distance to destination and retry if not close enough
- Monitor drift distance and walk back when > 15 tiles

### 2. Fishing
- Fishing spots are NPCs with "Net, Bait" options
- Wait ~1 second between clicks for animation
- Level-up dialogs appear frequently - must dismiss

### 3. Woodcutting
- Trees are locations with "Chop down" option
- Wait ~2 seconds per chop attempt
- Stay within 15 tiles of tree area to prevent drift

### 4. State Management
- Using initializeFromPreset ensures consistent state
- Can preserve skills while reinitializing inventory
- Bot disconnection errors happen occasionally - arc still counts

### 5. XP Tracking
- Counter tracking may not reflect actual XP gained
- Trust the XP totals in final state over counters

### 6. Mining
- Rocks are locations with "Mine" option
- SE Varrock mine (3285, 3365) works reliably
- Lumbridge Swamp mine interactions fail silently
- Wait ~2 seconds per mine attempt
- Walk closer if rock distance > 3 tiles
- Animation ID 625 = actively mining

### 7. Combat
- NPCs are interacted with sendInteractNpc using "Attack" option
- Use sendSetCombatStyle to switch training style (0=Attack, 1=Strength, 3=Defence)
- Cycle styles on level up to train all melee skills evenly
- Goblins/rats at Lumbridge (3240, 3220) are good low-level targets
- Check combat?.inCombat to see if in combat (optional chaining needed)
- Wait ~1.5 seconds between attack attempts

### 8. Banking
- Find bank booth or banker NPC and interact
- Wait for `state.interface.isOpen === true`
- Use `sdk.sendBankDeposit(slot, count)` to deposit items
- Use `sdk.sendBankWithdraw(bankSlot, count)` to withdraw
- Banker NPC is more reliable than bank booth
- Varrock West bank (3185, 3436) works well

### 9. Long-Distance Walking
- Single `bot.walkTo()` fails silently for distances > ~30 tiles
- Solution: Use waypoints with 20-25 tile segments
- Implement retry logic (3 attempts per waypoint)
- Always verify arrival with distance check
- Use `bot.walkTo()` instead of `sdk.sendWalk()` for pathfinding
