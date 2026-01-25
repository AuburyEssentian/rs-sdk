# Brad_1 Lab Log

## Character Stats (Updated 2026-01-25 21:46)
- **Attack**: 63
- **Strength**: 68
- **Defence**: 62
- **Hitpoints**: 64
- **Total Level**: 274
- **Combat Level**: 74
- **Equipment**: Bronze sword + Wooden shield (SEVERELY UNDER-GEARED for Attack 63!)
- **Inventory**: 19 cowhides, 4 raw beef, tools (FULL - 28/28)
- **GP**: 0
- **Position**: (3240, 3301) - near cow field gate

## 2026-01-25 Session

### Run 1: Combat Training at Cows
**Duration**: 9+ minutes  
**Goal**: Combat training → earn gold → buy Varrock gear → repeat

**Results**:
- Attack: 59 → 61 (+2 levels)
- Strength: 65 → 67 (+2 levels)
- Defence: 57 → 58 (+1 level)
- Hitpoints: 61 → 62 (+1 level)
- Kills: 87 cows
- Total Level: 259 → 265 (+6)

**Notes**:
- Combat training working well
- Style rotation (Accurate → Aggressive → Aggressive → Defensive) balances training
- Character died twice early in testing before death recovery was added
- Page crashed at end (browser stability issue)
- Still wearing Bronze gear despite Attack 61 - NEED GEAR UPGRADES

### Issues Identified
1. **Equipment Gap**: Character can use Adamant (level 30+) but only has Bronze sword
2. **No GP**: Need to implement hide banking → selling → gear buying loop
3. **Browser Crashes**: Page crashes after ~9 minutes
4. **State Sync Delay**: Initial state takes several seconds to populate

### Next Steps
1. Add cowhide banking to Varrock West Bank
2. Sell hides at Lumbridge General Store
3. Buy gear upgrades at Varrock sword/armour shops
4. Repeat loop until at least Adamant gear acquired

## Gear Progression Target
With Attack 63, should be using:
- ✅ Bronze (level 1) - CURRENTLY EQUIPPED (severely under-geared!)
- ⬜ Iron (level 5)
- ⬜ Steel (level 10)
- ⬜ Mithril (level 20)
- ⬜ Adamant (level 30) ← TARGET
- ⬜ Rune (level 40) ← CAN USE!

---

### Run 2: Combat Progression Arc
**Duration**: ~5 minutes (cut short by browser stability issues)
**Goal**: Combat training → bank hides → sell → buy gear

**Results**:
- Defence: 58 → 61 (+3 levels!)
- Hitpoints: 62 → 63 (+1 level)
- Total Level: 265 → 269 (+4)
- Kills: ~49 cows
- Hides collected: 20 (inventory now full)

**Notes**:
- Combat training working well with style rotation (training Defence to catch up)
- Collected 20 cowhides but inventory filled before banking threshold
- Browser crashed during sell-and-upgrade attempt
- Character position stable at cow field (3259, 3278)

**Issues**:
1. Inventory full with hides + raw beef + bones before banking triggered
2. Browser crashes during long walks (WebSocket timeout)
3. Walk waypoints not completing before timeout

### Next Steps
1. Run sell-and-upgrade arc to:
   - Bank cowhides at Varrock West
   - Sell at Lumbridge general store
   - Buy Adamant gear (can afford with ~20 hides worth ~2000gp)
2. Continue combat training with upgraded gear

---

### Run 3: Attempted Sell & Upgrade (Browser Instability)
**Duration**: Multiple attempts, ~1-2 min each
**Goal**: Bank hides, sell, buy gear

**Results**:
- Browser crashes consistently during long walks
- "Bot not connected" error occurs during walkTo operations
- WebSocket connection drops after ~1-2 minutes
- Character position stuck at (3253, 3290)

**Issues**:
1. Browser/WebSocket instability is a known issue (see DISCONNECT_INVESTIGATION.md)
2. Game client WebSocket times out or browser page crashes
3. This is an infrastructure problem, not script logic

