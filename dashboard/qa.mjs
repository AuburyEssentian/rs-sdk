import puppeteer from 'puppeteer';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error instanceof Error ? error.message : String(error)}`));

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:8240/', { waitUntil: 'networkidle0', timeout: 60_000 });
await page.waitForFunction(() => document.querySelector('#online-label')?.textContent === 'Online', { timeout: 20_000 });
await page.screenshot({ path: join(here, 'mobile-viewport.png'), fullPage: false });
await page.screenshot({ path: join(here, 'mobile.png'), fullPage: true });
const mobile = await page.evaluate(() => ({
  viewport: { width: innerWidth, height: innerHeight },
  bodyWidth: document.body.scrollWidth,
  online: document.querySelector('#online-label')?.textContent,
  objective: document.querySelector('#objective-title')?.textContent,
  totalLevel: document.querySelector('#total-level')?.textContent,
  frame: {
    naturalWidth: document.querySelector('#live-frame')?.naturalWidth,
    naturalHeight: document.querySelector('#live-frame')?.naturalHeight,
    renderedWidth: Math.round(document.querySelector('#live-frame')?.getBoundingClientRect().width || 0),
  },
  readOnlyBadge: document.querySelector('.readonly-foot')?.textContent,
  sections: ['fleet', 'fleet-plan', 'brain', 'brain-control', 'costs', 'cost-rates', 'progress', 'gear', 'world', 'log'].map(id => ({ id, exists: Boolean(document.getElementById(id)) })),
  targets: [...document.querySelectorAll('button, .section-nav a')].map(el => ({
    label: el.textContent?.trim() || el.getAttribute('aria-label'),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
  })),
}));

const statusResponse = await fetch('http://127.0.0.1:8240/api/status', { cache: 'no-store' });
const statusPayload = await statusResponse.json();
const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
const mutationResponses = await Promise.all(mutationMethods.map(method => fetch('http://127.0.0.1:8240/api/status', { method })));
const policy = {
  readOnly: statusPayload.readOnly,
  mutationStatuses: Object.fromEntries(mutationMethods.map((method, index) => [method, mutationResponses[index].status])),
  allow: mutationResponses[0].headers.get('allow'),
};

await page.click('#open-viewer');
const dialogOpen = await page.$eval('#viewer', dialog => dialog.open);
await page.click('#close-viewer');

const expectedCards = {
  overview: ['health', 'live', 'objective', 'stats'],
  fleet: ['fleet', 'fleet-plan'],
  brain: ['brain', 'brain-control'],
  costs: ['costs', 'cost-rates'],
  progress: ['progress'],
  loadout: ['gear'],
  world: ['world'],
  logs: ['log'],
};
const tabChecks = {};
for (const [tab, expected] of Object.entries(expectedCards)) {
  await page.click(`#tab-${tab}`);
  await page.waitForFunction(value => document.body.dataset.activeTab === value, {}, tab);
  tabChecks[tab] = await page.evaluate(() => ({
    active: document.body.dataset.activeTab,
    hash: location.hash,
    selected: document.querySelector('.app-tab[aria-selected="true"]')?.dataset.dashboardTab,
    visibleCards: [...document.querySelectorAll('.card')]
      .filter(card => !card.hidden && getComputedStyle(card).display !== 'none')
      .map(card => card.id)
      .sort(),
  }));
  await page.screenshot({ path: join(here, `mobile-tab-${tab}.png`), fullPage: false });
  if (tab === 'logs') await page.click('#tab-client');
  if (JSON.stringify(tabChecks[tab].visibleCards) !== JSON.stringify([...expected].sort())) {
    throw new Error(`Wrong cards on ${tab}: ${JSON.stringify(tabChecks[tab])}`);
  }
}

