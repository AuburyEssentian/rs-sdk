# Lab Log: fletching-gp

Goal: Maximize GP earned from fletching unstrung bows and selling them within 5 minutes.

## Strategy Overview

**Approach**: Chop -> Fletch -> Sell cycle
- Chop normal trees near Lumbridge for logs
- Fletch logs into best available product based on Fletching level:
  - Level 1-4: Arrow shafts (15 per log, 5 XP)
  - Level 5+: Shortbow (u) (1 per log, 5 XP)
- Sell products at Lumbridge general store
- Track total GP earned

**Starting conditions**: Bronze axe, knife, position near Lumbridge trees

**Key metrics**:
- Total GP earned (primary reward signal)
- Logs chopped
- Items fletched
- Items sold
- Final Fletching level

---

## Run 005 - 2026-01-25 02:35 (Current Best)

**Outcome**: timeout (but successful cycles)
**Duration**: 5m 0s
**GP Earned**: 25 GP (shop saturated from previous runs)
**Best Single Run**: 76 GP (when shop was fresh)

### Configuration
- Start: Level 5 Fletching
- Batch size: 6 logs
- Sell threshold: 6 items

### Results
- 2 complete sell cycles
- Reached Fletching level 23
- 12 shortbows sold

### Key Finding: Shop Saturation
Shop prices depend on current stock:
- **Fresh shop**: 9,8,7,7,6,6 GP = 43 GP per 6 bows
- **Saturated shop**: 2,2,2,2,2,2 GP = 12 GP per 6 bows

The Lumbridge General Store retains stock between runs, causing prices to drop over time. Best results occur when the shop has no shortbows in stock.

### What Works Well
1. Starting at level 5 skips worthless arrow shafts
2. 6-bow batches balance efficiency and frequency
3. GP-based success detection in sell loop is reliable
4. Walking away from stuck shop recovers gracefully

---

## Run 001 - 2026-01-25 00:43

**Outcome**: timeout
**Duration**: 5m 0s
**GP Earned**: 0

### What Happened
- Chopped 16 logs successfully
- Fletched 16 times, reached Fletching level 28
- Sold 240 arrow shafts total
- Completed 2 full chop->fletch->sell cycles

### Metrics
- Logs chopped: 16
- Items fletched: 16
- Items sold: 240
- Final Fletching level: 28

### Issues Found

1. **fletchLogs() product selection bug**: Even when calling `fletchLogs("short bow")`, the function creates Arrow shafts. The dialog option selection isn't working correctly.
   - Evidence: Events show `"method":"fletchLogs","args":["short bow"]` returning `"product":{"name":"Arrow shaft"}`
   - Root cause: The product pattern matching or dialog click sequence isn't selecting the right option

2. **Arrow shafts sell for 0 GP**: The Lumbridge general store gives 0 coins for arrow shafts.
   - Evidence: Sold 240 arrow shafts, GP earned stayed at 0
   - Need to sell shortbows or longbows (which are worth more) to earn GP

3. **Shop closing stuck**: `closeShop()` consistently times out and requires walking away to force close.
   - Workaround: Added retry limit and walk-away fallback

4. **Level-up dialogs blocking**: Frequent level-up dialogs (from rapid XP gain) interfere with fletching and need to be dismissed.
   - Workaround: Added dialog dismissal loops before key operations

### Root Cause Analysis

The primary failure is that **we cannot make shortbows** due to the `fletchLogs()` product selection bug. Since arrow shafts are worthless at the general store, we earn 0 GP regardless of how many we sell.

### Fixes Needed

1. **Fix fletchLogs() in bot-actions.ts**: The dialog option selection logic needs to properly click the shortbow/longbow option before clicking Ok. The current implementation falls through to making arrow shafts.

2. **Alternative shop**: Try selling at a different shop that buys arrow shafts for GP, or fix the bow creation to sell bows instead.

### What Worked Well

- Script structure and cycle logic is correct
- Chopping logs works reliably (~6-8 logs per minute with bronze axe)
- Fletching arrow shafts works (just not bows)
- Selling to shop works (just for 0 GP)
- Walking away to force-close stuck shops is effective
- Reached level 28 Fletching in 5 minutes (good XP rate!)

---

## Next Steps

