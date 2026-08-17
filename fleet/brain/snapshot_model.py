"""Fail-closed projections for model-visible Fleetbrain runtime state."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

DIRECTIVE_ID = re.compile(r"^fd-[a-z0-9][a-z0-9-]{7,79}$")
BOT_ID = re.compile(r"^Fsz[A-Za-z0-9]{1,9}$")


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None and parsed.utcoffset() is not None else None
    except ValueError:
        return None


def _valid_timestamp(value: Any) -> bool:
    return _parse_timestamp(value) is not None


def _project_receipt(value: Any) -> dict[str, Any] | None:
    keys = {"version", "directiveId", "botId", "mode", "completedAt", "ok", "from", "to", "amount", "recoveredFromClaim"}
    if not isinstance(value, dict) or set(value) != keys:
        return None
    if value.get("version") != 1 or value.get("ok") is not True or value.get("mode") != "fund-banker":
        return None
    directive_id = value.get("directiveId")
    bot_id = value.get("botId")
    source = value.get("from")
    destination = value.get("to")
    amount = value.get("amount")
    recovered = value.get("recoveredFromClaim", False)
    if not isinstance(directive_id, str) or not DIRECTIVE_ID.fullmatch(directive_id):
        return None
    if not isinstance(bot_id, str) or not BOT_ID.fullmatch(bot_id):
        return None
    if source != bot_id or destination != "Fszbank1":
        return None
    if not isinstance(amount, int) or isinstance(amount, bool) or amount < 100 or amount > 5000:
        return None
    if not _valid_timestamp(value.get("completedAt")) or not isinstance(recovered, bool):
        return None
    return {
        "version": 1,
        "directiveId": directive_id,
        "botId": bot_id,
        "mode": "fund-banker",
        "completedAt": value["completedAt"],
        "ok": True,
        "from": source,
        "to": destination,
        "amount": amount,
        "recoveredFromClaim": recovered,
    }


def recent_directive_receipts(path: Path, limit: int = 20, max_size: int = 4096) -> list[dict[str, Any]]:
    """Read only small, regular, non-symlink files and return strict receipt projections."""
    try:
        entries = []
        with os.scandir(path) as iterator:
            for entry in iterator:
                try:
                    if not entry.name.endswith(".json") or not entry.is_file(follow_symlinks=False):
                        continue
                    stat = entry.stat(follow_symlinks=False)
                    if stat.st_size <= 0 or stat.st_size > max_size:
                        continue
                    entries.append((stat.st_mtime_ns, Path(entry.path)))
                except OSError:
                    continue
    except OSError:
        return []

    receipts: list[dict[str, Any]] = []
    for _, item in sorted(entries, reverse=True):
        if len(receipts) >= max(0, min(limit, 20)):
            break
        try:
            projected = _project_receipt(json.loads(item.read_text()))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if projected is not None:
            receipts.append(projected)
    return receipts


def bounded_worker_directives(path: Path, max_size: int = 16384) -> dict[str, Any]:
    empty = {"version": 1, "directives": []}
    try:
        stat = path.lstat()
        if not path.is_file() or path.is_symlink() or stat.st_size <= 0 or stat.st_size > max_size:
            return empty
        value = json.loads(path.read_text())
    except (OSError, UnicodeError, json.JSONDecodeError):
        return empty
    if not isinstance(value, dict) or set(value) != {"version", "updatedAt", "directives"}:
        return empty
    if value.get("version") != 1 or not _valid_timestamp(value.get("updatedAt")):
        return empty
    directives = value.get("directives")
    if not isinstance(directives, list) or len(directives) > 5:
        return empty
    projected = []
    ids: set[str] = set()
    bots: set[str] = set()
    keys = {"id", "botId", "role", "mode", "amount", "reason", "createdAt", "expiresAt"}
    for item in directives:
        if not isinstance(item, dict) or set(item) != keys:
            return empty
        directive_id, bot_id = item.get("id"), item.get("botId")
        role, mode, amount, reason = item.get("role"), item.get("mode"), item.get("amount"), item.get("reason")
        if not isinstance(directive_id, str) or not DIRECTIVE_ID.fullmatch(directive_id) or directive_id in ids:
            return empty
        if not isinstance(bot_id, str) or not BOT_ID.fullmatch(bot_id) or bot_id in bots:
            return empty
        if role not in {"thief", "rune"} or mode != "fund-banker":
            return empty
        if not isinstance(amount, int) or isinstance(amount, bool) or amount < 100 or amount > 5000:
            return empty
        if not isinstance(reason, str) or not 20 <= len(reason) <= 300:
            return empty
        if not _valid_timestamp(item.get("createdAt")) or not _valid_timestamp(item.get("expiresAt")):
            return empty
        created = _parse_timestamp(item["createdAt"])
        expires = _parse_timestamp(item["expiresAt"])
        if created is None or expires is None or expires <= created or (expires - created).total_seconds() > 6 * 60 * 60:
            return empty
        ids.add(directive_id)
        bots.add(bot_id)
        projected.append({key: item[key] for key in keys})
    return {"version": 1, "updatedAt": value["updatedAt"], "directives": projected}
