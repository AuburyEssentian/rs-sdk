#!/usr/bin/env bun
// Gateway Service - Unified WebSocket router
// Combines Sync (bot↔SDK routing) and Controller (UI↔Agent routing) into one process
// SyncModule: always on, handles bot and sdk clients
// ControllerModule: activates when UI connects, handles agent lifecycle

import type {
    BotWorldState,
    BotAction,
    ActionResult,
    BotClientMessage,
    SyncToBotMessage,
    SDKMessage,
    SyncToSDKMessage
} from './types';
import { RunRecorder, type RunEvent } from './run-recorder';

const GATEWAY_PORT = parseInt(process.env.AGENT_PORT || '7780');
const AGENT_SERVICE_PORT = parseInt(process.env.AGENT_SERVICE_PORT || '7782');

// ============ Shared Types ============

interface BotSession {
    ws: any;
    clientId: string;
    username: string;
    lastState: BotWorldState | null;
    currentActionId: string | null;
}

interface SDKSession {
    ws: any;
    sdkClientId: string;
    targetUsername: string;
}

interface UISession {
    ws: any;
    username: string;
}

interface ActionLogEntry {
    timestamp: number;
    type: 'thinking' | 'action' | 'result' | 'error' | 'system' | 'user_message' | 'code' | 'state';
    content: string;
}

interface AgentState {
    running: boolean;
    sessionId: string | null;
    goal: string | null;
    startedAt: number | null;
    actionLog: ActionLogEntry[];
}

interface UIBotSession {
    state: AgentState;
    uiClients: Set<any>;
    recorder: RunRecorder | null;
}

// ============ Shared State ============

const botSessions = new Map<string, BotSession>();      // username -> BotSession
const sdkSessions = new Map<string, SDKSession>();      // sdkClientId -> SDKSession
const uiSessions = new Map<string, UIBotSession>();     // username -> UIBotSession
const wsToType = new Map<any, { type: 'bot' | 'sdk' | 'ui'; id: string }>();

// ============ Sync Module (Always On) ============

