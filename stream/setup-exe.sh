#!/usr/bin/env bash
# One-time setup for an exe.dev VM (Ubuntu/exeuntu base).
# Run from the project root: bash stream/setup-exe.sh
set -euo pipefail

echo "[setup] Installing system packages..."
sudo apt-get update -q
sudo apt-get install -y \
    ffmpeg \
    xvfb \
    xterm \
    chromium-browser \
    nodejs \
    npm \
    procps \
    fonts-liberation \
    fonts-dejavu-core \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils

echo "[setup] Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

echo "[setup] Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

echo "[setup] Installing project dependencies..."
bun install --frozen-lockfile
cd mcp && bun install --frozen-lockfile && cd ..

echo "[setup] Configuring Claude permissions..."
mkdir -p "$HOME/.claude/debug" "$HOME/.claude/projects" "$HOME/.claude/todos"
printf '{"permissions":{"allow":["mcp__rs-agent__*","Bash(*)","Read(*)","Write(*)"],"deny":[]}}\n' \
    > "$HOME/.claude/settings.json"

echo "[setup] Registering MCP server..."
claude mcp add rs-agent --scope user -- bun run "$(pwd)/mcp/server.ts"

echo ""
echo "[setup] Done. Next steps:"
echo "  1. cp stream/.env.example stream/.env"
echo "  2. Fill in stream/.env (GAME_BOT_NAME, BOT_PASSWORD, TWITCH_CHANNEL, etc.)"
echo "  3. bash stream/start-exe.sh"
