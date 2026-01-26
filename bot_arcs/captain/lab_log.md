# Captain Lab Log

## Session: 2026-01-25 (4 hours)

### Summary

Monitored 3 bots for 4 hours with 30-minute check intervals. Respawned all bots 8 times.

### Progress Made

| Bot | Start | End | Delta |
|-----|-------|-----|-------|
| Adam_2 | 328 | 344 | +16 |
| Adam_4 | 268 | 276 | +8 |
| brad_1 | 274 | 281 | +7 |

**Total: +31 levels across all bots**

### Milestones
- brad_1 hit Strength 70 (first to reach target)
- Adam_4 balanced all combat stats at 60
- Adam_2 collected 23 hides ready to bank

### What Worked
- Combat training at cow field
- Style rotation for balanced leveling
- Short runs (2-5 min) complete successfully
- Character state persists between crashes
- Respawn loop kept bots productive

### What Didn't Work
- Long walks disconnect (can't reach bank/shops)
- Browser crashes every 2-5 minutes
- T1 protocol errors blocked connections by end of session
- Running 3 bots simultaneously causes resource contention
- Goal loop stuck at combat phase - never reached gold/gear phases

### Efficiency
~35-45% uptime. Most time lost to crashes and reconnection attempts.

### Root Causes Identified
1. Server running 20+ hours (needs restart)
2. Multiple Chrome browsers fighting for resources
3. WebSocket stability degrades over time

### Recommendations for Next Session
1. Restart game server before starting
2. Run bots one at a time, not parallel
3. Try shorter banking routes (Lumbridge bank vs Varrock)

---

## Session: 2026-01-26 (Continued)

### 05:35 Check-in

| Bot | Status | Score | Key Progress |
|-----|--------|-------|--------------|
| Adam_2 | Running | 346 | ~62 hides collected, near Draynor Bank, still Bronze gear |
| Adam_4 | Running | **301** | **HIT SCORE 300!** Varrock West Bank working, 10+ bank trips |
| brad_1 | Respawned | 311 | Atk 72, Str 77, Def 71 - stuck with full inventory, respawned with gate fix |

### Wins
- **Adam_4 hit Score 300!** Varrock West Bank path confirmed working
- Adam_4 successfully banking 10-20 hides per trip
- Combat stats all above 65 on all bots

### Active Issues
- Adam_2 still working toward 100-hide goal for Al Kharid tanning plan
- All bots still using Bronze gear despite 60+ Attack (gear upgrades blocked by selling issues)

### 05:40 - Brad_1 Banking Success!
- **Banked 18 cowhides** at Varrock West Bank
- Gate fix confirmed working: `ctx.bot.openDoor(/gate/i)` before walking
- Attack 72→73, Total Level 311→312
- Respawned to continue loop
