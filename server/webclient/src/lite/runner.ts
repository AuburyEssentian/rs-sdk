// Headless bot runner: a LiteClient session wired to the SDK gateway.
//
// This is BotOverlay minus the browser - same StateCollector, ActionExecutor
// and BotActionQueue, but the gateway socket is a plain Bun WebSocket instead
// of the in-page GatewayConnection (which needs window.location). Controlling
// SDKs (sdk/runner.ts scripts, sdk/cli.ts, MCP execute_code) pair with it
// exactly as they would with a browser tab.
//
//   bun src/lite/runner.ts <botname>          # reads bots/<botname>/bot.env
//
// Run from server/webclient so the '#/*' import map resolves.

import { startSession, type LiteSession } from './session.js';
import { type ActionResult } from '#/bot/ActionExecutor.js';
import { formatWorldStateForAgent } from '#/bot/formatters.js';
import { BotActionQueue, type QueuedBotAction } from '#/bot/ActionQueue.js';
import type { BotAction } from '#/bot/types.js';
import type { LiteClient } from './LiteClient.js';

const TICK_MS = 20; // matches the browser draw loop that drives BotOverlay.tick()
const RECONNECT_MS = 3000;

class LiteGatewayRunner {
    private client: LiteClient;
    private actionQueue = new BotActionQueue();
    private waitTicks = 0;
    private serverTick = 0;

    private ws: WebSocket | null = null;
    private wsConnected = false;
    private preventReconnect = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private tickTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private session: LiteSession,
        private gatewayUrl: string
    ) {
        this.client = session.client;
        // State collection and action execution go through the client, which
        // activates this bot's interface table first - see LiteClient.activate.
        this.client.setOnGameTickCallback(() => {
            this.serverTick++;
            this.sendState();
        });

        this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    }

    connect(): void {
        if (this.ws) return;

        console.log(`[lite-runner] Connecting to gateway ${this.gatewayUrl}`);
        this.ws = new WebSocket(this.gatewayUrl);

        this.ws.onopen = () => {
            this.wsConnected = true;
            const { username, password } = this.client.getCredentials();
            console.log(`[lite-runner] Gateway connected, registering as '${username}'`);
            this.send({
                type: 'connected',
                username,
                password,
                clientId: `${username}-lite-${Date.now()}`,
                maxMessageLength: this.client.getMaxMessageLength()
            });
            // Drop queued work from the previous connection (BotOverlay.onConnected)
            const active = this.actionQueue.active;
            this.actionQueue.beginGeneration();
            if (active && this.waitTicks > 0) {
                this.actionQueue.complete(active);
            }
            this.waitTicks = 0;
        };

        this.ws.onmessage = event => {
            try {
                this.handleMessage(JSON.parse(String(event.data)));
            } catch (e) {
                console.error('[lite-runner] Bad gateway message:', e);
            }
        };

        this.ws.onclose = () => {
            this.wsConnected = false;
            this.ws = null;
            if (!this.preventReconnect) {
                console.warn(`[lite-runner] Gateway closed, reconnecting in ${RECONNECT_MS}ms`);
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
            }
        };

        this.ws.onerror = () => {
            // onclose follows
        };
    }

    stop(): void {
        this.preventReconnect = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.tickTimer) clearInterval(this.tickTimer);
        this.ws?.close();
        this.session.stop();
    }

    private send(msg: unknown): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private handleMessage(msg: any): void {
        if (msg.type === 'action') {
            this.onAction(msg.action, msg.actionId || null, msg.actionTimeoutMs);
        } else if (msg.type === 'screenshot_request') {
            // Headless: no canvas. Answer so the requester doesn't hang on a timeout.
            this.send({ type: 'screenshot_response', dataUrl: '', screenshotId: msg.screenshotId });
        } else if (msg.type === 'save_and_disconnect') {
            console.log(`[lite-runner] save_and_disconnect: ${msg.reason || 'session replaced'}`);
            // Closing the game socket triggers the engine-side save, same as browser logout.
            this.stop();
        }
    }

    private onAction(action: BotAction, actionId: string | null, actionTimeoutMs?: number): void {
        const queueTtlMs = actionTimeoutMs === undefined ? undefined : Math.max(0, actionTimeoutMs - 1_000);
        const queued = this.actionQueue.enqueue({ action, actionId }, queueTtlMs);
        if (!queued) {
            const result: ActionResult = {
                success: false,
                message: 'Action queue is full',
                phase: 'validation',
                reason: 'busy'
            };
            if (actionId) this.sendActionResult(actionId, result);
        }
    }

    private tick(): void {
        for (const expired of this.actionQueue.expirePending()) {
            const result: ActionResult = {
                success: false,
                message: `Action expired in queue: ${expired.action.type}`,
                phase: 'validation',
                reason: 'queue_expired'
            };
            if (expired.actionId) this.sendActionResult(expired.actionId, result);
        }

        if (this.waitTicks > 0) {
            this.waitTicks--;
            const active = this.actionQueue.active;
            if (this.waitTicks === 0 && active) {
                this.finishAction(active, { success: true, message: 'Wait complete', phase: 'completion' });
            }
            return;
        }

        if (this.actionQueue.active) return;

        const queued = this.actionQueue.startNext();
        if (!queued) return;

        const action = queued.action;
        const resultOrPromise = this.client.executeBotAction(action);

        if (resultOrPromise instanceof Promise) {
            resultOrPromise
                .then(result => this.finishAction(queued, result))
                .catch(e =>
                    this.finishAction(queued, {
                        success: false,
                        message: `Error: ${e}`,
                        phase: 'completion',
                        reason: 'execution_error'
                    })
                );
            return;
        }

        if (action.type === 'wait' && resultOrPromise.success) {
            this.waitTicks = (action as any).ticks || 1;
            return;
        }

        this.finishAction(queued, resultOrPromise);
    }

    private finishAction(entry: QueuedBotAction, result: ActionResult): void {
        if (this.actionQueue.active !== entry) return;

        const publishResult = this.actionQueue.isCurrentGeneration(entry);
        this.actionQueue.complete(entry);
        if (!publishResult) return;

        if (entry.actionId) {
            this.sendActionResult(entry.actionId, result);
        }
        this.sendState();
    }

    private sendActionResult(actionId: string, result: ActionResult): void {
        this.send({ type: 'actionResult', actionId, result });
    }

    private sendState(): void {
        if (!this.wsConnected) return;
        const state = this.client.collectBotState(this.serverTick);
        if (!state) return;
        this.send({
            type: 'state',
            state,
            formattedState: formatWorldStateForAgent(state, 'SDK Control')
        });
    }
}

