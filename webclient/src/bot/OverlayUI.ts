// OverlayUI.ts - DOM management for bot overlay and packet log panel
// Handles all UI creation, styling, and user interaction

import type { Client } from '#/client/Client.js';
import type { PacketLogEntry } from './types.js';

export interface OverlayUICallbacks {
    onPacketLogToggle(): void;
}

export class OverlayUI {
    private container: HTMLDivElement;
    private content: HTMLPreElement;
    private actionLog: HTMLPreElement;
    private packetLogContainer: HTMLDivElement;
    private packetLogContent!: HTMLPreElement;

    private visible: boolean = true;
    private minimized: boolean = false;
    private packetLogVisible: boolean = false;
    private packetLogEnabled: boolean = false;

    private actionLogEntries: string[] = [];
    private static readonly MAX_LOG_ENTRIES = 50;

    private client: Client;
    private callbacks: OverlayUICallbacks;

    constructor(client: Client, callbacks: OverlayUICallbacks) {
        this.client = client;
        this.callbacks = callbacks;

        // Create main overlay container
        this.container = document.createElement('div');
        this.container.id = 'bot-sdk-overlay';
        this.container.style.cssText = `
            width: 100%;
            max-width: 320px;
            background: rgba(0, 0, 0, 0.85);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            color: #04A800;
            overflow: hidden;
            margin-top: 10px;
        `;

        // Create header with controls
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: rgba(4, 168, 0, 0.2);
        `;
        header.innerHTML = `
            <span style="font-weight: bold;">BOT SDK</span>
            <div>
                <button id="bot-packets" style="background: none; border: 1px solid #04A800; color: #04A800; cursor: pointer; padding: 2px 8px; font-size: 10px;">PKT</button>
            </div>
        `;

        // Create content area (world state)
        this.content = document.createElement('pre');
        this.content.id = 'bot-sdk-content';
        this.content.style.cssText = `
            margin: 0;
            padding: 10px;
            overflow-y: auto;
            max-height: 300px;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;

        // Create action log area
        const actionHeader = document.createElement('div');
        actionHeader.style.cssText = `
            padding: 4px 10px;
            background: rgba(4, 168, 0, 0.15);
            border-top: 1px solid rgba(4, 168, 0, 0.3);
            font-weight: bold;
            font-size: 10px;
        `;
        actionHeader.textContent = 'SDK ACTIONS';

        this.actionLog = document.createElement('pre');
        this.actionLog.id = 'bot-sdk-actions';
        this.actionLog.style.cssText = `
            margin: 0;
            padding: 10px;
            overflow-y: auto;
            max-height: 150px;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: #FFD700;
            font-size: 10px;
        `;
        this.actionLog.textContent = '(waiting for SDK actions...)';

        this.container.appendChild(header);
        this.container.appendChild(this.content);
        this.container.appendChild(actionHeader);
        this.container.appendChild(this.actionLog);

        // Mount to sdk-panel-container if it exists, otherwise fall back to body
        const sdkContainer = document.getElementById('sdk-panel-container');
        if (sdkContainer) {
            sdkContainer.appendChild(this.container);
        } else {
            document.body.appendChild(this.container);
        }

        // Create packet log panel
        this.packetLogContainer = this.createPacketLogPanel();
        document.body.appendChild(this.packetLogContainer);

        // Setup event handlers
        this.setupEventHandlers();
    }

    private createPacketLogPanel(): HTMLDivElement {
        const panel = document.createElement('div');
        panel.id = 'bot-packet-log';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: 450px;
            max-height: 500px;
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #FF6600;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 10px;
            color: #FF6600;
            z-index: 10001;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            display: none;
        `;

        // Packet log header
        const packetHeader = document.createElement('div');
        packetHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: rgba(255, 102, 0, 0.2);
            border-bottom: 1px solid #FF6600;
            cursor: move;
        `;
        packetHeader.innerHTML = `
            <span style="font-weight: bold;">PACKET LOG</span>
            <div>
                <button id="pkt-toggle" style="background: #333; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px;">OFF</button>
                <button id="pkt-clear" style="background: none; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px;">Clear</button>
                <button id="pkt-copy" style="background: none; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px;">Copy</button>
                <button id="pkt-close" style="background: none; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
        `;

        // Packet log content
        this.packetLogContent = document.createElement('pre');
        this.packetLogContent.id = 'bot-packet-content';
        this.packetLogContent.style.cssText = `
            margin: 0;
            padding: 10px;
            overflow-y: auto;
            max-height: 430px;
            white-space: pre;
            word-wrap: normal;
            overflow-x: auto;
        `;
        this.packetLogContent.textContent = 'Packet logging disabled. Click "OFF" button to enable.\n\nUsage:\n1. Click "OFF" to toggle logging ON\n2. Perform actions in-game\n3. Click "Copy" to copy log to clipboard\n4. Click "Clear" to clear the log';

        panel.appendChild(packetHeader);
        panel.appendChild(this.packetLogContent);

        // Make draggable
        this.makeDraggable(packetHeader, panel);

        return panel;
    }

