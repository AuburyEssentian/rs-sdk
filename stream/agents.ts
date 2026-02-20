import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { appendFileSync, readFileSync, writeFileSync } from 'fs';

export interface AgentConfig {
  name: string;
  prompt: string;
  hasMcp: boolean;
  maxTurns?: number;
  /** Optional file to stream stdout lines into (for TUI display). */
  logFile?: string;
}

/** Append a line to a log file, trimming to maxLines periodically. */
function appendToLog(file: string, line: string, maxLines = 400): void {
  try {
    appendFileSync(file, line + '\n');
    // Trim every ~50 writes on average
    if (Math.random() < 0.02) {
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
      if (lines.length > maxLines) {
        writeFileSync(file, lines.slice(-maxLines).join('\n') + '\n');
      }
    }
  } catch {}
}

export class LongRunningAgent {
  private proc: ChildProcess | null = null;
  private stopped = false;

  constructor(private readonly config: AgentConfig) {}

  start(): void {
    this.stopped = false;
    this.spawn();
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill('SIGTERM');
    this.proc = null;
  }

  restart(): void {
    console.log(`[${this.config.name}] restarting`);
    this.proc?.kill('SIGTERM');
    // close handler respawns
  }

  private spawn(): void {
    if (this.stopped) return;

    const args: string[] = [
      '-p', this.config.prompt,
      '--max-turns', String(this.config.maxTurns ?? 1000),
      '--dangerously-skip-permissions',
    ];
    if (this.config.hasMcp) {
      args.push('--mcp-config', join(process.cwd(), '.mcp.json'));
    }

    const proc = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { ...process.env, HOME: process.env.HOME ?? '/root' },
    });
    this.proc = proc;

    const tag = `[${this.config.name}]`;
    proc.stdout?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n')) {
        const trimmed = line.trim();
        if (trimmed) {
          console.log(`${tag} ${trimmed}`);
          if (this.config.logFile) appendToLog(this.config.logFile, trimmed);
        }
      }
    });
    proc.stderr?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n')) {
        if (line.trim()) console.log(`${tag}[err] ${line.trim()}`);
      }
    });
    proc.on('error', (err) => console.error(`${tag} spawn error: ${err.message}`));
    proc.on('close', (code) => {
      if (this.stopped) return;
      console.log(`${tag} exited (code ${code}), restarting in 5s`);
      setTimeout(() => this.spawn(), 5_000);
    });

    console.log(`${tag} started`);
  }
}