const SyncModule = {
    sendToBot(session: BotSession, message: SyncToBotMessage) {
        if (session.ws) {
            try {
                session.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`[Gateway] [${session.username}] Failed to send to bot:`, error);
            }
        }
    },

    sendToSDK(session: SDKSession, message: SyncToSDKMessage) {
        if (session.ws) {
            try {
                session.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`[Gateway] [${session.sdkClientId}] Failed to send to SDK:`, error);
            }
        }
    },

    getSDKSessionsForBot(username: string): SDKSession[] {
        const sessions: SDKSession[] = [];
        for (const session of sdkSessions.values()) {
            if (session.targetUsername === username) {
                sessions.push(session);
            }
        }
        return sessions;
    },

    extractUsernameFromClientId(clientId: string | undefined): string | null {
        if (!clientId) return null;
        if (clientId.startsWith('bot-')) return null;
        const parts = clientId.split('-');
        if (parts.length >= 1 && parts[0] && !parts[0].match(/^\d+$/)) {
            return parts[0];
        }
        return null;
    },

    handleBotMessage(ws: any, message: BotClientMessage) {
        if (message.type === 'connected') {
            const username = message.username || this.extractUsernameFromClientId(message.clientId) || 'default';
            const clientId = message.clientId || `bot-${Date.now()}`;

            const existingSession = botSessions.get(username);
            if (existingSession && existingSession.ws !== ws) {
                try { existingSession.ws?.close(); } catch {}
            }

            const session: BotSession = {
                ws,
                clientId,
                username,
                lastState: existingSession?.lastState || null,
                currentActionId: null
            };

            botSessions.set(username, session);
            wsToType.set(ws, { type: 'bot', id: username });

            console.log(`[Gateway] Bot connected: ${clientId} (${username})`);

            this.sendToBot(session, { type: 'status', status: 'Connected to gateway' });

            for (const sdkSession of this.getSDKSessionsForBot(username)) {
                this.sendToSDK(sdkSession, { type: 'sdk_connected', success: true });
            }
            return;
        }

        const wsInfo = wsToType.get(ws);
        if (!wsInfo || wsInfo.type !== 'bot') return;

        const session = botSessions.get(wsInfo.id);
        if (!session) return;

        if (message.type === 'actionResult' && message.result) {
            const actionId = message.actionId || session.currentActionId || undefined;
            console.log(`[Gateway] [${session.username}] Action result: ${message.result.success ? 'success' : 'failed'} - ${message.result.message}`);

            for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_action_result',
                    actionId,
                    result: message.result
                });
            }
            session.currentActionId = null;
            return;
        }

        if (message.type === 'state' && message.state) {
            session.lastState = message.state;
            for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                this.sendToSDK(sdkSession, { type: 'sdk_state', state: message.state });
            }
        }

        if (message.type === 'screenshot_response' && message.dataUrl) {
            ControllerModule.handleScreenshot(session.username, message.dataUrl);
        }
    },

    handleSDKMessage(ws: any, message: SDKMessage) {
        if (message.type === 'sdk_connect') {
            const sdkClientId = message.clientId || `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const targetUsername = message.username;

            const session: SDKSession = { ws, sdkClientId, targetUsername };
            sdkSessions.set(sdkClientId, session);
            wsToType.set(ws, { type: 'sdk', id: sdkClientId });

            console.log(`[Gateway] SDK connected: ${sdkClientId} -> ${targetUsername}`);

            this.sendToSDK(session, { type: 'sdk_connected', success: true });

            const botSession = botSessions.get(targetUsername);
            if (botSession?.lastState) {
                this.sendToSDK(session, { type: 'sdk_state', state: botSession.lastState });
            }
            return;
        }

        if (message.type === 'sdk_action') {
            const wsInfo = wsToType.get(ws);
            if (!wsInfo || wsInfo.type !== 'sdk') return;

            const sdkSession = sdkSessions.get(wsInfo.id);
            if (!sdkSession) return;

            const botSession = botSessions.get(message.username || sdkSession.targetUsername);
            if (!botSession || !botSession.ws) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_error',
                    actionId: message.actionId,
                    error: 'Bot not connected'
                });
                return;
            }

            botSession.currentActionId = message.actionId || null;
            this.sendToBot(botSession, {
                type: 'action',
                action: message.action,
                actionId: message.actionId
            });

            console.log(`[Gateway] [${botSession.username}] SDK action: ${message.action?.type} (${message.actionId})`);
        }
    },

    handleClose(ws: any) {
        const wsInfo = wsToType.get(ws);
        if (!wsInfo) return;

        if (wsInfo.type === 'bot') {
            const session = botSessions.get(wsInfo.id);
            if (session) {
                console.log(`[Gateway] Bot disconnected: ${session.clientId} (${session.username})`);
                session.ws = null;

                for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                    this.sendToSDK(sdkSession, { type: 'sdk_error', error: 'Bot disconnected' });
                }
            }
        } else if (wsInfo.type === 'sdk') {
            const session = sdkSessions.get(wsInfo.id);
            if (session) {
                console.log(`[Gateway] SDK disconnected: ${session.sdkClientId}`);
                sdkSessions.delete(wsInfo.id);
            }
        }

        wsToType.delete(ws);
    }
};

// ============ Controller Module (Activates on UI Connect) ============

let agentServiceWs: WebSocket | null = null;
let agentServiceConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const ControllerModule = {
    getOrCreateSession(username: string): UIBotSession {
        let session = uiSessions.get(username);
        if (!session) {
            session = {
                state: {
                    running: false,
                    sessionId: null,
                    goal: null,
                    startedAt: null,
                    actionLog: []
                },
                uiClients: new Set(),
                recorder: null
            };
            uiSessions.set(username, session);
        }
        return session;
    },

    broadcastToBot(username: string, message: any) {
        const session = uiSessions.get(username);
        if (!session) return;

        const data = JSON.stringify(message);
        for (const client of session.uiClients) {
            try { client.send(data); } catch {}
        }
    },

    addLogEntry(username: string, type: ActionLogEntry['type'], content: string) {
        const session = this.getOrCreateSession(username);
        const entry: ActionLogEntry = { timestamp: Date.now(), type, content };
        session.state.actionLog.push(entry);

        if (session.state.actionLog.length > 200) {
            session.state.actionLog = session.state.actionLog.slice(-200);
        }

        this.broadcastToBot(username, { type: 'log', entry });

        if (session.recorder?.isRecording()) {
            session.recorder.logEvent({
                timestamp: entry.timestamp,
                type: entry.type as RunEvent['type'],
                content: entry.content
            });
        }
    },

    connectToAgentService() {
        if (agentServiceWs && agentServiceWs.readyState === WebSocket.OPEN) return;

        console.log(`[Gateway] Connecting to agent service at ws://localhost:${AGENT_SERVICE_PORT}...`);

        try {
            agentServiceWs = new WebSocket(`ws://localhost:${AGENT_SERVICE_PORT}`);

            agentServiceWs.onopen = () => {
                console.log('[Gateway] Connected to agent service');
                agentServiceConnected = true;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            };

            agentServiceWs.onmessage = (event) => {
                try {
                    const msg = JSON.parse(String(event.data));
                    this.handleAgentServiceMessage(msg);
                } catch (e) {
                    console.error('[Gateway] Error parsing agent service message:', e);
                }
            };

            agentServiceWs.onclose = () => {
                console.log('[Gateway] Disconnected from agent service');
                agentServiceConnected = false;
                agentServiceWs = null;
                this.scheduleReconnect();
            };

            agentServiceWs.onerror = () => {
                agentServiceConnected = false;
            };
        } catch (e) {
            console.error('[Gateway] Failed to connect to agent service:', e);
            this.scheduleReconnect();
        }
    },

    scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            this.connectToAgentService();
        }, 3000);
    },

    sendToAgentService(message: object): boolean {
        if (!agentServiceWs || !agentServiceConnected) return false;
        try {
            agentServiceWs.send(JSON.stringify(message));
            return true;
        } catch {
            return false;
        }
    },

    handleAgentServiceMessage(msg: any) {
        const username = msg.username;
        if (!username) return;

        const session = this.getOrCreateSession(username);

        switch (msg.type) {
            case 'thinking':
            case 'action':
            case 'code':
            case 'result':
            case 'error':
            case 'system':
            case 'state':
                this.addLogEntry(username, msg.type, msg.content);
                break;

            case 'todos':
                this.broadcastToBot(username, { type: 'todos', todos: msg.todos });
                break;

            case 'status':
                if (msg.status === 'running') {
                    session.state.running = true;
                    this.broadcastToBot(username, { type: 'status', status: 'running', goal: session.state.goal });
                } else if (msg.status === 'stopped' || msg.status === 'idle') {
                    session.state.running = false;
                    this.broadcastToBot(username, { type: 'status', status: 'stopped' });
                }
                break;
        }
    },

    handleScreenshot(username: string, dataUrl: string) {
        const session = uiSessions.get(username);
        if (session?.recorder?.isRecording()) {
            session.recorder.saveScreenshot(dataUrl);
        }
    },

    requestScreenshot(username: string) {
        const botSession = botSessions.get(username);
        if (botSession?.ws) {
            SyncModule.sendToBot(botSession, { type: 'screenshot_request' } as any);
        }
    },

    startAgent(username: string, goal: string) {
        console.log(`[Gateway] [${username}] Starting agent with goal: ${goal}`);

        const session = this.getOrCreateSession(username);
        session.state.goal = goal;
        session.state.startedAt = Date.now();
        session.state.actionLog = [];
        session.state.running = true;

        if (session.recorder?.isRecording()) {
            session.recorder.stopRun();
        }

        session.recorder = new RunRecorder();
        session.recorder.startRun(username, goal, () => this.requestScreenshot(username));

        this.addLogEntry(username, 'system', `Starting agent with goal: ${goal}`);
        this.broadcastToBot(username, { type: 'status', status: 'starting', goal });

        const sent = this.sendToAgentService({ type: 'start', username, goal });

        if (!sent) {
            this.addLogEntry(username, 'error', 'Agent service not available. Make sure agent-service.ts is running.');
            session.state.running = false;
            if (session.recorder?.isRecording()) session.recorder.stopRun();
            this.broadcastToBot(username, { type: 'status', status: 'stopped' });
        }
    },

    stopAgent(username: string) {
        const session = uiSessions.get(username);
        if (!session) return;

        this.addLogEntry(username, 'system', 'Stopping agent...');
        this.sendToAgentService({ type: 'stop', username });
        session.state.running = false;

        if (session.recorder?.isRecording()) {
            session.recorder.stopRun();
        }

        this.broadcastToBot(username, { type: 'status', status: 'stopped' });
    },

    sendMessage(username: string, message: string) {
        const session = this.getOrCreateSession(username);
        this.addLogEntry(username, 'user_message', message);

        if (session.state.running) {
            const sent = this.sendToAgentService({ type: 'message', username, message });
            if (sent) {
                this.addLogEntry(username, 'system', 'Message sent to agent');
            } else {
                this.addLogEntry(username, 'error', 'Failed to send message - agent service not available');
            }
        } else {
            this.addLogEntry(username, 'system', 'Agent not running. Starting agent with your message...');
            this.startAgent(username, message);
        }
    },

    handleUIMessage(ws: any, message: any) {
        const wsInfo = wsToType.get(ws);
        if (!wsInfo || wsInfo.type !== 'ui') return;

        const username = wsInfo.id;
        const session = this.getOrCreateSession(username);

        switch (message.type) {
            case 'start':
                if (message.goal) this.startAgent(username, message.goal);
                break;
            case 'stop':
                this.stopAgent(username);
                break;
            case 'restart':
                if (session.state.goal) this.startAgent(username, session.state.goal);
                break;
            case 'send':
                if (message.message) this.sendMessage(username, message.message);
                break;
            case 'getState':
                ws.send(JSON.stringify({ type: 'state', ...session.state }));
                break;
            case 'clearLog':
                session.state.actionLog = [];
                this.broadcastToBot(username, { type: 'logCleared' });
                break;
        }
    },

    handleUIConnect(ws: any, username: string) {
        // Lazy-connect to agent service on first UI connection
        this.connectToAgentService();

        const session = this.getOrCreateSession(username);
        session.uiClients.add(ws);
        wsToType.set(ws, { type: 'ui', id: username });

        console.log(`[Gateway] UI connected for ${username} (${session.uiClients.size} clients)`);

        ws.send(JSON.stringify({
            type: 'state',
            ...session.state,
            agentServiceConnected
        }));
    },

    handleUIClose(ws: any) {
        const wsInfo = wsToType.get(ws);
        if (!wsInfo || wsInfo.type !== 'ui') return;

        const username = wsInfo.id;
        const session = uiSessions.get(username);

        if (session) {
            session.uiClients.delete(ws);
            console.log(`[Gateway] UI disconnected for ${username} (${session.uiClients.size} clients)`);

            if (session.uiClients.size === 0) {
                if (session.state.running) this.stopAgent(username);
                uiSessions.delete(username);
                console.log(`[Gateway] [${username}] Session cleared`);
            }
        }

        wsToType.delete(ws);
    }
};

