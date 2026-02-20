import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';

export class ExecutorProcess {
  private proc: ChildProcess | null = null;
  private stopped = false;
  private restartDelay = 5_000;

  constructor(private readonly botName: string) {}

  start(): void {
    this.stopped = false;
    this.spawn();
  }

  restart(): void {
    console.log('[executor] Restarting on planner request...');
    this.proc?.kill('SIGTERM');
    // close handler will call spawn() again
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill('SIGTERM');
    this.proc = null;
  }

  private spawn(): void {
    if (this.stopped) return;

    const waitScript = join(import.meta.dir, 'wait-update.sh');
    const prompt = `You are a Runescape bot playing live on Twitch as "${this.botName}".

Loop forever using this exact pattern:
1. Call: Bash("bash ${waitScript}")
   This blocks until the planner has new instructions. Read what it outputs — that is your plan.
2. Use execute_code to carry out the plan in the game. Take real, meaningful actions.
3. After acting, go back to step 1.

Start now by calling Bash("bash ${waitScript}") to receive your first instructions.`;

    const proc = spawn('claude', [
      '-p', prompt,
      '--max-turns', '1000',
      '--dangerously-skip-permissions',
      '--mcp-config', join(process.cwd(), '.mcp.json'),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { ...process.env, HOME: process.env.HOME ?? '/root' },
    });
    this.proc = proc;

    proc.stdout?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n')) {
        const t = line.trim();
        if (t) console.log(`[executor] ${t}`);
      }
    });
    proc.stderr?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n')) {
        const t = line.trim();
        if (t) console.log(`[executor:err] ${t}`);
      }
    });
    proc.on('error', (err) => console.error(`[executor] spawn error: ${err.message}`));
    proc.on('close', (code) => {
      if (this.stopped) return;
      console.log(`[executor] exited (code ${code}), restarting in ${this.restartDelay}ms`);
      setTimeout(() => this.spawn(), this.restartDelay);
    });

    console.log('[executor] started');
  }
}
