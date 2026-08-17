#!/usr/bin/env python3
"""Build a read-only API-list-price-equivalent token-cost ledger for Fleetbrain."""
from __future__ import annotations

import json
import os
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

MODEL = "gpt-5.6-luna"
PRICING_VERSION = "openai-gpt-5.6-2026-08-17"
PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing"
CONTEXT_BAND = "short"
CONTEXT_BAND_DEFINITION = "<=272K input tokens per request"
PRICES = {
    "input": 0.20,
    "output": 1.20,
    "cacheRead": 0.02,
    "cacheWrite": 0.25,
}
LONG_CONTEXT_PRICES = {
    "input": 0.40,
    "output": 1.80,
    "cacheRead": 0.04,
    "cacheWrite": 0.50,
}
LOCAL_TZ = ZoneInfo("Australia/Sydney")
DEFAULT_DB = Path.home() / ".hermes" / "profiles" / "fleetbrain" / "state.db"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "runtime" / "costs.json"


def list_price_cost(input_tokens: int, output_tokens: int, cache_read_tokens: int, cache_write_tokens: int) -> float:
    return round((
        input_tokens * PRICES["input"]
        + output_tokens * PRICES["output"]
        + cache_read_tokens * PRICES["cacheRead"]
        + cache_write_tokens * PRICES["cacheWrite"]
    ) / 1_000_000, 8)


def iso_timestamp(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def collect(db_path: Path) -> dict[str, Any]:
    uri = f"file:{db_path}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT
              s.id AS session_id,
              COALESCE(s.title, '') AS title,
              s.source,
              s.started_at,
              s.ended_at,
              u.model,
              u.billing_provider,
              SUM(u.api_call_count) AS api_calls,
              SUM(u.input_tokens) AS input_tokens,
              SUM(u.output_tokens) AS output_tokens,
              SUM(u.cache_read_tokens) AS cache_read_tokens,
              SUM(u.cache_write_tokens) AS cache_write_tokens,
              SUM(u.reasoning_tokens) AS reasoning_tokens,
              SUM(u.estimated_cost_usd) AS recorded_estimated_cost_usd,
              SUM(u.actual_cost_usd) AS recorded_actual_cost_usd
            FROM session_model_usage u
            JOIN sessions s ON s.id = u.session_id
            WHERE lower(u.model) = ?
            GROUP BY s.id, u.model, u.billing_provider
            ORDER BY s.started_at DESC
            """,
            (MODEL,),
        ).fetchall()
    finally:
        connection.close()

    totals = defaultdict(int)
    daily: dict[str, dict[str, Any]] = {}
    runs = []
    recorded_estimated = 0.0
    recorded_actual = 0.0
    for row in rows:
        input_tokens = int(row["input_tokens"] or 0)
        output_tokens = int(row["output_tokens"] or 0)
        cache_read_tokens = int(row["cache_read_tokens"] or 0)
        cache_write_tokens = int(row["cache_write_tokens"] or 0)
        reasoning_tokens = int(row["reasoning_tokens"] or 0)
        api_calls = int(row["api_calls"] or 0)
        cost = list_price_cost(input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
        started = float(row["started_at"] or 0)
        local_day = datetime.fromtimestamp(started, timezone.utc).astimezone(LOCAL_TZ).date().isoformat()
        day = daily.setdefault(local_day, {
            "date": local_day,
            "sessions": 0,
            "apiCalls": 0,
            "inputTokens": 0,
            "outputTokens": 0,
            "cacheReadTokens": 0,
            "cacheWriteTokens": 0,
            "reasoningTokens": 0,
            "estimatedCostUsd": 0.0,
        })
        day["sessions"] += 1
        for key, value in (
            ("apiCalls", api_calls),
            ("inputTokens", input_tokens),
            ("outputTokens", output_tokens),
            ("cacheReadTokens", cache_read_tokens),
            ("cacheWriteTokens", cache_write_tokens),
            ("reasoningTokens", reasoning_tokens),
        ):
            totals[key] += value
            day[key] += value
        day["estimatedCostUsd"] = round(day["estimatedCostUsd"] + cost, 8)
        recorded_estimated += float(row["recorded_estimated_cost_usd"] or 0)
        recorded_actual += float(row["recorded_actual_cost_usd"] or 0)
        runs.append({
            "sessionId": row["session_id"],
            "title": row["title"] or "Untitled Fleetbrain review",
            "source": row["source"],
            "provider": row["billing_provider"] or "openai-codex",
            "model": row["model"],
            "startedAt": iso_timestamp(started),
            "endedAt": iso_timestamp(row["ended_at"]),
            "apiCalls": api_calls,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "cacheReadTokens": cache_read_tokens,
            "cacheWriteTokens": cache_write_tokens,
            "reasoningTokens": reasoning_tokens,
            "estimatedCostUsd": cost,
        })

    total_cost = list_price_cost(
        totals["inputTokens"], totals["outputTokens"],
        totals["cacheReadTokens"], totals["cacheWriteTokens"],
    )
    return {
        "version": 1,
        "currency": "USD",
        "scope": "fleetbrain-orchestrator",
        "billingMode": "list-price-equivalent",
        "actualSubscriptionCharge": None,
        "explanation": "Estimated API-equivalent cost. Codex subscription usage is not an actual metered invoice.",
        "pricing": {
            "model": MODEL,
            "version": PRICING_VERSION,
            "source": PRICING_SOURCE,
            "contextBand": CONTEXT_BAND,
            "contextBandDefinition": CONTEXT_BAND_DEFINITION,
            "perMillionTokens": PRICES,
            "longContextPerMillionTokens": LONG_CONTEXT_PRICES,
        },
        "totals": {
            "sessions": len(rows),
            **dict(totals),
            "estimatedCostUsd": total_cost,
            "recordedProviderEstimateUsd": round(recorded_estimated, 8),
            "recordedActualCostUsd": round(recorded_actual, 8),
        },
        "daily": sorted(daily.values(), key=lambda item: item["date"], reverse=True)[:90],
        "runs": runs[:50],
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main() -> None:
    db_path = Path(os.environ.get("FLEETBRAIN_STATE_DB", DEFAULT_DB))
    output = Path(os.environ.get("FLEETBRAIN_COST_OUTPUT", DEFAULT_OUTPUT))
    atomic_write(output, collect(db_path))


if __name__ == "__main__":
    main()