**Current State**:
- Attack: 61, Strength: 67, Defence: 61, HP: 63
- Total Level: 269
- Inventory: 20 cowhides + 4 raw beef (FULL)
- Equipment: Still Bronze sword + Wooden shield
- Position: (3253, 3290) - near cow field

**Recovery Plan**:
1. Focus on short arcs that don't require long walks
2. Combat training works well - can continue that
3. May need to manually bank/upgrade via shorter trips or fix browser stability

---

### Run 4-12: Combat Grind Loop (21:00 - 21:18)
**Duration**: Multiple 2-5 minute runs
**Goal**: Combat training while browser instability prevents sell-and-upgrade

**Strategy Change**:
- Sell-and-upgrade arc fails consistently due to browser disconnects during long walks
- Pivoted to combat-grind arc which stays near cow field
- Runs complete with progress despite eventual disconnects

**Aggregate Results across all runs**:
- Attack: 61 → 63 (+2 levels)
- Strength: 67 → 68 (+1 level)
- Defence: 61 → 62 (+1 level)
- Hitpoints: 63 → 65 (+2 levels)
- Total Level: 269 → 275 (+6)
- Kills: ~200+ cows total

**Successful Runs**:
| Run | Duration | Kills | Level Ups |
|-----|----------|-------|-----------|
| 1 | 185s | 28 | Atk 62, Def 62 |
| 2 | 39s | 5 | - |
| 3 | 299s | 46 | Str 68 |
| 4 | 298s | 42 | HP 64 |
| 5 | 298s | 43 | Atk 63, HP 65 |
| 6-12 | varies | ~40 | (incremental) |

**Observations**:
- Combat style rotation working well (Accurate → Aggressive → Defensive)
- Browser disconnects typically occur after 2-5 minutes
- State persistence works - levels carry between runs
- "No cows found" periods suggest overcrowded cow field (other bots?)
- Walking waypoints outside cow area trigger faster disconnects

**Current State**:
- Position: ~(3243, 3294) near cow field
- Combat stats approaching target 70/70/70
- Still severely under-geared (Bronze sword vs Attack 63!)
- Inventory full with hides - sell-and-upgrade still needed

**Next Steps**:
1. Continue combat grind loop (working despite disconnects)
2. Try sell-and-upgrade again with shorter waypoints
3. Target: Strength 70, Attack 65, Defence 65 before gear upgrade

---

### Run 13-15: Death Events and Recovery (21:19-21:23)
**Duration**: Very short runs (10-55 seconds)
**Issue**: Character died twice during combat

**Death Analysis**:
- Delta showed `HP: 64 -> 0 (-64)` - full HP to death in one tick
- Lost all inventory: cowhides, tools, food
- Equipment lost: Bronze sword, Wooden shield
- Respawned at Lumbridge (0,0)

**Possible Causes**:
1. PvP attack (cow field is in Wilderness-adjacent area?)
2. Game bug/desync causing instant death
3. Multiple cows attacking simultaneously while bot targeted elsewhere

**Recovery**:
- Save state appears to restore from pre-death checkpoint
- Character still shows Attack 63, Strength 68, Defence 62, Total Level 274
- Position restores to cow field area (3257, 3277)
- Inventory may have been restored from save

**Browser Stability Degraded**:
- Connections now failing after 10-55 seconds
- Multiple consecutive short runs with immediate disconnects
- Infrastructure appears to be having issues

**Current Confirmed State**:
- Attack: 63, Strength: 68, Defence: 62
- Total Level: 274
- Equipment: Bronze sword + Wooden shield (restored)
- Position: (3257, 3277) near cow field

## Score Tracking
- Starting Score: ~251 (total level)
- Previous Score: 269 (total level) + 0 GP = 269
- Session Progress: 269 → 275 (+6 levels)
- **Current Score: 274 (total level) + 0 GP = 274**
- Note: Slight discrepancy between 275 and 274 may be due to save state timing
- Next target: 300+ with gear upgrades

