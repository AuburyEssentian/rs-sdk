#!/bin/bash
set -e

IMAGE_NAME="${IMAGE_NAME:-ghcr.io/maxbittker/rs-agent-benchmark}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building Docker image: ${FULL_IMAGE}"

cd "$(dirname "$0")"
docker build -t "${FULL_IMAGE}" .

echo "Built: ${FULL_IMAGE}"

if [ "$PUSH" = "1" ] || [ "$PUSH" = "true" ]; then
    echo "Pushing ${FULL_IMAGE}..."
    docker push "${FULL_IMAGE}"
    echo "Pushed: ${FULL_IMAGE}"
fi
