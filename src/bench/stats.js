// Frame-time statistics: nearest-rank percentiles (the value at rank ceil(p * n)).

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length))) - 1];
}

export function summarize(frameTimes) {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  return {
    frames: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.length ? sorted[sorted.length - 1] : null,
  };
}
