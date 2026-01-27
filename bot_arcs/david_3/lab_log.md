# Lab Log: david_3

## Character Goal
Explore the game, enjoy yourself, and make your own goals.

---

## Session Start - 2026-01-27

### Arc: diagnostic

**Run 001 - 2026-01-27 03:47**

**Duration**: ~30s
**Outcome**: SUCCESS - Explored initial state

### What I Discovered
- Fresh character in Lumbridge (3222, 3222)
- Combat Level 3, Total Level 30
- HP: 10/10
- All skills at level 1 except Hitpoints (10)

### State After Run
**Levels**: All at 1, Hitpoints 10
**Total Level**: 30

**Equipment**: Nothing equipped

**Inventory** (18 items):
- Bronze axe, Bronze pickaxe (tools)
- Bronze dagger, Bronze sword, Wooden shield, Shortbow (weapons/armor)
- Bronze arrow x25, Air rune x25, Mind rune x15, Water rune x6, Earth rune x4, Body rune x2 (ammo/runes)
- Small fishing net, Tinderbox, Bucket, Pot (misc)
- Shrimps x1, Bread x1 (food)

**Nearby**: Rats, Men, Women, Cook (Lumbridge Castle area)

### My Goals
I'm going to explore different skills and see what's fun! I think I'll start with something chill - maybe **fishing** since I have a net. Then perhaps try some **combat** with the rats to level up. Eventually I want to explore different areas and become a well-rounded adventurer.

### Next Steps
- Try fishing at Lumbridge (near the castle there should be fishing spots)
- Or explore combat by fighting rats/men
- Build up some levels and GP before venturing further

---

## Arc: fishing-adventure

### Run 001 - 2026-01-27 03:51

**Duration**: 5 minutes (300s timeout)
**Outcome**: TIMEOUT (expected - full run!)

### What Happened
- Started at (3145, 3231) near goblins/bear from previous walk
- Walked to Draynor fishing (3087, 3230) - took 2 HP damage on the way (8/10 HP)
- Found fishing spots immediately!
- Fished continuously, dismissing level-up dialogs
- Dropped fish when inventory got full (keep tools)

### Progress
- **Fishing**: 1 → 43 (+42 levels!)
- **XP Gained**: ~51,000 fishing XP
- **Total Level**: 30 → 72 (+42)

### State After Run
**Levels**: Fishing 43, Hitpoints 10
**Total Level**: 72

**Equipment**: Nothing equipped

**Inventory**: ~18 items (tools + some fish)

**Location**: Draynor Village fishing area (3088, 3229)

