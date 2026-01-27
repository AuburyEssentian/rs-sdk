# Lab Log: calk_2

**Character Theme**: Desert-focused account centered around Al Kharid

## High-Level Goals

1. **Get to Al Kharid** - Earn 10gp toll (sell shortbow), pass through gate
2. **Level Thieving** - Pickpocket men in Al Kharid for GP (3gp each)
3. **Buy Kebabs** - Cheap food (1gp each) from Karim for sustain
4. **Train Combat** - Fight Al Kharid warriors (level 9) with kebab sustain
5. **Buy Scimitars** - Upgrade weapons at Zeke's shop as Attack levels up

## Key Al Kharid Locations

| Location | Coordinates | Notes |
|----------|-------------|-------|
| Toll Gate | (3268, 3228) | 10gp to enter |
| Bank | (3269, 3167) | Store loot |
| Kebab Shop (Karim) | (3273, 3180) | Dialog-based, 1gp per kebab |
| Scimitar Shop (Zeke) | (3287, 3186) | Bronze to Adamant scimitars |
| Fishing Spots | (3267, 3148) | Safe shrimp fishing |
| Men/Warriors | (3293, 3175) | Thieving/combat targets |

## Scimitar Prices (Zeke's Shop)

| Weapon | Attack Req | Cost |
|--------|------------|------|
| Bronze scimitar | 1 | 32gp |
| Iron scimitar | 5 | 112gp |
| Steel scimitar | 10 | 400gp |
| Mithril scimitar | 20 | 1040gp |
| Adamant scimitar | 30 | 2560gp |

## Progression Strategy

The desert-journey arc will:
1. **Phase 1: Travel** - Sell shortbow at Lumbridge general store, pay 10gp toll, enter Al Kharid
2. **Phase 2: Thieving** - Pickpocket men until ~200gp accumulated
3. **Phase 3: Buy First Scimitar** - Purchase and equip bronze scimitar (32gp)
4. **Phase 4: Combat Training** - Fight warriors, eat kebabs, train combat
5. **Phase 5: Gear Upgrades** - Auto-upgrade scimitars as Attack increases

The script will automatically cycle between activities based on:
- GP level (thieve if low, combat if comfortable)
- HP level (eat kebabs, buy more if out)
- Attack level (buy better scimitar when available)

---

## Character Stats (Starting)
- **All Skills**: Level 1
- **Total Level**: 32 (estimated fresh character)
- **GP**: 0
- **Equipment**: None
- **Position**: Lumbridge spawn (3222, 3218)

---

## Arc History

---

## Arc: desert-journey

### Run 001 - 2026-01-27 01:09

**Duration**: 600s (full 10 minutes)
**Goal**: Complete desert progression in Al Kharid

**Results**: GREAT PROGRESS!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 1 | 37 | **+36** |
| Attack | 1 | 1 | 0 |
| Strength | 1 | 1 | 0 |
| Defence | 1 | 1 | 0 |
| Hitpoints | 10 | 10 | 0 |
| Total Level | 30 | ~66 | **+36** |

**What Happened**:
1. **Phase 1 (Travel)**: Sold shortbow for 20gp at Lumbridge general store, paid 10gp toll, successfully entered Al Kharid
2. **Phase 2 (Thieving)**: Pickpocketed men near palace, gained 36 thieving levels!
3. **Phase 3 (Equipment)**: Bought and equipped bronze scimitar from Zeke
4. **Phase 4 (Combat)**: Started combat training but no XP gained - "I can't reach that!" messages indicate pathfinding issues
5. **Kebab Sustain**: Bought and ate many kebabs successfully

**State After Run**:
- **Position**: (3290, 3174) - near warriors in Al Kharid
- **In Al Kharid**: YES
- **GP**: ~50
- **Thieving**: 37
- **Combat**: All level 1 (no XP gained despite 22 combat attempts)
- **Equipment**: Bronze scimitar

**Technical Notes**:
- Shop keeper NPC name has a space: "Shop keeper" not "Shopkeeper"
- Gate finding needed retry logic
- Combat "kills" counter counting attempts, not actual kills
- "I can't reach that!" suggests NPC is behind obstacles

**Issues to Fix**:
- Combat XP not being gained - investigate why kills don't give XP
- Possibly stuck attacking NPCs through walls

### Next Steps
- [ ] Debug why combat isn't giving XP
- [x] Continue thieving to level 40+
- [ ] Earn GP for iron scimitar upgrade
- [ ] Fix combat pathfinding

---

### Run 002 - 2026-01-27 01:21

**Duration**: 174s (disconnected early - browser error)
**Goal**: Continue progression

**Results**:
- Character had respawned at Lumbridge with 0gp
- Successfully pickpocketed 12gp for toll (no shortbow fallback worked!)
- Re-entered Al Kharid
- **Thieving: 38 → 43** (+5 levels)
- Bought and equipped bronze scimitar
- **Total Level**: 67 → 72 (+5)

