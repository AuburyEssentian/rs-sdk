# Connection Stability Cleanup Plan

**Status**: Complete
**Date**: 2025-01-29
**Last Updated**: 2025-01-29

## Problem Statement

We needed to improve connection stability across the full stack:
**Engine → Bot Client → Gateway → SDK Client**

### Issues Addressed

1. **Bot Client Login Reliability**: Bot clients couldn't always log in when an old session was running. Need graceful session takeover with save file preservation.

2. **Gateway Session Diagnostics**: Need reliable tracking of session state (active/stale/dead), connection duration, and diagnostic endpoints.

3. **Local Dev Auth Parity**: Currently don't run login server locally, can't reproduce auth bugs.

4. **SDK ↔ Gateway Connection**: Verify multi-controller behavior is working correctly.

---

## Architecture Overview

```
Engine (Game World, port 43594)
    ↕ (WebSocket login + game protocol)
Bot Client (Browser webclient)
    ↕ (WebSocket via GatewayConnection.ts)
Gateway (port 7780)
    ↕ (WebSocket)
SDK Client (BotSDK)
```

### Critical Files

| Component | File | Purpose |
|-----------|------|---------|
| Gateway | `gateway/gateway.ts` | Routes Bot↔SDK, session tracking, auth |
| Gateway Types | `gateway/types.ts` | Message type definitions |
| Bot Client | `webclient/src/bot/GatewayConnection.ts` | Bot's gateway connection |
| Bot Controller | `webclient/src/bot/BotOverlay.ts` | Main bot controller with client access |
| Game Client | `webclient/src/client/Client.ts` | Game client with `logout()` method |
| Engine World | `engine/src/engine/World.ts` | Session takeover logic (lines 903-943) |
| Login Thread | `engine/src/server/login/LoginThread.ts` | Local vs remote login handling |
| Login Server | `engine/src/server/login/LoginServer.ts` | Remote login server (production) |
| SDK Client | `sdk/index.ts` | SDK connection and actions |
| SDK Types | `sdk/types.ts` | Type definitions including BotStatus |

---

## Key Discovery: Engine-Native Session Takeover

During implementation, we discovered the **engine already handles session takeover natively** at `World.ts:903-943`. When a new login arrives for an already-logged-in username:

1. `other.save()` serializes existing player's in-memory state
2. `PlayerLoading.load()` creates new player from that state
3. New player gets added to `newPlayers` set
4. Old player is removed via `removePlayerWithoutSave()` (no disk write to avoid race conditions)

**Bug Fixed**: The original code used `break;` after takeover, which only exited the inner loop. The code then continued to add the original player to `this.players`, causing an infinite loop when `transferredPlayer` was processed. Fixed by changing to `continue player;`.

This means **no gateway-level coordination is needed for session takeover**. The gateway's role is simplified to:
- Track session diagnostics
- Notify SDKs when bots connect/disconnect
- Support `save_and_disconnect` for SDK-initiated disconnects

---

## Implementation Summary

### Task 1: Gateway Session Metadata Enhancement ✅ COMPLETE

**Files**: `gateway/gateway.ts`, `sdk/types.ts`

Added to `BotSession` interface:
```typescript
connectedAt: number;    // When bot connected (timestamp)
lastHeartbeat: number;  // Last message received (any type)
```

Added session status calculation:
```typescript
type SessionStatus = 'active' | 'stale' | 'dead';

function getSessionStatus(session: BotSession): SessionStatus {
    if (!session.ws) return 'dead';
    const stateAge = Date.now() - session.lastStateReceivedAt;
    if (stateAge > 30000) return 'stale';  // No state for 30s
    return 'active';
}
```

Updated `/status` and `/status/:username` endpoints with enhanced diagnostics:
- `status`: Session status (active/stale/dead)
- `connectedAt`: When bot connected
- `lastStateAt`: When last state was received
- `lastHeartbeat`: When last message was received
- `stateAge`: Milliseconds since last state
- `sessionDuration`: Milliseconds since connection

---

### Task 2: Gateway Save-and-Disconnect Support ✅ COMPLETE

**Files**: `gateway/gateway.ts`, `gateway/types.ts`

Added `save_and_disconnect` message type for SDK-initiated disconnects. When gateway needs to disconnect a bot (e.g., for SDK disconnect request):

```typescript
this.sendToBot(existingSession, {
    type: 'save_and_disconnect',
    reason: 'New session connecting'
});
```

Note: This is NOT used for session takeover (engine handles that). It's available for future SDK features that need graceful bot disconnection.

---

### Task 3: Bot Client Save-and-Disconnect Handler ✅ COMPLETE

**Files**: `webclient/src/bot/GatewayConnection.ts`, `webclient/src/bot/BotOverlay.ts`

Added `onSaveAndDisconnect` to `GatewayMessageHandler` interface:
```typescript
onSaveAndDisconnect(reason: string): void;
```

Added `preventReconnect` flag to prevent auto-reconnect after graceful disconnect.

Implemented handler in BotOverlay that calls `client.logout()` to trigger server-side save.

---

### Task 4: Local Dev Auth Parity ✅ COMPLETE

