/**
 * trigger-login.ts
 * Uses Chrome DevTools Protocol to trigger game auto-login in the running Chromium instance.
 * Waits for the game to fully load (100% progress) before triggering login.
 */

const botName = process.argv[2] || '';
const password = process.argv[3] || '';

if (!botName || !password) {
  console.error('[trigger-login] Usage: bun trigger-login.ts <botName> <password>');
  process.exit(1);
}

const CDP_URL = 'http://localhost:9222';
const MAX_WAIT_MS = 35 * 60_000; // 35 minutes (game loads slowly with software rendering)
const POLL_INTERVAL_MS = 5_000;

async function getGamePage(): Promise<{ webSocketDebuggerUrl: string; url: string } | null> {
  try {
    const resp = await fetch(`${CDP_URL}/json`);
    if (!resp.ok) return null;
    const pages: any[] = await resp.json();
    return pages.find(p => p.url?.includes('rs-sdk-demo') || p.url?.includes('/bot')) ?? null;
  } catch {
    return null;
  }
}

async function evalInPage(ws: WebSocket, expression: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const timer = setTimeout(() => reject(new Error('CDP eval timeout')), 15_000);

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          clearTimeout(timer);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: false } }));
  });
}

async function closeExtraTabs(): Promise<void> {
  try {
    const resp = await fetch(`${CDP_URL}/json`);
    if (!resp.ok) return;
    const pages: any[] = await resp.json();
    // Keep only the first game page, close any extras
    const gamePages = pages.filter(p => p.type === 'page' && (p.url?.includes('rs-sdk-demo') || p.url?.includes('/bot')));
    for (const p of gamePages.slice(1)) {
      console.log(`[trigger-login] Closing extra tab: ${p.url}`);
      await fetch(`${CDP_URL}/json/close/${p.id}`).catch(() => {});
    }
    // Also close any non-game pages
    for (const p of pages) {
      if (p.type === 'page' && !p.url?.includes('rs-sdk-demo') && !p.url?.includes('/bot')) {
        console.log(`[trigger-login] Closing non-game tab: ${p.url}`);
        await fetch(`${CDP_URL}/json/close/${p.id}`).catch(() => {});
      }
    }
  } catch {}
}

async function main() {
  console.log(`[trigger-login] Starting for bot=${botName}, waiting up to 35min for game load...`);

  const start = Date.now();

  // Wait for CDP and the game page
  let page = null;
  while (Date.now() - start < MAX_WAIT_MS) {
    page = await getGamePage();
    if (page) break;
    console.log('[trigger-login] CDP not ready yet, waiting...');
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!page) {
    console.error('[trigger-login] Could not find game page via CDP');
    process.exit(1);
  }

  console.log(`[trigger-login] Found page: ${page.url}`);

  // Connect via WebSocket
  let ws: WebSocket | null = null;
  let wsConnected = false;

  const connectWS = async () => {
    // Re-fetch page list to get fresh WS URL
    const freshPage = await getGamePage();
    if (!freshPage) throw new Error('Page disappeared');

    const w = new WebSocket(freshPage.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      w.addEventListener('open', () => { wsConnected = true; resolve(); });
      w.addEventListener('error', () => reject(new Error('WS error')));
      setTimeout(() => reject(new Error('WS timeout')), 8_000);
    });
    return w;
  };

  // Retry WS connection with backoff
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      ws = await connectWS();
      console.log('[trigger-login] Connected to CDP WebSocket');
      break;
    } catch (e: any) {
      console.log(`[trigger-login] WS attempt ${attempt} failed: ${e.message}, retrying...`);
      await new Promise(r => setTimeout(r, 3_000 * attempt));
    }
  }

  if (!ws || !wsConnected) {
    console.error('[trigger-login] Could not connect to CDP WebSocket');
    process.exit(1);
  }

  // Poll for game progress and ingame state
  let lastProgress = -1;
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const state = await evalInPage(ws, `JSON.stringify({
        ingame: window.gameClient ? !!window.gameClient.ingame : false,
        progress: window.gameClient ? (window.gameClient.lastProgressPercent ?? 0) : 0,
        autoLoginAvail: typeof window.gameClient?.autoLogin === 'function'
      })`);
      const info = JSON.parse(state?.result?.value ?? '{}');

      if (info.progress !== lastProgress) {
        console.log(`[trigger-login] Progress: ${info.progress}% | ingame: ${info.ingame} | autoLogin: ${info.autoLoginAvail}`);
        lastProgress = info.progress;
      }

      if (info.ingame) {
        console.log('[trigger-login] Already in game!');
        ws.close();
        await closeExtraTabs();
        return;
      }

      if (info.progress >= 100) {
        // Game loaded - trigger login
        console.log('[trigger-login] Game loaded at 100%, triggering login...');
        const loginResult = await evalInPage(ws, `(function() {
          try {
            var usernameEl = document.getElementById('bot-username');
            var passwordEl = document.getElementById('bot-password');
            if (usernameEl) usernameEl.value = ${JSON.stringify(botName)};
            if (passwordEl) passwordEl.value = ${JSON.stringify(password)};
            if (typeof window.quickLogin === 'function') {
              window.quickLogin(${JSON.stringify(botName)}, ${JSON.stringify(password)});
              return 'quickLogin called';
            }
            if (window.gameClient && window.gameClient.autoLogin) {
              window.gameClient.autoLogin(${JSON.stringify(botName)}, ${JSON.stringify(password)});
              return 'autoLogin called';
            }
            return 'no login method';
          } catch(e) { return 'error: ' + e.message; }
        })()`);
        console.log(`[trigger-login] Login triggered: ${loginResult?.result?.value}`);

        // Poll for up to 3 minutes to confirm ingame (login can be slow)
        const loginStart = Date.now();
        while (Date.now() - loginStart < 3 * 60_000) {
          await new Promise(r => setTimeout(r, 3_000));
          try {
            const check = await evalInPage(ws, `JSON.stringify({
              ingame: window.gameClient ? !!window.gameClient.ingame : false,
              progress: window.gameClient ? (window.gameClient.lastProgressPercent ?? 0) : 0
            })`);
            const checkInfo = JSON.parse(check?.result?.value ?? '{}');
            console.log(`[trigger-login] Post-login check: ingame=${checkInfo.ingame} progress=${checkInfo.progress}%`);
            if (checkInfo.ingame) {
              console.log('[trigger-login] Successfully logged in!');
              ws.close();
              await closeExtraTabs();
              return;
            }
          } catch (e: any) {
            console.log(`[trigger-login] Post-login check error: ${e.message}`);
            break;
          }
        }

        console.log('[trigger-login] Login did not result in ingame state, will retry...');
        // Fall through to continue polling loop
      }
    } catch (e: any) {
      console.log(`[trigger-login] Poll error: ${e.message}, reconnecting...`);
      ws.close();
      await new Promise(r => setTimeout(r, 3_000));
      try {
        ws = await connectWS();
      } catch {
        // Continue loop, will retry
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('[trigger-login] Timed out waiting for game to load');
  ws?.close();
}

main().catch(e => {
  console.error('[trigger-login] Fatal error:', e.message);
  process.exit(1);
});
