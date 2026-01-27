# Lab Log: calk

**Character Theme**: Desert-focused account centered around Al Kharid

## High-Level Goals

1. **Get to Al Kharid** - Earn 10gp toll (sell shortbow), pass through gate
2. **Level Thieving** - Pickpocket men/warriors in Al Kharid for GP
3. **Buy Kebabs** - Cheap food (1gp each) from Karim for sustain
4. **Train Combat** - Al Kharid warriors, or goblins nearby
5. **Buy Scimitars** - Upgrade weapons at Zeke's shop as Attack levels up

## Key Al Kharid Locations

| Location | Coordinates | Notes |
|----------|-------------|-------|
| Toll Gate | (3268, 3228) | 10gp to enter |
| Bank | (3269, 3167) | Store loot |
| Kebab Shop (Karim) | (3273, 3180) | Dialog-based, 1gp per kebab |
| Scimitar Shop (Zeke) | (3287, 3186) | Bronze to Adamant scimitars |
| Fishing Spots | (3267, 3148) | Safe shrimp fishing |
| Men/Warriors | (3293, 3175) | Thieving targets |

## Scimitar Prices (Zeke's Shop)

| Weapon | Attack Req | Cost |
|--------|------------|------|
| Bronze scimitar | 1 | 32gp |
| Iron scimitar | 5 | 112gp |
| Steel scimitar | 10 | 400gp |
| Mithril scimitar | 20 | 1040gp |
| Adamant scimitar | 30 | 2560gp |

## Progression Plan

### Phase 1: Get to Al Kharid
- [ ] Sell shortbow at Lumbridge General Store (20gp)
- [ ] Walk to Al Kharid toll gate (3268, 3228)
- [ ] Pay 10gp toll, enter Al Kharid
- [ ] Walk to kebab shop or bank area

### Phase 2: Establish Thieving Loop
- [ ] Pickpocket men near palace for GP (3gp per success)
- [ ] Buy kebabs when HP low (1gp each)
- [ ] Bank excess GP periodically
- [ ] Target: Thieving level 25 (Warriors unlock)

### Phase 3: Buy First Scimitar
- [ ] Once 112gp+ saved, buy Iron scimitar from Zeke
- [ ] Equip and start combat training

### Phase 4: Combat + Thieving Loop
- [ ] Train combat on Al Kharid warriors or nearby NPCs
- [ ] Use kebabs for healing
- [ ] Thieve when low on GP
- [ ] Buy scimitar upgrades as Attack levels increase

### Phase 5: Long-term Goals
- [ ] Attack/Strength/Defence 40+
- [ ] Thieving 40+
- [ ] Adamant scimitar equipped

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

## Arc: get-to-alkharid

### Run 001 - 2026-01-26 23:06

**Duration**: ~60s (short travel arc)
**Goal**: Travel from Lumbridge to Al Kharid

**Results**:
- Sold shortbow at Lumbridge General Store for 20gp
- Paid 10gp toll at Al Kharid gate
- Successfully entered Al Kharid!
- Walked to kebab shop area (Karim at 3273, 3180)

**State After Run**:
- **Position**: (3273, 3180) - at kebab shop in Al Kharid
- **In Al Kharid**: YES
- **GP**: 10 (20 - 10 toll)
- **Total Level**: 30
- **Thieving**: 1

**Inventory**: Bronze axe, Tinderbox, Small fishing net, Shrimps, Bucket, Pot, Bread, Bronze pickaxe, Bronze dagger, Bronze sword, Wooden shield, Bronze arrows (25), Air runes (25), Mind runes (15), Water runes (6), Earth runes (4), Body runes (2)

**Technical Notes**:
- Toll gate dialog pattern: Click through "Continue" options until "Yes, ok." appears
- CRITICAL: Use `sendWalk()` not `bot.walkTo()` for walking through the gate after paying
- Gate position: (3268, 3227), walk to (3277, 3227) after paying

### Next Steps
- [x] Phase 1 complete: In Al Kharid with 10gp
- [ ] Start thieving training on men/guards
- [ ] Buy kebabs when GP accumulates
- [ ] Eventually buy first scimitar from Zeke

---

## Arc: alkharid-thieving

### Run 001 - 2026-01-26 23:08

**Duration**: 292s (~5 minutes)
**Goal**: Train thieving, earn GP, use kebabs

**Results**: AMAZING PROGRESS!
- **Thieving: 1 → 43** (+42 levels!)
- **GP Earned**: 189gp (had 200gp at end)
- **Total Level**: 30 → 72 (+42)
- **Pickpocket Attempts**: 86
- **Success Rate**: 73%
- **Kebabs Bought**: 5
- **Kebabs Eaten**: 8 (plus starting shrimps/bread)

**State After Run**:
- **Position**: (3269, 3167) - Al Kharid bank
- **Thieving**: 43
- **GP**: 200 (about to bank)
- **Total Level**: 72

