#!/usr/bin/env bash
set -euo pipefail

# Ensure HOME is set correctly (Fly init sets HOME=/ for PID 1)
export HOME=/home/streamer

# Load local .env if present (for local dev only — skip on Fly where secrets are injected)
if [ -f "stream/.env" ] && [ -z "${FLY_APP_NAME:-}" ]; then
    set -a
    # shellcheck disable=SC1091
    source stream/.env
    set +a
fi

# Validate required env vars
: "${GAME_BOT_NAME:?GAME_BOT_NAME is required}"
: "${BOT_PASSWORD:?BOT_PASSWORD is required}"

# Create bot credentials file from env vars (so MCP server can connect)
BOT_SERVER="${BOT_SERVER:-rs-sdk-demo.fly.dev}"
mkdir -p "bots/${GAME_BOT_NAME}"
cat > "bots/${GAME_BOT_NAME}/bot.env" << EOF
BOT_USERNAME=${GAME_BOT_NAME}
PASSWORD=${BOT_PASSWORD}
SERVER=${BOT_SERVER}
SHOW_CHAT=false
EOF
echo "[start] Created bots/${GAME_BOT_NAME}/bot.env (SERVER=${BOT_SERVER})"

# Clean display log for the terminal panel (written by index.ts)
export BOT_DISPLAY_LOG="/tmp/bot-display.log"
touch "${BOT_DISPLAY_LOG}"

# On Linux, start virtual display and browser
if [[ "$(uname -s)" == "Linux" ]]; then
    export DISPLAY="${DISPLAY:-:99}"
    echo "[start] Starting Xvfb on ${DISPLAY}"
    Xvfb "${DISPLAY}" -screen 0 1920x1080x24 -nolisten tcp &
    sleep 1

    # Terminal panel on the left (~640x1080, font 14pt → ~8px/char → ~80 cols, ~18px/row → ~60 rows)
    xterm \
        -geometry 80x60+0+0 \
        -fa 'DejaVu Sans Mono' -fs 14 \
        -bg '#0d1117' -fg '#c9d1d9' \
        -u8 \
        -title 'Bot Terminal' \
        -e "bash -c 'export LANG=C.UTF-8 LC_ALL=C.UTF-8; exec bun /app/stream/tui.ts'" &

    # Launch game client in Chromium if URL is set
    if [ -n "${GAME_CLIENT_URL:-}" ]; then
        # Build bot-specific auto-login URL so the game session is live
        BOT_URL="${GAME_CLIENT_URL}/bot?bot=${GAME_BOT_NAME}&password=${BOT_PASSWORD}"
        STATUS_URL="https://${BOT_SERVER}/status/${GAME_BOT_NAME}"

        launch_chromium() {
            pkill -f "chromium.*${GAME_BOT_NAME}" 2>/dev/null || true
            sleep 1
            echo "[start] Launching Chromium at ${GAME_CLIENT_URL}/bot?bot=${GAME_BOT_NAME}&password=***"
            chromium \
                --disable-dev-shm-usage \
                --disable-gpu \
                --remote-debugging-port=9222 \
                --no-first-run \
                --disable-infobars \
                --window-size=1280,1080 \
                --window-position=640,0 \
                --app="${BOT_URL}" &
        }

        launch_chromium
        sleep 10

        # Trigger login via CDP - waits for 100% load then logs in (runs in background)
        bun /app/stream/trigger-login.ts "${GAME_BOT_NAME}" "${BOT_PASSWORD}" 2>&1 &

        # Background watchdog: restart Chromium only if it crashes (not while loading)
        (
            while true; do
                sleep 60
                # Only restart if Chromium process is gone (crashed)
                if ! pgrep -f "chromium" > /dev/null 2>&1; then
                    echo "[watchdog] Chromium not running, restarting..."
                    launch_chromium
                    sleep 30
                    echo "[watchdog] Re-triggering login..."
                    bun /app/stream/trigger-login.ts "${GAME_BOT_NAME}" "${BOT_PASSWORD}" 2>&1 || true
                fi
            done
        ) &
    else
        echo "[start] GAME_CLIENT_URL not set, skipping browser launch"
    fi
fi

# Ensure ~/.claude/debug is writable (may be root-owned from SSH debugging)
mkdir -p /home/streamer/.claude/debug 2>/dev/null || true

# Register MCP server at runtime (ensures ~/.claude.json always has it,
# even after Claude overwrites it with a fresh config on first run)
echo "[start] Registering MCP server in user config"
claude mcp add rs-agent --scope user -- bun /app/mcp/server.ts 2>&1 || true
echo "[start] MCP servers: $(claude mcp list 2>&1)"

echo "[start] Starting stream orchestrator"
exec bun stream/index.ts
