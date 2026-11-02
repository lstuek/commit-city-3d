// Render-rate cap by elapsed time. Each render books the next one a fixed interval
// later, so 60, 120 and 144 Hz callbacks all give about `fps` renders per second
// (skipping every second callback would give 60 fps on a 120 Hz screen).
// Movement must run on real time, not on the render count.
const TOLERANCE_MS = 2; // callbacks arrive with jitter; a callback this close to the slot renders

export function createFrameCap(fps) {
  const interval = fps ? 1000 / fps : 0;
  let next = null;
  return {
    shouldRender(now) {
      if (!fps) return true;
      if (next !== null && now < next - TOLERANCE_MS) return false;
      next = next === null ? now + interval : next + interval;
      if (next <= now) next = now + interval; // fell behind (slow display or a stall): resync, no burst
      return true;
    },
  };
}
