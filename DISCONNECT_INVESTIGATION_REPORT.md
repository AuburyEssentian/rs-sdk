# Bot Disconnect Investigation Report

**Date:** 2026-01-25
**Status:** Investigation Complete - Candidates Identified

---

## TL;DR

**Primary Finding**: The 15-second tick freeze detection is working correctly - it's detecting when the game server stops sending tick updates. The root cause is upstream: either the game server freezing, T1 protocol errors causing client logout, or browser crashes.

**Your Three Theories:**
1. **Idle timeout overfiring** - Likely the webclient's 5-second `idleNetCycles` timeout (see Candidate 4)
2. **Bot script stuck** - Partially supported, but the script waits correctly; issue is no tick updates arriving
3. **Contention issues** - Strongly supported: server uptime degradation, multiple Java processes, T1 protocol errors

---

## Key Timeout Values Found

| Location | Timeout | Purpose |
|----------|---------|---------|
| `TcpServer.ts:19` | **30,000ms** | TCP socket idle timeout |
| `sdk.ts:61` | **30,000ms** | SDK action timeout (configurable) |
| `script-runner.ts:431` | **15,000ms** | Tick freeze detection threshold |
| `sdk.ts:93-96` | **10,000ms** | WebSocket connection timeout |
| `Client.ts:3533` | **5,000ms** | Webclient idle reconnect (250 cycles × 20ms) |
| `browser.ts:75` | **120,000ms** | Puppeteer protocol timeout |

---

## State Update Flow (Critical Path)

```
Game Server (Java)
    ↓ (every 600ms game tick)
Game Client (Browser/WebSocket)
    ↓ (forwards to gateway)
Gateway
    ↓ (WebSocket to SDK)
SDK
    ↓ (stored in state)
script-runner polls state every 10 seconds
    ↓
ConnectionHealthMonitor checks if tick changed
    ↓ (if no change for 15s)
"Game tick frozen" error thrown
```

**Key insight**: The tick freeze detection at `script-runner.ts:305` is working correctly. It detects when no new ticks arrive. The question is: **why do ticks stop arriving?**

---

# Candidate Root Causes

## Candidate 1: T1 Protocol Mismatch (HIGH CONFIDENCE)

**What happens:**
- Server sends packet with unrecognized opcode
- Webclient reaches fallback at `Client.ts:9081`
- Logs: `T1 - {opcode},{size} - {prev_opcode1},{prev_opcode2}`
- Immediately calls `logout()` → closes WebSocket

**Evidence:**
- Issues.md: "T1 - XX,0 - 134,192" logs observed
- 50-100% T1 error rate by end of 4-hour session
- Server was running 20+ hours

**Root cause hypothesis:**
- Server/client version mismatch
- Server sends new packet types that old webclient doesn't recognize
- OR memory corruption causes garbage opcodes

**Tests:**
1. Check if webclient and engine are on same commit
2. Add logging before T1 error to dump full packet buffer
3. Check if specific opcodes are always unrecognized (version) vs random (corruption)

**File:** `webclient/src/client/Client.ts:9081`

---

## Candidate 2: Game Loop Blocking (MEDIUM CONFIDENCE)

**What happens:**
- World.cycle() takes longer than 420ms tick rate
- Tick counter doesn't increment
- Clients don't receive state updates
- Script-runner detects "tick frozen"

**Evidence:**
- Logs show tick numbers repeating across state snapshots
- Game tick frozen for 15-17s observed in multiple runs

**Potential blockers (in order of suspicion):**
1. **rsbuf.computePlayer()** - synchronous WASM for every player (line 1040-1117)
2. **Pathfinding** - `pathToTarget()` for every player with movement
3. **Script execution** - `ScriptRunner.execute()` with no timeout
4. **Build area rebuild** - `rebuildNormal()` called every cycle per player

**Tests:**
1. Enable `NODE_DEBUG_PROFILE` to see tick timing: `tick N: Xms/420 ms`
2. Check metrics endpoint for `lostcity_cycle_*` timings
3. Add logging around rsbuf calls to measure WASM execution time
4. Run with single bot vs multiple bots to isolate contention

**File:** `engine/src/engine/World.ts:366-553`

---

## Candidate 3: Missing Keepalive/Heartbeat (MEDIUM CONFIDENCE)

**What happens:**
- Network becomes unresponsive without TCP reset
- Gateway/SDK don't detect stale connection
- Messages queue up but never send
- Eventually detected when action times out (30s) or tick freeze (15s)

**Evidence:**
- SDK reconnection observed but bot still fails after
- No ping/pong in gateway, SDK, or sync WebSocket

**Gaps found:**

| Layer | Keepalive | Stale Detection |
|-------|-----------|-----------------|
| Gateway→Bot | None | On close only |
| Gateway→SDK | None | On close only |
| SDK→Gateway | None | On send fail/close |
| Webclient→Sync | None | On close only |

