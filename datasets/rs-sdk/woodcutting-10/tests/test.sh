#!/bin/bash
# Verify woodcutting level and write continuous reward.
# Reward = min(current_level / 10, 1.0)

set -e

mkdir -p /logs/verifier

cd /app
bun run /tests/check_level.ts
