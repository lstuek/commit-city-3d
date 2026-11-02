import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameCap } from '../../src/quality/frame-cap.js';

// Run `seconds` of animation callbacks at `hz` (with optional jitter) and count renders.
function rendersPerSecond(cap, hz, seconds = 10, jitterMs = 0) {
  let rendered = 0;
  const step = 1000 / hz;
  for (let i = 0; i <= seconds * hz; i++) {
    const jitter = jitterMs ? Math.sin(i * 12.9898) * jitterMs : 0;
    if (cap.shouldRender(1000 + i * step + jitter)) rendered++;
  }
  return rendered / seconds;
}

test('the 30 fps cap renders about 30 frames per second at a 60 Hz callback rate', () => {
  const fps = rendersPerSecond(createFrameCap(30), 60);
  assert.ok(Math.abs(fps - 30) <= 0.5, `got ${fps} fps`);
});

test('the 30 fps cap renders about 30 frames per second at a 120 Hz callback rate', () => {
  const fps = rendersPerSecond(createFrameCap(30), 120);
  assert.ok(Math.abs(fps - 30) <= 0.5, `got ${fps} fps`);
});

test('the cap holds about 30 fps with 1 ms callback jitter and at 144 Hz', () => {
  for (const [hz, jitter] of [[60, 1], [120, 1], [144, 0]]) {
    const fps = rendersPerSecond(createFrameCap(30), hz, 10, jitter);
    assert.ok(Math.abs(fps - 30) <= 1, `${hz} Hz: got ${fps} fps`);
  }
});

test('a display slower than the cap renders every callback', () => {
  assert.equal(rendersPerSecond(createFrameCap(30), 24), 24.1);
});

test('no cap renders every callback', () => {
  const cap = createFrameCap(null);
  assert.equal(rendersPerSecond(cap, 120, 1), 121);
});