// ============ Message Router ============

function handleMessage(ws: any, data: string) {
    let parsed: any;
    try {
        parsed = JSON.parse(data);
    } catch {
        console.error('[Gateway] Invalid JSON');
        return;
    }

    // Check if this is already a known connection
    const wsInfo = wsToType.get(ws);
    if (wsInfo) {
        if (wsInfo.type === 'bot') {
            SyncModule.handleBotMessage(ws, parsed);
        } else if (wsInfo.type === 'sdk') {
            SyncModule.handleSDKMessage(ws, parsed);
        } else if (wsInfo.type === 'ui') {
            ControllerModule.handleUIMessage(ws, parsed);
        }
        return;
    }

    // Route based on message type for new connections
    if (parsed.type?.startsWith('sdk_')) {
        SyncModule.handleSDKMessage(ws, parsed);
    } else if (parsed.type === 'connected' || parsed.type === 'state' || parsed.type === 'actionResult' || parsed.type === 'screenshot_response') {
        SyncModule.handleBotMessage(ws, parsed);
    }
}

function handleClose(ws: any) {
    const wsInfo = wsToType.get(ws);
    if (!wsInfo) return;

    if (wsInfo.type === 'ui') {
        ControllerModule.handleUIClose(ws);
    } else {
        SyncModule.handleClose(ws);
    }
}