// ------------------------------------------------------------------ CLI entry

function deriveGatewayUrl(server: string): string {
    if (!server) return 'ws://localhost:7780';
    if (server.startsWith('ws://') || server.startsWith('wss://')) return server;
    if (server.startsWith('localhost') || server.startsWith('127.')) {
        return `ws://${server.includes(':') ? server : server + ':7780'}`;
    }
    return `wss://${server}/gateway`;
}

const botName = process.argv[2];
if (!botName) {
    console.error('Usage: bun src/lite/runner.ts <botname>');
    process.exit(1);
}

const repoRoot = new URL('../../../../', import.meta.url).pathname;
const envPath = `${repoRoot}bots/${botName}/bot.env`;
const env = Object.fromEntries(
    (await Bun.file(envPath).text())
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const host = env.SERVER || 'localhost';
const session = await startSession({
    host,
    username: env.BOT_USERNAME!,
    password: env.PASSWORD!,
    quiet: true
});

console.log(`[lite-runner] '${env.BOT_USERNAME}' logged into ${host}`);

const runner = new LiteGatewayRunner(session, deriveGatewayUrl(host));
runner.connect();

process.on('SIGINT', () => {
    console.log('\n[lite-runner] SIGINT, shutting down');
    runner.stop();
    process.exit(0);
});

// One bot per process, so re-login is the supervisor's job (systemd, a shell
// loop, whatever launched us). Exit non-zero on anything we did not ask for, so
// it can tell "finished" from "died".
const end = await session.stopped;
console.log(`[lite-runner] Game session ended (${end.reason})`, end.error ?? '');
runner.stop();
process.exit(end.reason === 'stopped' ? 0 : 1);
