# Lab Log: Adam_4

Fresh combat character created after Adam_3's combat broke.

## Character Progress

| Date | Arc | Duration | Score Before | Score After | Delta |
|------|-----|----------|--------------|-------------|-------|
| 01-25 | combat-money | 300s | 30 | 78 | +48 |
| 01-25 | combat-money | 71s | 78 | 86 | +8 |
| 01-25 | combat-money | 301s | 87 | 157 | +70 |
| 01-25 | combat-money | 300s | 157 | 179 | +22 |
| 01-25 | combat-money | 197s | 179 | 182 | +3 | (loot fix - now collecting coins!)
| 01-25 | combat-money | 300s | 182 | 185 | +3 |
| 01-25 | combat-money | 262s | 185 | 191 | +6 |
| 01-25 | combat-money | 300s | 191 | 194 | +3 |
| 01-25 | cowhide-training | 184s | 194 | 197 | +3 | (cows much better - 31 hides collected!)

---

## Current State

**Total Level**: 197 (Atk 44, Str 57, Def 30, HP ~16 + others 1)
**GP**: 19
**Equipment**: Bronze dagger (equipped)
**Equipment Value**: ~0

**Score**: 197 + 19 = 216

**Inventory**: Starting kit + dagger equipped + 19 coins + cowhides (dropped)

---

## Notes

- Created because Adam_3's combat was broken (attack commands sent but no XP gained)
- Combat working well - Strength 1→34 in 5 minutes
- Combat style rotation implemented (Strength → Attack → Defence)
- **FIXED**: Loot pickup now works - was using `nearbyLocs` instead of `groundItems`
- Goblins drop small amounts of coins (5-20 at a time)

## Issues Observed

- Frequent dialog dismissals during combat (random events?)
- Browser disconnection after ~3 minutes sometimes
