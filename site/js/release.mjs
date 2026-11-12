export const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;

export function compareRelease(a, b) {
  const av = String(a?.version || '').split('.').map(Number);
  const bv = String(b?.version || '').split('.').map(Number);
  if (av.some(Number.isNaN) || bv.some(Number.isNaN)) return -1;
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const diff = (av[i] || 0) - (bv[i] || 0);
    if (diff !== 0) return diff;
  }
  const ab = Number(a?.build || 0);
  const bb = Number(b?.build || 0);
  if (Number.isNaN(ab) || Number.isNaN(bb)) return -1;
  return ab - bb;
}

export function shouldAcceptRelease(candidate, baseline) {
  if (!candidate?.version || !candidate?.build || !candidate?.links) return false;
  return compareRelease(candidate, baseline) >= 0;
}

export function parseRelease(data, repo) {
  if (!data || data.draft || data.prerelease) return null;
  const match = /^v(\d+(?:\.\d+)*)-build\.(\d+)$/.exec(data.tag_name || '');
  if (!match || !Array.isArray(data.assets)) return null;
  const [, version, build] = match;
  const stem = `Frazia-${version}-${build}-arm64`;
  const downloadPrefix = `https://github.com/${repo}/releases/download/v${version}-build.${build}/`;
  const asset = (name) => {
    const url = data.assets.find((entry) => entry?.name === name)?.browser_download_url;
    return typeof url === 'string' && url.startsWith(downloadPrefix) ? url : null;
  };
  const links = {
    dmg: asset(`${stem}.dmg`),
    zip: asset(`${stem}.zip`),
    install: asset('INSTALL.txt'),
    checksums: asset('SHA256SUMS'),
  };
  if (!Object.values(links).every(Boolean)) return null;
  if (typeof data.html_url === 'string' && data.html_url.startsWith(`https://github.com/${repo}/releases/tag/`)) {
    links.notes = data.html_url;
  }
  return { version, build, links };
}