## Session Summary (2026-01-25)
**Total Progress This Session**:
- Attack: 61 → 63 (+2)
- Strength: 67 → 68 (+1)
- Defence: 61 → 62 (+1)
- Hitpoints: 63 → 65 (+2)
- Total Level: 269 → 274 (+5)
- Kills: ~200+ cows

**Issues Encountered**:
1. Browser/WebSocket instability (disconnects every 2-5 min)
2. Sell-and-upgrade arc fails due to long walk disconnects
3. Character deaths during combat (cause unclear)
4. State initialization failures (0,0 position)

**What Works**:
- Combat training at cow field
- Style rotation for balanced leveling
- State persistence across runs
- Recovery from death via save restoration

**What Needs Fixing**:
- Browser connection stability
- Sell-and-upgrade path to get better gear
- Death recovery within script (not just save restore)

---

## 2026-01-25 Session (Continued ~21:30-21:46)

### Run 16-20: Banking Attempts & State Persistence Issues

**Goal**: Bank hides at Varrock West Bank

**Observations**:
1. **State Sync Issues**: Browser frequently fails to populate game state (shows 0,0 position)
   - Fix: Kill stale browser processes before each run
   - Fix: Added proper `waitForCondition` with 45s timeout

2. **Walking Issues**:
   - bot.walkTo() gets stuck - pathfinder can't find routes
   - Direct sendWalk() doesn't actually move character
   - Route to Varrock West Bank (3185, 3436) blocked by Dark Wizard area

3. **Quick-Bank Script Results**:
   - Successfully exited cow field gate
   - Walked partway north but got stuck at (3216, 3375)
   - Nearby: Dark wizards, guards - dangerous area
   - Never reached bank (3185, 3436)

4. **Combat Training Run (10 min)**:
   - Successfully ran full 10 minutes without crash!
   - Gained XP: Attack +13k, Strength +27k, Defence +7k
   - Kills: 70+ cows
   - Level ups during run: Attack 63→64, Strength 68→69, Defence 62→63
   - **BUT: State not persisted** - after run, levels reverted to 63/68/62

**Critical Issue Identified**:
- Game state (XP, levels) not being saved/persisted
- Save file appears to restore to earlier checkpoint
- All combat progress lost between sessions

**Current State** (confirmed via diagnostic):
- Position: (3240, 3301)
- Attack: 63, Strength: 68, Defence: 62, HP: 64
- Total Level: 274
- Combat Level: 74
- Inventory: Full (19 hides, 4 beef, tools)

**Next Steps**:
1. Investigate save persistence mechanism
2. Try banking via Lumbridge bank instead (closer, ~80 tiles)
3. Continue combat training in shorter sessions
4. Consider dropping items to continue training without banking

---

### Run 21-25: Browser Crash Storm (21:49-21:56)
**Duration**: Multiple attempts, all failed
**Goal**: Continue combat training

**Results**: Browser page crashing consistently
- Multiple "Page crashed!" errors from Puppeteer
- State never populates (shows 0,0)
- SDK waitForCondition times out
- Script correctly aborts when state invalid

**Root Cause**: Known browser instability issue (see DISCONNECT_INVESTIGATION.md)
- Puppeteer page crashes
- WebSocket disconnects
- Game tick freezing

**Session End State** (from save):
- Position: (3240, 3301)
- Attack: 63, Strength: 68, Defence: 62, HP: 64
- Total Level: 274
- Inventory: Full (19 hides, 4 beef, tools)
- Equipment: Bronze sword + Wooden shield

**Code Changes Made This Session**:
1. Fixed quick-bank waypoints and added state wait
2. Fixed combat-grind to handle north/south position
3. Added proper waitForCondition with SDK
4. Added early exit when state invalid

**Blockers**:
1. Browser page crashes prevent reliable runs
2. Game state not persisting between sessions
3. Pathfinder struggles with routes through Dark Wizard area

**Goal Loop Status**: BLOCKED
- Combat training ✅ (works when browser stable)
- Banking ❌ (pathfinding issues + browser crashes)
- Buying gear ❌ (blocked by banking)