**Technical Notes**:
- Script errored when trying to bank (fixed `ctx.bot.openBank()` → use SDK banker directly)
- Kebab buying dialog works perfectly
- Auto-eating working well
- Men pickpocketing gives ~3gp each
- At level 25+ could target Warriors for 18gp each but Men were working great

**Key Learnings**:
- Thieving XP is FAST: 1→43 in 5 minutes!
- Kebab sustain loop works: buy 1gp kebabs when low
- Banking threshold of 200gp is good

### Next Steps
- [x] Fix banking function
- [ ] Run longer thieving session
- [ ] Buy Iron scimitar (112gp) when ready for combat
- [ ] Consider switching to Warriors at level 25+

---

### Run 002 - 2026-01-26 23:52

**Duration**: 600s (full 10 minutes)
**Goal**: Continue thieving, earn more GP

**Results**:
- **Thieving: 43 → 54** (+11 levels)
- **GP: 200 → 621** (+421 GP earned)
- **Total Level**: 72 → 83 (+11)
- **Pickpocket Success Rate**: ~70%
- **Kebabs Bought**: 9
- **Kebabs Eaten**: ~20

**State After Run**:
- **Position**: Near kebab shop (3274, 3180)
- **Thieving**: 54
- **GP**: 621
- **Total Level**: 83

**Key Observations**:
- Script now properly walks to men location (3293, 3175)
- Kebab sustain loop working well
- ~3gp per successful pickpocket
- Banking disabled to avoid stuck loop

**Ready for Next Phase**: Have 621 GP - can afford Steel scimitar (400gp)!

---

## Arc: buy-scimitar

### Run 001 - 2026-01-27 00:05

**Duration**: ~30s (quick shopping arc)
**Goal**: Buy and equip best affordable scimitar

**Results**:
- Opened Zeke's shop successfully
- Bought **Bronze scimitar** (32gp)
- Equipped it immediately
- **GP: 636 → 604** (-32gp)

**State After Run**:
- **Position**: (3287, 3186) - Zeke's shop
- **Attack**: 1 (need 5 for Iron, 10 for Steel)
- **GP**: 604
- **Equipment**: Bronze scimitar equipped

**Zeke's Shop Stock**:
- Bronze scimitar (32gp) - Attack 1
- Iron scimitar (112gp) - Attack 5
- Steel scimitar (400gp) - Attack 10
- Mithril scimitar (1040gp) - Attack 20

**Technical Notes**:
- Shop items are in `shop?.shopItems`, NOT `shop?.items`
- Zeke uses "Trade" option, not "Talk"

### Next Steps
- [x] Train Attack to 5 to use Iron scimitar
- [x] Buy Iron scimitar when Attack 5+
- [x] Continue training to Attack 10 for Steel
- [x] Train Strength/Defence alongside Attack

---

## Arc: alkharid-combat

### Run 001 - 2026-01-27 00:07

**Duration**: 600s (full 10 minutes)
**Goal**: Train combat skills with kebab sustain

**Results**: MASSIVE PROGRESS!

| Stat | Start | End | Gain |
|------|-------|-----|------|
| Attack | 1 | 18 | **+17** |
| Strength | 1 | 32 | **+31** |
| Defence | 1 | 10 | **+9** |
| Hitpoints | 10 | 25 | **+15** |
| Total Level | 84 | ~156 | **+72** |

**Combat Stats**:
- **Kills**: 137 (mostly Al-Kharid warriors)
- **Combat Level**: ~32
- **GP**: 604 → 89 (spent on upgrades)

**Weapon Progression** (auto-upgrade feature worked!):
1. Bronze scimitar (start)
2. Iron scimitar (at Attack 5)
3. **Steel scimitar** (at Attack 10) - currently equipped!

**State After Run**:
- **Position**: (3295, 3174) - Al Kharid warriors area
- **Attack**: 18
- **Strength**: 32
- **Defence**: 10
- **Hitpoints**: 25
- **GP**: 89
- **Equipment**: Steel scimitar

**Key Observations**:
- Combat style cycling works: Accurate → Aggressive → Aggressive → Defensive
- Kebab sustain sufficient for warriors
- Auto-upgrade bought Iron then Steel scimitar without issues
- Fighting warriors is efficient XP

**Next Goals**:
- [ ] Train Defence higher (currently lagging at 10)
- [ ] Earn more GP for Mithril scimitar (1040gp, Attack 20)
- [ ] Continue combat to Attack 20+ for Mithril upgrade
- [ ] Consider training Thieving more for GP

---

## Current Character Summary

**calk** - Desert-focused Al Kharid character

**Combat Stats**:
- Attack: 18
- Strength: 32
- Defence: 10
- Hitpoints: 25
- Thieving: 54

**Total Level**: ~156
**GP**: 89
**Equipment**: Steel scimitar

**Progression Score** (Total Level + GP + Equipment Value):
- Total Level: 156
- GP: 89
- Equipment Value: ~400 (Steel scimitar)
- **Total Score**: ~645

---

