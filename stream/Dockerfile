FROM oven/bun:latest

# System deps: ffmpeg, xvfb, chromium, nodejs (for claude cli), fonts
RUN apt-get update && apt-get install -y \
    ffmpeg \
    xvfb \
    xterm \
    chromium \
    nodejs \
    npm \
    procps \
    fonts-liberation \
    fonts-dejavu-core \
    libasound2 \
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
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create a non-root user (required for --dangerously-skip-permissions in Claude Code)
RUN useradd -m -s /bin/bash streamer

# Pre-configure Claude permissions and pre-create all subdirs (so root SSH sessions can't claim them)
RUN mkdir -p /home/streamer/.claude/debug /home/streamer/.claude/projects /home/streamer/.claude/todos /home/streamer/.claude/backups && \
    printf '{"permissions":{"allow":["mcp__rs-agent__*","Bash(*)","Read(*)","Write(*)"],"deny":[]}}\n' \
    > /home/streamer/.claude/settings.json && \
    chown -R streamer:streamer /home/streamer/.claude

# Register the rs-agent MCP server via official claude mcp add command
# Run from /home/streamer to avoid /app symlink issues (bun image has /app -> /home/bun/app)
RUN HOME=/home/streamer runuser -u streamer -- \
    bash -c 'cd /home/streamer && claude mcp add rs-agent --scope user -- bun run /app/mcp/server.ts'

WORKDIR /app

# Copy all source first (no node_modules from host - see .dockerignore)
COPY .mcp.json tsconfig.json bunfig.toml package.json bun.lock ./
COPY sdk/ ./sdk/
COPY mcp/ ./mcp/
COPY stream/ ./stream/
COPY server/vendor/ ./server/vendor/

# Install deps fresh for Linux (after copying so nothing overwrites them)
RUN bun install --frozen-lockfile
RUN cd mcp && bun install --frozen-lockfile

# Create X11 socket dir with sticky bit so non-root Xvfb works
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Give streamer ownership of the app directory
RUN chown -R streamer:streamer /app
RUN chmod +x stream/start.sh stream/wait-for-chat.sh stream/set-plan.sh

USER streamer
CMD ["bash", "stream/start.sh"]
