# Bot Disconnect Investigation

## Problem Summary
The cowhide-banking script consistently experiences "Bot not connected" errors, causing premature termination. This document collects evidence from multiple runs to identify the root cause.

## Error Signature
```
ERROR: Bot not connected
...
ConnectionClosedError: Connection closed.
  at _rawSend (/Users/max/workplace/rs-agent/Server/node_modules/puppeteer-core/lib/esm/puppeteer/cdp/Connection.js:102:35)
```

---

## Evidence from Runs

### Run 001 (06:15) - Duration ~2 min
- **Final state**: 3 kills, 4 hides, position (3263, 3266)
- **HP at disconnect**: 3-4/23 (critically low)
- **Last action**: Picking up cow hide
- **Events before disconnect**:
  ```
  tick 20579 repeated 3 times (game frozen)
  dialog.open: false
  Then: "Bot not connected"
  ```

### Run 002 (06:22) - Duration ~3.5 min
- **Final state**: 4 kills, 9 hides, position (3262, 3261)
- **HP at disconnect**: 6/28
- **Last action**: Attacking cow
- **Events before disconnect**:
  ```
  tick 36835 - normal state
  Then immediately: "Bot not connected"
  ```

### Run 003 (06:34) - Duration ~2.5 min
- **Final state**: 7 kills, 8 hides, position (3245, 3296)
- **HP at disconnect**: 6/29
- **Last action**: Banking trip started, walking to stairs
- **Notable**: Bot was walking when disconnect happened

### Run 004 (06:42) - Duration ~1.5 min
- **Final state**: 1 kill, 3 hides, position (3244, 3289)
- **HP at disconnect**: 13/23
- **Events before disconnect**:
  ```
  dialog.open: true, options: 1 (dialog stuck open)
  tick 18824 repeated (frozen)
  "Combat ended: lost_target"
  "Dismissing dialog..."
  Immediately: "Bot not connected"
  ```

### Run 005 (06:47) - Best run, ~4 min
- **Final state**: 8 kills, 8 hides
- **HP at disconnect**: Not recorded (was in banking loop)
- **Notable**: Script worked well, banking triggered correctly
- **Disconnect**: During repeated banking attempts

### Run 006 (07:04) - Duration ~1 min
- **Final state**: 0 kills, 0 hides, position (3263, 3258)
- **Very early disconnect** - barely started

### Run 007 (07:06) - Duration ~2 min
- **Final state**: 2 kills, 4 hides, position (3248, 3290)
- **Notable event**:
  ```
  [BotSDK] Reconnecting in 1000ms (attempt 1)
  [BotSDK] Reconnected successfully after 0 attempt(s)
  ```
- SDK attempted reconnection, succeeded briefly, then failed again

### Run 008 (07:12) - Duration ~1 min
- **Final state**: 1 kill, 2 hides
- Early disconnect

### Run 009 (07:22) - Duration ~2 min
- **Final state**: 5 kills, 5 hides, position (3261, 3262)
- **Last action**: Attacking cow

---

## Patterns Observed

### 1. Game Tick Freezing
Multiple runs show the game tick stopping/repeating:
```
Run 001: tick 20579 repeated 3 times
Run 004: tick 18824 repeated
```
This suggests the game server stops responding before the disconnect.

### 2. Dialog Correlation
Run 004 specifically shows:
- `dialog.open: true` stuck
- Tick frozen
- Then disconnect

The dialog dismissal might not be working, blocking the game loop.

### 3. HP Not the Cause
- Run 004: HP was 13/23 (healthy) when disconnect happened
- Run 007: HP was 12/22 (healthy)
- Low HP doesn't correlate with disconnects

### 4. Position Not the Cause
Disconnects happen at various positions:
- In cow field (3261, 3262)
- Walking to bank (3245, 3296)
- Near castle (3244, 3289)

### 5. SDK Reconnection Attempt
Run 007 shows the SDK has reconnection logic:
```
[BotSDK] Reconnecting in 1000ms (attempt 1)
[BotSDK] Reconnected successfully after 0 attempt(s)
```
But the bot still disconnected shortly after.

---

## Hypotheses

### H1: Dialog Blocking Game Loop
**Evidence**: Run 004 shows dialog stuck open with frozen tick
**Theory**: Level-up dialogs or other dialogs block the WebSocket heartbeat, causing timeout

### H2: WebSocket Timeout
**Evidence**: Tick freezing before disconnect
**Theory**: Something causes the game to stop sending state updates, triggering a connection timeout