### Analysis
This is working EXTREMELY well! Fishing is giving massive XP gains. The script handles:
- Walking to fishing area
- Finding fishing spots (they're NPCs!)
- Continuous clicking to fish
- Dismissing level-up dialogs
- Dropping fish when inventory fills

### Next Steps
- Run again to keep leveling! Aim for 50+ fishing
- After fishing, maybe try combat or other skills
- Consider banking fish later for GP

---

### Run 002 - 2026-01-27 03:57

**Duration**: ~2 min (stalled)
**Outcome**: STALL - walked away when spots disappeared

### What Happened
- Started already at Draynor (3087, 3227) from last run
- Fished smoothly, many level ups
- At some point spots moved/disappeared, walked back, then stalled
- Ended up at (3147, 3233) near goblins

### Progress
- **Fishing**: 44 → 49 (+5 levels)
- **XP Gained**: ~41,000 more fishing XP
- **Total Level**: 73 → 78 (approx)

### State After Run
**Levels**: Fishing 49, Hitpoints 10
**Total Level**: ~78

**Location**: Near goblins (3147, 3233)

### Analysis
The script works great but has an issue: when fishing spots aren't visible, it tries to walk to the fishing area, which can cause it to walk far away and lose progress. The stall timeout catches this.

### Next Steps
- Run fishing again - should walk back to Draynor
- Almost at level 50 fishing!

---

### Run 003 - 2026-01-27 04:00

**Duration**: 5 minutes (full timeout)
**Outcome**: SUCCESS!

### What Happened
- Started at Draynor (3087, 3227) - character was already there!
- Fished continuously for 5 full minutes
- No stall issues this time
- Dropped fish when inventory got full

### Progress
- **Fishing**: 44 → 54 (+10 levels!)
- **XP Gained**: ~94,000 fishing XP (from start of this run)
- **Total Level**: 73 → 83 (+10)

### STATE MILESTONE: Level 50 Fishing achieved!

### State After Run
**Levels**: Fishing 54, Hitpoints 10
**Total Level**: 83

**Location**: Draynor Village fishing area

### Analysis
Full 5-minute run without stalls! The fishing script is working very reliably now. Getting about 10 fishing levels per 5-minute run at this point.

### Next Steps
- Keep fishing! Aiming for 60+ now
- After 60, maybe try something new like combat or woodcutting

---

### Runs 004-006 - 2026-01-27 04:07-04:20

**Duration**: Various (mix of full runs and stalls)
**Outcome**: Mixed - some good runs, some state sync issues

### Summary
- Multiple runs with state sync issues (0,0 position)
- When it works, fishing is very effective: 44 → 54 in runs
- Script stalls when spots disappear and character walks away
- Keep ending up at (3146, 3233) near goblins

### State After Multiple Runs
**Levels**: Fishing ~54, Hitpoints 10
**Total Level**: ~83 (reports 73 but this may be stale)

**Location**: Near goblins at (3146, 3233)

### Analysis
- Fishing script is ~60% reliable (state sync issues hurt)
- Walking to find new spots causes stalls
- Getting consistent progress when it does work
- The goblin area I keep ending up in might be good for combat!

### Decision: Try Combat!
Since I keep ending up near goblins anyway, let me try some **combat** training! Goblins are level 2 and a good starter enemy. This will be a nice change of pace from fishing.

---

## Arc: goblin-combat

### Run 001 - 2026-01-27 04:24

**Duration**: 5 minutes (full timeout)
**Outcome**: SUCCESS!

### What Happened
- Started at (3129, 3231) near goblins
- Equipped bronze sword and wooden shield
- Fought goblins continuously for 5 minutes
- Many level up dialogs dismissed
- ~263 fights (attacks initiated)

### Progress
- **Attack**: 1 → 35 (+34 levels!)
- **Strength**: 1 (not trained - combat style was Attack)
- **Defence**: 1 (not trained)
- **Hitpoints**: 10 → 25 (+15 levels!)
- **Total Level**: 78 → 127 (+49!)

### State After Run
**Levels**: Attack 35, Strength 1, Defence 1, Hitpoints 25, Fishing ~54
**Total Level**: ~127 (estimate)
**Combat Level**: ~13 (was 3)

**Equipment**: Bronze sword, Wooden shield
**Inventory**: Reduced to ~3 items (fish still there from earlier)

**Location**: Goblin area near (3149, 3240)

### Analysis
Combat training is INCREDIBLY effective! Got 34 Attack levels in 5 minutes! The script:
- Finds nearby goblins
- Attacks them continuously
- Dismisses level-up dialogs
- Moves around the area following goblins

**Issue**: The combat style rotation isn't working - only trained Attack. Need to fix the style switching or manually set to train Strength/Defence.

### Next Steps
- Fix combat style to train Strength next
- Or keep running to get Attack to 40+ first
- HP is low (ended at 5/25) - might need food

---

### Runs 002-003 - 2026-01-27 04:29-04:38

**Duration**: 5 min + 2 min (died in run 2) + 5 min (full)
**Outcome**: SUCCESS with style cycling working!

### What Happened

**Run 002** (04:29):
- Continued training Attack (style wasn't cycling correctly)
- Attack 35 → 43
- Died at HP=2 and respawned at Lumbridge
- Script stalled after death - no goblins at respawn point

**Run 003** (04:38):
- Fixed combat style to train lowest stat
- Started training Strength (was level 1)
- Strength 1 → 35 in one run!
- Defence 1 → 34
- Picked up loot: Bones, 34gp coins, Bolts, Goblin mail, Chef's hat
- No deaths this time!

### Progress Summary
- **Attack**: 35 → 43 → 35 (back down due to save sync? or save resets?)
- **Strength**: 1 → 35 (+34 levels!)
- **Defence**: 1 → 34 (+33 levels!)
- **Hitpoints**: 25 → 35 (+10)
- **Combat Level**: ~28 (was ~13)
- **GP**: +34gp from goblin coin drops

### State After Run 003
**Levels**: Attack ~43, Strength 35, Defence 34, Hitpoints 35, Fishing ~54
**Total Level**: ~180+ (estimate)
**Combat Level**: ~28

**Equipment**: Bronze sword, Wooden shield
**Inventory**: Bones, coins, bolts, goblin mail, chef's hat, misc

**Location**: Near cow field (3143, 3255)

### Analysis
Combat training with style cycling is AMAZING! The script now:
- Trains the lowest combat stat automatically
- Re-equips items after death
- Walks back to goblins after respawning
- Picks up loot (coins, bones, items)

### Next Steps
- Keep running combat to balance all melee stats to 40+
- Eventually try cows for cowhides (more valuable loot)
- Consider selling items for GP later

---

### Runs 004+ - 2026-01-27 04:44-04:49

**Duration**: Multiple attempts
**Outcome**: Browser state sync issues

### What Happened
- Multiple attempts to run combat script
- Browser consistently returns (0,0) position - state sync failure
- Script has retry logic but browser never recovers
- This is a known issue from Adam_4's experience with useSharedBrowser

### Technical Notes
- The browser seems to get into a bad state after multiple runs
- Position reads as (0,0), skills as 1, inventory empty
- The game is actually running fine (character visible) but SDK can't sync state
- Usually resolved by trying again later or restarting browser

---

## Session Summary - 2026-01-27

### Starting State
- Fresh character: Total Level 30, Combat Level 3
- Location: Lumbridge Castle (3222, 3222)
- Equipment: None
- Inventory: Starter kit (tools, weapons, runes, food)

### Final State (estimated)
- **Fishing**: ~54
- **Attack**: ~43
- **Strength**: ~35
- **Defence**: ~34
- **Hitpoints**: ~35
- **Total Level**: ~200+
- **Combat Level**: ~28+
- **GP**: ~34+ from goblin drops

### Achievements
1. Traveled to Draynor for fishing - learned to avoid Dark Wizards
2. Fishing 1 → 54 (+53 levels!) - multiple successful 5-min fishing runs
3. Combat training at goblin area - learned to fight and loot
4. Attack 1 → 43 (+42 levels!)
5. Strength 1 → 35 (+34 levels!)
6. Defence 1 → 34 (+33 levels!)
7. Implemented combat style cycling to train lowest stat
8. Added death recovery (re-equip, walk back to goblins)
9. Collected loot: coins, bones, goblin mail, chef's hat, air talisman

### Scripts Created
- `diagnostic/script.ts` - Check character state
- `fishing-adventure/script.ts` - Fish at Draynor
- `goblin-combat/script.ts` - Train combat with style cycling

### Key Learnings
1. Fishing spots are NPCs, not locations
2. Combat style 0=Attack, 1=Strength, 3=Defence
3. Need to re-equip items after death
4. Dark Wizards at ~(3220, 3220) are dangerous for low levels
5. Browser state sync issues common - retry helps
6. useSharedBrowser=false is more stable

### Issues Encountered
- Browser state sync: Sometimes returns (0,0) position
- Walking can cause stalls when destinations are far
- Fishing spots disappear, causing character to walk away

### What I Enjoyed
- Fishing is relaxing and gives tons of levels quickly
- Combat is exciting with lots of level-up notifications
- Exploring different areas and finding goblins
- Picking up loot and finding random items

---

## Session: 2026-01-27 04:50 - Continued Combat Training

### Diagnostic Check (04:50)
After killing stale browser processes, state synced properly.

**State**: At (3150, 3265) near goblins
**Levels**: Attack 35, Defence 35, Strength 35, Hitpoints 35, Fishing 49
**Total Level**: 205
**Combat Level**: 40

All melee stats balanced at 35! Style cycling working properly.

---

### Arc: goblin-combat

### Run (04:55) - 5 minute full run

**Duration**: 5 minutes (full timeout)
**Outcome**: SUCCESS!

### What Happened
- Simplified combat script (removed retry logic that was causing issues)
- Style cycling working perfectly - trained Defence first (was lowest), then Attack
- Picked up lots of loot: bones, body runes, beer, goblin mail, bronze spear, 5gp
- Inventory got full near the end ("You don't have enough inventory space")
- Moved around the goblin area following targets

### Progress
- **Attack**: 35 → 41 (+6 levels!)
- **Strength**: 42 (no change - already ahead from earlier session)
- **Defence**: 35 → 43 (+8 levels!)
- **Hitpoints**: 39 → 42 (+3 levels)
- **Combat Level**: 40 → ~46

### State After Run
**Levels**: Attack 41, Strength 42, Defence 43, Hitpoints 42, Fishing 49
**Total Level**: ~225
**Combat Level**: ~46

**Equipment**: Bronze sword, Wooden shield
**Inventory**: FULL - lots of bones, goblin mail x2, bronze spear, beer, body runes, bolts, coins (~39gp total)

**Location**: Near goblins (3151, 3265)

### Analysis
- Combat training is going excellently
- Style cycling keeps stats balanced - currently Def > Str > Atk
- ALL MELEE STATS NOW 40+!
- Need to drop bones or bank to make room for more loot

### Next Steps
- Drop excess bones to make room
- Continue training towards 50+ in all melee
- Consider trying cows for cowhides (more GP potential)

---

### Runs (05:02 - 05:18) - Multiple Combat Sessions

**Outcome**: Mixed - some progress, some stalls due to state sync

### What Happened
- Multiple combat runs with varying success
- Added bone-dropping logic to script (fixed to use sendDropItem with slot)
- Stats progressed but some runs stalled due to browser state sync issues
- Character sometimes walks away from goblin area when no targets visible

### Progress (across sessions)
- **Attack**: 41 → 47 (peak) but saves inconsistent
- **Strength**: 42 → 46
- **Defence**: 43 → 46
- **Hitpoints**: 42 → 46
- **Combat Level**: 48 → 51
- **Coins**: ~53gp total

### Technical Notes
- Browser state sync continues to be unreliable
- After killing browser processes, state syncs properly on fresh launch
- Character was walking eastward when no goblins visible (towards Lumbridge)
- Bone-dropping now works with ctx.sdk.sendDropItem(slot)

### Current State (after diagnostic at 05:18)
**Levels**: Attack 44, Strength 44, Defence 46, Hitpoints 45, Fishing 49
**Total Level**: 244
**Combat Level**: 51

**Equipment**: Bronze sword, Wooden shield
**Inventory**: 28 items (bones, goblin mail, bronze spear, bolts, runes, 53gp)

**Location**: Goblin area (3153, 3237)

---

### Session Summary - 2026-01-27 04:44 - 05:23

A challenging session with many browser state sync issues, but still made progress.

**Starting State (from last session)**:
- Attack ~43, Strength ~35, Defence ~34, Hitpoints ~35
- Total Level: ~200

**Final State** (estimated from working runs):
- Attack: 44
- Strength: 45 (trained this session)
- Defence: 46
- Hitpoints: 45
- Total Level: 244
- Combat Level: 51

**Achievements This Session**:
1. Fixed combat style cycling - now properly trains lowest stat
2. Added bone-dropping to combat script using sendDropItem(slot)
3. Multiple successful combat runs between state sync issues
4. All melee stats now in mid-40s range
5. Combat level increased from ~40 to 51

**Technical Issues**:
- Browser state sync very unreliable - often returns (0,0) position
- Scripts stall when state doesn't populate
- Need to kill browser processes between some runs
- Character sometimes walks away when no goblins visible

**What's Working**:
- Combat training at goblin area
- Style cycling to balance stats
- Bone dropping to manage inventory
- Loot collection (coins, runes, items)

**Next Session Goals**:
- Continue combat training towards level 50 in all melee
- Consider trying cow field for cowhides and more XP
- Maybe try selling items for GP

---

## Session: 2026-01-27 05:24 - Goblin Grind Success!

### Arc: goblin-grind

### Run (05:24 - 05:34) - Full 10 minute run!

**Duration**: 10 minutes (full timeout)
**Outcome**: SUCCESS! 🎉

### What Happened
- Created new `goblin-grind` script with bone-burying logic
- Discovered bones have "Bury" option (not "Drop") - gives Prayer XP!
- Full 10-minute combat session at goblin/spider area
- ~250 attack attempts across goblins, spiders, and giant spiders
- Style cycling worked perfectly - trained whichever stat was lowest
- Multiple level-ups throughout the run

### Progress During Run
Based on the combat log output:
- **Attack**: 44 → 48 (+4 levels!)
- **Strength**: 45 → 49 (+4 levels!)
- **Defence**: 46 → 49 (+3 levels!)
- **Hitpoints**: 45 → ~47 (from combat)

### Technical Notes
- Bone "Bury" option found and logged (optionsWithIndex showed only "Bury")
- Script ran smoothly for full duration with no stalls
- Character moved between goblin area and spider area naturally
- Dialog dismissal working properly for level-ups

### Scripts Created/Updated
- `goblin-grind/script.ts` - Combat training with bone burying and style cycling

### Analysis
This was a great run! The simplified goblin-grind script is very stable:
- No complex walking logic (stays in current area)
- Attacks any goblin/spider nearby
- Combat style rotates to train lowest stat
- Handles level-up dialogs properly
- 45-second stall timeout gives plenty of time

**Note**: State sync between runs remains inconsistent. The diagnostic after this run showed older stats (before the 10-min session). The in-run progress was real but may not have persisted to the save.

### Current Best Estimate State
Based on the run output (may not match save):
- Attack: 48
- Strength: 49
- Defence: 49
- Hitpoints: ~47
- Fishing: 49
- Combat Level: ~53

### Next Steps
- Run goblin-grind again to continue progress
- Try burying bones at start to clear inventory
- Consider exploring new areas once all melee stats hit 50

---

### Run 2 (05:36 - 05:46) - Another Full 10 minutes!

**Duration**: 10 minutes (full timeout)
**Outcome**: SUCCESS!

### What Happened
- Started fresh, bone-burying detected bones but only had 1
- Full combat session in goblin/spider area
- ~300 attack attempts
- Excellent level-up progression

### Progress
- **Attack**: 44 → 49 (+5 levels!)
- **Strength**: 45 → 49 (+4 levels!)
- **Defence**: 46 → 49 (+3 levels!)
- **Hitpoints**: 45 → ~47

### STATE MILESTONE: ALL MELEE STATS AT 49!

### Analysis
Two back-to-back successful 10-minute runs! The goblin-grind script is very stable:
- Combat style cycling keeps all stats balanced
- No stalls or crashes
- Handles level-up dialogs perfectly
- Naturally moves between goblin and spider areas

### Next Steps
- One more run should get all stats to 50!
- After that, maybe explore something new

---

### Run 3 (05:47 - 05:57) - LEVEL 50+ ACHIEVED!

**Duration**: 10 minutes (full timeout)
**Outcome**: SUCCESS! 🎉🎉🎉

### What Happened
- Started with all stats at 49!
- Buried 2 bones successfully
- Full combat session, ~300 attack attempts
- MASSIVE level gains!

### Progress
Starting: Attack 49, Strength 49, Defence 49, HP 49
Ending: Attack 52, Strength 53, Defence 53, HP ~51

- **Attack**: 49 → 52 (+3 levels!)
- **Strength**: 49 → 53 (+4 levels!)
- **Defence**: 49 → 53 (+4 levels!)
- **Hitpoints**: 49 → ~51 (+2 levels)

### 🏆 MILESTONE: ALL MELEE STATS 50+! 🏆

**Total Level**: 282+ (Combat Level: ~57)

### Analysis
Three consecutive 10-minute runs, all successful!
- Style cycling keeps stats balanced perfectly
- Script is extremely stable
- Went from 49/49/49 to 52/53/53 in one run!

### Current State Estimate
- **Attack**: 52
- **Strength**: 53
- **Defence**: 53
- **Hitpoints**: ~51
- **Fishing**: 49
- **Total Level**: 285+
- **Combat Level**: ~57

### What's Next?
With all melee stats 50+, I've hit my goal! Time to explore something new:
- Try fishing again to get that to 50+?
- Explore Al Kharid (requires toll or 10k coins)
- Try the cow field for cowhides
- Maybe try a new skill like Mining or Woodcutting?

---

## Session: 2026-01-27 06:05 - 06:45 - Exploring New Skills!

### Overview
With all melee stats 50+, time to explore new skills: Fishing, Woodcutting, and Mining.

### Arc: buy-tools
**Goal**: Get missing tools for fishing and woodcutting

**Run 1**: Walked to Port Sarim, bought **Small fishing net** for 5gp from Gerrant's
- Successful! Net acquired.

**Run 2**: Walked to Bob's Axes, bought **Bronze axe** for 16gp
- Successful! Axe acquired.

**Current GP**: 32 (down from 53)

---

### Arc: fishing-adventure
**Goal**: Level fishing from 49 to 50+

**Run 1** (5 minutes): MASSIVE SUCCESS!
- Started: Fishing 49
- Ended: **Fishing 56** (+7 levels!)
- XP gained: ~94,000
- Fished shrimps and anchovies at Draynor
- Script working great with level-up dialog handling

**STATE MILESTONE: Fishing 50+ achieved!**

---

### Arc: woodcutting
**Goal**: Train woodcutting from level 1

**Run 1** (~3 min before crash):
- Started: Woodcutting 1
- Reached: **Woodcutting 41** (+40 levels!)
- Began at regular trees in Lumbridge
- Automatically switched to willows at level 30
- Browser crashed after moving to Draynor willows

**Run 2** (~2 min):
- Continued from Woodcutting 31
- Reached: **Woodcutting 43** (+12 more)
- Training at Draynor willows

**STATE MILESTONE: Woodcutting 43!**

---

### Final State This Session
**Position**: (3087, 3235) - Draynor willows
**Total Level**: 347

**Skills**:
- Fishing: 56 (was 49, +7)
- Woodcutting: 43 (was 1, +42!)
- Attack: 52
- Strength: 53
- Defence: 53
- Hitpoints: 53
- Prayer: 23

**Combat Level**: 63

**Inventory**: Small fishing net, Bronze axe, logs, willow logs, misc items
**GP**: 32

---

### Technical Issues
- Browser crashes frequently after multiple runs
- "Page crashed!" errors common
- State sync issues (0,0 position) occur randomly
- Need to kill browser processes between some runs
- Mining script not yet tested due to browser instability

### Scripts Created This Session
- `buy-tools/script.ts` - Buy pickaxe/axe from Bob's Axes
- `woodcutting/script.ts` - Train WC with auto-switch from trees to willows
- `mining/script.ts` - Not yet tested (browser issues)

### What's Working Well
1. Fishing script runs full 5 minutes without issues
2. Woodcutting with auto-switch from trees (1-30) to willows (30+)
3. Shop interaction (Trade, Buy) working correctly
4. Long-distance walking with waypoints

### What I Enjoyed
- Rapid skill leveling is very satisfying
- Woodcutting went from 1 to 43 in under 5 minutes of runtime!
- Fishing now highest skill at level 56
- Exploring new content is fun

### Next Steps (for future session)
- Fix browser stability issues
- Test mining script
- Continue training skills to 50+
- Maybe try firemaking with the logs?

---

## DEATH EVENT - 2026-01-27 ~06:44

**Cause**: Dark Wizards killed the character while walking from Draynor toward Bob's Axes.

**Items Lost** (all items on death):
- Shortbow, Small fishing net (5gp), Bronze axe (16gp)
- Coins x32, Bolts x16, Body rune x21
- Willow logs, Goblin mail, Bronze spear
- Bronze sword (equipped), Wooden shield (equipped)

**Lesson Learned**: The Dark Wizard area (~3220, 3220) is VERY dangerous. Even at combat level 63, multiple Dark Wizards can kill you while walking. The walking script didn't account for combat interruption.

**Recovery Plan**:
1. Character respawns at Lumbridge with nothing
2. Need to rebuild - buy tools again
3. Skills are preserved (Fishing 56, Woodcutting 43, Melee 50+)
4. Can pickpocket men for GP to buy new tools

**Prevention for Future**:
- Add HP monitoring during walks
- Eat food if HP drops
- Avoid Dark Wizard area entirely (use wider waypoints)
- Consider running vs walking through dangerous areas

---

### Additional Runs (05:57 - 06:05)

**Fishing Attempt**: Tried fishing at Draynor but script got stuck in dialog loop (clicking level-up dialog but not fishing). Needs debugging.

**Combat Attempts**: Browser started experiencing crashes and "Bot not connected" errors. State sync issues returned.

### Verified State (from successful runs)
- **Attack**: 52
- **Strength**: 53
- **Defence**: 53
- **Hitpoints**: 53
- **Fishing**: 49
- **Total Level**: 298
- **Combat Level**: ~58

---

## Session Summary - 2026-01-27 05:00 - 06:05

### Major Achievements This Session
1. **Three consecutive successful 10-minute combat runs**
2. **All melee stats reached 50+**:
   - Attack: 44 → 52 (+8 levels)
   - Strength: 45 → 53 (+8 levels)
   - Defence: 46 → 53 (+7 levels)
   - Hitpoints: 45 → 53 (+8 levels)
3. **Total Level**: 245 → 298 (+53 levels)
4. **Combat Level**: 51 → ~58

### Scripts That Work Well
- `goblin-grind/script.ts` - Extremely stable, ran 3x 10-minute sessions without issues
  - Combat style cycling keeps all melee stats balanced
  - Bone-burying works (when bones are present)
  - Handles level-up dialogs
  - 45-second stall timeout gives plenty of time

### Scripts That Need Work
- `fishing-adventure/script.ts` - Gets stuck in dialog loop, needs debugging

### Technical Notes
- Browser crashes after extended use (~4-5 runs)
- State sync issues (0,0 position) happen randomly
- "Bot not connected" errors occur when browser is in bad state
- Retrying usually works

### Character Overview
**david_3** is now a capable mid-level combatant:
- Combat Level 58
- All melee stats 52-53
- Fishing at 49 (one level from 50!)
- Well-equipped with bronze sword and wooden shield
- Inventory has misc loot (coins, runes, goblin mail)
- Located near goblin area (3149, 3251)

### What I Enjoyed This Session
- Combat training is very satisfying with constant level-ups
- Style cycling makes progress feel balanced
- Watching stats climb from 44s to 50s was exciting!

---

## Session: 2026-01-27 06:40 - 07:05 - Exploration Adventure!

### Starting State
- Position: (3101, 3236) near Draynor bank
- Combat Level: 63-64
- Stats: Attack 52-55, Strength 53, Defence 53, HP 53-54
- Fishing: 56, Woodcutting: 43, Prayer: 23
- Total Level: 347-351

### Arc: explore-combat

Created a new script that fights anything nearby and trains lowest combat stat!

### Run 1 - Jail Guards & Wandering (06:44)

**Duration**: ~2 minutes before disconnect
**Location**: Started near jail (3108, 3238) - Prince Ali Rescue quest area!

**What Happened**:
- Dropped 19 junk items (logs, goblin mail, etc.)
- Fought jail guards (level 26) - new enemy type!
- Also fought goblins
- Wandered toward goblin area

**Progress**:
- Attack: 55 → 56 (+1)
- Strength: 53 → 55 (+2)
- Defence: 53 → 54 (+1)
- Moved to (3139, 3252)

### Run 2 - Extended Combat (06:45-06:53)

**Duration**: ~8 minutes, 240+ attacks before disconnect

**What Happened**:
- Started at jail, fought guards
- Wandered through Lumbridge fighting men, women, rats
- Even attacked a duck!
- Explored new areas automatically

**Progress**:
- Attack: 56 (stable)
- Strength: 53 → 55 (+2)
- Defence: 53 → 54 (+1)
- HP: 54 → 55
- Ended at (3230, 3209) - Bob's Axes shop!

### Run 3 - FULL 10 MINUTE RUN! (06:55-07:05)

**Duration**: 10 minutes (full timeout!)
**Attacks**: 300+

**What Happened**:
- Started at jail guards again
- Fought an impressive variety of enemies:
  - Jail guards (lvl 26)
  - Goblins (lvl 2)
  - An Imp (lvl 2)!
  - Unicorns (lvl 15)!
  - A Bear (lvl 21)!
  - Spiders and Giant spiders (lvl 1-2)
- Combat style cycled between Strength and Defence

**Progress**:
- Attack: 57 (stable)
- Strength: 53 → 56 (+3!)
- Defence: 53 → 56 (+3!)
- HP: 54 → 56 (+2)
- Total Level: 353 → 361 (+8)
- Combat Level: 65 → 67 (+2)

### Final State

**Position**: (3171, 3240) - Spider/Bear area near Lumbridge
**Combat Level**: 67
**Total Level**: 361

| Skill | Level | Change |
|-------|-------|--------|
| Attack | 57 | +5 |
| Strength | 56 | +3 |
| Defence | 56 | +3 |
| Hitpoints | 56 | +2-3 |
| Fishing | 56 | -- |
| Woodcutting | 43 | -- |
| Prayer | 23 | -- |

**Equipment**: Bronze sword, Wooden shield
**Inventory**: Shortbow, Fishing net, Coins x32, Bronze axe, Bolts, Body runes

### Scripts Created
- `explore-combat/script.ts` - Fights any nearby enemies, trains lowest stat

### Highlights This Session
1. **Created explore-combat script** - Fights anything nearby, very versatile!
2. **Discovered new areas** - Jail area, Lumbridge town, spider/bear zone
3. **Fought new enemy types** - Jail guards, unicorns, bears, imps!
4. **Full 10-minute successful run** - Script is stable now
5. **All melee stats 56-57** - Great balanced progress!

### What I Enjoyed
- The freedom of exploring and fighting random enemies
- Discovering the jail guards and Prince Ali area
- Fighting unicorns and a bear!
- Watching stats climb throughout the session

---

## Session: 2026-01-27 07:15 - 07:45 - Mining Adventure & Browser Woes

### Starting State
- Position: (3171, 3245) - Spider area near Lumbridge
- Combat Level: 67
- Total Level: 362 (unchanged since last session)
- HP: 13/56 (low from previous combat)

### Arc: mining-adventure
**Goal**: Buy pickaxe from Bob's Axes and train Mining at SE Varrock mine

**Run 1** (07:18):
- Walked to Bob's Axes avoiding Dark Wizards (safe waypoints working!)
- Successfully bought Bronze pickaxe for 1gp
- Script errored on `sendCloseInterface` (wrong function name)

**Run 2** (07:19):
- Detected pickaxe in inventory
- Started walking to SE Varrock mine
- Browser disconnected mid-walk ("Bot not connected")

**Run 3** (07:21):
- HUGE SUCCESS! Made it to SE Varrock mine!
- Mining went from **level 1 to level 44** (+43 levels!)
- Mined 30+ ores before browser crash
- Total Level jumped from 362 to 405!
- **But... the save didn't persist** - Mining reverted to level 1

### Technical Issues This Session
- Browser extremely unstable - crashes every 1-3 minutes
- "Bot not connected" errors very frequent
- State sync issues - often shows (0, 0) position
- Progress lost when browser crashes before save syncs
- Multiple (0, 0) state writes corrupting state.md

### Attempted Workarounds
1. Created `mine-here` script to mine at current location (no walking)
2. Created `farm-combat` script for cow/chicken combat training
3. Multiple retry loops with delays between runs
4. None fully successful due to browser instability

### Combat Training Attempts
- At cow/chicken farm near (3240, 3296)
- Fought cows and chickens (level 1-2)
- XP gains minimal due to huge level difference (combat 67 vs level 1-2 enemies)
- Needed ~20+ chicken kills for no visible level gain
- Scripts work correctly but browser crashes before meaningful progress

### Final State
**Position**: (3240, 3296) - Cow/chicken farm near Lumbridge
**Total Level**: 362 (no change persisted)
**Combat Level**: 67

| Skill | Level |
|-------|-------|
| Attack | 57 |
| Defence | 57 |
| Strength | 56 |
| Hitpoints | 56 |
| Fishing | 56 |
| Woodcutting | 43 |
| Prayer | 23 |
| Mining | 1 (lost 43 levels to browser crash!) |

**Equipment**: Bronze sword, Wooden shield
**Inventory**: Shortbow, Small fishing net, **Bronze pickaxe** (kept!), Coins x31, Bronze axe, Bolts x16, Body runes x21

### Scripts Created This Session
- `mining-adventure/script.ts` - Buy pickaxe and walk to SE Varrock mine
- `mine-here/script.ts` - Mine at current location (no walking)
- `farm-combat/script.ts` - Combat train at cow/chicken farm

### Learnings
1. **Dark Wizard avoidance working** - Safe waypoints successfully avoid ~(3220, 3220)
2. **Shop interaction confirmed** - Bob's Axes sells Bronze pickaxe for 1gp
3. **Mining is FAST** - Level 1 to 44 in under 6 minutes of actual mining!
4. **Browser instability severe** - Need to investigate root cause
5. **Save persistence unreliable** - Progress can be lost on crash
6. **Chickens give tiny XP** - Not worth fighting at combat level 67

### What I Would Do Differently
- Shorter timeout scripts (1-2 min) to maximize successful saves
- Focus on activities that don't require walking (less crash-prone)
- Maybe try fishing at current location (fishing spots nearby?)
- Consider browser restart between sessions

### Frustrating But Instructive
Lost 43 Mining levels to a browser crash, but learned:
- Mining script works excellently when browser cooperates
- Safe waypoints for avoiding Dark Wizards are reliable
- Need more robust handling of browser disconnects

---

## Session: 2026-01-27 07:54 - Mining Recovery Success!

### Overview
Used SHORT 2-minute mining runs to prevent losing progress to browser crashes.

### Arc: mine-short
**Strategy**: 2-minute timeout mining runs at SE Varrock mine to save progress frequently.

### Runs Summary

| Run | Start Mining | End Mining | Notes |
|-----|--------------|------------|-------|
| 1   | 1            | 30         | SUCCESS! Walked to mine, massive gains |
| 2   | 31           | 42         | SUCCESS! Continued progress |
| 3-5 | 35-42        | 45-46      | Mixed - some crashes, save bounces |
| 6+  | 42           | 46         | Consistent - save stabilized at 42-46 range |

### Progress Made
- **Mining**: 1 → 46 (+45 levels!)
- **Total Level**: 362 → 407 (+45)
- **Found**: Uncut emerald (gem drop!)

### Technical Issues
- Browser state sync very unreliable (frequent 0,0 position errors)
- Save state bounces between runs (42 → 46 → 42 pattern)
- Bot disconnects frequently mid-run
- Short runs help capture progress before crashes

### Scripts Created
- `mine-short/script.ts` - 2-minute mining with safe waypoints

### Final State
**Position**: (3283, 3367) - SE Varrock mine
**Mining**: 46 (up from 1!)
**Total Level**: 407
**Combat Level**: 67

| Skill | Level |
|-------|-------|
| Attack | 57 |
| Defence | 57 |
| Strength | 56 |
| Hitpoints | 56 |
| Fishing | 56 |
| Mining | 46 |
| Woodcutting | 43 |
| Prayer | 23 |

### What Worked
1. **Short 2-min runs** - Progress saves more reliably
2. **Safe waypoints** - Avoid Dark Wizards successfully
3. **Already at mine** - No walking needed after first run
4. **Perseverance** - Keep trying despite crashes

### What Didn't Work
- Save state consistency - server seems to revert sometimes
- Browser stability - frequent crashes and disconnects

---

## Session: 2026-01-27 08:30 - 09:10 - Mining Progress!

### Overview
Continued mining at SE Varrock mine with short 2-minute runs to capture progress before browser crashes.

### Browser Issues
- State sync failing ~60-70% of the time (returns 0,0 position)
- `useSharedBrowser: false` helps but doesn't solve completely
- Browser disconnects ("Bot not connected") happen frequently
- Page crashes occur periodically
- Keep retrying until state syncs!

### Mining Progress (Best Run)
One excellent run achieved:
- **Mining**: 46 → 47 → 48 → 49! (+3 levels)
- **121 mining attempts** in 2 minutes
- Full timeout completion
- Ore dropping working correctly

### State Snapshot (from successful runs)
**Position**: (3283, 3367) - SE Varrock mine
**Mining**: 49 (was 44-46 at session start)
**Total Level**: 410
**Combat Level**: 67

---

## Session: 2026-01-27 09:06 - 09:45 - Mining to 54!

### Overview
Continued mining at SE Varrock mine. Browser instability persists but making steady progress.

### Key Discovery
Setting `headless: false` in launchOptions helps with state sync. Visible browser is more stable!

### Mining Progress
Multiple successful runs:
- Mining: 47 → 48 → 49 → 50 → 51 → 52 → 53 → 54 (+7 levels!)
- Found 2 uncut emeralds from mining!
- Full 2-minute runs completing regularly

### Final State
**Position**: (3283, 3367) - SE Varrock mine
**Total Level**: 415 (+8 from session start)
**Combat Level**: 67

| Skill | Level | Change |
|-------|-------|--------|
| Attack | 57 | -- |
| Defence | 57 | -- |
| Strength | 56 | -- |
| Hitpoints | 56 | -- |
| Fishing | 56 | -- |
| Mining | 54 | +7! |
| Woodcutting | 43 | -- |
| Prayer | 23 | -- |

**Inventory**: Tools, 31gp, 2 uncut emeralds, ore

### What Worked
1. `headless: false` - visible browser more reliable
2. Longer state wait loop (up to 40 attempts)
3. Short 2-min runs to capture progress
4. Keeping at mine (no walking needed)

### Next Goals
- Level Woodcutting from 43 to 50+ (lagging behind)
- Maybe try Smithing with the ore?
- Keep all skills balanced around 55+

| Skill | Level |
|-------|-------|
| Attack | 57 |
| Defence | 57 |
| Strength | 56 |
| Hitpoints | 56 |
| Fishing | 56 |
| Mining | 49 |
| Woodcutting | 43 |
| Prayer | 23 |

**Note**: state.md got overwritten with bad (0,0) state at end of session. The actual progress is Mining 49, Total Level 410.

### Technical Notes
- Modified script to use `useSharedBrowser: false` for more reliable state sync
- Still only ~30-40% of runs successfully sync state
- When state syncs, runs complete well with good XP gains
- Short 2-min runs are essential - longer runs would lose more progress

### Achievements
1. Mining 46 → 49 (+3 levels this session)
2. Total Level: 407 → 410
3. Mining XP: ~70k → ~100k (close to level 50!)
4. Ore dropping working correctly

### What I'd Do Next
- Keep running until Mining hits 50!
- Only ~1,500 XP away from level 50
- Consider trying a different skill if browser remains too unstable

---

## Session: 2026-01-27 09:43 - 10:02 - Mining to 56!

### Starting State (from state.md)
**Position**: (3283, 3367) - SE Varrock mine
**Mining**: 53 (already past 50!)
**Total Level**: 414
**Combat Level**: 67

### Runs Summary
Multiple 2-minute mining runs with typical browser instability. The pattern:
- ~60% of runs fail with state sync issues (0,0 position)
- When runs succeed, get 30-50 mining attempts per run
- Level up dialogs appear frequently (good sign!)

### Progress
| Metric | Start | End | Change |
|--------|-------|-----|--------|
| Mining | 53 | 56 | +3! |
| Total Level | 414 | 417 | +3 |
| Mining XP | 141,750 | 190,750 | +49,000 |

### Key Runs
1. **Run 1**: Mining 53 → 54, inventory filled with ore
2. **Run ~4**: Mining 54 → 55 (hit level up dialog)
3. **Run ~7**: Mining 55 → 56 (another level up!)

### Final State
**Position**: (3283, 3367) - SE Varrock mine
**Total Level**: 417
**Combat Level**: 67

| Skill | Level |
|-------|-------|
| Attack | 57 |
| Defence | 57 |
| Strength | 56 |
| Hitpoints | 56 |
| Fishing | 56 |
| Mining | 56 |
| Woodcutting | 43 |
| Prayer | 23 |

**Inventory**: Tools, 31gp, 2 uncut emeralds, 2 copper ore, body runes

### Analysis
Mining is now at 56, tied with Fishing! All main combat stats are 56-57. We've achieved the goal of getting Mining past 50.

Browser instability remains the main challenge - about 60% of runs fail to sync state. Short 2-minute runs help capture progress before crashes.

### Achievements This Session
1. Mining 53 → 56 (+3 levels)
2. Mining now tied with Fishing at 56!
3. Total Level 417
4. Found 2 uncut emeralds from mining

### Next Goals
- Woodcutting is lagging at 43 - could bring it up to 50+
- All skills 56+ except Woodcutting (43) and Prayer (23)
- Consider exploring new areas or skills

---
