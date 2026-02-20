#!/bin/bash
PLAN_FILE=/tmp/plan.md
VERSION_FILE=/tmp/plan-version
SEEN_FILE=/tmp/plan-last-seen

mkdir -p /tmp
[ -f "$VERSION_FILE" ] || echo "0" > "$VERSION_FILE"
[ -f "$SEEN_FILE" ] || echo "" > "$SEEN_FILE"

LAST=$(cat "$SEEN_FILE")
while true; do
  CURRENT=$(cat "$VERSION_FILE")
  if [ "$CURRENT" != "$LAST" ]; then
    echo "$CURRENT" > "$SEEN_FILE"
    cat "$PLAN_FILE"
    exit 0
  fi
  sleep 0.5
done
