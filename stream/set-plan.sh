#!/bin/bash
# Reads new plan from stdin, writes to /tmp/plan.md and signals the executor.
# Usage: bash set-plan.sh << 'PLAN'
#   your plan here
# PLAN
cat > /tmp/plan.md
date +%s > /tmp/plan-version
echo "[planner] Plan updated: $(head -1 /tmp/plan.md)"
