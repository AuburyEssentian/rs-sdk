import { appendFileSync, mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ChatCollector } from './chat';
import { VideoStreamer } from './video';
import { checkClaudeEnv } from './claude';
import { LongRunningAgent } from './agents';

// --- Config ---
const channel = process.env.TWITCH_CHANNEL;
const streamKey = process.env.TWITCH_STREAM_KEY;
const gameBotName = process.env.GAME_BOT_NAME;
const gameClientUrl = process.env.GAME_CLIENT_URL;
const enableVideo = process.env.ENABLE_VIDEO !== 'false';

if (!channel) { console.error('TWITCH_CHANNEL is required'); process.exit(1); }
if (!gameBotName) { console.error('GAME_BOT_NAME is required'); process.exit(1); }

// --- Logging ---
const logDir = join(import.meta.dir, 'logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `stream-${new Date().toISOString().slice(0, 10)}.log`);

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(logFile, line + '\n'); } catch {}
}

// --- Display log ---
const displayLogPath = process.env.BOT_DISPLAY_LOG;

// --- Shared files ---
const CHAT_BUFFER    = '/tmp/chat-buffer.txt';
const RESTART_FILE   = '/tmp/restart-executor';
const PLAN_FILE      = '/tmp/plan.md';
const PLAN_VERSION_FILE = '/tmp/plan-version';
const EXECUTOR_LOG   = '/tmp/executor-log.txt';

function initSharedFiles(): void {
  writeFileSync(CHAT_BUFFER, '');
  writeFileSync(EXECUTOR_LOG, '');
  if (!existsSync(PLAN_FILE)) {
    writeFileSync(PLAN_FILE, readFileSync(join(import.meta.dir, 'plan.md'), 'utf8'));
  }
  if (!existsSync(PLAN_VERSION_FILE)) {
    writeFileSync(PLAN_VERSION_FILE, '0');
  }
}

// --- Main ---
async function main() {
  log(`Starting stream for bot "${gameBotName}" on #${channel}`);
  if (displayLogPath) {
    try { appendFileSync(displayLogPath, ` ${gameBotName}\n${'-'.repeat(44)}\n`); } catch {}
  }
  checkClaudeEnv();
  initSharedFiles();

  // Chat — writes messages to buffer for planner + display log
  let chatConnected = false;
  const chat = new ChatCollector(channel!, (msg) => {
    if (displayLogPath) {
      try { appendFileSync(displayLogPath, ` @${msg.username}  ${msg.text}\n`); } catch {}
    }
    try { appendFileSync(CHAT_BUFFER, `@${msg.username}: ${msg.text}\n`); } catch {}
  });
  try {
    await chat.connect();
    chatConnected = true;
    log('Chat connected');
  } catch (err: unknown) {
    log(`Chat connection failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Video
  let video: VideoStreamer | null = null;
  if (enableVideo && streamKey) {
    const botPassword = process.env.BOT_PASSWORD;
    const botGameUrl = gameClientUrl && gameBotName && botPassword
      ? `${gameClientUrl}/bot?bot=${gameBotName}&password=${botPassword}`
      : gameClientUrl;
    video = new VideoStreamer(streamKey, botGameUrl);
    await video.start();
    log('Video streaming started');
  } else {
    log('Video disabled');
  }

  const waitScript = join(import.meta.dir, 'wait-for-chat.sh');
  const setPlanScript = join(import.meta.dir, 'set-plan.sh');

  // Planner — blocks on chat, updates plan, optionally requests executor restart
  const planner = new LongRunningAgent({
    name: 'planner',
    hasMcp: false,
    prompt: `You are the planner for a Runescape Twitch bot named "${gameBotName}".

Loop forever:
1. Wait for viewer messages:
   Bash("bash ${waitScript}")
   The output is new Twitch chat messages.

2. Read the current plan:
   Bash("cat ${PLAN_FILE}")

3. Write an updated plan based on the messages:
   Bash("bash ${setPlanScript} << 'PLAN'
<your updated plan here>
PLAN")

4. If viewers want something urgent (switch tasks, do something specific now), also run:
   Bash("touch ${RESTART_FILE}")

5. Go back to step 1.

Keep plans concise and actionable. One or two sentences is enough.`,
  });

  // Executor — continuously plays the game based on the current plan
  const executor = new LongRunningAgent({
    name: 'executor',
    hasMcp: true,
    logFile: EXECUTOR_LOG,
    prompt: `You are a Runescape bot playing live on Twitch as "${gameBotName}".

Loop forever:
1. Read your instructions:
   Bash("cat ${PLAN_FILE}")

2. Carry out the instructions using execute_code. Take real, meaningful actions in the game.

3. Use execute_code to call sdk.sendSay() occasionally to chat with viewers.

4. Go back to step 1.

Never stop. Always keep playing.`,
  });

  planner.start();
  executor.start();

  // Watch for planner-requested executor restarts
  setInterval(() => {
    if (existsSync(RESTART_FILE)) {
      try { unlinkSync(RESTART_FILE); } catch {}
      log('Planner requested executor restart');
      executor.restart();
    }
  }, 1_000);

  // Shutdown
  const shutdown = async () => {
    log('Shutting down...');
    planner.stop();
    executor.stop();
    video?.stop();
    await chat.disconnect().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('Planner and executor running');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
