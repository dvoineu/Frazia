import { I18N, SUPPORTED_LANGUAGES } from './i18n.js';
import { createAnalytics } from './analytics.mjs';

const STORAGE_KEY = 'voicehelper-language';
const ANALYTICS_CHOICE_KEY = 'frazia-analytics-choice';
const REPO = 'dvoineu/VoiceHelper-downloads';
const RELEASE_CACHE_KEY = 'frazia-latest-release';
const release = { version: '1.1', build: '8' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let currentLanguage = 'en';

/* ---------- Theme Override (for Safari/iframe & preview parity) ---------- */

function applyThemeParam(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  } else if (theme === 'auto') {
    delete document.documentElement.dataset.theme;
  }
}

const initialTheme = new URLSearchParams(window.location.search).get('theme');
if (initialTheme) applyThemeParam(initialTheme);

/* ---------- Language ---------- */

function readStoredLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable: ?lang still works */
  }
}

function detectInitialLanguage() {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (SUPPORTED_LANGUAGES.includes(fromUrl)) return fromUrl;
  const saved = readStoredLanguage();
  if (SUPPORTED_LANGUAGES.includes(saved)) return saved;
  return 'en';
}

function fill(value) {
  return value.replaceAll('{version}', release.version).replaceAll('{build}', release.build);
}

/* ---------- Opt-in Analytics ---------- */

function setupAnalytics() {
  const choice = document.getElementById('analytics-choice');
  const settings = document.getElementById('analytics-settings');
  if (!choice || !settings) return;
  if (location.origin !== 'https://dvoineu.github.io' || !location.pathname.startsWith('/Frazia/')) {
    settings.hidden = true;
    return;
  }
  let storage;
  try { storage = window.localStorage; } catch { settings.hidden = true; return; }
  let stored;
  try { stored = storage.getItem(ANALYTICS_CHOICE_KEY); } catch { settings.hidden = true; return; }
  const analytics = createAnalytics({
    storage,
    crypto: window.crypto,
    sendBeacon: navigator.sendBeacon?.bind(navigator),
    fetch: window.fetch.bind(window),
    enabled: stored === 'allow',
  });
  if (stored === 'allow') analytics.visit(currentLanguage, document.referrer);
  choice.hidden = stored === 'allow' || stored === 'decline';
  settings.addEventListener('click', () => { choice.hidden = false; });

  function decide(allow) {
    try { storage.setItem(ANALYTICS_CHOICE_KEY, allow ? 'allow' : 'decline'); } catch {
      analytics.setEnabled(false);
      choice.hidden = true;
      return;
    }
    analytics.setEnabled(allow);
    choice.hidden = true;
    if (allow) analytics.visit(currentLanguage, document.referrer);
  }

  document.getElementById('analytics-allow')?.addEventListener('click', () => decide(true));
  document.getElementById('analytics-decline')?.addEventListener('click', () => decide(false));
  document.querySelectorAll('[data-release="dmg"], [data-release="zip"]').forEach((link) => {
    link.addEventListener('click', () => analytics.download(link.dataset.release, release.version, release.build));
  });
}

/* ---------- Latest GitHub Release ---------- */

function compareRelease(a, b) {
  const av = String(a?.version || '').split('.').map(Number);
  const bv = String(b?.version || '').split('.').map(Number);
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const diff = (av[i] || 0) - (bv[i] || 0);
    if (diff !== 0) return diff;
  }
  return Number(a?.build || 0) - Number(b?.build || 0);
}

function parseRelease(data) {
  const match = /^v(\d+(?:\.\d+)*)-build\.(\d+)$/.exec(data.tag_name || '');
  if (!match || !Array.isArray(data.assets)) return null;
  const [, version, build] = match;
  const stem = `Frazia-${version}-${build}-arm64`;
  const asset = (name) => data.assets.find((entry) => entry.name === name)?.browser_download_url;
  const links = {
    dmg: asset(`${stem}.dmg`),
    zip: asset(`${stem}.zip`),
    install: asset('INSTALL.txt'),
    checksums: asset('SHA256SUMS'),
  };
  if (!Object.values(links).every(Boolean)) return null;
  if (typeof data.html_url === 'string' && data.html_url.startsWith(`https://github.com/${REPO}/releases/tag/`)) {
    links.notes = data.html_url;
  }
  return { version, build, links };
}

