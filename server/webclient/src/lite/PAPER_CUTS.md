# LiteClient paper cuts

Small operational issues observed while running headless bots. Keep entries
specific, state whether they are confirmed, and record the workaround before
filing an SDK report.

## Open

### Gate recovery can retain a stale door route

- **Observed:** 2026-08-04, during an Al Kharid death/recovery run.
- **Symptom:** `BotActions.walkTo()` repeatedly retried the toll-gate door after
  a death, even though a direct LiteClient walk across the opened gate worked.
- **Impact:** A recovery script can spend a long time retrying movement rather
  than returning to its combat area.
- **Workaround:** Open the nearby gate explicitly, dispatch `sdk.sendWalk()`,
  and verify arrival from fresh state instead of relying on high-level walk
  retries in this specific recovery path.
- **Follow-up:** Reproduce against the browser client before treating this as a
  LiteClient-only bug; the routing wrapper is shared.

### Visible NPCs are not necessarily reachable

- **Observed:** 2026-08-04, beside the Al Kharid toll gate.
- **Symptom:** Gate-side goblins appeared in `nearbyNpcs`, but interaction
  returned `cant_reach` because the gate collision blocked their tiles.
- **Impact:** Target loops can spin on visible targets without making progress.
- **Workaround:** Require `npc.reachable !== false` before interacting, and
  move to an accessible recovery tile when no target qualifies.
- **Status:** Expected API behavior, but easy to miss in new scripts.

### Fresh-account bootstrap needs its own recovery plan

- **Observed:** 2026-08-04.
- **Symptom:** A death can leave a character by the toll gate with no coins or
  food, while its original Lumbridge-only coin-farming selector finds no valid
  targets.
- **Impact:** The combat loop appears stalled even though the Lite action
  transport is healthy.
- **Workaround:** Include safe local goblins in the funding selector, collect
  enough coins for both the toll and a kebab buffer, and preserve a
  post-death return-to-camp state machine.
- **Status:** Script design issue, not a LiteClient defect.

## Resolved in the action bridge

### One controller per Lite session did not scale to the remote host

- **Observed:** 2026-08-04 on the 7.7 GiB remote fleet host.
- **Symptom:** Starting 25 independent SDK training scripts caused each Bun
  process to initialise its own large world-pathfinding map. Controller memory
  grew to roughly 250–365 MiB per account and the host was OOM-killed before
  the fleet could stabilise.
- **Fix:** `bots/fleet_controller.ts` now owns all 25 SDK connections in one
  Bun process, while each account retains its own LiteClient session. The
  controller is about 474 MiB total and the complete fleet uses about 2.2 GiB.
- **Status:** Confirmed in the remote deployment; the process split is 25 Lite
  runners plus one shared controller.

### An expired active action could hold the queue forever

- **Observed:** 2026-08-04 while stopping/restarting controller scripts during
  recovery diagnostics.
- **Symptom:** `BotActionQueue` only expired pending entries. If its active
  entry never completed, later gateway actions remained behind it indefinitely.
- **Fix:** `expireActive()` now releases an expired current entry; the Lite
  runner returns a bounded `queue_expired` failure and publishes fresh state.
- **Coverage:** `server/webclient/src/bot/ActionQueue.test.ts` verifies that a
  later action can run after the active entry expires.

### A static path door absent from the Lite map could block Varrock travel

- **Observed:** 2026-08-04, south-west of Varrock at `(3175, 3316)`.
- **Symptom:** `BotActions.walkTo()` found a door in global collision data, but
  no live, openable object existed at that tile. Repeated `not_found` results
  caused the route to be recomputed instead of walking through open terrain.
- **Fix:** The proactive door check now ignores `not_found`; genuine locked
  doors and `cant_reach` results retain the existing recovery logic.

### Local collision routing can disagree with the authoritative map

- **Observed:** 2026-08-04 while travelling from Varrock's south-west gate to
  the dark-wizard camp.
- **Symptom:** LiteClient's local routefinder returned success, but the server
  rejected the resulting movement packet (`UnsetMapFlag`) and the player stayed
  put.
- **Workaround/Fix:** Controllers can now send up to 25 turn points calculated
  from the SDK's authoritative world map. Lite writes those points directly in
  the normal `MOVE_GAMECLICK` format; live Varrock travel and the matching
  packet-encoding test confirm the route is accepted.

## Confirmation checklist

Before adding an entry as a LiteClient bug, verify:

1. The same action works or fails differently through the browser client.
2. The target was reachable and no dialog/modal blocked input.
3. The observed effect is not merely a successful packet dispatch; inspect
   subsequent state or server feedback.