**Tests:**
1. Add WebSocket ping/pong in gateway (WS spec native)
2. Add 30s heartbeat in SDK
3. Monitor `ws.readyState` before sending in gateway
4. Add connection age logging to see how long connections live

**Files:**
- `agent/gateway.ts`
- `agent/sdk.ts`

---

## Candidate 4: Webclient 5-Second Reconnect Timeout (MEDIUM CONFIDENCE)

**What happens:**
- `idleNetCycles` counter triggers reconnect after 5 seconds of no network activity
- If game server is temporarily slow, webclient disconnects preemptively
- Bot sees "connection closed" without understanding why

**Evidence:**
- Code comment: "lowered from 15s due to Cloudflare issue"
- `Client.ts:3533-3537`: 250 cycles × 20ms = 5 seconds

**Root cause hypothesis:**
- Game server tick takes >5 seconds (GC pause, heavy processing)
- Webclient interprets as network failure and disconnects

**Tests:**
1. Increase `idleNetCycles` threshold temporarily (to 500 = 10s)
2. Add logging when reconnect is triggered
3. Correlate webclient reconnect timing with game tick freeze timing

**File:** `webclient/src/client/Client.ts:3533-3537`

---

## Candidate 5: Multiple Java Processes (LOW-MEDIUM CONFIDENCE)

**What happens:**
- Two game server instances compete for resources
- Database locks, port conflicts, or memory contention
- One or both servers become unresponsive

**Evidence:**
- Issues.md: "Two server PIDs observed (1034, 57974)"
- Server uptime degradation after 20+ hours

**Tests:**
1. Run `ps aux | grep java` to check for multiple processes
2. Check if both are listening on same port (would fail)
3. Kill stale processes and restart cleanly
4. Add process health check before running bots

---

## Candidate 6: Browser/Puppeteer Crash (LOW-MEDIUM CONFIDENCE)

**What happens:**
- Chrome tab crashes silently
- Page.on('crash') fires but only logs
- Script continues for 15s until tick freeze detected
- Then sees "Bot not connected"

**Evidence:**
- Error comes from Puppeteer CDP: `puppeteer-core/lib/esm/puppeteer/cdp/Connection.js:102`
- Page crash handlers exist but don't abort script

**Tests:**
1. Add `page.on('crash')` handler that throws DisconnectError immediately
2. Monitor Chrome memory usage during runs
3. Run with `--disable-dev-shm-usage` flag for Docker/constrained environments
4. Check if crashes correlate with specific actions (high memory operations)

**File:** `test/utils/browser.ts:214-236`

---

# Diagnostic Tests to Run

## Quick Tests (No Code Changes)

1. **Check server uptime**: `ps -p <pid> -o etime` - if >20h, restart
2. **Check for multiple Java processes**: `ps aux | grep java | grep -v grep`
3. **Enable debug profile**: Set `NODE_DEBUG_PROFILE=1` before running server
4. **Check metrics**: Hit the metrics endpoint to see cycle timings
5. **Watch browser memory**: `top -pid <chrome-pid>` during bot run

## Code-Based Tests

1. **Add T1 packet dump**: Before logout on T1 error, dump full buffer hex
2. **Add tick timing log**: Log when cycle() exceeds 1000ms
3. **Add heartbeat**: Implement ping/pong in gateway
4. **Lower freeze threshold**: Change 15s to 5s to detect faster
5. **Browser crash abort**: Make page.on('crash') throw immediately

---

# Priority Order for Investigation

| Priority | Candidate | Why |
|----------|-----------|-----|
| 1 | T1 Protocol Mismatch | 50-100% error rate, clear evidence |
| 2 | Game Loop Blocking | Tick freeze is consistent symptom |
| 3 | Webclient 5s Timeout | Easy to test, could explain many disconnects |
| 4 | Missing Keepalive | Architectural gap but not acute cause |
| 5 | Multiple Java Processes | Easy to check, might be red herring |
| 6 | Browser Crash | Detection exists, just needs faster abort |

---

# Quick Wins

1. **Restart game server** - if running 20+ hours, fresh start may help
2. **Kill stale Java processes** - ensure only one server PID
3. **Run bots sequentially** - avoid browser resource contention
4. **Reduce tick freeze threshold** - detect faster (10s instead of 15s)
5. **Set reconnectMaxRetries: 3** - fail fast instead of infinite retry

---

# Files Reference

| File | Relevance |
|------|-----------|
| `webclient/src/client/Client.ts:9081` | T1 error and logout trigger |
| `webclient/src/client/Client.ts:3533` | 5-second idle reconnect |
| `engine/src/engine/World.ts:366-553` | Main game loop |
| `engine/src/server/tcp/TcpServer.ts:19` | TCP 30s timeout |
| `agent/script-runner.ts:276-325` | ConnectionHealthMonitor |
| `agent/gateway.ts` | WebSocket relay (no keepalive) |
| `agent/sdk.ts:112-129` | WebSocket close handling |
| `test/utils/browser.ts:214-236` | Page crash handlers |