function applyRelease(info) {
  if (!info) return;
  if (info.version && info.build) {
    release.version = info.version;
    release.build = info.build;
  }
  Object.entries(info.links).forEach(([kind, url]) => {
    if (!url) return;
    document.querySelectorAll(`[data-release="${kind}"]`).forEach((a) => { a.href = url; });
  });
  document.querySelectorAll('[data-release="label"]').forEach((el) => {
    el.textContent = `${release.version} (${release.build})`;
  });
  applyLanguage(currentLanguage);
}

async function loadLatestRelease() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(RELEASE_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.at < 3600 * 1000 && compareRelease(cached.info, release) >= 0) {
      applyRelease(cached.info);
      return;
    }
  } catch { /* no storage */ }
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      priority: 'low',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!response.ok) return;
    const info = parseRelease(await response.json());
    if (!info) return;
    try { sessionStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ at: Date.now(), info })); } catch { /* no storage */ }
    applyRelease(info);
  } catch {
    /* offline or rate-limited: keep fallback links from HTML */
  }
}

/* ---------- Responsive Popover Navbar ---------- */

let measureNavbar = () => {};

function setupNavbar() {
  const header = document.querySelector('.site-header');
  const inner = header?.querySelector('.header-inner');
  const menu = document.getElementById('site-menu');
  const button = header?.querySelector('.menu-button');
  if (!header || !inner || !menu || !button) return;

  const hasNativePopover = Object.hasOwn(HTMLElement.prototype, 'popover');
  let lastCollapsedWidth = 0;

  measureNavbar = (force = false) => {
    const currentWidth = header.clientWidth;
    const wasWide = header.classList.contains('is-wide');
    if (!force && !wasWide && currentWidth <= lastCollapsedWidth) return;

    const wasOpen = menu.matches(':popover-open') || menu.classList.contains('is-open');
    header.classList.add('is-measuring', 'is-wide');
    menu.removeAttribute('popover');

    const fits = inner.scrollWidth <= inner.clientWidth;
    header.classList.toggle('is-wide', fits);

    if (!fits) {
      lastCollapsedWidth = currentWidth;
      menu.setAttribute('popover', 'auto');
      if (wasOpen) {
        if (hasNativePopover) menu.showPopover?.();
        else menu.classList.add('is-open');
      }
    } else {
      lastCollapsedWidth = 0;
      menu.classList.remove('is-open');
    }

    requestAnimationFrame(() => header.classList.remove('is-measuring'));
  };

  if (!hasNativePopover) {
    button.addEventListener('click', () => {
      menu.classList.toggle('is-open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.classList.remove('is-open');
    });
  }

  menu.addEventListener('click', (event) => {
    if (!event.target.closest('a')) return;
    if (hasNativePopover && menu.hasAttribute('popover')) {
      try { menu.hidePopover(); } catch { /* already closed */ }
    }
    menu.classList.remove('is-open');
  });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => measureNavbar(false));
    ro.observe(header);
    ro.observe(menu);
  }
  measureNavbar(true);
}

/* ---------- Accessible Copy Buttons (Invoker Commands + Fallback) ---------- */

const copyTimers = new WeakMap();
let lastCopyAnnouncement = '';

function legacyCopy(text) {
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
  }
}

function reportCopy(button, ok) {
  const tip = button.nextElementSibling;
  clearTimeout(copyTimers.get(button));
  button.removeAttribute('data-copied');
  button.removeAttribute('data-failed');

  const dict = I18N[currentLanguage];
  let message = ok ? dict.copySuccess : dict.copyFailed;
  if (message === lastCopyAnnouncement) message += '\u00A0';
  lastCopyAnnouncement = message;

  if (tip) tip.textContent = '';
  void button.offsetWidth;
  button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
  if (tip) requestAnimationFrame(() => { tip.textContent = message; });

  copyTimers.set(button, window.setTimeout(() => {
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    if (tip) tip.textContent = '';
  }, 2000));
}

async function copyFromTarget(button, target) {
  if (!button || !target) return;
  const text = target.matches('input, textarea') ? target.value : (target.innerText || target.textContent || '').trim();
  if (!text) return;
  try {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (!legacyCopy(text)) throw new Error('Copy failed');
    }
    reportCopy(button, true);
  } catch {
    reportCopy(button, false);
  }
}

function setupCopyButtons() {
  if ('CommandEvent' in window) {
    document.addEventListener('command', (event) => {
      if (event.command?.startsWith('--copy')) {
        copyFromTarget(event.source, event.target);
      }
    }, true);
  } else {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[command^="--copy"]');
      if (!button) return;
      const target = document.getElementById(button.getAttribute('commandfor'));
      if (target) copyFromTarget(button, target);
    });
  }
}

