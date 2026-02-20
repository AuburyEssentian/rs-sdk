#!/bin/bash
# Blocks until new Twitch chat messages arrive, then outputs them.
# Called by the planner agent in a loop.
BUFFER=/tmp/chat-buffer.txt
SEEN=/tmp/chat-last-seen

mkdir -p /tmp
touch "$BUFFER"
[ -f "$SEEN" ] || echo "0" > "$SEEN"

LAST=$(cat "$SEEN")
while true; do
  CURRENT=$(wc -l < "$BUFFER" | tr -d ' ')
  if [ "$CURRENT" -gt "$LAST" ]; then
    echo "$CURRENT" > "$SEEN"
    tail -n "+$((LAST + 1))" "$BUFFER"
    exit 0
  fi
  sleep 0.5
done