1. Investigate and fix the `fletchLogs()` product selection bug in bot-actions.ts
2. Once fixed, verify shortbows sell for GP at general store
3. Consider starting with oak logs near a different location for higher-value products
4. Optimize batch sizes based on travel time vs. crafting time

---

## Technical Notes

### Inventory Structure
- Logs don't stack - each is a separate inventory item with count=1
- Arrow shafts DO stack - one item with count=15 per log
- Shortbow (u) doesn't stack - one item per bow

### XP Rates (observed)
- Arrow shafts: ~750 XP per fletch action (server has boosted rates?)
- Reached level 24 from 1 in first 8 fletches

### Shop Behavior
- General store at (3212, 3246) buys most items
- Arrow shafts sell for 0 GP (possibly server-specific)
- Shop interface sometimes gets stuck open

---

## Learnings

### 1. Strategic Findings

**What Worked:**
- **Batch size of 6 logs** is optimal - small enough for frequent sell cycles, large enough to minimize travel overhead
- **Starting at Fletching level 5** skips worthless arrow shafts and goes straight to shortbows (5-9 GP each)
- **GP-based success detection** in sell loop is more reliable than trusting `sellToShop()` return values
- **Walking away from stuck shop** is an effective recovery mechanism - the shop closes when you leave the area
- **Dismissing dialogs before operations** prevents blocking - level-up dialogs appear frequently with boosted XP rates

**What Didn't Work:**
- **Smaller batches (4 logs)** earned less total GP despite more sell cycles - overhead of walking to shop dominates
- **Arrow shafts as a product** - worthless at general stores (0 GP), waste of the first log at level 1
- **Relying on sellToShop success field** - reports false failures even when sales succeed
- **Large batches (8+ logs)** - risk timeout before completing sell cycle

**Game Mechanics Insights:**
- Shop prices decrease as stock increases (9 GP first bow → 2 GP when saturated)
- Shop stock persists between game sessions/runs - not reset per character
- Logs don't stack in inventory (each is count=1), but arrow shafts do stack (count=15 per log)
- Shortbows don't stack (each is count=1)

### 2. Process & Tooling Reflections

**What Made Debugging Easier:**
- The `events.jsonl` with action results was invaluable for tracing sell failures
- State snapshots showing inventory contents helped verify fletching was working
- Adding inline `ctx.log()` for decision points ("Selling X items...", "Fletching into Y...")
- The fletchLogs debug output showing dialog options and click targets

**What Made Debugging Harder:**
- State snapshots don't include shop data (shop.isOpen, shop.playerItems) - had to infer from action results
- No easy way to see "current state" at a specific timestamp - have to grep through events
- Screenshot interval (30s) too sparse to catch UI state issues
- Hard to distinguish "script bug" vs "SDK bug" vs "game mechanics" when things fail

**Suggestions for Improvement:**
- Add shop state to compactState() in script-runner for better visibility
- Consider a "verbose mode" that logs state on every decision branch
- Tool to replay events.jsonl with timeline visualization would help
- Add GP tracking to state snapshots (coins count)

### 3. SDK Issues & Gaps

**Functions That Don't Work As Expected:**
- `sellToShop()` returns `success: false` even when the sale succeeds (GP increases). Had to add GP-based success detection as workaround.
- `closeShop()` times out even after calling `sendCloseShop()` - the shop.isOpen flag doesn't update. Required walk-away workaround.
- `fletchLogs()` initially had product selection bug (fixed during this run) - was always making arrow shafts regardless of product parameter.

**Missing Functionality:**
- No `getShopStock()` or way to check current shop prices before selling
- No way to check if shop will buy an item without attempting the sale
- No `waitForShopClose()` with force-close option
- Missing higher-tier axes in Items constants (only BRONZE_AXE defined)

**API Design Issues:**
- `sellToShop()` should use GP change as success signal internally, not rely on count change timing
- Shop closing should have a "walk away" fallback built-in after N retries
- `fletchLogs()` dialog handling was fragile - should be more robust to dialog structure changes

**Workarounds That Shouldn't Be Necessary:**
- Checking GP before/after sell to detect success
- Walking away to force-close stuck shops
- Manual dialog dismissal loops before fletching
- Retry counters to escape stuck states