// ============ Server Setup ============

console.log(`[Gateway] Starting Gateway Service on port ${GATEWAY_PORT}...`);

const server = Bun.serve({
    port: GATEWAY_PORT,

    fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (req.headers.get('upgrade') === 'websocket') {
            // Check if this is a UI connection (has ?bot= param)
            const botUsername = url.searchParams.get('bot');
            const upgraded = server.upgrade(req, { data: { botUsername } });
            if (upgraded) return undefined;
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Status page
        if (url.pathname === '/' || url.pathname === '/status') {
            const botUsername = url.searchParams.get('bot');

            // If ?bot=all or no bot param, show full status
            if (!botUsername || botUsername === 'all') {
                const bots: Record<string, any> = {};
                for (const [username, session] of botSessions) {
                    bots[username] = {
                        connected: session.ws !== null,
                        clientId: session.clientId,
                        lastTick: session.lastState?.tick || 0,
                        inGame: session.lastState?.inGame || false,
                        player: session.lastState?.player?.name || null
                    };
                }

                const sdks: Record<string, any> = {};
                for (const [id, session] of sdkSessions) {
                    sdks[id] = { targetUsername: session.targetUsername };
                }

                const uis: Record<string, any> = {};
                for (const [username, session] of uiSessions) {
                    uis[username] = {
                        running: session.state.running,
                        goal: session.state.goal,
                        clients: session.uiClients.size
                    };
                }

                return new Response(JSON.stringify({
                    status: 'running',
                    agentServiceConnected,
                    connectedBots: botSessions.size,
                    connectedSDKs: sdkSessions.size,
                    connectedUIs: uiSessions.size,
                    bots,
                    sdks,
                    uis
                }, null, 2), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // Specific bot status (for controller API compatibility)
            const session = ControllerModule.getOrCreateSession(botUsername);
            return new Response(JSON.stringify({
                bot: botUsername,
                running: session.state.running,
                sessionId: session.state.sessionId,
                goal: session.state.goal,
                startedAt: session.state.startedAt,
                logCount: session.state.actionLog.length,
                agentServiceConnected
            }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Controller API endpoints
        const botUsername = url.searchParams.get('bot') || 'default';

        if (url.pathname === '/log') {
            const session = ControllerModule.getOrCreateSession(botUsername);
            return new Response(JSON.stringify(session.state.actionLog), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        if (url.pathname === '/start' && req.method === 'POST') {
            return (async () => {
                try {
                    const body = await req.json() as { goal?: string };
                    if (body.goal) {
                        ControllerModule.startAgent(botUsername, body.goal);
                        return new Response(JSON.stringify({ ok: true, bot: botUsername }), {
                            headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
                    }
                    return new Response(JSON.stringify({ ok: false, error: 'No goal provided' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                } catch {
                    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
            })();
        }

        if (url.pathname === '/stop' && req.method === 'POST') {
            ControllerModule.stopAgent(botUsername);
            return new Response(JSON.stringify({ ok: true, bot: botUsername }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        return new Response(`Gateway Service (port ${GATEWAY_PORT})

Endpoints:
- GET /status              Full status (bots, SDKs, UIs)
- GET /status?bot=<name>   Bot-specific status
- GET /log?bot=<name>      Action log
- POST /start?bot=<name>   Start agent {goal}
- POST /stop?bot=<name>    Stop agent

WebSocket:
- ws://localhost:${GATEWAY_PORT}              Bot/SDK connections
- ws://localhost:${GATEWAY_PORT}?bot=<name>   UI connections

Agent Service: ${agentServiceConnected ? 'Connected' : 'Disconnected'}
Bots: ${botSessions.size} | SDKs: ${sdkSessions.size} | UIs: ${uiSessions.size}
`, {
            headers: { 'Content-Type': 'text/plain', ...corsHeaders }
        });
    },

    websocket: {
        open(ws: any) {
            const botUsername = ws.data?.botUsername;
            if (botUsername) {
                // UI connection with ?bot= param
                ControllerModule.handleUIConnect(ws, botUsername);
            }
            // Bot/SDK connections identify themselves via first message
        },

        message(ws: any, message: string | Buffer) {
            handleMessage(ws, message.toString());
        },

        close(ws: any) {
            handleClose(ws);
        }
    }
});

console.log(`[Gateway] Gateway running at http://localhost:${GATEWAY_PORT}`);
console.log(`[Gateway] Bot/SDK: ws://localhost:${GATEWAY_PORT}`);
console.log(`[Gateway] UI: ws://localhost:${GATEWAY_PORT}?bot=<username>`);
console.log(`[Gateway] Agent service: ws://localhost:${AGENT_SERVICE_PORT}`);

// Connect to agent service eagerly on startup
ControllerModule.connectToAgentService();
