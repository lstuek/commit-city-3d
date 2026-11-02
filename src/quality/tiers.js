// Quality tiers (GLOSSARY: desktop full, desktop reduced, phone lite), best first,
// and the start-up choice from device capability. Pure: the browser probe lives in index.js.

export const TIERS = ['desktop-full', 'desktop-reduced', 'phone-lite'];

// What each tier sets. fpsCap null = render every display frame.
export const TIER_SETTINGS = {
  'desktop-full': { pixelRatioCap: 2, fpsCap: null, liveShadow: true, reflection: 'live', budgetMs: 1000 / 60 },
  'desktop-reduced': { pixelRatioCap: 1.5, fpsCap: null, liveShadow: false, reflection: 'live', budgetMs: 1000 / 60 },
  'phone-lite': { pixelRatioCap: 1, fpsCap: 30, liveShadow: false, reflection: 'probe', budgetMs: 1000 / 30 },
};

/** The `tier` URL flag, when it names a known tier; otherwise null. */
export function pinnedTier(search) {
  const tier = new URLSearchParams(search).get('tier');
  return TIERS.includes(tier) ? tier : null;
}

/** Coarse GPU class from the WebGL renderer string. */
export function gpuClass(renderer = '') {
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(r)) return 'software';
  if (/geforce|nvidia|quadro|radeon rx|radeon pro|radeon r9|arc\(tm\) a|arc a\d|apple m\d/.test(r)) return 'discrete';
  return 'integrated';
}

/**
 * Start tier: the pinned flag wins; a coarse pointer gets phone lite; a software
 * renderer, or an integrated GPU without a WebGPU adapter, gets desktop reduced.
 */
export function chooseTier({ pinned = null, coarsePointer = false, webgpuAdapter = false, renderer = '' }) {
  if (pinned) return pinned;
  if (coarsePointer) return 'phone-lite';
  const gpu = gpuClass(renderer);
  if (gpu === 'software' || (gpu === 'integrated' && !webgpuAdapter)) return 'desktop-reduced';
  return 'desktop-full';
}