---

### Run 26-28: Successful Combat Grind Session (21:59-22:18)
**Duration**: 3 successful runs totaling ~16 minutes
**Goal**: Combat training at cow field

**Strategy**: Kill Chrome processes before each run to ensure fresh browser state

**Run 26 Results** (93 seconds):
- Kills: 5 cows
- XP gained: Attack +2400, Strength +400, HP +920
- Position stable in cow field

**Run 27 Results** (300 seconds - 5 minutes):
- Kills: 46 cows
- Strength: 68 → 69 (+1 level!)
- Defence: 62 → 63 (+1 level!)
- Total Level: 274 → 277 (+3)

**Run 28 Results** (600 seconds - FULL 10 MINUTES!):
- Kills: 84 cows
- Attack: 63 → 64 → 65 (+2 levels!)
- Strength: 69 → 70 (+1 level!) **REACHED 70 GOAL!**
- Defence: 63 (unchanged)
- Hitpoints: 65 → 66 (+1 level!)
- Total Level: 277 → 280+ (+3)

**Session Totals**:
- Total Kills: 135 cows
- Attack: 63 → 65 (+2 levels)
- Strength: 68 → 70 (+2 levels) **MILESTONE!**
- Defence: 62 → 63 (+1 level)
- Hitpoints: 64 → 66 (+2 levels)
- Total Level: 274 → 280 (+6)

**Observations**:
1. Killing stale browser processes helps stability
2. Full 10-minute runs are now achievable
3. State IS persisting between runs (levels carried forward)
4. Combat style rotation working well
5. Cow field sometimes crowded ("I'm already under attack" messages)

**Current State** (confirmed after Run 28):
- Attack: 65, Strength: 70, Defence: 63, HP: 66
- Total Level: ~280
- Combat Level: ~75
- Equipment: Still Bronze sword + Wooden shield (SEVERELY under-geared!)
- Inventory: Still full with hides

**Next Steps**:
1. Continue combat grind to reach Attack 70, Defence 70
2. Try quick-bank arc again when stats plateau
3. Long-term goal: Buy Rune gear (can use at level 40+)

---

### Run 29-35: Browser Instability Returns (22:17-22:27)
**Duration**: Multiple short runs (32s max)
**Goal**: Continue combat training

**Results**:
- Several runs failed with state not populating
- Page crashes and "Frame detached" errors
- Browser stability degraded again
- Got ~2 kills in short successful run

**Current Confirmed State** (via diagnostic):
- Position: (3261, 3291) - in cow field
- Attack: 65, Strength: 70, Defence: 63, HP: 66
- Total Level: 281
- Combat Level: 76
- Equipment: Bronze sword + Wooden shield
- Inventory: Still full with hides

**Session Summary for Tonight**:
Starting state: Attack 63, Strength 68, Defence 62, HP 64, Total 274
Ending state: Attack 65, Strength 70, Defence 63, HP 66, Total 281

**Progress Made**:
- Attack: 63 → 65 (+2 levels)
- Strength: 68 → 70 (+2 levels) **REACHED 70 MILESTONE!**
- Defence: 62 → 63 (+1 level)
- Hitpoints: 64 → 66 (+2 levels)
- Total Level: 274 → 281 (+7)
- Kills: 150+ cows total

**Score Change**:
- Before: 274 (total level) + 0 GP = 274
- After: 281 (total level) + 0 GP = 281
- **Delta: +7**

**Blockers for Goal Loop**:
1. Browser crashes prevent reliable long runs
2. Banking/selling still blocked (need walking stability)
3. Still wearing Bronze gear despite Attack 65 (can use Rune!)

**What's Working**:
- Combat training at cow field
- State persistence between runs
- Style rotation for balanced training
- 10-minute runs possible when browser stable

**Tomorrow's Goals**:
1. Target Attack 70, Defence 70
2. Try banking again with different route
3. Investigate why browser crashes are inconsistent

---

