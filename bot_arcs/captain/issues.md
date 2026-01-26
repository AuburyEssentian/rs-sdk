# Known Issues & Bugs

Collected from 4-hour monitoring session on 2026-01-25.

---

## Server / Infrastructure

| Issue | Symptoms | Frequency | Notes |
|-------|----------|-----------|-------|
| **T1 Protocol Errors** | `T1 - XX,0 - 134,192` logs, connection rejected | 50-100% by end of session | Webclient calls `logout()` on unrecognized packet opcodes |
| **Multiple Java Processes** | Two server PIDs observed (1034, 57974) | Unknown | Possible resource conflict |
| **Server Uptime Degradation** | Connections fail more as server runs longer | Progressive | Server was running 20+ hours |
| **Game Tick Freezing** | `[Health] Game tick frozen for 15s` in logs | Occasional | Causes WebSocket timeouts |

**Recommendation**: Add server health monitoring, auto-restart after N hours

---

## SDK

| Issue | Symptoms | Frequency | Notes |
|-------|----------|-----------|-------|
| **State Sync Failure** | Position shows (0,0), HP shows 0, inventory empty | ~50% of connections | Not actual death - just sync failure |
| **waitForCondition Unreliable** | Times out even when condition should pass | Frequent | Bots switched to polling loops instead |
| **WebSocket Disconnects** | `ConnectionClosedError: Connection closed` | Every 2-5 minutes | Mid-action disconnects |
| **interactNpc Timeout** | Action sent but no response | Occasional | Bot thinks it's still attacking |
| **isAttacking/inCombat Flag** | Returns false while actively fighting | Frequent | Fixed by checking animation ID instead |

**Recommendation**: Add reconnection logic, improve state sync reliability

---

## Browser / Puppeteer

| Issue | Symptoms | Frequency | Notes |
|-------|----------|-----------|-------|
| **Page Crashes** | `Page crashed!` from Puppeteer | Every 5-10 minutes | Random timing |
| **Frame Detached** | `Frame detached` errors | Occasional | During navigation |
| **Resource Contention** | Multiple bots = more crashes | When running 3 bots | Chrome instances fight for memory |
| **useSharedBrowser Issues** | Only works if browser already exists | Always | New browser launches often fail |

**Recommendation**: Single shared browser instance for all bots, or sequential bot execution

---

## Harness / Arc-Runner

| Issue | Symptoms | Frequency | Notes |
|-------|----------|-----------|-------|
| **State Loading Race** | Script starts before state populated | ~30% of runs | Added manual wait loops as workaround |
| **No Reconnection Logic** | Bot aborts on any disconnect | Always | Should auto-retry |
| **Drift Detection at (0,0)** | Thinks bot drifted when state sync fails | When sync fails | Fixed by ignoring 0,0 positions |

**Recommendation**: Built-in state-ready detection, auto-reconnect on transient failures

---

## Script / Strategy Level

| Issue | Symptoms | Frequency | Notes |
|-------|----------|-----------|-------|
| **Long Walks Fail** | Disconnect before reaching destination | Almost always | Walks >30 tiles risky |
| **Banking Route Blocked** | Dark Wizard area on path to Varrock West | Always | Need alternate route or Lumbridge bank |
| **Stair Climbing Broken** | `sendInteract` on stairs does nothing | Always | Floor level doesn't change |
| **General Store Prices** | Hides sell for ~10gp (not 100gp) | Always | Need better sell location |
| **Infinite Drop Loop** | Keeps dropping when threshold wrong | Fixed | Changed BANK_THRESHOLD to 27 |

**Recommendation**: Shorter waypoint paths, avoid multi-floor buildings, find better shops

---

## Priority Matrix

| Priority | Issue | Layer | Effort |
|----------|-------|-------|--------|
| **P0** | T1 Protocol Errors | Server | Unknown |
| **P0** | State Sync Failures | SDK | Medium |
| **P1** | WebSocket Disconnects | SDK/Browser | Medium |
| **P1** | Page Crashes | Browser | Medium |
| **P2** | No Reconnection Logic | Harness | Low |
| **P2** | Long Walk Failures | Script | Low |
| **P3** | Stair Climbing | SDK/Server | Unknown |
| **P3** | Browser Contention | Harness | Medium |

---

## Quick Wins

1. **Kill stale Chrome processes before each run** - improves stability
2. **Run bots sequentially** - avoids resource contention
3. **Use polling instead of waitForCondition** - more reliable
4. **Check animation ID for combat state** - not inCombat flag
5. **Ignore (0,0) positions in drift checks** - false positives from sync failures