/* ---------- Accessible Tablists (Selection Follows Focus + hidden="until-found") ---------- */

function setupTabGroup(tablistEl, onSelect) {
  if (!tablistEl) return null;
  const tabs = [...tablistEl.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.querySelector(`[role="tabpanel"][aria-labelledby="${CSS.escape(tab.id)}"]`));
  const hasNativeFocusGroup = Object.hasOwn(HTMLElement.prototype, 'focusGroup');

  function activate(selectedTab, { focus = false } = {}) {
    tabs.forEach((tab, index) => {
      const isSelected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.toggleAttribute('focusgroupstart', isSelected);
      if (!hasNativeFocusGroup) {
        tab.tabIndex = isSelected ? 0 : -1;
      }
      const panel = panels[index];
      if (panel) {
        if (isSelected) {
          panel.hidden = false;
        } else {
          panel.hidden = 'until-found';
        }
      }
    });
    if (focus) selectedTab.focus();
    selectedTab.scrollIntoView?.({ block: 'nearest', inline: 'nearest', container: 'nearest' });
    onSelect?.(selectedTab);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    panels[index]?.addEventListener('beforematch', () => activate(tab));
  });

  if (!hasNativeFocusGroup) {
    tablistEl.addEventListener('keydown', (event) => {
      const current = tabs.indexOf(document.activeElement);
      if (current === -1) return;
      let next = -1;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next !== -1) {
        event.preventDefault();
        activate(tabs[next], { focus: true });
      }
    });
  }

  const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
  if (initial) activate(initial);
  return { activate, tabs };
}

/* ---------- Hero Multi-App Dictation Demo ---------- */

const DEMO_SCENARIOS = {
  messages: { titleKey: 'demoMessagesTitle', phraseKey: 'demoMessagesPhrase' },
  mail: { titleKey: 'demoMailTitle', phraseKey: 'demoMailPhrase' },
  code: { titleKey: 'demoCodeTitle', phraseKey: 'demoCodePhrase' },
};

const demo = (() => {
  const windowEl = document.getElementById('demo-window');
  const titleEl = document.getElementById('demo-window-title');
  const textEl = document.getElementById('demo-text');
  const hud = document.getElementById('demo-hud');
  const statusEl = document.getElementById('demo-status');
  const timerEl = document.getElementById('demo-timer');
  let activeScenario = 'messages';
  let timers = [];

  const later = (fn, ms) => timers.push(window.setTimeout(fn, ms));
  const clear = () => {
    timers.forEach((id) => window.clearTimeout(id));
    timers = [];
  };

  function currentPhrase() {
    const dict = I18N[currentLanguage];
    const spec = DEMO_SCENARIOS[activeScenario] || DEMO_SCENARIOS.messages;
    return dict[spec.phraseKey];
  }

  function updateChrome() {
    if (!windowEl || !titleEl) return;
    const dict = I18N[currentLanguage];
    const spec = DEMO_SCENARIOS[activeScenario] || DEMO_SCENARIOS.messages;
    windowEl.dataset.app = activeScenario;
    titleEl.textContent = dict[spec.titleKey];
  }

  function setState(state) {
    if (!hud || !statusEl) return;
    const dict = I18N[currentLanguage];
    hud.dataset.state = state;
    document.dispatchEvent(new CustomEvent('vh-demo', { detail: state }));
    statusEl.textContent = {
      listening: dict.demoListening,
      recognizing: dict.demoRecognizing,
      inserted: dict.demoInserted,
    }[state];
  }

  function showFinal() {
    updateChrome();
    if (textEl) textEl.textContent = currentPhrase();
    if (timerEl) timerEl.textContent = '0:04';
    setState('inserted');
  }

  function cycle() {
    updateChrome();
    if (textEl) textEl.textContent = '';
    setState('listening');
    for (let s = 0; s <= 4; s += 1) {
      later(() => { if (timerEl) timerEl.textContent = `0:0${s}`; }, s * 750);
    }
    later(() => setState('recognizing'), 3150);
    later(() => {
      if (textEl) textEl.textContent = currentPhrase();
      setState('inserted');
    }, 3950);
    later(cycle, 8600);
  }

  return {
    setScenario(scenario) {
      if (DEMO_SCENARIOS[scenario]) {
        activeScenario = scenario;
        this.restart();
      }
    },
    restart() {
      if (!textEl || !hud) return;
      clear();
      if (reducedMotion.matches || document.hidden) showFinal();
      else cycle();
    },
    stop: clear,
  };
})();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) demo.stop();
  else demo.restart();
});

/* ---------- Video Guide & Chapters ---------- */

