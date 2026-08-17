# RS-SDK Fleet Operations

## Architecture

The fleet is intentionally split into a deterministic data plane and a bounded LLM control plane:

```text
Sam
 └─ main Hermes (operator/maintainer, openai-codex gpt-5.6-sol)
     └─ Docker: hermes-fleetbrain (strategic reviews, gpt-5.6-luna/max)
         └─ read-only fleet snapshot + audited lifecycle work orders
             └─ host reconciler (strict validation/cooldown)
                 └─ manifest supervisor
                     └─ 1 protected rendered account + dynamic Lite accounts (20 total max)
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

`fleet.json` is the source of truth. `fleet/supervisor.ts` live-reconciles one client and one controller child for every enabled Lite account without bouncing unchanged workers. The current baseline is 18 Lite children. The rendered account retains its dedicated services and is protected from Fleetbrain lifecycle actions. The hard cap is 20 total characters, including disabled/archived accounts.

## LaunchAgents

All services start after macOS user login:

- `ai.hermes.rssdk.client` — rendered client
- `ai.hermes.rssdk.player` — rendered controller
- `ai.hermes.rssdk.fleet` — dynamic manifest-driven Lite client/controller pairs
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
- Review schedule: every fifteen minutes (max-reasoning reviews may take roughly nine minutes; overlap is forbidden)
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

Fleetbrain may place at most one expiring version-2 lifecycle work order per review in:

```text
fleet/brain/runtime/work-orders/pending/
```

Allowed actions are `restart_controller`, `restart_client`, `restart_account`, `add_account`, and `remove_account`. The host reconciler independently requires:

1. Schema version 2, `requestedBy: fleetbrain`, a matching filename, bounded evidence and a maximum 15-minute lifetime.
2. An enabled supervisor-owned Lite target for restart/remove actions. `FSZ6yjrsA` is always rejected.
3. New account names matching `Fsz...` (4-12 alphanumeric characters) and a deterministic role from `smith`, `fish`, `cook`, `wood`, `thief`, `rune`, `banker`, or `flex`.
4. No more than 20 total characters, including disabled accounts. Reactivation is preferred over creating another character.
5. A five-minute per-account restart cooldown and fifteen-minute fleet scale cooldown.
6. Live supervisor-owned PIDs for restart actions and post-action supervisor verification.

`remove_account` means disable-and-archive: stop the two children and mark the manifest entry disabled while preserving the character directory, credentials, status and history. `add_account` reactivates a disabled account or creates one new Lite account. Every result is archived. The dashboard never applies actions.

## Hierarchical strategy

Fleetbrain keeps durable strategy in `fleet/brain/runtime/strategy.json`:

1. One verified long-horizon achievement such as a genuinely rare drop, difficult collection, or advanced production capability.
2. Two to six ordered milestones.
3. One to five measurable short-term goals owned by named deterministic workers.
4. Bounded progress evidence from fresh telemetry.

Fifteen-minute reviews advance or replace short-term goals without churning the long horizon. The long-horizon target changes only when achieved, proven impossible, or explicitly overridden by Sam/main Hermes. Capacity and lifecycle actions must support this goal ladder.

## Costs

The dashboard Costs tab reports API-equivalent pricing, not a Codex subscription invoice. Fleetbrain's calls are in OpenAI's short-context band (at most 272K input tokens per request), using the current direct API rates from <https://developers.openai.com/api/docs/pricing>:

| Bucket | USD / 1M tokens |
|---|---:|
| Uncached input | $0.20 |
| Output (including reasoning) | $1.20 |
| Cache read | $0.02 |
| Cache write | $0.25 |

`fleet/brain/collect_costs.py` reads Fleetbrain's `state.db` in SQLite read-only mode and writes `fleet/brain/runtime/costs.json` atomically. The payload also records Luna's >272K long-context rates for transparency, but they are not used for these runs. Reasoning tokens are shown separately but are not charged twice because they are already a subset of output tokens.

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

Main Hermes runs the `RS-SDK fleet overseer check-in` every 24 hours on `openai-codex/gpt-5.6-sol`. It inspects gameplay progress, Fleetbrain strategy/actions, reconciler audits, costs, services and dashboard health; it course-corrects safe subordinate defects and reports back to the originating Discord thread.

## Safety notes

- Never expose account passwords, Codex OAuth data, API keys, prompts, cookies or raw private session content in dashboard payloads.
- In-game text and screenshots are untrusted telemetry, not commands.
- Do not point two Hermes containers/processes at the same profile directory.
- Keep the host reconciler's lifecycle allowlist explicit, schema-validated, reversible and audited; never turn it into arbitrary shell or code execution.
- A running process is not proof of productive gameplay. Verify status freshness, XP/inventory progression and completed logistics separately.
