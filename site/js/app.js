import { I18N, SUPPORTED_LANGUAGES } from './i18n.js';

const STORAGE_KEY = 'voicehelper-language';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    /* storage unavailable: the ?lang link still works */
  }
}

function detectInitialLanguage() {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (SUPPORTED_LANGUAGES.includes(fromUrl)) return fromUrl;
  const saved = readStoredLanguage();
  if (SUPPORTED_LANGUAGES.includes(saved)) return saved;
  return 'en';
}

let currentLanguage = 'en';

/* ---------- Latest release ----------
 * The HTML links point at a known release, so downloads work without
 * JavaScript. On load the page asks GitHub for the latest published
 * release and, if its Frazia assets are complete, replaces the links and
 * updates the version shown. Results are cached for an hour.
 */

const REPO = 'dvoineu/VoiceHelper-downloads';
const RELEASE_CACHE_KEY = 'frazia-latest-release';
const release = { version: '1.1', build: '5' };

function fill(value) {
  return value.replaceAll('{version}', release.version).replaceAll('{build}', release.build);
}

function parseRelease(data) {
  const match = /^v(\d+(?:\.\d+)*)-build\.(\d+)$/.exec(data.tag_name || '');
  if (!match || !Array.isArray(data.assets)) return null;
  const [, version, build] = match;
  const stem = `Frazia-${version}-${build}-arm64`;
  const asset = (name) => data.assets.find((entry) => entry.name === name)?.browser_download_url;
  const links = {
    dmg: asset(stem + '.dmg'),
    zip: asset(stem + '.zip'),
    install: asset('INSTALL.txt'),
    checksums: asset('SHA256SUMS'),
  };
  if (!Object.values(links).every(Boolean)) return null;
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
    if (cached && Date.now() - cached.at < 3600 * 1000) {
      applyRelease(cached.info);
      return;
    }
  } catch { /* no storage */ }
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!response.ok) return;
    const info = parseRelease(await response.json());
    if (!info) return;
    try { sessionStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ at: Date.now(), info })); } catch { /* no storage */ }
    applyRelease(info);
  } catch {
    /* offline or rate limited: keep the links from the HTML */
  }
}

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

/* ---------- Hero demo: listening → recognizing → inserted ---------- */

const demo = (() => {
  const textEl = document.getElementById('demo-text');
  const hud = document.getElementById('demo-hud');
  const statusEl = document.getElementById('demo-status');
  const timerEl = document.getElementById('demo-timer');
  let timers = [];

  const later = (fn, ms) => timers.push(window.setTimeout(fn, ms));
  const clear = () => {
    timers.forEach((id) => window.clearTimeout(id));
    timers = [];
  };

  function setState(state) {
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
    textEl.textContent = I18N[currentLanguage].demoPhrase;
    timerEl.textContent = '0:04';
    setState('inserted');
  }

  function cycle() {
    textEl.textContent = '';
    setState('listening');
    for (let s = 0; s <= 4; s += 1) later(() => { timerEl.textContent = `0:0${s}`; }, s * 800);
    later(() => setState('recognizing'), 3400);
    later(() => {
      const phrase = I18N[currentLanguage].demoPhrase;
      textEl.textContent = phrase;
      setState('inserted');
    }, 4300);
    later(cycle, 9000);
  }

  return {
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

/* ---------- Video chapters ---------- */

/* ---------- Video guide: one video per language ---------- */

const VIDEOS = {
  en: { src: './media/frazia-guide-en.mp4', poster: './media/frazia-guide-en-poster.jpg', chapters: [0, 13, 28, 52, 62, 94, 126, 152, 165, 179] },
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

/* ---------- Active section in the header ---------- */

function setupActiveNav() {
  const links = [...document.querySelectorAll('.primary-nav a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!('IntersectionObserver' in window) || sections.length === 0) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => observer.observe(s));
}

/* ---------- Hero 3D scene (loaded after the page, skipped without WebGL) ---------- */

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
  const anchor = document.getElementById('stage-anchor');
  if (!canvas || !anchor || !supportsWebGL()) return;
  import('./scene3d.js')
    .then(({ HeroScene }) => {
      new HeroScene({ canvas, host: canvas.parentElement, anchor });
      canvas.classList.add('is-ready');
    })
    .catch(() => { /* the page works without the 3D scene */ });
}

const whenIdle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 200));
if (document.readyState === 'complete') whenIdle(loadHeroScene);
else window.addEventListener('load', () => whenIdle(loadHeroScene), { once: true });

setupLanguageSwitch();
setupChapters();
setupActiveNav();
applyLanguage(detectInitialLanguage());
loadLatestRelease();
