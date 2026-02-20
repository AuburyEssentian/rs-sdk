#!/usr/bin/env bash
# Entrypoint for exe.dev (ad-hoc, non-Docker).
# Run from the project root: bash stream/start-exe.sh
set -euo pipefail

PROJ="$(pwd)"

# Load .env
if [ -f "stream/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source stream/.env
    set +a
else
    echo "[start] ERROR: stream/.env not found. Copy stream/.env.example and fill it in."
    exit 1
fi

# Validate required vars
: "${GAME_BOT_NAME:?GAME_BOT_NAME is required in stream/.env}"
: "${BOT_PASSWORD:?BOT_PASSWORD is required in stream/.env}"

# Create bot credentials file
BOT_SERVER="${BOT_SERVER:-rs-sdk-demo.fly.dev}"
mkdir -p "bots/${GAME_BOT_NAME}"
cat > "bots/${GAME_BOT_NAME}/bot.env" << EOF
BOT_USERNAME=${GAME_BOT_NAME}
PASSWORD=${BOT_PASSWORD}
SERVER=${BOT_SERVER}
SHOW_CHAT=false
EOF
echo "[start] Created bots/${GAME_BOT_NAME}/bot.env (SERVER=${BOT_SERVER})"

export BOT_DISPLAY_LOG="/tmp/bot-display.log"
touch "${BOT_DISPLAY_LOG}"

# Start virtual display
export DISPLAY="${DISPLAY:-:99}"
echo "[start] Starting Xvfb on ${DISPLAY}"
Xvfb "${DISPLAY}" -screen 0 1920x1080x24 -nolisten tcp &
sleep 1

# Terminal TUI panel
xterm \
    -geometry 80x60+0+0 \
    -fa 'DejaVu Sans Mono' -fs 14 \
    -bg '#0d1117' -fg '#c9d1d9' \
    -u8 \
    -title 'Bot Terminal' \
    -e "bash -c 'export LANG=C.UTF-8 LC_ALL=C.UTF-8; exec bun ${PROJ}/stream/tui.ts'" &

# Launch game client in Chromium
if [ -n "${GAME_CLIENT_URL:-}" ]; then
    BOT_URL="${GAME_CLIENT_URL}/bot?bot=${GAME_BOT_NAME}&password=${BOT_PASSWORD}"

    # Try chromium-browser, chromium, then google-chrome
    CHROMIUM_BIN="google-chrome"
    for _b in chromium chromium-browser google-chrome google-chrome-stable; do
        if command -v "$_b" &>/dev/null && "$_b" --version &>/dev/null 2>&1; then
            CHROMIUM_BIN="$_b"; break
        fi
    done

    launch_chromium() {
        pkill -f "${CHROMIUM_BIN}.*${GAME_BOT_NAME}" 2>/dev/null || true
        sleep 1
        echo "[start] Launching ${CHROMIUM_BIN} at ${GAME_CLIENT_URL}/bot?bot=${GAME_BOT_NAME}&password=***"
        "${CHROMIUM_BIN}" \
            --disable-dev-shm-usage \
            --disable-gpu \
            --remote-debugging-port=9222 \
            --user-data-dir=/tmp/chrome-profile \
            --no-first-run \
            --disable-infobars \
            --window-size=1280,1080 \
            --window-position=640,0 \
            --app="${BOT_URL}" &
    }

    launch_chromium
    sleep 10

    bun "${PROJ}/stream/trigger-login.ts" "${GAME_BOT_NAME}" "${BOT_PASSWORD}" 2>&1 &

    # Crash watchdog
    (
        while true; do
            sleep 60
            if ! pgrep -f "${CHROMIUM_BIN}" > /dev/null 2>&1; then
                echo "[watchdog] Chromium not running, restarting..."
                launch_chromium
                sleep 30
                bun "${PROJ}/stream/trigger-login.ts" "${GAME_BOT_NAME}" "${BOT_PASSWORD}" 2>&1 || true
            fi
        done
    ) &
else
    echo "[start] GAME_CLIENT_URL not set, skipping browser launch"
fi

# Re-register MCP server (claude can overwrite its config on first run)
echo "[start] Registering MCP server"
claude mcp add rs-agent --scope user -- bun "${PROJ}/mcp/server.ts" 2>&1 || true
echo "[start] MCP servers: $(claude mcp list 2>&1)"

echo "[start] Starting stream orchestrator"
exec bun stream/index.ts
