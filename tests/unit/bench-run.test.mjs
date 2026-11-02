import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benchParams, createBenchmark } from '../../src/bench/benchmark.js';

test('the bench flag runs the fixed 60-second path; benchSeconds shortens it for tests', () => {
  assert.equal(benchParams(''), null);
  assert.deepEqual(benchParams('?bench=1'), { durationMs: 60_000 });
  assert.deepEqual(benchParams('?bench=1&benchSeconds=2'), { durationMs: 2_000 });
  assert.deepEqual(benchParams('?bench=1&benchSeconds=nope'), { durationMs: 60_000 });
});

test('a benchmark flies its path for the duration and reports frame times, draw calls, triangles, tier and renderer', () => {
  const bench = createBenchmark({ durationMs: 1000, tier: 'desktop-reduced', renderer: 'Test GPU' });
  const poses = [];
  // 16 ms frames, then one 40 ms hitch.
  const times = [0, ...Array.from({ length: 60 }, (_, i) => (i + 1) * 16), 960 + 40, 1040];
  for (const t of times) {
    if (bench.done) break;
    poses.push(bench.pose(t).position.clone());
    bench.record(t, { calls: 12, triangles: 3400 + (t > 500 ? 100 : 0) });
  }
  const report = bench.report;
  assert.equal(bench.done, true);
  assert.equal(report.tier, 'desktop-reduced');
  assert.equal(report.renderer, 'Test GPU');
  assert.equal(report.frames, 61);
  assert.equal(report.p50Ms, 16);
  assert.equal(report.p95Ms, 16);
  assert.equal(report.maxMs, 40);
  assert.equal(report.p99Ms, 40);
  assert.equal(report.drawCalls, 12);
  assert.equal(report.triangles, 3500);
  assert.equal(report.durationMs, 1000);
  assert.ok(Math.max(...poses.map((p) => p.distanceTo(poses[0]))) > 1, 'camera moved along the path');
});

test('the path is fixed: the same time gives the same pose', () => {
  const a = createBenchmark({ durationMs: 60_000 }).pose(12_345);
  const b = createBenchmark({ durationMs: 60_000 }).pose(12_345);
  assert.ok(a.position.equals(b.position) && a.target.equals(b.target));
});
