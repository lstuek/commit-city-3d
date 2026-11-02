// Quality governor: moves between tiers from the measured 95th-percentile frame time.
// Frames are judged in windows; a tier change needs `sustainWindows` windows in a row
// on the same side of a threshold. After each change, `cooldownWindows` windows are
// ignored; a change that reverses the previous one doubles that cooldown (the guard
// against flip-flopping). The governor never rises above `ceiling` (the start tier).
import { TIERS, TIER_SETTINGS } from './tiers.js';
import { percentile } from '../bench/stats.js';

const LOWER_ABOVE = 1.25; // p95 over budget x 1.25: too slow for this tier
const RAISE_BELOW = { 'desktop-reduced': 0.7, 'phone-lite': 1.1 }; // headroom to try the tier above

export function createGovernor({ tier, ceiling = tier, windowFrames = 60, sustainWindows = 3, cooldownWindows = 5, onChange = () => {} }) {
  let frames = [];
  let streak = 0;
  let side = 0; // -1 lower, +1 raise, 0 hold
  let cooldown = 0;
  let lastMove = 0;
  let reversals = 0;
  const top = TIERS.indexOf(ceiling);

  const gov = { tier, changes: 0, sample };

  function judge(p95) {
    const i = TIERS.indexOf(gov.tier);
    const budget = TIER_SETTINGS[gov.tier].budgetMs;
    if (i < TIERS.length - 1 && p95 > budget * LOWER_ABOVE) return -1;
    if (i > top && p95 < budget * RAISE_BELOW[gov.tier]) return 1;
    return 0;
  }

  function sample(frameMs) {
    frames.push(frameMs);
    if (frames.length < windowFrames) return gov.tier;
    const p95 = percentile(frames.sort((a, b) => a - b), 0.95);
    frames = [];
    if (cooldown > 0) {
      cooldown--;
      return gov.tier;
    }
    const s = judge(p95);
    streak = s !== 0 && s === side ? streak + 1 : s !== 0 ? 1 : 0;
    side = s;
    if (streak < sustainWindows) return gov.tier;

    if (lastMove !== 0 && s !== lastMove) reversals++;
    lastMove = s;
    streak = 0;
    side = 0;
    cooldown = cooldownWindows * 2 ** Math.min(reversals, 4);
    gov.tier = TIERS[TIERS.indexOf(gov.tier) - s];
    gov.changes++;
    onChange(gov.tier);
    return gov.tier;
  }

  return gov;
}
