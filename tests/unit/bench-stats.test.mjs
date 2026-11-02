import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/bench/stats.js';

test('frame-time percentiles use the nearest rank on a known sample', () => {
  // 1..100 ms in shuffled order: nearest rank gives p50 50, p95 95, p99 99, max 100.
  const sample = Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) + 1);
  assert.deepEqual(summarize(sample), { frames: 100, p50: 50, p95: 95, p99: 99, max: 100 });
});

test('a small sample: p95 and p99 land on the slowest frame', () => {
  assert.deepEqual(summarize([10, 30, 20, 40]), { frames: 4, p50: 20, p95: 40, p99: 40, max: 40 });
});

test('an empty sample reports null times', () => {
  assert.deepEqual(summarize([]), { frames: 0, p50: null, p95: null, p99: null, max: null });
});
