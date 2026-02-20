/**
 * Stream TUI — replaces `tail -F /tmp/bot-display.log` in xterm.
 * Renders three panels every 2s: PLAN · EXECUTOR · CHAT
 * Designed for the fixed 80×60 xterm geometry used in start.sh.
 */
import { readFileSync, existsSync } from 'fs';

const PLAN_FILE         = '/tmp/plan.md';
const PLAN_VERSION_FILE = '/tmp/plan-version';
const EXECUTOR_LOG      = '/tmp/executor-log.txt';
const CHAT_BUFFER       = '/tmp/chat-buffer.txt';

// Fixed terminal size matching xterm -geometry 80x60
const COLS = process.stdout.columns || 80;
const ROWS = process.stdout.rows    || 60;
const INNER = COLS - 4; // usable content width (borders + 1-space padding each side)

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const hide = '\x1b[?25l';
const show = '\x1b[?25h';
const cls  = '\x1b[2J\x1b[H';
const rst  = '\x1b[0m';
const at   = (r: number, c: number) => `\x1b[${r};${c}H`;
const dim    = (s: string) => `\x1b[2m${s}${rst}`;
const bold   = (s: string) => `\x1b[1m${s}${rst}`;
const cyan   = (s: string) => `\x1b[96m${s}${rst}`;
const green  = (s: string) => `\x1b[92m${s}${rst}`;
const yellow = (s: string) => `\x1b[93m${s}${rst}`;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Pad string to visible length `len`, ignoring ANSI codes. */
function pad(s: string, len: number): string {
  const vis = stripAnsi(s).length;
  return s + ' '.repeat(Math.max(0, len - vis));
}

/** Word-wrap `text` into lines of at most `width` chars, up to `maxLines`. */
function wrap(text: string, width: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (out.length >= maxLines) break;
    const line = raw.trimEnd();
    if (!line) { out.push(''); continue; }
    let r = line;
    while (r.length > 0 && out.length < maxLines) {
      out.push(r.slice(0, width));
      r = r.slice(width);
    }
  }
  return out;
}

/** Read last `n` non-empty lines from a file. */
function readTail(file: string, n: number): string[] {
  if (!existsSync(file)) return [];
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(l => l.trim())
      .slice(-n);
  } catch { return []; }
}

function readAll(file: string): string {
  if (!existsSync(file)) return '';
  try { return readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

// ── VT100 alternate character set (line drawing built into xterm, no font needed) ──
// \x1b(0 = enter DEC Special Graphics mode; \x1b(B = return to ASCII
// In graphics mode: l=┌ k=┐ m=└ j=┘ q=─ x=│
const ACS_ON  = '\x1b(0';
const ACS_OFF = '\x1b(B';

// ── Box drawing ───────────────────────────────────────────────────────────────
/**
 * Draw a titled box into `buf` using VT100 line drawing.
 * Top border pattern: ┌─ TITLE ──────┐  (ACS chars + normal title text)
 */
function drawBox(
  buf: string[],
  titlePlain: string,
  titleAnsi: string,
  rows: string[],
  startRow: number,
  boxH: number,
): void {
  // prefix = "─ " (2), suffix = " " (1), corners = 2  →  fill = COLS - 5 - titlePlain.length
  const fillLen = Math.max(0, COLS - 5 - titlePlain.length);

  // ┌─ TITLE ─...─┐
  buf.push(at(startRow, 1));
  buf.push(ACS_ON, 'l', 'q', ACS_OFF); // ┌─
  buf.push(' ', titleAnsi, ' ');        // _TITLE_
  buf.push(ACS_ON, 'q'.repeat(fillLen), 'k', ACS_OFF); // ─...─┐

  // │ content │
  for (let i = 0; i < boxH - 2; i++) {
    buf.push(at(startRow + 1 + i, 1));
    buf.push(ACS_ON, 'x', ACS_OFF, ' ');               // │_
    buf.push(pad((rows[i] ?? '').slice(0, INNER), INNER));
    buf.push(' ', ACS_ON, 'x', ACS_OFF);               // _│
  }

  // └─...─┘
  buf.push(at(startRow + boxH - 1, 1));
  buf.push(ACS_ON, 'm', 'q'.repeat(COLS - 2), 'j', ACS_OFF); // └──...──┘
}

// ── Layout (must sum to ROWS) ─────────────────────────────────────────────────
const PLAN_H = 6;   // rows 1-6    → 4 content lines
const EXEC_H = 42;  // rows 7-48   → 40 content lines
const CHAT_H = 12;  // rows 49-60  → 10 content lines
// 6 + 42 + 12 = 60 ✓

// ── Render ────────────────────────────────────────────────────────────────────
function render(): void {
  const buf: string[] = [hide, cls];

  // ── PLAN ──
  const planRaw = readAll(PLAN_FILE) || 'No plan set yet.';
  const planTs  = readAll(PLAN_VERSION_FILE);
  let planText  = planRaw;
  if (planTs) {
    const secs = Math.floor(Date.now() / 1000) - parseInt(planTs, 10);
    const age  = secs < 60 ? `${secs}s` : secs < 3600 ? `${Math.floor(secs / 60)}m` : `${Math.floor(secs / 3600)}h`;
    planText = `${dim(`[${age} ago]`)}  ${planRaw}`;
  }
  const planRows = wrap(planText, INNER, PLAN_H - 2);
  drawBox(buf, 'PLAN', cyan(bold('PLAN')), planRows, 1, PLAN_H);

  // ── EXECUTOR ──
  const execRows = readTail(EXECUTOR_LOG, EXEC_H - 2);
  drawBox(buf, 'EXECUTOR', green(bold('EXECUTOR')), execRows, PLAN_H + 1, EXEC_H);

  // ── CHAT ──
  const chatRows = readTail(CHAT_BUFFER, CHAT_H - 2);
  drawBox(buf, 'CHAT', yellow(bold('CHAT')), chatRows, PLAN_H + EXEC_H + 1, CHAT_H);

  // ── Status line ──
  buf.push(at(ROWS, 1), dim(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'));

  process.stdout.write(buf.join(''));
}

// ── Run ───────────────────────────────────────────────────────────────────────
process.stdout.write(hide);
render();
const interval = setInterval(render, 2_000);

function cleanup() {
  clearInterval(interval);
  process.stdout.write(show + '\x1b[2J\x1b[H');
  process.exit(0);
}
process.on('SIGINT',  cleanup);
process.on('SIGTERM', cleanup);