**State After Run**:
- **Position**: (3273, 3191) - near Karim in Al Kharid
- **In Al Kharid**: YES
- **GP**: 21
- **Thieving**: 43
- **Equipment**: Bronze scimitar

**Technical Notes**:
- Pickpocket fallback for toll money working perfectly
- Script handles "no shortbow" case now

### Next Steps
- [x] Continue thieving/combat training
- [ ] Earn GP for iron scimitar (112gp) at Attack 5

---

### Run 003 - 2026-01-27 03:40

**Duration**: 600s (full 10 minutes)
**Goal**: Continue combat and thieving training

**Results**: COMBAT IS WORKING!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 43 | 44 | +1 |
| Attack | 1 | 5 | **+4** |
| Strength | 1 | 10 | **+9** |
| Defence | 1 | 1 | 0 |
| Hitpoints | 10 | 12 | +2 |
| Total Level | 72 | ~87 | **+15** |

**Combat Stats**:
- 119 combat engagements
- Combat style rotation working (Accurate/Aggressive/Defensive)
- Many "I can't reach that!" messages - some NPCs are behind obstacles

**State After Run**:
- **Position**: (3290, 3175) - Al Kharid warriors area
- **GP**: 51
- **Thieving**: 44
- **Attack**: 5 (can use Iron scimitar now!)
- **Strength**: 10
- **Defence**: 1
- **Hitpoints**: 12
- **Equipment**: Bronze scimitar

**Key Observations**:
- Combat XP IS being gained now!
- Defence lagging because style rotation favors Attack/Strength
- Ready for Iron scimitar upgrade (need 112gp, have 51gp)
- Kebab sustain working well

### Next Steps
- [ ] Earn ~61 more GP (thieve or combat)
- [ ] Buy Iron scimitar (Attack 5 requirement met!)
- [ ] Continue to Attack 10 for Steel scimitar

---

### Run 004 - 2026-01-27 03:52

**Duration**: 600s (full 10 minutes)
**Goal**: Continue combat training

**Results**:
- Starting state showed Atk 1, Str 1, Def 1 (save state didn't persist last run's progress)
- **Attack: 1 → 5** (+4)
- **Strength: 1 → 5** (+4)
- **Defence**: 1 (no change - style rotation issue)
- **Hitpoints**: 10 → 11 (+1)
- 123 combat engagements
- Many "I can't reach that!" messages - combat area has obstacles

**State After Run**:
- **Position**: Near warriors area
- **GP**: 50
- **Thieving**: 44
- **Attack**: 5
- **Strength**: 5
- **Defence**: 1
- **Hitpoints**: 11
- **Equipment**: Bronze scimitar

**Issues Identified**:
1. Save state not persisting combat levels between runs
2. Excessive "I can't reach that!" - combat area has many obstacles
3. Defence not training (style rotation weighted toward Attack/Strength)

---

### Run 005 - 2026-01-27 04:09

**Duration**: 600s (full 10 minutes)
**Goal**: Continue combat training

**Results**: DEFENCE TRAINING SUCCESS!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 44 | 44 | 0 |
| Attack | 5 | 5 | 0 |
| Strength | 5 | 10 | **+5** |
| Defence | 1 | 13 | **+12** |
| Hitpoints | 11 | 15 | **+4** |
| Total Level | 82 | ~99 | **+17** |

**Combat Stats**:
- 102+ combat engagements
- Style rotation working well - Defence finally catching up!
- Kebab sustain loop working perfectly

**State After Run**:
- **Position**: Near warriors area in Al Kharid
- **GP**: 52
- **Thieving**: 44
- **Attack**: 5
- **Strength**: 10
- **Defence**: 13
- **Hitpoints**: 15
- **Equipment**: Bronze scimitar

**Key Observations**:
- Defence trained from 1 → 13 in one run!
- Strength caught up to 10
- Combat is stable - character surviving well with kebab sustain
- Still seeing "I can't reach that!" but combat progressing despite it

### Next Steps
- [x] Defence is now catching up (1 → 13)
- [ ] Attack still at 5 - need more Accurate style time
- [ ] Need ~60 more GP for Iron scimitar (112gp)
- [ ] Continue to Attack 10 for Steel scimitar (400gp)

---

---

### Run 006 - 2026-01-27 04:22

**Duration**: 600s (full 10 minutes)
**Goal**: Optimized combat training - fixed style rotation & relocation

**Optimizations Applied**:
1. Changed combat area to (3285, 3175) - more open
2. Weighted style rotation 50% Attack (was lagging)
3. Added "can't reach" detection → auto-relocate

