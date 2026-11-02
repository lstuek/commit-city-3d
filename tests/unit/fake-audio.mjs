// A small stand-in for the Web Audio API at its system boundary. It records the
// graph so tests can ask one behavioral question: which started sources have an
// open path (every gain above 0) to the speakers right now?

class Param {
  constructor(value) { this.value = value; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  setTargetAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}

class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.out = new Set(); }
  connect(target) { this.out.add(target); return target; }
  disconnect() { this.out.clear(); }
}

class Source extends Node {
  constructor(ctx, kind) { super(ctx, kind); this.started = false; this.stopped = false; }
  start() { this.started = true; this.ctx.sources.push(this); }
  stop() { this.stopped = true; }
}

export class FakeAudioContext {
  static created = [];
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.sources = [];
    this.destination = new Node(this, 'destination');
    FakeAudioContext.created.push(this);
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n; }
  createBiquadFilter() {
    const n = new Node(this, 'filter');
    Object.assign(n, { type: 'lowpass', frequency: new Param(350), Q: new Param(1), gain: new Param(0) });
    return n;
  }
  createOscillator() {
    const n = new Source(this, 'oscillator');
    Object.assign(n, { type: 'sine', frequency: new Param(440), detune: new Param(0) });
    return n;
  }
  createBufferSource() {
    const n = new Source(this, 'buffer');
    Object.assign(n, { buffer: null, loop: false, playbackRate: new Param(1) });
    return n;
  }
  async decodeAudioData(bytes) { return { decodedFrom: bytes.name, duration: 10 }; }

  // Sources that are playing and reach the destination through open gains.
  audible() {
    const reaches = (node, seen = new Set()) => {
      if (node === this.destination) return true;
      if (!(node instanceof Node) || seen.has(node)) return false;
      seen.add(node);
      if (node.kind === 'gain' && node.gain.value <= 0) return false;
      return [...node.out].some((n) => reaches(n, seen));
    };
    return this.sources.filter((s) => s.started && !s.stopped && reaches(s));
  }
}

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

export const throwingStorage = {
  getItem() { throw new Error('SecurityError: storage denied'); },
  setItem() { throw new Error('QuotaExceededError'); },
};

// Timers the tests drive by hand, so no real interval keeps node alive.
export function manualTimers() {
  const live = new Map();
  let id = 0;
  return {
    live,
    setInterval: (fn) => { live.set(++id, fn); return id; },
    clearInterval: (i) => { live.delete(i); },
  };
}
