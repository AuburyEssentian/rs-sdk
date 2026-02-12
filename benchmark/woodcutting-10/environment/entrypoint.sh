#!/bin/bash
set -e

echo "[entrypoint] Starting game engine..."
cd /app/server/engine && bun run src/app.ts &
ENGINE_PID=$!

# Wait for engine web server (serves bot client page)
echo "[entrypoint] Waiting for engine to be ready..."
for i in $(seq 1 120); do
    if curl -sf http://localhost:8888 > /dev/null 2>&1; then
        echo "[entrypoint] Engine ready on port 8888"
        break
    fi
    if [ $i -eq 120 ]; then
        echo "[entrypoint] ERROR: Engine failed to start within 120s"
        exit 1
    fi
    sleep 1
done

echo "[entrypoint] Starting gateway..."
cd /app/server/gateway && bun run gateway.ts &
GATEWAY_PID=$!
sleep 3
echo "[entrypoint] Gateway ready on port 7780"

echo "[entrypoint] Launching headless bot client..."
cd /app/server/gateway && bun run launch-bot.ts &
BOT_PID=$!

# Wait for bot to be in-game (puppeteer + tutorial skip)
echo "[entrypoint] Waiting for bot to connect and finish tutorial..."
for i in $(seq 1 120); do
    # Check if launch-bot.ts printed its ready message
    if curl -sf "http://localhost:7780" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done
# Give extra time for tutorial skip
sleep 20
echo "[entrypoint] Bot should be ready"

echo "[entrypoint] All services running (engine=$ENGINE_PID, gateway=$GATEWAY_PID, bot=$BOT_PID)"

# Keep container alive
exec tail -f /dev/null
