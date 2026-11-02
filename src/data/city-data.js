// City data loader: the only module that touches the network for data.
// Input a URL and a bundled fallback; output validated city data with every
// missing or invalid value as null (shown as a dash, never as 0).

export const LANDMARK_KEYS = ['portfolio', 'new-era', 'bionic-wave', 'ka-tech', 'ka-ops', 'aios', 'crm', 'systemselect'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
const text = (v) => (typeof v === 'string' && v.trim() ? v : null);
const flag = (v) => (typeof v === 'boolean' ? v : null);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// Throws on data that is not city data at all (so the loader falls back).
export function parseCityData(raw) {
  if (!isObject(raw) || typeof raw.generated_at !== 'string' || Number.isNaN(Date.parse(raw.generated_at))) {
    throw new Error('malformed city data');
  }
  const totals = isObject(raw.totals) ? raw.totals : {};
  const landmarks = isObject(raw.landmarks) ? raw.landmarks : {};
  const locked = isObject(raw.locked) ? raw.locked : {};
  return {
    generated_at: raw.generated_at,
    totals: { tokens: count(totals.tokens), commits: count(totals.commits), top_language: text(totals.top_language) },
    landmarks: Object.fromEntries(LANDMARK_KEYS.map((key) => {
      const l = isObject(landmarks[key]) ? landmarks[key] : {};
      return [key, {
        commits_total: count(l.commits_total),
        commits_30d: count(l.commits_30d),
        pushed_this_week: flag(l.pushed_this_week),
        last_push_date: day(l.last_push_date),
        language: text(l.language),
      }];
    })),
    locked: { activity_30d: count(locked.activity_30d) },
  };
}

export const DASH = '—';

// A null is unknown, never zero: it shows a dash.
export function formatValue(v) {
  if (v === null || v === undefined) return DASH;
  return typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
}

export const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function isStale(city, now = Date.now()) {
  return now - Date.parse(city.generated_at) > STALE_AFTER_MS;
}

export const LIVE_URL = 'https://raw.githubusercontent.com/lstuek/lstuek/main/data/city.json';

// Any failure (network, HTTP status, bad JSON, wrong shape) uses the copy
// bundled at deploy. source tells which one the page shows.
export async function loadCityData(url, fallback, { fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  try {
    const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`city data HTTP ${response.status}`);
    return { city: parseCityData(await response.json()), source: 'live' };
  } catch {
    return { city: parseCityData(fallback), source: 'fallback' };
  }
}