### H3: Puppeteer/Browser Issue
**Evidence**: Error originates from `puppeteer-core/lib/esm/puppeteer/cdp/Connection.js`
**Theory**: Browser tab crashes or CDP connection drops

### H4: Game Server Overload
**Evidence**: Inconsistent timing, SDK reconnection attempts
**Theory**: Game server is unstable or rate-limiting connections

---

## Questions to Investigate

1. **Where is the WebSocket timeout configured?** Is there a heartbeat mechanism?

2. **What triggers the disconnect in the SDK?** Look at `BotSDK` reconnection logic.

3. **Is the Puppeteer page crashing?** Check if page.isClosed() before operations.

4. **Are there server-side logs?** What does the game server see when bot disconnects?

5. **Does the dialog dismissal actually work?** The "Dismissing dialog..." spam suggests it might be failing.

---

---

## Root Cause Analysis

### Connection Architecture
```
Script → SDK (WebSocket) → Gateway (WebSocket) → Bot/Browser (Puppeteer)
```

The error "Bot not connected" comes from **gateway.ts:208**, meaning the **game client browser** disconnected from the gateway, NOT the SDK.

### Key Finding: No Page Crash Handlers
Looking at `test/utils/browser.ts` and `scripts/script-runner.ts`:
- **No `page.on('crash')` handler** - browser crashes are silent
- **No `page.on('pageerror')` handler** - JS errors are not logged
- **No `page.on('error')` handler** - page errors not captured

When the Puppeteer page crashes or the WebSocket inside it drops, there's NO notification to the script - it just sees "Bot not connected" when it tries the next action.

### Gateway Disconnect Flow
From `gateway.ts:228-236`:
```typescript
handleClose(ws: any) {
    if (wsInfo.type === 'bot') {
        session.ws = null;  // Mark bot as disconnected
        // Send error to all SDKs watching this bot
        this.sendToSDK(sdkSession, { type: 'sdk_error', error: 'Bot disconnected' });
    }
}
```

When the browser's WebSocket closes (page crash, network issue, etc.), the gateway marks the bot as disconnected and notifies all SDKs.

---

## Recommended Next Steps

### 1. Add Page Crash Handlers (Critical)
In `test/utils/browser.ts` or `script-runner.ts`:
```typescript
page.on('crash', () => {
    console.error('[Browser] Page crashed!');
});

page.on('pageerror', (error) => {
    console.error('[Browser] Page error:', error);
});

page.on('error', (error) => {
    console.error('[Browser] Error:', error);
});
```

### 2. Add WebSocket Health Monitoring
Track time since last state update from the game client to detect freezes early.

### 3. Add SDK Connection State Listener
In script-runner, listen for connection state changes:
```typescript
sdk.onConnectionStateChange((state, attempt) => {
    console.log(`[SDK] Connection: ${state}`, attempt ? `(attempt ${attempt})` : '');
});
```

### 4. Check Browser Console Logs
Capture console output from the game page to see if there are JS errors before crashes.

### 5. Investigate Game Server Logs
Check if the game server is logging any errors when bots disconnect.

---

## Fixes Applied

### Fix 1: Page Crash Handlers (browser.ts) ✅
Added handlers for page crashes, JS errors, and close events:
```typescript
page.on('crash', () => console.error('[Browser] Page CRASHED!'));
page.on('pageerror', (error) => console.error('[Browser] Page JS error:', error.message));
page.on('error', (error) => console.error('[Browser] Error:', error.message));
page.on('close', () => console.log('[Browser] Page closed'));
page.on('console', (msg) => { if (msg.type() === 'error') console.error('[Browser Console]', msg.text()); });
```

### Fix 2: SDK Connection State Listener (script-runner.ts) ✅
Added listener for connection state changes:
```typescript
sdk.onConnectionStateChange((state, attempt) => {
    console.log(`[SDK] Connection state: ${state}`);
    if (state === 'disconnected') disconnectDetected = true;
});
```

### Fix 3: Game Tick Freeze Detection (script-runner.ts) ✅
Added `ConnectionHealthMonitor` class that tracks time since last state update and detects frozen game ticks (15s threshold).

### Fix 4: DisconnectError Handling (script-runner.ts) ✅
Added `DisconnectError` class and proper handling in the script runner main loop, with clean termination and logging when disconnect or tick freeze is detected.

---

## Remaining Investigation

If disconnects continue, the next steps are:
1. Check browser console output for JS errors before crashes
2. Investigate game server logs for disconnect reasons
3. Consider adding browser restart/recovery logic for long-running scripts
