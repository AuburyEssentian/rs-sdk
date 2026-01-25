# Lab Log: Adam_3

A persistent character for long-term progression experiments.

## Character Progress

| Date | Arc | Duration | Score Before | Score After | Delta |
|------|-----|----------|--------------|-------------|-------|
| 01-25 | fishing-basics | 87s | 32 | 42 | +10 |
| 01-25 | fishing-basics | 14s | 42 | 54 | +12 |
| 01-25 | fishing-basics | 45s | 54 | 69 | +15 |
| 01-25 | fishing-basics | 301s | 54 | 66 | +12 |
| 01-25 | (death) | - | 66 | 66 | 0 |
| 01-25 | recovery-restart | 2s | 66 | 30 | -36 |
| 01-25 | wc-fm-lumbridge | 9s | 30 | 62 | +32 |
| 01-25 | wc-fm-lumbridge | 189s | 62 | 113 | +51 |
| 01-25 | wc-fm-lumbridge (multiple) | ~30min | 113 | 139 | +26 |
| 01-25 | mining-lumbridge | 96s | 139 | 168 | +29 |
| 01-25 | fishing-basics | 300s | 184 | 192 | +8 |
| 01-25 | thieving-farmers | 300s | 192 | 192 | +0 | (failed - need lvl 10 thieving for farmers)

---

## Current State

**Total Level**: 192 (WC 53, FM 58, Mining 46, Fishing 9, HP 10, others 1)
**GP**: 0
**Equipment**: None
**Equipment Value**: 0

**Score**: 192

**Inventory**: LOST TOOLS! Only combat gear remains:
- Shortbow, Bronze sword, Wooden shield

**ISSUE 1**: Character lost axe, pickaxe, fishing net, tinderbox - can't train any gathering skills!
**ISSUE 2**: Combat is BROKEN - attack commands sent but no XP gained. Save state corrupted?

**Bank**: Empty

---

## Death & Recovery - 2026-01-25

### What Happened
- Adam_3 died during fishing (cause unknown - possibly dark wizard?)
- Death triggered endless respawn/dialog loop
- Recovery via preset reset ALL progress (skills reset to 1)
- Fishing 37 → 1 (lost all XP)

### Lesson Learned
- `initializeFromPreset` resets EVERYTHING, not just inventory
- Need a smarter recovery method that preserves skill progress
- Or: avoid dying by staying in safe areas

### Plan Forward
- Start fresh with different activity (diversify)
- Try woodcutting or mining near Lumbridge
- Stay away from dark wizards!

---

## Previous Arcs

### fishing-basics (Runs 001-004)
- Reached Fishing level 37 before death
- Best run: +15 levels in 45 seconds
- Dialog handling issues caused some wasted time
- Dark wizard area near Draynor may have caused death
