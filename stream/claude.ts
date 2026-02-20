import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export interface ClaudeResult {
  response: string;
  sessionId?: string;
}

export interface ClaudeRunOptions {
  timeoutMs: number;
  maxTurns: number;
  botName: string;
}

export function checkClaudeEnv(): void {
  const cwd = process.cwd();
  const home = process.env.HOME ?? '(unset)';
  const mcpPath = `${cwd}/.mcp.json`;
  const mcpExists = existsSync(mcpPath);
  const claudeJson = `${home}/.claude.json`;
  const claudeJsonExists = existsSync(claudeJson);
  console.log(`[claude] cwd=${cwd} HOME=${home} .mcp.json=${mcpExists ? 'found' : 'MISSING'} ~/.claude.json=${claudeJsonExists ? 'found' : 'MISSING'}`);
  if (claudeJsonExists) {
    try {
      const content = readFileSync(claudeJson, 'utf8');
      console.log(`[claude] ~/.claude.json: ${content.slice(0, 300)}`);
    } catch {}
  }
}

export async function runClaude(
  prompt: string,
  opts: ClaudeRunOptions,
): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--max-turns', String(opts.maxTurns),
      '--dangerously-skip-permissions',
      '--mcp-config', '/app/.mcp.json',
    ];

    const proc = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { ...process.env, HOME: '/home/streamer' },
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Claude timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      // Forward each non-empty line so it shows in fly logs
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) console.log(`[claude:err] ${trimmed}`);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      const raw = stdout.trim();
      console.log(`[claude] exit=${code} stdout=${raw.slice(0, 300)}`);

      if (code !== 0 && !raw) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(-500)}`));
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        const response = String(parsed.result ?? parsed.message ?? '');
        console.log(`[claude] session_id=${parsed.session_id} subtype=${parsed.subtype} result_len=${response.length}`);
        resolve({ response, sessionId: parsed.session_id });
      } catch {
        resolve({ response: raw.slice(-1000) });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

