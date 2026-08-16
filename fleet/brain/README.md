# Fleetbrain control plane

This directory contains the isolated Luna strategic orchestrator for a dynamic RS-SDK fleet capped at 20 total characters.

## Components

- `collect_snapshot.py` — deterministic compact health, capacity, logistics, strategy and control-plane input.
- `fleetbrain_prompt.md` — versioned standing review/authority/goal-hierarchy contract deployed to the Fleetbrain cron job.
- `reconciler-model.ts` — pure version-2 work-order, target, cap and cooldown validation.
- `reconciler.ts` — host-only lifecycle mutation boundary and audit writer.
- `collect_costs.py` — read-only SQLite token ledger with Luna list-price calculation.
- `docker-compose.yml` — isolated official Hermes container.
- `ensure_container.sh` — idempotent login-time container recovery.
- `runtime/strategy.json` — durable long horizon, milestones, short-term goals and evidence.
- `runtime/brain-status.json` — current Luna campaign, decision and capacity intent.
- `runtime/work-orders/` — pending/completed/rejected audit trail.

The repository is mounted read-only in the container except for `runtime/`. The host reconciler, not Luna, owns side effects. The dashboard reads these files but has no mutation route.

## Work-order schema

```json
{
  "version": 2,
  "id": "wo-20260817-flex-restart-v2",
  "requestedBy": "fleetbrain",
  "action": "restart_account",
  "botId": "Fszflex1",
  "reason": "Fresh evidence supports a selective full-account lifecycle reset.",
  "evidence": ["controllerFailureRepeated=true", "clientStateInvalid=true"],
  "createdAt": "2026-08-17T00:00:00Z",
  "expiresAt": "2026-08-17T00:10:00Z"
}
```

Allowed actions:

- `restart_controller`
- `restart_client`
- `restart_account`
- `remove_account` — disable/archive only; never delete character data or credentials
- `add_account` — reactivate or create one valid Lite account; requires `roleKey`

The hard cap is 20 total characters, disabled accounts included. `FSZ6yjrsA` is protected. Requests that fail schema, identity, target, cap, expiry, PID, protection or cooldown checks are archived under `runtime/work-orders/rejected/`.

## Goal hierarchy

Luna preserves one verified long-horizon achievement, decomposes it into ordered milestones, then publishes measurable short-term goals assigned to deterministic workers. Routine reviews advance tactical goals without changing the long horizon unless it is achieved, proven impossible or explicitly overridden.
