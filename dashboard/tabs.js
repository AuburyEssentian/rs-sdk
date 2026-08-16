export const TABS = ['overview', 'fleet', 'brain', 'costs', 'progress', 'loadout', 'world', 'logs'];

const LEGACY_HASHES = {
  live: 'overview',
  objective: 'overview',
  stats: 'overview',
  health: 'overview',
  gear: 'loadout',
  log: 'logs',
};

const CARD_TABS = {
  live: 'overview',
  objective: 'overview',
  stats: 'overview',
  health: 'overview',
  fleet: 'fleet',
  'fleet-plan': 'fleet',
  brain: 'brain',
  'brain-control': 'brain',
  costs: 'costs',
  'cost-rates': 'costs',
  progress: 'progress',
  gear: 'loadout',
  world: 'world',
  log: 'logs',
};

export function normalizeTab(value) {
  return TABS.includes(value) ? value : 'overview';
}

export function tabFromHash(hash) {
  const value = String(hash || '').replace(/^#/, '').toLowerCase();
  return normalizeTab(LEGACY_HASHES[value] || value);
}

export function nextTab(current, direction) {
  const index = TABS.indexOf(normalizeTab(current));
  return TABS[(index + direction + TABS.length) % TABS.length];
}

export function centeredTabScrollLeft(offsetLeft, tabWidth, viewportWidth, maxScroll) {
  const centred = offsetLeft + tabWidth / 2 - viewportWidth / 2;
  return Math.max(0, Math.min(maxScroll, centred));
}

export function initTabs(root = document) {
  const buttons = [...root.querySelectorAll('[data-dashboard-tab]')];
  if (!buttons.length) return null;

  const setActive = (requested, { updateHash = true, focus = false } = {}) => {
    const tab = normalizeTab(requested);
    root.body.dataset.activeTab = tab;
    let activeButton = null;

    for (const button of buttons) {
      const active = button.dataset.dashboardTab === tab;
      if (active) activeButton = button;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }

    const tablist = activeButton?.parentElement;
    if (tablist && tablist.scrollWidth > tablist.clientWidth) {
      tablist.scrollTo({
        left: centeredTabScrollLeft(activeButton.offsetLeft, activeButton.offsetWidth, tablist.clientWidth, tablist.scrollWidth - tablist.clientWidth),
        behavior: focus ? 'smooth' : 'auto',
      });
    }

    for (const [id, cardTab] of Object.entries(CARD_TABS)) {
      const card = root.getElementById(id);
      if (!card) continue;
      card.hidden = cardTab !== tab;
      card.setAttribute('aria-hidden', String(cardTab !== tab));
    }

    if (updateHash && window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`);
    }
    window.dispatchEvent(new CustomEvent('dashboardtabchange', { detail: { tab } }));
    return tab;
  };

  for (const button of buttons) {
    button.addEventListener('click', () => setActive(button.dataset.dashboardTab));
    button.addEventListener('keydown', event => {
      const current = button.dataset.dashboardTab;
      let target = null;
      if (event.key === 'ArrowRight') target = nextTab(current, 1);
      if (event.key === 'ArrowLeft') target = nextTab(current, -1);
      if (event.key === 'Home') target = TABS[0];
      if (event.key === 'End') target = TABS.at(-1);
      if (!target) return;
      event.preventDefault();
      setActive(target, { focus: true });
    });
  }

  window.addEventListener('hashchange', () => setActive(tabFromHash(window.location.hash), { updateHash: false }));
  setActive(tabFromHash(window.location.hash), { updateHash: true });
  return { setActive, get activeTab() { return root.body.dataset.activeTab; } };
}

if (typeof document !== 'undefined') {
  const start = () => initTabs(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
