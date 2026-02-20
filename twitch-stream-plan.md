# 24/7 Twitch Stream with Claude Code - Implementation Plan

## Goal

Run a 24/7 Twitch stream of the game bot, where Claude Code reads Twitch chat every 5 minutes and decides what to do next based on viewer suggestions.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Twitch Chat  │────►│  Orchestrator    │────►│  Claude Code    │
│ (tmi.js)     │     │  (stream.ts)     │     │  (claude -p)    │
└─────────────┘     │                  │     │                 │
                    │  - chat buffer   │     │  - reads chat   │
                    │  - 5-min timer   │     │  - picks action │
                    │  - ffmpeg mgmt   │     │  - calls MCP    │
                    │  - chat relay    │     └────────┬────────┘
                    └──────────────────┘              │
                           ▲                          ▼
┌─────────────┐           │              ┌─────────────────┐
│ Twitch RTMP  │◄──────────┤              │  MCP Server     │
│ (ffmpeg)     │   screen  │              │  (mcp/server.ts)│
└─────────────┘   capture  │              └────────┬────────┘
                           │                       ▼
                    ┌──────┴──────┐       ┌─────────────────┐
                    │ Game Client  │◄──────│  Game Gateway   │
                    │ (browser)    │       │  (WebSocket)    │
                    └─────────────┘       └─────────────────┘
```

## Components to Build

### 1. Twitch Chat Collector

**File:** `stream/chat.ts`

- Connect to Twitch IRC via `tmi.js`
- Buffer all messages with username + timestamp
- Filter out bot's own messages
- Optional: basic moderation filter (strip known spam patterns, prompt injection attempts)
- Expose `drain()` method to flush buffer
- Support anonymous read-only mode (no OAuth needed) or authenticated mode (to post replies)

**Dependencies:** `bun add tmi.js && bun add -d @types/tmi.js`

### 2. FFmpeg Stream Manager

**File:** `stream/video.ts`

- Launch FFmpeg to capture game client window → Twitch RTMP
- macOS: use `avfoundation` capture
- Auto-restart on crash with exponential backoff (5s → 10s → 20s → ... → 5min cap)
- Log errors but don't crash the orchestrator
- Graceful shutdown on SIGINT/SIGTERM

**FFmpeg settings:**
- 1080p30 or 720p30 (lower CPU)
- libx264 veryfast preset
- 4500kbps video, 128kbps AAC audio
- Keyframe interval = 60 (2x framerate, Twitch requirement)
- Silent audio track (Twitch requires audio even if muted)

**Dependencies:** FFmpeg installed (`brew install ffmpeg`)

### 3. Claude Code Runner

**File:** `stream/claude.ts`

- Invoke `claude -p` in headless mode with the chat summary as prompt
- Pass `--allowedTools` to auto-approve MCP tools and file reads
- Use `--resume SESSION_ID` to maintain conversation context across cycles
- Parse JSON output to extract session ID and response text
- Timeout protection: kill Claude process if it takes longer than 4 minutes (must finish before next cycle)
- Return Claude's response for posting to chat

**Prompt template:**
```
You are playing a game live on Twitch. Your bot name is "{botName}".

Recent Twitch chat messages (last 5 minutes):
{chatMessages}

Instructions:
- Read what viewers are suggesting
- Check your current game state using the bot tools
- Take an action based on chat suggestions or your own judgment
- Keep a brief summary of what you did (this gets posted to chat)
- Prioritize viewer engagement - acknowledge specific users when acting on their ideas
```

### 4. Orchestrator

**File:** `stream/index.ts`

- Start all three components
- Run the main loop:
  1. Every 5 minutes, drain chat buffer
  2. Build prompt with chat messages
  3. Call Claude Code
  4. Post Claude's response summary back to Twitch chat
  5. Repeat
- Handle errors gracefully (one failed cycle shouldn't kill the stream)
- Log everything to a rotating log file
- Support clean shutdown

### 5. Configuration

**File:** `stream/.env`

```env
# Twitch
TWITCH_CHANNEL=your_channel
TWITCH_STREAM_KEY=live_xxxxx
TWITCH_OAUTH_TOKEN=oauth:xxxxx     # for posting to chat (optional)
TWITCH_BOT_USERNAME=your_bot       # chat bot account name

# Game
GAME_BOT_NAME=Claude46             # which bot to control

# Timing
CHAT_INTERVAL_MS=300000            # 5 minutes
CLAUDE_TIMEOUT_MS=240000           # 4 minute max per cycle

# Claude
CLAUDE_MAX_TURNS=10                # limit actions per cycle
CLAUDE_ALLOWED_TOOLS=Bash,Read,mcp__rs-agent__execute_code,mcp__rs-agent__list_bots
```

## File Structure

```
stream/
├── index.ts          # Orchestrator (entry point)
├── chat.ts           # Twitch chat collector
├── video.ts          # FFmpeg stream manager
├── claude.ts         # Claude Code headless runner
├── .env              # Credentials (gitignored)
└── .env.example      # Template with placeholder values
```

## Implementation Order

1. **chat.ts** - Get Twitch chat reading working standalone
2. **claude.ts** - Get `claude -p` invocation working with MCP tools
3. **index.ts** - Wire chat → Claude → chat response loop (no video yet)
4. **video.ts** - Add FFmpeg streaming
5. **index.ts** - Integrate video manager, add health checks
6. Test full loop end-to-end

## Prerequisites / Setup Steps

1. Install FFmpeg: `brew install ffmpeg`
2. Install tmi.js: `bun add tmi.js && bun add -d @types/tmi.js`
3. Create a Twitch account (or use existing)
4. Get stream key from Twitch Dashboard → Settings → Stream
5. Get OAuth token for chat bot from https://twitchapps.com/tmi/
6. Have the game client running in a browser window (FFmpeg needs something to capture)
7. Have a bot already created and out of tutorial (`bun scripts/create-bot.ts`)
8. Copy `stream/.env.example` to `stream/.env` and fill in credentials

## Considerations

**Cost:** Each 5-minute cycle invokes Claude Code. That's ~288 calls/day. Use `--max-turns` to cap how much work Claude does per cycle.

**Chat moderation:** Raw Twitch chat will contain spam, slurs, and prompt injection attempts. At minimum, strip messages that look like system prompts or instructions. Consider a simple blocklist.

**Session continuity:** Using `--resume` keeps Claude's memory of what it was doing. Without it, every cycle starts fresh with no context. The tradeoff is that sessions accumulate context and may eventually need to be reset.

**Prompt injection:** Viewers will try to manipulate Claude through chat. The system prompt should clearly establish boundaries about what Claude can and cannot do. Consider sandboxing `--allowedTools` tightly.

**Stream stability:** FFmpeg and the orchestrator should be independent — if FFmpeg crashes, the bot keeps playing. If Claude fails a cycle, the stream stays up. Use process supervision (pm2 or systemd) for the orchestrator itself.

**macOS vs Linux:** macOS works for development but a Linux VPS is better for 24/7 uptime. On Linux, use Xvfb (virtual display) + x11grab for headless screen capture. On macOS, the game client window must be visible.

**Rate limits:** Twitch chat has a 20 messages per 30 seconds limit. tmi.js handles this automatically. Claude's responses posted to chat should be kept under 500 characters.