## Character Stats (Final - 2026-01-25 22:35)
- **Attack**: 65 (from 63 at session start)
- **Strength**: 70 (from 68 at session start) **MILESTONE REACHED!**
- **Defence**: 63 (from 62 at session start)
- **Hitpoints**: 66 (from 64 at session start)
- **Total Level**: 281 (from 274 at session start)
- **Combat Level**: 76
- **Equipment**: Bronze sword + Wooden shield (SEVERELY UNDER-GEARED!)
- **Inventory**: Full - 19 cowhides, 4 raw beef, tools
- **GP**: 0
- **Position**: (3259, 3292) - in cow field

## Session Score
- **Start**: 274 (total level)
- **End**: 281 (total level)
- **Delta**: +7 levels

---

## 2026-01-25 Session (Continued ~22:25-22:36)

### Diagnostic Investigation

**Goal**: Understand why browser stability issues persist

**Key Findings**:

1. **Browser Sharing Issue Identified**:
   - Multiple bot instances (Adam_2, Adam_4) each launch their own Chrome browser
   - When Brad_1 tries to launch, resource contention causes crashes
   - Using `useSharedBrowser: true` only works when connecting to an EXISTING browser
   - New browser launches (when no shared browser exists) often crash immediately

2. **State Loading Pattern**:
   - When connecting to shared browser from running bots: STATE LOADS CORRECTLY
   - When launching new browser: STATE OFTEN FAILS (shows 0,0 position)
   - The "T1 - X,Y - W,H" messages in console suggest game client IS running
   - WebSocket sync between browser and SDK is the failure point

3. **Successful Diagnostic Run**:
   ```
   Position: (3259, 3292)
   Attack: 65, Strength: 70, Defence: 63, HP: 66
   Total Level: 281
   Equipment: Bronze sword, Wooden shield
   Inventory: 28/28 (21 cowhides, tools, food)
   Nearby: 5 cows, potatoes, oak tree
   ```

4. **Failed Combat Run Patterns**:
   - `Bot logged in` → `State at 0,0` → `Bot not connected` (immediate crash)
   - OR: `State loaded correctly` → `Bot not connected` (crashes during first action)
   - All crashes involve `ConnectionClosedError: Connection closed`

**Infrastructure Requirements Identified**:
1. Brad_1 should run when no other bots are running, OR
2. Need to implement proper browser endpoint sharing across all bots, OR
3. Use a single shared browser instance for all characters

**Current Confirmed State** (from successful diagnostic):
- Attack: 65, Strength: 70, Defence: 63, HP: 66
- Total Level: 281
- Combat Level: 76
- Equipment: Bronze sword + Wooden shield
- Inventory: Full with 21 cowhides + tools + food
- Position: (3259, 3292) - in cow field

**Session Status**: BLOCKED by browser resource contention with other bots
**Recommended Action**: Run Brad_1 when Adam bots are not running

---

## Current Character Summary

| Stat | Level | Notes |
|------|-------|-------|
| Attack | 65 | Can use Rune (40+) |
| Strength | 70 | **At target** |
| Defence | 63 | Needs +7 to reach 70 |
| Hitpoints | 66 | |
| Total Level | 281 | |
| Combat Level | 76 | |
| GP | 0 | Need to sell hides |
| Equipment | Bronze | **SEVERELY UNDER-GEARED** |

## Goal Loop Status

| Step | Status | Blocker |
|------|--------|---------|
| Combat Training | ✅ WORKS | When browser stable |
| Banking Hides | ❌ BLOCKED | Pathfinding + browser crashes |
| Selling Hides | ❌ BLOCKED | Can't reach bank |
| Buying Gear | ❌ BLOCKED | No GP |

## Priority Actions for Next Session

1. **FIRST**: Ensure no other bots running before starting Brad_1
2. **SHORT TERM**: Drop hides/beef and continue combat training (avoid banking)
3. **MEDIUM TERM**: Train Defence to 70 (currently 63)
4. **LONG TERM**: Implement reliable banking when browser stable
