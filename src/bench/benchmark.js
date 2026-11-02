// Benchmark mode: `?bench=1` flies a fixed camera path for 60 s (`benchSeconds=N`
// shortens it for tests) and reports frame-time percentiles, draw calls, triangles,
// the tier and the renderer string. Pure: the page wiring lives in src/quality/index.js.
import { CatmullRomCurve3, Vector3 } from 'three';
import { summarize } from './stats.js';

const DEFAULT_MS = 60_000;

// Fixed orbit-style loop around the start street (one path until the movement modes
// land; then one path per mode). Closed, so start and end poses match.
const PATH = new CatmullRomCurve3(
  [[4, 1.5, 0], [2.5, 2.5, 3], [0, 1, 4.5], [-3, 3, 2.5], [-4, 1.2, -1], [-1.5, 2, -4], [2, 0.8, -3.5]]
    .map(([x, y, z]) => new Vector3(x, y, z)),
  true,
);
const TARGET = new Vector3(0, 0.3, 0);

export function benchParams(search) {
  const params = new URLSearchParams(search);
  if (!params.has('bench')) return null;
  const seconds = Number(params.get('benchSeconds'));
  return { durationMs: seconds > 0 ? seconds * 1000 : DEFAULT_MS };
}

export function createBenchmark({ durationMs = DEFAULT_MS, tier = null, renderer = 'unknown' } = {}) {
  const frameTimes = [];
  let start = null;
  let last = null;
  let drawCalls = 0;
  let triangles = 0;
  const pose = { position: new Vector3(), target: TARGET };

  const bench = {
    done: false,
    report: null,
    /** Camera pose at time `now` (ms, the animation-frame timestamp). */
    pose(now) {
      start ??= now;
      PATH.getPointAt(Math.min(1, (now - start) / durationMs) % 1, pose.position);
      return pose;
    },
    /** One rendered frame at `now`, with the renderer's per-frame counts. */
    record(now, { calls, triangles: tris }) {
      if (bench.done) return;
      start ??= now;
      if (last !== null) frameTimes.push(now - last);
      last = now;
      drawCalls = Math.max(drawCalls, calls);
      triangles = Math.max(triangles, tris);
      if (now - start < durationMs) return;
      const s = summarize(frameTimes);
      bench.done = true;
      bench.report = {
        tier, renderer, durationMs, frames: s.frames,
        p50Ms: s.p50, p95Ms: s.p95, p99Ms: s.p99, maxMs: s.max,
        drawCalls, triangles,
      };
    },
  };
  return bench;
}