const VIDEOS = {
  en: { src: './media/frazia-guide-en-dav-v4.mp4', poster: './media/frazia-guide-en-poster.jpg', chapters: [0, 13, 28, 52, 62, 94, 126, 152, 165, 179] },
  ru: { src: './media/frazia-guide-ru-dav-v4.mp4', poster: './media/frazia-guide-poster.jpg', chapters: [0, 12, 27, 54, 65, 98, 134, 159, 173, 187] },
};

const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function applyVideoLanguage(lang) {
  const video = document.getElementById('guide-video');
  const info = VIDEOS[lang] || VIDEOS.en;
  if (!video) return;
  const source = video.querySelector('source');
  if (source && source.getAttribute('src') !== info.src) {
    source.setAttribute('src', info.src);
    video.setAttribute('poster', info.poster);
    video.load();
  }
  document.querySelectorAll('[data-video-link]').forEach((a) => { a.href = info.src; });
  document.querySelectorAll('[data-seek]').forEach((button, i) => {
    button.dataset.seek = String(info.chapters[i]);
    const time = button.querySelector('.time');
    if (time) time.textContent = formatTime(info.chapters[i]);
  });
}

function setupChapters() {
  const video = document.getElementById('guide-video');
  if (!video) return;
  const buttons = [...document.querySelectorAll('[data-seek]')];

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const seek = () => {
        video.currentTime = Number(button.dataset.seek);
        video.play().catch(() => {});
      };
      if (video.readyState >= 1) seek();
      else {
        video.preload = 'metadata';
        video.addEventListener('loadedmetadata', seek, { once: true });
        video.load();
      }
    });
  });

  video.addEventListener('timeupdate', () => {
    let active = 0;
    buttons.forEach((b, i) => { if (video.currentTime >= Number(b.dataset.seek)) active = i; });
    buttons.forEach((b, i) => {
      if (i === active) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  });
}

/* ---------- Active Section Highlight in Header ---------- */

function setupActiveNav() {
  const links = [...document.querySelectorAll('.site-menu a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!('IntersectionObserver' in window) || sections.length === 0) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-42% 0px -52% 0px' });
  sections.forEach((s) => observer.observe(s));
}

/* ---------- Language Switching ---------- */

function applyLanguage(lang) {
  currentLanguage = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
  const dict = I18N[currentLanguage];

  document.documentElement.lang = currentLanguage;
  document.title = dict.metaTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', dict.metaDescription);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = dict[el.dataset.i18n];
    if (value === undefined) return;
    el.textContent = fill(value);
    el.hidden = value === '';
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const value = dict[el.dataset.i18nHtml];
    if (value !== undefined) el.innerHTML = fill(value);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const value = dict[el.dataset.i18nAriaLabel];
    if (value) el.setAttribute('aria-label', value);
  });

  document.querySelectorAll('[data-language]').forEach((link) => {
    if (link.dataset.language === currentLanguage) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });

  applyVideoLanguage(currentLanguage);
  demo.restart();
  measureNavbar(true);
}

function setupLanguageSwitch() {
  document.querySelectorAll('[data-language]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const lang = link.dataset.language;
      storeLanguage(lang);
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      history.replaceState(null, '', url);
      applyLanguage(lang);
    });
  });
}

/* ---------- Optional Hero 3D Scene ---------- */

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function loadHeroScene() {
  const canvas = document.getElementById('hero-canvas');
  const anchor = document.getElementById('stage-emblem');
  const stageFrame = document.getElementById('demo-stage');
  if (!canvas || !anchor || !supportsWebGL()) return;
  import('./scene3d.js')
    .then(({ HeroScene }) => {
      new HeroScene({ canvas, host: canvas.parentElement, anchor, stageFrame });
      canvas.classList.add('is-ready');
    })
    .catch(() => { /* page works without 3D scene */ });
}

/* ---------- Boot ---------- */

setupNavbar();
setupCopyButtons();
setupTabGroup(document.getElementById('demo-tablist'), (tab) => {
  demo.setScenario(tab.dataset.scenario);
});
setupTabGroup(document.getElementById('model-tablist'));
document.getElementById('demo-replay')?.addEventListener('click', () => demo.restart());
setupLanguageSwitch();
setupChapters();
setupActiveNav();
applyLanguage(detectInitialLanguage());
setupAnalytics();
loadLatestRelease();

const whenIdle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 200));
if (document.readyState === 'complete') whenIdle(loadHeroScene);
else window.addEventListener('load', () => whenIdle(loadHeroScene), { once: true });
