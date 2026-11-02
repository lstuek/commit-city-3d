import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from '../../src/quality/governor.js';

// Feed whole windows of frames; return the tier after each window.
function feed(gov, windows, frameMs, spikes = 0) {
  const tiers = [];
  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < 60; i++) gov.sample(i < spikes ? 50 : frameMs);
    tiers.push(gov.tier);
  }
  return tiers;
}
const options = { windowFrames: 60, sustainWindows: 3, cooldownWindows: 4 };

test('a sustained high p95 lowers desktop full to desktop reduced after 3 windows', () => {
  const gov = createGovernor({ tier: 'desktop-full', ...options });
  assert.deepEqual(feed(gov, 3, 25), ['desktop-full', 'desktop-full', 'desktop-reduced']);
});

test('a sustained high p95 keeps lowering, down to phone lite and no further', () => {
  const gov = createGovernor({ tier: 'desktop-full', ...options });
  feed(gov, 40, 45);
  assert.equal(gov.tier, 'phone-lite');
});

test('a sustained low p95 raises desktop reduced back to desktop full', () => {
  const gov = createGovernor({ tier: 'desktop-reduced', ceiling: 'desktop-full', ...options });
  assert.deepEqual(feed(gov, 3, 8), ['desktop-reduced', 'desktop-reduced', 'desktop-full']);
});

test('the governor never raises above the start tier', () => {
  const gov = createGovernor({ tier: 'phone-lite', ...options });
  feed(gov, 20, 10);
  assert.equal(gov.tier, 'phone-lite');
});

test('noise does not change the tier: alternating windows and a few spikes per window', () => {
  const gov = createGovernor({ tier: 'desktop-reduced', ceiling: 'desktop-full', ...options });
  for (let k = 0; k < 20; k++) {
    feed(gov, 1, 25);
    feed(gov, 1, 8);
    feed(gov, 2, 14);
  }
  feed(gov, 20, 14, 2); // 2 frames at 50 ms in every 60 stay under the p95 rank
  assert.equal(gov.tier, 'desktop-reduced');
  assert.equal(gov.changes, 0);
});

test('after a change it waits the cooldown, and a reversal doubles the next wait', () => {
  const gov = createGovernor({ tier: 'desktop-full', ...options });
  feed(gov, 3, 25); // lower
  assert.equal(gov.tier, 'desktop-reduced');
  // 4 cooldown windows are ignored, then 3 sustained low windows raise: window 7.
  const up = feed(gov, 7, 8);
  assert.equal(up.indexOf('desktop-full') + 1, 7);
  // That raise reversed the last change, so the cooldown doubles to 8: lowered at window 8 + 3 = 11.
  const down = feed(gov, 12, 25);
  assert.equal(down.indexOf('desktop-reduced') + 1, 11);
});

test('phone lite reached from desktop rises again once it holds 30 fps', () => {
  const gov = createGovernor({ tier: 'phone-lite', ceiling: 'desktop-full', ...options });
  feed(gov, 3, 1000 / 30);
  assert.equal(gov.tier, 'desktop-reduced');
});