    private setupEventHandlers(): void {
        const packetsBtn = document.getElementById('bot-packets');
        const pktToggle = document.getElementById('pkt-toggle');
        const pktClear = document.getElementById('pkt-clear');
        const pktCopy = document.getElementById('pkt-copy');
        const pktClose = document.getElementById('pkt-close');

        packetsBtn?.addEventListener('click', () => this.togglePacketLog());
        pktToggle?.addEventListener('click', () => this.togglePacketLogging());
        pktClear?.addEventListener('click', () => this.clearPacketLog());
        pktCopy?.addEventListener('click', () => this.copyPacketLog());
        pktClose?.addEventListener('click', () => this.togglePacketLog());
    }

    private makeDraggable(handle: HTMLElement, container: HTMLElement): void {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            if (container.style.left) {
                startLeft = parseInt(container.style.left) || 10;
            } else {
                startLeft = window.innerWidth - container.offsetWidth - (parseInt(container.style.right) || 10);
            }
            startTop = parseInt(container.style.top) || 10;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            container.style.left = `${startLeft + dx}px`;
            container.style.right = 'auto';
            container.style.top = `${startTop + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // Packet log methods
    togglePacketLog(): void {
        this.packetLogVisible = !this.packetLogVisible;
        this.packetLogContainer.style.display = this.packetLogVisible ? 'block' : 'none';

        // Auto-enable logging when opening, auto-disable when closing
        if (this.packetLogVisible && !this.packetLogEnabled) {
            this.setPacketLogging(true);
        } else if (!this.packetLogVisible && this.packetLogEnabled) {
            this.setPacketLogging(false);
        }
    }

    togglePacketLogging(): void {
        this.setPacketLogging(!this.packetLogEnabled);
    }

    private setPacketLogging(enabled: boolean): void {
        this.packetLogEnabled = enabled;
        this.client.setPacketLogging(enabled);

        const toggleBtn = document.getElementById('pkt-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = enabled ? 'ON' : 'OFF';
            toggleBtn.style.background = enabled ? '#FF6600' : '#333';
            toggleBtn.style.color = enabled ? '#000' : '#FF6600';
        }

        if (enabled) {
            this.client.setPacketLogCallback((entry) => this.addPacketLogEntry(entry));
            this.packetLogContent.textContent = '--- Packet logging started ---\n';
        } else {
            this.client.setPacketLogCallback(null);
            this.packetLogContent.textContent += '\n--- Packet logging stopped ---\n';
        }
    }

    addPacketLogEntry(entry: PacketLogEntry): void {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const line = `[${time}] ${entry.name.padEnd(20)} | size: ${entry.size.toString().padStart(3)} | ${entry.data}\n`;
        this.packetLogContent.textContent += line;

        // Auto-scroll to bottom
        this.packetLogContent.scrollTop = this.packetLogContent.scrollHeight;
    }

    clearPacketLog(): void {
        this.client.clearPacketLog();
        this.packetLogContent.textContent = this.packetLogEnabled
            ? '--- Log cleared ---\n'
            : 'Packet logging disabled. Click "OFF" button to enable.\n';
    }

    copyPacketLog(): void {
        const text = this.packetLogContent.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            const copyBtn = document.getElementById('pkt-copy');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.style.background = '#FF6600';
                copyBtn.style.color = '#000';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = 'none';
                    copyBtn.style.color = '#FF6600';
                }, 1000);
            }
        }).catch(err => {
            console.error('Failed to copy packet log:', err);
        });
    }

    isPacketLoggingEnabled(): boolean {
        return this.packetLogEnabled;
    }

    // Main overlay methods
    toggleMinimize(): void {
        this.minimized = !this.minimized;
        const display = this.minimized ? 'none' : 'block';
        this.content.style.display = display;
        this.actionLog.style.display = display;
        // Also hide/show the action header (it's the 3rd child)
        const actionHeader = this.container.children[2] as HTMLElement;
        if (actionHeader) actionHeader.style.display = display;
        this.container.style.maxHeight = this.minimized ? 'auto' : '600px';
    }

    toggle(): void {
        this.visible = !this.visible;
        this.container.style.display = this.visible ? 'block' : 'none';
    }

    show(): void {
        this.visible = true;
        this.container.style.display = 'block';
    }

    hide(): void {
        this.visible = false;
        this.container.style.display = 'none';
    }

    isVisible(): boolean {
        return this.visible;
    }

    isMinimized(): boolean {
        return this.minimized;
    }

    updateContent(text: string): void {
        this.content.textContent = text;
    }

    logAction(type: string, detail: string): void {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = `[${time}] ${type}: ${detail}`;
        this.actionLogEntries.unshift(entry);
        if (this.actionLogEntries.length > OverlayUI.MAX_LOG_ENTRIES) {
            this.actionLogEntries.pop();
        }
        this.actionLog.textContent = this.actionLogEntries.join('\n');
    }

    destroy(): void {
        this.container.remove();
        this.packetLogContainer.remove();
    }
}