**Results**: HUGE ATTACK GAINS!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 44 | 45 | +1 |
| Attack | 5 | 27 | **+22** |
| Strength | 12 | 12 | 0 |
| Defence | 13 | 19 | **+6** |
| Hitpoints | 15 | 23 | **+8** |
| Total Level | 105 | ~141 | **+36** |

**Combat Stats**:
- 93 kills
- Attack-weighted rotation working perfectly
- Relocation helping with obstacles

**State After Run**:
- **Position**: Near combat area in Al Kharid
- **GP**: 52
- **Thieving**: 45
- **Attack**: 27 (can use Mithril scimitar at 20!)
- **Strength**: 12
- **Defence**: 19
- **Hitpoints**: 23
- **Equipment**: Bronze scimitar (need to upgrade!)

**Key Observations**:
- Attack-weighted rotation caught Attack up massively
- Still some "can't reach" spam but combat progressing
- **READY for Mithril scimitar** (1040gp needed, have 52gp)
- Could buy Steel scimitar now (400gp needed)

### Next Steps
- [ ] Earn GP for Steel scimitar (400gp) or Mithril (1040gp)
- [ ] Attack at 27 - continue to 30 for Adamant, 40 for Rune
- [ ] Balance Strength (lagging at 12)

---

---

### Run 007 - 2026-01-27 04:33

**Duration**: 600s (full 10 minutes)
**Goal**: Thieving for GP → scimitar upgrades

**Results**: DOUBLE SCIMITAR UPGRADE!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 45 | 56 | **+11** |
| Attack | 27 | 27 | 0 |
| Strength | 12 | 12 | 0 |
| Defence | 19 | 19 | 0 |
| Hitpoints | 23 | 23 | 0 |
| Total Level | 142 | ~153 | **+11** |

**Equipment Upgrades**:
- Bronze → Iron scimitar (112gp) ✓
- Iron → Steel scimitar (400gp) ✓

**State After Run**:
- **GP**: 60
- **Thieving**: 56
- **Attack**: 27
- **Strength**: 12
- **Defence**: 19
- **Hitpoints**: 23
- **Equipment**: Steel scimitar!

**Key Observations**:
- Thieving very efficient at 45+ with high success rate
- Two scimitar upgrades in one run
- Steel scimitar will significantly boost combat damage

### Next Steps
- [ ] Combat with Steel scimitar
- [ ] Balance Strength (still at 12)
- [ ] Save for Mithril scimitar (1040gp)

---

---

### Run 008 - 2026-01-27 04:44

**Duration**: 360s (6 minutes - browser disconnected early)
**Goal**: Combat with Steel scimitar, Strength-weighted rotation

**Results**: STRENGTH CATCHING UP!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 57 | 57 | 0 |
| Attack | 27 | 33 | **+6** |
| Strength | 19 | 26 | **+7** |
| Defence | 19 | 21 | +2 |
| Hitpoints | 24 | 28 | +4 |
| Total Level | 154 | 181 | **+27** |

**Combat Stats**:
- 53 kills in 6 minutes
- Steel scimitar making combat much faster
- Strength-weighted rotation working

**State After Run**:
- **GP**: 101
- **Thieving**: 57
- **Attack**: 33 (3 away from Adamant!)
- **Strength**: 26
- **Defence**: 21
- **Hitpoints**: 28
- **Equipment**: Steel scimitar

**Technical Notes**:
- Browser disconnected at 6 minutes (transient error)
- Progress was saved

### Next Steps
- [ ] Get Attack to 30 for Adamant scimitar (2560gp needed)
- [ ] Continue balancing Strength
- [ ] Save GP for Mithril (1040gp) or Adamant (2560gp)

---

---

### Run 009 - 2026-01-27 04:50

**Duration**: 600s (full 10 minutes)
**Goal**: Combat with Steel scimitar, Strength-weighted rotation

**Results**: HUGE STRENGTH & DEFENCE GAINS!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 57 | 57 | 0 |
| Attack | 33 | 35 | +2 |
| Strength | 29 | 39 | **+10** |
| Defence | 21 | 33 | **+12** |
| Hitpoints | 29 | 36 | +7 |
| Total Level | 181 | ~212 | **+31** |

**Combat Stats**:
- 82 kills
- Strength rotation very effective
- Combat very efficient with Steel scimitar

**State After Run**:
- **GP**: 102
- **Thieving**: 57
- **Attack**: 35
- **Strength**: 39 (1 away from 40 goal!)
- **Defence**: 33
- **Hitpoints**: 36
- **Equipment**: Steel scimitar

**Key Observations**:
- Strength 39 - almost at goal of 40!
- Defence caught up massively (21→33)
- Attack lagging now (35 vs 39/33)
- Ready for Mithril scimitar (need 1040gp)

