#!/bin/zsh
set -eu
DOCKER=/opt/homebrew/bin/docker
COMPOSE=/Users/aubury/.hermes/agent-games/rs-sdk/fleet/brain/docker-compose.yml
ENV_FILE=/Users/aubury/.hermes/profiles/fleetbrain/docker.env
if ! "$DOCKER" info >/dev/null 2>&1; then
  exit 0
fi
if "$DOCKER" inspect -f '{{.State.Running}}' hermes-fleetbrain 2>/dev/null | /usr/bin/grep -qx true; then
  exit 0
fi
exec "$DOCKER" compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d
