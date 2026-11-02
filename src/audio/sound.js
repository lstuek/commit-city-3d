// Sound for Commit City on the Web Audio API.
// Nothing exists before enter(): no AudioContext, no node, no sound.
// Graph: [rain, traffic, hum] -> ambient bus -\
//                      [radio synth] -> radio bus --> master -> speakers
// preload() only fetches the file bytes (the last loading wave); decoding needs
// the context, so it happens on enter().

const MUTE_KEY = 'commit-city:muted';
const MIX = { rain: 0.55, traffic: 0.3, hum: 0.14, radio: 0.16 };

export function createSound({ createContext, fetchBytes, urls, storage, timers = globalThis, onChange = () => {} }) {
  let ctx = null;
  let master = null;
  let entering = null;
  let bytes = null;
  let radio = false;
  let muted = false;
  try { muted = storage?.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked: start unmuted */ }

  const state = () => ({
    context: ctx ? ctx.state : 'none',
    radio,
    muted,
    masterGain: master ? master.gain.value : null,
  });
  const changed = () => onChange(state());

  function preload() {
    bytes ??= Promise.all(Object.entries(urls).map(async ([name, url]) => [name, await fetchBytes(url).catch(() => null)]))
      .then(Object.fromEntries);
    return bytes;
  }

  function loopFile(buffer, level, bus) {
    const gain = ctx.createGain();
    gain.gain.value = level;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain).connect(bus);
    src.start();
  }

  // Low city hum: mains tone and its harmonics through a lowpass, with a slow swell.
  function startHum(bus) {
    const level = ctx.createGain();
    level.gain.value = MIX.hum;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.connect(level).connect(bus);
    for (const [type, freq, amp] of [['sine', 50, 1], ['triangle', 100.4, 0.35], ['sawtooth', 49.7, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(filter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = MIX.hum * 0.4;
    lfo.connect(depth).connect(level.gain);
    lfo.start();
  }

  // Synth radio (a synthesized stand-in track): a slow minor progression with a
  // saw pad, a plucked bass and a square arpeggio. Voices are long-lived; a
  // look-ahead scheduler only writes their pitch and envelope automation.
  let station = null;
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]]; // Am F C G
  const BASS = [45, 41, 48, 43];
  const STEP = 60 / 92 / 2; // eighth notes at 92 bpm

  function voice(type, dest, level) {
    const osc = ctx.createOscillator();
    osc.type = type;
    const amp = ctx.createGain();
    amp.gain.value = level;
    osc.connect(amp).connect(dest);
    osc.start();
    return { osc, amp };
  }

  function startRadio() {
    const bus = ctx.createGain();
    bus.gain.value = MIX.radio;
    bus.connect(master);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    tone.connect(bus);
    const pad = [0, 1, 2].map(() => voice('sawtooth', tone, 0.12));
    pad.forEach((v, i) => { v.osc.detune.value = (i - 1) * 7; });
    const bass = voice('sine', bus, 0);
    const arp = voice('square', tone, 0);
    let step = 0;
    let next = ctx.currentTime + 0.05;
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        const bar = Math.floor(step / 8) % CHORDS.length;
        const chord = CHORDS[bar];
        if (step % 8 === 0) pad.forEach((v, i) => v.osc.frequency.setValueAtTime(hz(chord[i]), next));
        if (step % 2 === 0) {
          bass.osc.frequency.setValueAtTime(hz(BASS[bar]), next);
          pluck(bass.amp.gain, next, 0.9, 0.18);
        }
        arp.osc.frequency.setValueAtTime(hz(chord[step % 3] + 12), next);
        pluck(arp.amp.gain, next, 0.22, 0.06);
        step += 1;
        next += STEP;
      }
    };
    tick();
    const timer = timers.setInterval(tick, 100);
    return { bus, timer, voices: [...pad, bass, arp] };
  }

  function pluck(param, t, peak, decay) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + 0.01);
    param.setTargetAtTime(0, t + 0.02, decay);
  }

  function stopRadio() {
    if (!station) return;
    timers.clearInterval(station.timer);
    for (const v of station.voices) v.osc.stop();
    station.bus.disconnect();
    station = null;
  }

  function syncRadio() {
    if (!ctx) return;
    if (radio && !station) station = startRadio();
    if (!radio) stopRadio();
  }

  // Hard cut on the master gain: every layer goes through it, so one write stops all sound.
  function applyMute() {
    if (!master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.value = muted ? 0 : 1;
  }

  async function build() {
    ctx = createContext();
    master = ctx.createGain();
    applyMute();
    master.connect(ctx.destination);
    await ctx.resume();
    const ambient = ctx.createGain();
    ambient.connect(master);
    ambient.gain.setValueAtTime(0, ctx.currentTime);
    ambient.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    startHum(ambient);
    syncRadio();
    changed();
    const files = await preload();
    for (const name of Object.keys(urls)) {
      // A failed fetch or decode drops that layer only.
      const buffer = files[name] && (await ctx.decodeAudioData(files[name]).catch(() => null));
      if (buffer) loopFile(buffer, MIX[name] ?? 0.3, ambient);
    }
    changed();
  }

  return {
    preload,
    enter() {
      entering ??= build();
      return entering;
    },
    setRadio(on) {
      radio = !!on;
      syncRadio();
      changed();
    },
    setMuted(on) {
      muted = !!on;
      try { storage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* not remembered, still muted now */ }
      applyMute();
      changed();
    },
    state,
  };
}
