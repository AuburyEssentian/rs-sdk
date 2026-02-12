FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# System dependencies:
#   chromium     - real chromium binary (not a snap shim like ubuntu 24.04)
#   default-jre  - Java runtime for RuneScript compiler (engine cache packing)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    chromium \
    default-jre-headless \
    unzip \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Use system chromium instead of puppeteer downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Clone rs-sdk
ARG RS_SDK_REPO=https://github.com/MaxBittker/rs-sdk.git
ARG RS_SDK_REF=main
RUN git clone --depth 1 --branch $RS_SDK_REF $RS_SDK_REPO /app
WORKDIR /app

# Install all workspace dependencies
RUN bun install
RUN cd engine && bun install
RUN cd gateway && bun install
RUN cd webclient && bun install && bun run build
RUN cp -r webclient/out/bot engine/public/bot
RUN cd mcp && bun install

# Pre-pack game cache and let engine fully start so all data files are generated.
# Wait for "World ready" in output, then kill. This ensures maps, scripts, configs are all packed.
RUN cd engine && \
    bun run src/app.ts > /tmp/engine.log 2>&1 & \
    for i in $(seq 1 300); do \
        grep -q "World ready" /tmp/engine.log 2>/dev/null && break; \
        sleep 1; \
    done && \
    sleep 2 && kill $(jobs -p) 2>/dev/null; rm -f /tmp/engine.log; true

# Create bot credentials (local server, no remote)
RUN mkdir -p bots/agent
COPY bot.env bots/agent/bot.env

# Copy entrypoint and helper scripts
COPY entrypoint.sh /entrypoint.sh
COPY launch-bot.ts /app/gateway/launch-bot.ts
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