await page.focus('#tab-logs');
await page.keyboard.press('ArrowRight');
await page.waitForFunction(() => document.body.dataset.activeTab === 'overview');
const keyboardWrapped = await page.$eval('#tab-overview', tab => tab === document.activeElement && tab.getAttribute('aria-selected') === 'true');

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.reload({ waitUntil: 'networkidle0', timeout: 60_000 });
await page.waitForFunction(() => document.querySelector('#online-label')?.textContent === 'Online', { timeout: 20_000 });
await page.screenshot({ path: join(here, 'desktop.png'), fullPage: true });
await page.click('#tab-fleet');
await page.screenshot({ path: join(here, 'desktop-fleet.png'), fullPage: true });
await page.click('#tab-brain');
await page.screenshot({ path: join(here, 'desktop-brain.png'), fullPage: true });
await page.click('#tab-costs');
await page.screenshot({ path: join(here, 'desktop-costs.png'), fullPage: true });
await page.click('#tab-loadout');
await page.screenshot({ path: join(here, 'desktop-loadout.png'), fullPage: true });
const desktop = await page.evaluate(() => ({
  viewport: { width: innerWidth, height: innerHeight },
  bodyWidth: document.body.scrollWidth,
  online: document.querySelector('#online-label')?.textContent,
  activeTab: document.body.dataset.activeTab,
  cards: document.querySelectorAll('.card').length,
  healthRows: document.querySelectorAll('.health-row').length,
  skillRows: document.querySelectorAll('.skill-row').length,
  itemRows: document.querySelectorAll('.item').length,
  chartPath: document.querySelector('#chart-line')?.getAttribute('d'),
  fleetBots: document.querySelectorAll('.fleet-bot').length,
  fleetOnline: document.querySelector('#fleet-online')?.textContent,
  fleetConfigured: document.querySelector('#fleet-configured')?.textContent,
  brainModel: document.querySelector('#brain-model')?.textContent,
  longHorizon: document.querySelector('#brain-long-horizon')?.textContent,
  shortGoals: document.querySelectorAll('#brain-short-goals .data-row').length,
  milestones: document.querySelectorAll('#brain-milestones .data-row').length,
  progressEvidence: document.querySelectorAll('#brain-progress-evidence .observation').length,
  estimatedCost: document.querySelector('#cost-total')?.textContent,
}));

const smallTargets = mobile.targets.filter(target => target.h > 0 && target.h < 44);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
if (mobile.bodyWidth > mobile.viewport.width) throw new Error(`Mobile horizontal overflow: ${mobile.bodyWidth}px body in ${mobile.viewport.width}px viewport`);
if (smallTargets.length) throw new Error(`Touch targets below 44px: ${JSON.stringify(smallTargets)}`);
if (!mobile.sections.every(section => section.exists)) throw new Error(`Missing read-only section: ${JSON.stringify(mobile.sections)}`);
if (policy.readOnly !== true || !Object.values(policy.mutationStatuses).every(status => status === 405) || policy.allow !== 'GET, HEAD') throw new Error(`Read-only policy failed: ${JSON.stringify(policy)}`);
if (!dialogOpen) throw new Error('Live-frame viewer did not open');
if (!keyboardWrapped) throw new Error('Arrow-key tab navigation did not wrap and focus Overview');
if (!Object.entries(tabChecks).every(([tab, check]) => check.active === tab && check.selected === tab && check.hash === `#${tab}`)) {
  throw new Error(`Tab state/hash mismatch: ${JSON.stringify(tabChecks)}`);
}
if (!desktop.chartPath || desktop.itemRows < 1 || desktop.activeTab !== 'loadout') throw new Error(`Read-only tab data failed to render: ${JSON.stringify(desktop)}`);
if (desktop.fleetBots < 1 || desktop.fleetBots > 20 || Number(desktop.fleetOnline) < 1) throw new Error(`Fleet data failed to render: ${JSON.stringify(desktop)}`);
if (desktop.brainModel !== 'gpt-5.6-luna' || !/^(?:\$|USD)/.test(desktop.estimatedCost || '')) throw new Error(`Fleetbrain/cost data failed to render: ${JSON.stringify(desktop)}`);
if (!desktop.longHorizon || desktop.longHorizon.startsWith('Waiting for')) throw new Error(`Hierarchical strategy failed to render: ${JSON.stringify(desktop)}`);
if (desktop.shortGoals < 1 || desktop.milestones < 1 || desktop.progressEvidence < 1) throw new Error(`Goal ladder detail failed to render: ${JSON.stringify(desktop)}`);

console.log(JSON.stringify({ mobile, desktop, policy, tabChecks, keyboardWrapped, dialogOpen, errors }, null, 2));
await browser.close();