### Next Steps
- [ ] Attack needs catch-up (35 vs Str 39, Def 33)
- [ ] Thieve for Mithril/Adamant scimitar
- [ ] Strength almost at 40 goal

---

---

### Run 010 - 2026-01-27 05:01

**Duration**: 600s (full 10 minutes)
**Goal**: Combat with Attack-weighted rotation

**Results**: GOALS NEARLY ACHIEVED!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 57 | 57 | 0 |
| Attack | 44 | 48 | +4 |
| Strength | 39 | 41 | +2 |
| Defence | 33 | 39 | **+6** |
| Hitpoints | 39 | 43 | +4 |
| Total Level | 224 | ~240 | +16 |

**Combat Stats**:
- 109 kills
- Attack rotation effective
- All combat stats near/above 40!

**State After Run**:
- **GP**: 100
- **Thieving**: 57
- **Attack**: 48 ✓ (goal was 40)
- **Strength**: 41 ✓ (goal was 40)
- **Defence**: 39 (1 away from 40!)
- **Hitpoints**: 43
- **Equipment**: Steel scimitar

**GOALS STATUS**:
- Attack 40: ✓ ACHIEVED (48)
- Strength 40: ✓ ACHIEVED (41)
- Defence 40: 39/40 (1 more level!)
- Thieving 40: ✓ ACHIEVED (57)

### Next Steps
- [ ] Defence just needs 1 more level to hit 40!
- [ ] All goals nearly complete!
- [ ] Consider Mithril scimitar upgrade (1040gp)

---

---

### Run 011 - 2026-01-27 05:12

**Duration**: 314s (5.2 minutes - browser disconnected)
**Goal**: Final push - Defence to 40

**Results**: ALL GOALS ACHIEVED!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Thieving | 57 | 57 | 0 |
| Attack | 48 | 48 | 0 |
| Strength | 44 | 45 | +1 |
| Defence | 41 | 42 | +1 |
| Hitpoints | 45 | 46 | +1 |
| Total Level | 248 | 254 | +6 |

**State After Run**:
- **GP**: 102
- **Thieving**: 57
- **Attack**: 48
- **Strength**: 45
- **Defence**: 42
- **Hitpoints**: 46
- **Equipment**: Steel scimitar

## GOALS COMPLETE!

| Goal | Target | Achieved |
|------|--------|----------|
| Attack | 40 | 48 ✓ |
| Strength | 40 | 45 ✓ |
| Defence | 40 | 42 ✓ |
| Thieving | 40 | 57 ✓ |

---

### Current Character Summary

**calk_2** - Desert-focused Al Kharid character

**Combat Stats**:
- Attack: 48 ✓
- Strength: 45 ✓
- Defence: 42 ✓
- Hitpoints: 46
- Thieving: 57 ✓

**Total Level**: 254
**GP**: 102
**Equipment**: Steel scimitar

**ALL GOALS ACHIEVED!**

**Progression Score** (Total Level + GP + Equipment Value):
- Total Level: 254
- GP: 102
- Equipment Value: ~400 (Steel scimitar)
- **Total Score**: ~756

---

## Arc Complete Summary

**calk_2** completed the desert-journey arc over 11 runs:

| Run | Duration | Key Progress |
|-----|----------|--------------|
| 001 | 10m | Entered Al Kharid, Thieving 1→37 |
| 002 | 3m | Thieving 38→43 |
| 003 | 10m | Combat working, Atk 1→5, Str 1→10 |
| 004 | 10m | Combat training |
| 005 | 10m | Defence 1→13, Strength 5→10 |
| 006 | 10m | Attack 5→27 (optimizations) |
| 007 | 10m | Thieving 45→56, Bronze→Iron→Steel scimitar |
| 008 | 6m | Attack 27→33, Strength 19→26 |
| 009 | 10m | Strength 29→39, Defence 21→33 |
| 010 | 10m | Attack 44→48, Defence 33→39 |
| 011 | 5m | Defence 41→42, ALL GOALS ACHIEVED |

**Total Runtime**: ~94 minutes
**Starting Stats**: All level 1
**Final Stats**: Attack 48, Strength 45, Defence 42, Hitpoints 46, Thieving 57

---

## Phase 2: Towards 60/60/60

**New Goals**: Attack 60, Strength 60, Defence 60, Thieving 70, Adamant scimitar

### Phase 2 Progress (Multiple Short Runs)

Due to browser instability, runs are shorter but progress is persisting.

**Equipment Upgrades**:
- Steel → Mithril scimitar (1040gp) ✓

**Current State**:
- Attack: 48
- Strength: 45
- Defence: 44
- Hitpoints: 46
- Thieving: 69
- GP: ~800
- Equipment: Mithril scimitar
- Total Level: ~268

**GP for Adamant**: Need 2560gp, have ~800 (need ~1760 more)
