# Lab Log: Brad_2

Combat + Thieving + Varrock Drip progression character.

## Goal
- Level combat (Attack, Strength, Defence) at Lumbridge cows
- Make GP through thieving (pickpocket men)
- Buy increasingly better armor from Varrock shops

## Character Progress

| Date | Arc | Duration | Score Before | Score After | Delta |
|------|-----|----------|--------------|-------------|-------|
| 2026-01-26 | combat-thief-drip | 10m | 32 | 75 | +43 |

---

## Current State

**Total Level**: 75 (Attack 16, Str 1, Def 1, HP 13, Thieving 45 + base skills)
**GP**: 0
**Equipment**: None equipped (sword in inventory)
**Equipment Value**: 0

**Score**: 75

**Key Skills**:
- Attack: 16
- Strength: 1
- Defence: 1
- Hitpoints: 13
- Thieving: 45

**Inventory**: Shortbow, Bronze sword (UNEQUIPPED!), Wooden shield
**Bank**: Empty

---

## Arc: combat-thief-drip - Run 001 (2026-01-26)

### What Happened
- Thieved men to level 45 Thieving
- Bought Bronze sword from Varrock shop
- **BUG**: Sword was not equipped after purchase
- Trained combat with fists only (no Str/Def XP)
- Only Attack stat leveled since fighting unarmed
- Died to cows (HP went to 0), respawned at Lumbridge
- Lost all coins on death
- **BUG**: Bot sat idle at Lumbridge spawn for last 90 seconds

### Issues Found
1. **Equipment not verified after purchase** - Had sword but never equipped it
2. **No death/respawn recovery** - Script doesn't detect respawn and resume activity
3. **Combat style only trains Attack when unarmed** - No Str/Def without weapon

### Root Cause
The `equipBestGear()` function or shop buying flow didn't properly equip the sword. Need to verify equipment slot is filled after equip action.

### Next Steps
- Fix equipment verification in script
- Add respawn detection and recovery logic
- Re-run after fixes

---

## Arc: combat-thief-drip

### Strategy
1. Start at Lumbridge, walk to cows
2. Train combat until inventory full or HP low
3. When need GP: thieve men in Lumbridge/Varrock
4. When have enough GP: buy gear upgrades in Varrock
5. Equip new gear and return to combat training

### Gear Progression Targets
- Bronze set: ~170 GP (sword 26 + body 80 + legs 65)
- Iron set: ~580 GP (sword 91 + body 280 + legs 210)
- Steel set: ~2075 GP (sword 325 + body 1000 + legs 750)
- Mithril set: ~5395 GP (sword 845 + body 2600 + legs 1950)

---
