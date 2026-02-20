export interface ChatMessage {
  username: string;
  text: string;
  timestamp: number;
}

export class ChatCollector {
  private buffer: ChatMessage[] = [];
  private ws: WebSocket | null = null;
  private readonly channel: string;
  private readonly onMessage?: (msg: ChatMessage) => void;
  private stopped = false;

  constructor(channel: string, onMessage?: (msg: ChatMessage) => void) {
    this.channel = channel.toLowerCase().replace(/^#/, '');
    this.onMessage = onMessage;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      this.ws = ws;

      ws.addEventListener('open', () => {
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK justinfan12345');
        ws.send(`JOIN #${this.channel}`);
        resolve();
      });

      ws.addEventListener('message', ({ data }) => {
        for (const line of data.toString().split('\r\n')) {
          this.handleLine(line, ws);
        }
      });

      ws.addEventListener('error', () => reject(new Error('WebSocket connection error')));

      ws.addEventListener('close', () => {
        if (!this.stopped) {
          console.log('[chat] Disconnected, reconnecting in 5s...');
          setTimeout(() => this.connect().catch((e: Error) => console.log(`[chat] Reconnect failed: ${e.message}`)), 5000);
        }
      });
    });
  }

  private handleLine(line: string, ws: WebSocket): void {
    if (!line) return;
    if (line.startsWith('PING')) {
      ws.send('PONG :tmi.twitch.tv');
      return;
    }
    const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
    if (match) {
      const [, username, text] = match;
      const msg = { username, text: this.sanitize(text), timestamp: Date.now() };
      this.buffer.push(msg);
      console.log(`[chat] @${msg.username}: ${msg.text}`);
      this.onMessage?.(msg);
    }
  }

  private sanitize(text: string): string {
    return text
      .replace(/<\|im_start\||<\|im_end\||<s>|<\/s>/gi, '')
      .replace(/system\s*:/gi, 'system -')
      .replace(/\[INST\]|\[\/INST\]/gi, '')
      .slice(0, 200)
      .trim();
  }

  drain(): ChatMessage[] {
    const messages = [...this.buffer];
    this.buffer = [];
    return messages;
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }
}
