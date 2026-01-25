# Lab Log: combat-trainer

**Goal**: Maximize Attack + Strength + Defence + Hitpoints levels over 5 minutes.

**Strategy**: Kill goblins near Lumbridge while cycling combat styles for balanced XP gain.

---

## Run 001 - (pending)

**Setup**: LUMBRIDGE_SPAWN preset - standard tutorial-complete items (bronze sword, shield, dagger, axe, arrows, etc.)

### Hypotheses
1. The new combat SDK features (`player.combat`, `npc.inCombat`, `combatEvents`) will help us track combat state effectively
2. Cycling combat styles every 3 kills will provide balanced training across Attack/Strength/Defence
3. 45 second stall timeout should accommodate natural combat lulls

### Testing
- `player.combat.inCombat` - does this accurately reflect when we're fighting?
- `npc.targetIndex` - can we detect if an NPC is already fighting someone else?
- `combatEvents` array - is damage_dealt/damage_taken tracked reliably?
- Combat style switching - does `sendSetCombatStyle()` work?

### Results
**Outcome**: TIMEOUT (ran full 5 minutes)
**Final Stats**: Attack 12, Hitpoints 12, Combat Level 7+ (from level 3!)

### Observations

**GOOD NEWS**: Training actually worked great! XP was gained steadily despite our broken combat tracking.

**SDK Issues Found**:

1. **`npc.hp` and `npc.maxHp` always 0** - NPC health tracking isn't populating. All goblins show `HP: 0/0`. This makes it impossible to detect NPC death by health.

2. **`player.combat.inCombat` unreliable** - Our `waitForCombatEnd()` exits immediately with "lost_target" even while combat is ongoing (proven by XP gains in state snapshots).

3. **`npc.inCombat` false positives** - Getting "already in combat" for goblins that we should be able to attack. May need to check if NPC is targeting US specifically vs someone else.

4. **`combatEvents` not visible in state snapshots** - Can't confirm if damage_dealt/damage_taken events are firing. Need to log these explicitly.

### Root Cause
Our `waitForCombatEnd()` checks `player.combat.inCombat` which returns false almost immediately, causing us to think combat ended when it hasn't. Meanwhile the actual combat continues in the background and we gain XP.

### Fix Ideas
1. Don't rely on `player.combat.inCombat` - instead wait for XP gains or NPC disappearance
2. Add timeout-based combat wait (e.g., wait 5-10 seconds after attack)
3. Track the NPC index and wait for it to disappear from nearbyNpcs
4. Use `combatEvents` array to detect damage being dealt

---

## SDK Feedback

### Combat Status Fields Being Tested

1. **PlayerCombatState** (`player.combat`)
   - `inCombat: boolean` - player has a target
   - `targetIndex: number` - who we're targeting
   - `lastDamageTick: number` - when we last took damage

2. **NearbyNpc combat fields**
   - `hp / maxHp / healthPercent` - NPC health tracking
   - `targetIndex: number` - who the NPC is targeting
   - `inCombat: boolean` - is NPC in combat with anyone

3. **CombatEvent array** (`state.combatEvents`)
   - `type: 'damage_taken' | 'damage_dealt' | 'kill'`
   - `damage: number`
   - `sourceIndex / targetIndex` - who hit who

### Questions Answered
- [x] Is `player.combat.inCombat` reliable? **NO** - returns false even during active combat
- [x] Does `npc.inCombat` correctly indicate when NPCs are fighting? **UNCLEAR** - may have false positives
- [ ] Are combat events being logged correctly? **NEEDS TESTING** - not visible in state snapshots
- [x] Is kill detection working (NPC disappears or HP=0)? **PARTIAL** - NPC disappearance works, but hp/maxHp always 0

---

## SDK Fixes Applied (by Claude)

**Date**: After Run 001 feedback

### Issues Fixed

