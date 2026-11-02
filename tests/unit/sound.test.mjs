import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../../src/audio/sound.js';
import { FakeAudioContext, manualTimers, memoryStorage, throwingStorage } from './fake-audio.mjs';

const urls = { rain: '/assets/rain.mp3', traffic: '/assets/traffic.mp3' };

function setup({ storage = memoryStorage() } = {}) {
  const contexts = [];
  const fetched = [];
  const sound = createSound({
    createContext: () => { const c = new FakeAudioContext(); contexts.push(c); return c; },
    fetchBytes: async (url) => { fetched.push(url); return { name: url }; },
    urls,
    storage,
    timers: manualTimers(),
  });
  return { sound, contexts, fetched, storage };
}

const playingFiles = (ctx) => ctx.audible().filter((s) => s.kind === 'buffer').map((s) => s.buffer.decodedFrom).sort();
const playingSynths = (ctx) => ctx.audible().filter((s) => s.kind === 'oscillator').length;

test('the audio graph stays silent before Enter, even after preload, radio and mute clicks', async () => {
  const { sound, contexts, fetched } = setup();
  await sound.preload();
  sound.setRadio(true);
  sound.setRadio(false);
  sound.setMuted(true);
  sound.setMuted(false);
  assert.equal(contexts.length, 0, 'no AudioContext exists before Enter');
  assert.equal(sound.state().context, 'none');
  assert.deepEqual(fetched.sort(), [urls.rain, urls.traffic], 'preload only fetches bytes');
});

test('Enter starts the ambient bed (rain, traffic, hum) and not the radio', async () => {
  const { sound, contexts } = setup();
  await sound.enter();
  const [ctx] = contexts;
  assert.equal(ctx.state, 'running');
  assert.deepEqual(playingFiles(ctx), [urls.rain, urls.traffic]);
  assert.ok(ctx.audible().filter((s) => s.kind === 'buffer').every((s) => s.loop), 'file layers loop');
  assert.ok(playingSynths(ctx) > 0, 'the hum layer plays');
  assert.equal(sound.state().radio, false);
  await sound.enter();
  assert.equal(contexts.length, 1, 'a second Enter does not build a second graph');
});

test('the radio switch starts and stops the synth radio over the ambient bed', async () => {
  const { sound, contexts } = setup();
  await sound.enter();
  const [ctx] = contexts;
  const ambientSynths = playingSynths(ctx);

  sound.setRadio(true);
  assert.equal(sound.state().radio, true);
  assert.ok(playingSynths(ctx) > ambientSynths, 'radio voices play');
  assert.deepEqual(playingFiles(ctx), [urls.rain, urls.traffic], 'ambient keeps playing');

  sound.setRadio(false);
  assert.equal(sound.state().radio, false);
  assert.equal(playingSynths(ctx), ambientSynths, 'radio voices stop, hum stays');

  sound.setRadio(true);
  assert.ok(playingSynths(ctx) > ambientSynths, 'the radio can be switched on again');
  sound.setRadio(false);
});

test('mute silences everything at once, and unmute brings it back', async () => {
  const { sound, contexts } = setup();
  await sound.enter();
  sound.setRadio(true);
  const [ctx] = contexts;
  sound.setMuted(true);
  assert.equal(ctx.audible().length, 0, 'nothing reaches the speakers');
  assert.equal(sound.state().muted, true);
  assert.equal(sound.state().masterGain, 0);
  sound.setMuted(false);
  assert.ok(ctx.audible().length > 0);
  sound.setRadio(false);
});

test('mute survives a reload through storage', async () => {
  const storage = memoryStorage();
  setup({ storage }).sound.setMuted(true);

  const reloaded = setup({ storage });
  assert.equal(reloaded.sound.state().muted, true, 'remembered before Enter');
  await reloaded.sound.enter();
  assert.equal(reloaded.contexts[0].audible().length, 0, 'enters silent');

  reloaded.sound.setMuted(false);
  assert.equal(setup({ storage }).sound.state().muted, false, 'unmute is remembered too');
});

test('storage that throws does not break sound or mute', async () => {
  const { sound, contexts } = setup({ storage: throwingStorage });
  assert.equal(sound.state().muted, false);
  await sound.enter();
  assert.ok(contexts[0].audible().length > 0);
  sound.setMuted(true);
  assert.equal(contexts[0].audible().length, 0);
  assert.equal(setup({ storage: undefined }).sound.state().muted, false, 'no storage at all is fine');
});
