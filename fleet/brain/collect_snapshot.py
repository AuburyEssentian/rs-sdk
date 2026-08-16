#!/usr/bin/env python3
"""Emit one bounded, deterministic fleet snapshot for the Luna orchestrator."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("FLEET_REPO_ROOT", Path(__file__).resolve().parents[2]))
BRAIN = ROOT / "fleet" / "brain"
RUNTIME = BRAIN / "runtime"
NOW = datetime.now(timezone.utc)


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError, TypeError):
        return default


def age_seconds(timestamp: Any) -> int | None:
    if not isinstance(timestamp, str):
        return None
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return max(0, int((NOW - parsed.astimezone(timezone.utc)).total_seconds()))
    except ValueError:
        return None


def inventory_summary(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    totals: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            continue
        totals[item["name"]] = totals.get(item["name"], 0) + int(item.get("count") or 0)
    return [f"{name} x{count}" for name, count in sorted(totals.items())][:12]


def file_count(path: Path) -> int:
    try:
        return sum(1 for item in path.iterdir() if item.is_file() and item.suffix == ".json" and not item.name.endswith(".result.json"))
    except OSError:
        return 0


manifest = read_json(ROOT / "fleet.json", {"bots": []})
supervisor = read_json(ROOT / "fleet" / "supervisor-status.json", {"children": []})
children = {child.get("key"): child for child in supervisor.get("children", []) if isinstance(child, dict)}
accounts = []
issues = []

for definition in manifest.get("bots", []):
    if not isinstance(definition, dict):
        continue
    bot_id = definition.get("id")
    status = read_json(ROOT / str(definition.get("statusPath", "")), {})
    status_age = age_seconds(status.get("updatedAt"))
    controller = children.get(f"{bot_id}:controller", {})
    client = children.get(f"{bot_id}:client", {})
    account = {
        "id": bot_id,
        "role": definition.get("roleKey") or definition.get("role"),
        "clientMode": definition.get("clientMode"),
        "online": bool(status.get("online")),
        "statusAgeSeconds": status_age,
        "activity": status.get("activity"),
        "detail": status.get("detail"),
        "position": status.get("position"),
        "hp": (status.get("player") or {}).get("hp"),
        "maxHp": (status.get("player") or {}).get("maxHp"),
        "totalLevel": status.get("totalLevel"),
        "levels": status.get("levels") or {},
        "inventory": inventory_summary(status.get("inventory")),
        "controller": {
            "running": controller.get("running") if definition.get("clientMode") == "lite" else None,
            "crashCount": controller.get("crashCount") if definition.get("clientMode") == "lite" else None,
            "lastStartedAt": controller.get("lastStartedAt") if definition.get("clientMode") == "lite" else None,
        },
        "client": {
            "running": client.get("running") if definition.get("clientMode") == "lite" else None,
            "crashCount": client.get("crashCount") if definition.get("clientMode") == "lite" else None,
        },
    }
    accounts.append(account)
    if status_age is None:
        issues.append({"severity": "red", "botId": bot_id, "kind": "missing-status"})
    elif status_age >= 600:
        issues.append({"severity": "red", "botId": bot_id, "kind": "stale-status", "ageSeconds": status_age})
    elif status_age >= 180:
        issues.append({"severity": "amber", "botId": bot_id, "kind": "aging-status", "ageSeconds": status_age})
    if definition.get("clientMode") == "lite" and not controller.get("running"):
        issues.append({"severity": "red", "botId": bot_id, "kind": "controller-not-running"})
    if definition.get("clientMode") == "lite" and not client.get("running"):
        issues.append({"severity": "red", "botId": bot_id, "kind": "client-not-running"})

supply_requests = []
for path in sorted((ROOT / "fleet").glob("supply-*.json")):
    request = read_json(path)
    if isinstance(request, dict):
        supply_requests.append(request)

payload = {
    "schemaVersion": 1,
    "generatedAt": NOW.isoformat().replace("+00:00", "Z"),
    "contract": {
        "strategicWriter": "fleetbrain",
        "gameplay": "deterministic-workers-only",
        "allowedAutomaticMutation": "restart_controller",
        "automaticRestartRequires": "offline or status stale >= 600 seconds; five-minute cooldown",
        "dashboard": "strictly-read-only",
    },
    "summary": {
        "configured": len(accounts),
        "online": sum(1 for account in accounts if account["online"] and (account["statusAgeSeconds"] or 10**9) < 180),
        "liteChildrenRunning": sum(1 for child in supervisor.get("children", []) if child.get("running")),
        "liteChildrenConfigured": len(supervisor.get("children", [])),
        "issueCount": len(issues),
    },
    "issues": issues[:20],
    "accounts": accounts,
    "logistics": read_json(ROOT / "fleet" / "logistics.json", {}),
    "supplyRequests": supply_requests,
    "controlPlane": {
        "reconciler": read_json(RUNTIME / "reconciler-status.json", {}),
        "previousBrainStatus": read_json(RUNTIME / "brain-status.json", {}),
        "pendingWorkOrders": file_count(RUNTIME / "work-orders" / "pending"),
        "completedWorkOrders": file_count(RUNTIME / "work-orders" / "completed"),
        "rejectedWorkOrders": file_count(RUNTIME / "work-orders" / "rejected"),
    },
    "costs": read_json(RUNTIME / "costs.json", {}),
}
print(json.dumps(payload, separators=(",", ":"), ensure_ascii=True))
