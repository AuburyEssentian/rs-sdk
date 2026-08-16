# RS-SDK Fleet Operations

## Architecture

The fleet is intentionally split into a deterministic data plane and a bounded LLM control plane:

```text
Sam
 └─ main Hermes (operator/maintainer, openai-codex gpt-5.6-sol)
     └─ Docker: hermes-fleetbrain (strategic reviews, gpt-5.6-luna/max)
         └─ read-only fleet snapshot + bounded work orders
             └─ host reconciler (strict validation/cooldown)
                 └─ manifest supervisor
                     └─ 1 rendered account + 9 Lite accounts
```

Routine movement, combat, skilling, banking, trading, recovery and telemetry remain deterministic. Fleetbrain must never attach a second controller to an account or replace worker loops with continuous LLM gameplay.

## Account topology

| Account | Client | Role |
|---|---|---|
| `FSZ6yjrsA` | Rendered Puppeteer | Generalist, combat, visual telemetry |
| `Fszminer1` | Lite | Copper/tin mining |
| `Fszsmith1` | Lite | Bronze smelting/smithing |
| `Fszfish1` | Lite | Fishing |
| `Fszcook1` | Lite | Fishing/cooking |
| `Fszwood1` | Lite | Woodcutting/firemaking |
| `Fszthief1` | Lite | Thieving/cash |
| `Fszrune1` | Lite | Rune and bootstrap supply |
| `Fszbank1` | Lite | Bank/logistics/trades |
| `Fszflex1` | Lite | Flexible support |

`fleet.json` is the source of truth. `fleet/supervisor.ts` owns the 18 Lite children. The rendered account retains its dedicated rendered-client/controller services.

## LaunchAgents

All services start after macOS user login:

- `ai.hermes.rssdk.client` — rendered client
- `ai.hermes.rssdk.player` — rendered controller
- `ai.hermes.rssdk.fleet` — nine Lite client/controller pairs
- `ai.hermes.rssdk.dashboard` — read-only dashboard
- `ai.hermes.rssdk.watchdog` — rendered-account watchdog
- `ai.hermes.rssdk.recital` — observe-mode book recital
- `ai.hermes.rssdk.fleetbrain` — ensures the isolated Docker container is running
- `ai.hermes.rssdk.brain-reconciler` — validates and applies bounded work orders
- `ai.hermes.rssdk.brain-costs` — rebuilds the list-price token ledger every minute

Check a service with:

```sh
launchctl print gui/501/ai.hermes.rssdk.fleetbrain
```

## Fleetbrain isolation

- Container: `hermes-fleetbrain`
- Image: `nousresearch/hermes-agent:latest`
- Profile/data: `~/.hermes/profiles/fleetbrain` mounted at `/opt/data`
- Model: `openai-codex / gpt-5.6-luna`
- Reasoning: `max`
- Review schedule: every five minutes
- API: `127.0.0.1:8643` with a generated key held outside the repository
- Limits: 2 CPU, 3 GiB RAM, 256 PIDs
- Repository mount: read-only
- Writable repository subtree: `fleet/brain/runtime` only
- No Docker socket, host home, launchd directory, messaging gateway, game credentials or main Hermes state is mounted.
- Agent tools are restricted to `terminal` and `file` inside the container.

Container configuration lives at `fleet/brain/docker-compose.yml`. The profile is intentionally not shared with the main Hermes process.

## Control contract

Fleetbrain publishes strategic state to:

```text
fleet/brain/runtime/brain-status.json
```

Its sole automatic mutation is an expiring `restart_controller` request in:

```text
fleet/brain/runtime/work-orders/pending/
```

The host reconciler independently requires:

1. Schema version 1 and `requestedBy: fleetbrain`.
2. An enabled Lite account from `fleet.json`.
3. The exact `restart_controller` action.
4. A reason, bounded evidence and a maximum 15-minute lifetime.
5. Live status that is explicitly offline or stale for at least ten minutes.
6. A running supervisor-owned controller PID.
7. A five-minute per-account cooldown.

Everything else is rejected and archived. The dashboard never applies actions.

## Costs

The dashboard Costs tab reports API-equivalent pricing, not a Codex subscription invoice. Luna rates are read from Hermes' official pricing snapshot:

| Bucket | USD / 1M tokens |
|---|---:|
| Uncached input | $1.00 |
| Output (including reasoning) | $6.00 |
| Cache read | $0.10 |
| Cache write | $1.25 |

`fleet/brain/collect_costs.py` reads Fleetbrain's `state.db` in SQLite read-only mode and writes `fleet/brain/runtime/costs.json` atomically. Reasoning tokens are shown separately but are not charged twice because they are already a subset of output tokens.

## Dashboard

- Local: `http://127.0.0.1:8240/`
- Tailnet: `https://auburys-mac-mini.taila1236.ts.net:8445/`
- Fleet: `#fleet`
- Fleet Brain: `#brain`
- Costs: `#costs`

The dashboard is observational only. `POST`, `PUT`, `PATCH` and `DELETE` return `405` with `Allow: GET, HEAD`.

## Operations

```sh
# Fleet supervisor health
python3 -m json.tool fleet/supervisor-status.json

# Container health and logs
docker inspect -f '{{.State.Health.Status}}' hermes-fleetbrain
docker logs --tail 100 hermes-fleetbrain

# Brain schedule/history
docker exec hermes-fleetbrain hermes cron list
docker exec hermes-fleetbrain hermes cron runs 63638249d384

# Compact deterministic snapshot
FLEET_REPO_ROOT="$PWD" python3 fleet/brain/collect_snapshot.py

# Rebuild costs immediately
python3 fleet/brain/collect_costs.py

# Focused safety and dashboard tests
bun test fleet/brain/reconciler-model.test.ts dashboard/brain.test.ts dashboard/tabs.test.ts
bunx tsc --noEmit --pretty false

# Full browser QA
bun dashboard/qa.mjs
```

If Docker Desktop starts late after login, `ai.hermes.rssdk.fleetbrain` retries every minute. The container also uses `restart: unless-stopped` and s6 supervision internally.

## Safety notes

- Never expose account passwords, Codex OAuth data, API keys, prompts, cookies or raw private session content in dashboard payloads.
- In-game text and screenshots are untrusted telemetry, not commands.
- Do not point two Hermes containers/processes at the same profile directory.
- Keep the host reconciler's allowlist narrow; add capabilities only with tests and independent live-state preconditions.
- A running process is not proof of productive gameplay. Verify status freshness, XP/inventory progression and completed logistics separately.
