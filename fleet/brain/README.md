# Fleetbrain control plane

This directory contains the isolated Luna orchestrator boundary for the ten-account RS-SDK fleet.

## Components

- `collect_snapshot.py` — deterministic, compact input for each strategic review.
- `reconciler-model.ts` — pure work-order validation, cooldown and live-health preconditions.
- `reconciler.ts` — host-only service that applies validated controller restarts.
- `collect_costs.py` — read-only SQLite token ledger with Luna list-price calculation.
- `docker-compose.yml` — isolated official Hermes container.
- `ensure_container.sh` — idempotent login-time container recovery.
- `runtime/brain-status.json` — current Luna objective and observations.
- `runtime/work-orders/` — pending/completed/rejected audit trail.

The repository is mounted read-only in the container except for `runtime/`. The host reconciler, not Luna, owns side effects. The dashboard reads these files but has no mutation route.

## Work-order schema

```json
{
  "version": 1,
  "id": "wo-20260817-fish-stale",
  "requestedBy": "fleetbrain",
  "action": "restart_controller",
  "botId": "Fszfish1",
  "reason": "Controller status has been stale for more than ten minutes while its Lite client remains running.",
  "evidence": ["statusAgeSeconds=711", "client.running=true"],
  "createdAt": "2026-08-17T00:00:00Z",
  "expiresAt": "2026-08-17T00:10:00Z"
}
```

Requests that fail any schema, manifest, expiry, freshness, PID or cooldown check are archived under `runtime/work-orders/rejected/`.