**Files**: `engine/.env.example`

Documented local auth setup in `.env.example`:
1. Set `LOGIN_SERVER=true` in both engine and gateway
2. SQLite is already the default DB backend
3. Run login server: `bun run engine/src/server/login/LoginServer.ts`
4. Accounts auto-create on first login (no manual setup needed)

---

### Task 5: SDK Browser Launch Decision Refinement ✅ COMPLETE

**Files**: `sdk/index.ts`, `sdk/types.ts`

Updated `BotStatus` interface with new gateway status fields:
```typescript
status?: SessionStatus;      // 'active' | 'stale' | 'dead'
connectedAt?: number;
lastStateAt?: number;
lastHeartbeat?: number;
stateAge?: number | null;
sessionDuration?: number | null;
```

Updated `shouldLaunchBrowser()` to use gateway's session status for smarter decisions.

---

### Task 6: Documentation Comments ✅ COMPLETE

**Files**: `gateway/gateway.ts`

Added comprehensive documentation explaining:
- BotSession lifecycle and one-per-username constraint
- SDKSession multi-controller behavior
- Session status calculation
- Pending takeover mechanism

---

### Additional: Bot Re-Login After Being Kicked ✅ COMPLETE

**Files**: `webclient/src/client/Client.ts`

When a bot client is kicked and returns to the title screen, clicking "Existing User" now triggers auto-login with the bot's URL credentials instead of showing the login form. This allows easy session re-takeover by clicking on a kicked tab.

---

### Bug Fix: Engine Session Takeover Infinite Loop ✅ FIXED

**File**: `engine/src/engine/World.ts:938`

**Problem**: After session takeover, `break;` only exited the inner `for` loop. The code continued to process the original `player` through normal login, adding it to `this.players`. When `transferredPlayer` was processed next, it found the original player with the same username and triggered another takeover → infinite loop (100% CPU, server freeze).

**Fix**: Changed `break;` to `continue player;` to skip to the next iteration of the outer loop.

```typescript
// Before (broken):
this.removePlayerWithoutSave(other);
break;

// After (fixed):
this.removePlayerWithoutSave(other);
continue player;  // Skip rest of loop - transferredPlayer will be processed next
```

---

## Session Takeover Flow (Final)

```
1. Tab1 (bot client) is logged in and playing
2. Tab2 (bot client, same username) loads and auto-logins to engine
3. Engine's processLogins() detects duplicate username (World.ts:903)
4. Engine saves Tab1's player state to memory via other.save()
5. Engine creates transferredPlayer from that state
6. Engine removes Tab1's player via removePlayerWithoutSave()
7. Engine adds transferredPlayer to newPlayers, continues to next iteration
8. transferredPlayer goes through normal login process
9. Tab2 is now playing with Tab1's state preserved
10. Tab1's gateway connection closes, SDK is notified
11. Tab1 can click "Existing User" to re-takeover if desired
```

---

## Testing Checklist

### Session Takeover Testing ✅
- [x] Start bot client A, connect to game
- [x] Start bot client B with same username
- [x] Verify bot A is kicked (returns to title screen)
- [x] Verify bot B logs in successfully with A's state
- [x] Verify no infinite loop or server freeze
- [x] Verify bot A can re-login by clicking "Existing User"

### Diagnostics Testing ✅
- [x] Curl `/status` and verify new fields appear
- [x] Verify `status: 'active'` when bot is running
- [x] Verify `status: 'dead'` and `connected: false` when bot disconnects
- [x] Verify `inGame` and `player` are null/false when disconnected

### Local Auth Testing
- [x] Documented in `.env.example`
- [ ] Manual testing with `LOGIN_SERVER=true` (optional)

---

## Removed/Abandoned Approaches

### LoginCoordinator (Removed)

Initially implemented a `LoginCoordinator` that connected to gateway BEFORE game login to coordinate session takeover. This was overly complex and caused issues because:
1. Bot client auto-login happened independently of gateway coordination
2. Added race conditions between gateway and engine
3. Engine already handles session takeover correctly

The LoginCoordinator was removed in favor of relying on the engine's native session takeover.

### Gateway Pre-Login Messages (Removed)

Removed `pre_login`, `login_cleared`, `login_pending`, `login_denied` message types that were part of the LoginCoordinator approach.

---

## Files Modified

| File | Changes |
|------|---------|
| `gateway/gateway.ts` | Session metadata, status calculation, diagnostics endpoints |
| `gateway/types.ts` | Added `save_and_disconnect` message type |
| `webclient/src/bot/GatewayConnection.ts` | `onSaveAndDisconnect` handler, `preventReconnect` flag |
| `webclient/src/bot/BotOverlay.ts` | Implemented `onSaveAndDisconnect()` |
| `webclient/src/client/Client.ts` | Bot re-login on "Existing User" click |
| `engine/src/engine/World.ts` | Fixed `break;` → `continue player;` bug |
| `engine/.env.example` | Local auth documentation |
| `sdk/types.ts` | Enhanced `BotStatus` interface |
| `sdk/index.ts` | Updated `shouldLaunchBrowser()` logic |
