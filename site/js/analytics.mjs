// Explicit events only. The caller must obtain permission before enabling this
// client; constructing it does not access storage or send network requests.
const ENDPOINT = 'https://eu.i.posthog.com/i/v0/e/';
const PROJECT_TOKEN = 'phc_p7Qa9Q6PK4WoNhAgPx8S6gEJf655xJoMrV6VMpzjiEGc';
const ID_KEY = 'frazia-analytics-id';
const DOWNLOAD_KEY = 'frazia-analytics-download';

export function createAnalytics({ storage, crypto, sendBeacon, fetch, enabled = false }) {
  let allowed = enabled;

  function visitorId() {
    try {
      const existing = storage.getItem(ID_KEY);
      if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
      const id = crypto.randomUUID();
      storage.setItem(ID_KEY, id);
      return storage.getItem(ID_KEY) === id ? id : null;
    } catch {
      return null;
    }
  }

  function capture(event, properties) {
    if (!allowed) return;
    const id = visitorId();
    if (!id) return;
    const payload = JSON.stringify({
      token: PROJECT_TOKEN,
      event,
      properties: {
        distinct_id: id,
        schema_version: 1,
        source: 'web',
        environment: 'production',
        $geoip_disable: true,
        ...properties,
      },
    });
    try {
      if (sendBeacon && sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
    } catch { /* fall back to a keepalive request */ }
    try {
      Promise.resolve(fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: payload, keepalive: true, referrerPolicy: 'no-referrer',
      })).catch(() => {});
    } catch { /* analytics must never block the site */ }
  }

  return {
    setEnabled(value) {
      allowed = value === true;
      if (!allowed) {
        try { storage.removeItem(ID_KEY); storage.removeItem(DOWNLOAD_KEY); } catch { /* storage unavailable */ }
      }
    },
    visit(language) {
      capture('site_visited', { language: language === 'ru' ? 'ru' : 'en' });
    },
    download(format, version, build) {
      if (!['dmg', 'zip'].includes(format) || !/^\d+(?:\.\d+)*$/.test(version) || !/^\d+$/.test(build)) return;
      if (allowed) {
        try { storage.setItem(DOWNLOAD_KEY, String(Date.now())); } catch { /* storage unavailable */ }
      }
      capture('download_clicked', { format, release_version: `${version}-build.${build}` });
    },
  };
}