1. **`player.combat.inCombat` now reliable** ✅
   - **Root cause**: Only checked `targetId !== -1`, which resets between attack animations
   - **Fix**: Now also checks `combatCycle > loopCycle` (400-tick window after any hit)
   - **Test result**: `player.combat.inCombat: true` during combat (was false before)

2. **`npc.inCombat` improved** ✅
   - Same fix applied - uses `combatCycle` in addition to `targetId`

3. **`npc.hp/maxHp` documented** ✅
   - This is expected behavior - server only sends HP data when NPC takes damage
   - Added JSDoc comments explaining: "NOTE: 0 until NPC takes damage"
   - **Test result**: After first hit, health shows correctly (e.g., 7/7 → 6/7 → 5/7)

4. **`npc.combatCycle` field added** ✅
   - New field exposed for scripts to do custom timing logic
   - Value is `tick + 400` when NPC takes damage

5. **`combatEvents` ARE working** ✅
   - Test showed `damage_dealt` events being tracked
   - Note: Damage value may show 0 for misses/blocks

### Code Changes

- `webclient/src/bot/BotSDK.ts:354-358` - Player `inCombat` fix
- `webclient/src/bot/BotSDK.ts:611-619` - NPC `inCombat` fix
- `agent/types.ts` - Added `combatCycle` field and JSDoc docs

### Test Commands

```bash
# Run combat state test
bun test/combat-state.ts

# Run combat events test (more thorough)
bun test/combat-events.ts
```

### Recommended Script Changes

Your `waitForCombatEnd()` should now work better since `player.combat.inCombat` stays TRUE during combat. However, consider also checking:

```typescript
// More robust combat detection
const isInCombat = (): boolean => {
    const state = sdk.getState();
    const pc = state?.player?.combat;
    if (!pc) return false;

    // inCombat is now reliable (uses combatCycle internally)
    return pc.inCombat;
};

// For NPC-specific checks, use combatCycle directly
const npcRecentlyHit = (npc: NearbyNpc, currentTick: number): boolean => {
    return npc.combatCycle > currentTick;
};
```

**Please test and confirm if these fixes resolve your issues!**

---

## Run 002 - 2026-01-25 (after SDK fixes)

**Outcome**: TIMEOUT (ran full 5 minutes) - 8+ kills, **17,490 XP gained!**

### Results

| Metric | Run 001 | Run 002 | Improvement |
|--------|---------|---------|-------------|
| Kills | 1 | 8+ | 8x |
| Total XP | ~1600 | 17,490 | 10x |
| Attack | 0→? | +8,800 | Working |
| Strength | 0 | +4,400 | Working |
| Defence | 0 | 0 | (switched style too late) |
| Hitpoints | +390 | +4,290 | 10x |
| Damage dealt | 0 | 20 | Now tracked |
| Damage taken | 0 | 10 | Now tracked |
| Food eaten | 0 | 1 | Working |
| Looted | 0 | 5 | Working |

### SDK Fixes Verified

1. **`player.combat.inCombat` - FIXED** - Stays true during combat now
2. **`npc.combatCycle` - WORKING** - Reliable combat detection via tick comparison
3. **`combatEvents` - WORKING** - Damage tracking functional
4. **Kill detection - WORKING** - NPC disappearance detected correctly

### Script Fixes Applied

1. Fixed `waitForCombatEnd()` to use `combatCycle` comparison
2. Fixed food regex to not match "fishing net" (`/^(bread|shrimps?|...)$/i`)

### Remaining Issues

1. **HP: 0/0 still showing** - Expected behavior (0 until first damage)
2. **"Timeout waiting to attack"** - Pathing issues, need investigation
3. **"already in combat"** - May be competing with other players/NPCs
4. **Defence XP = 0** - Style switching happened too late in the run

### Next Steps

- Start with Defensive style to get Defence XP
- Better NPC selection (avoid ones being fought by others)
- Log HP values after first hit to confirm tracking
