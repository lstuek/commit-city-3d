// Unstyled sound controls (styling belongs to the design tickets): Enter, radio
// switch and mute. Mute exists from the start. The audio files are fetched in
// the last loading wave, once the page reports the scene is shown (data-ready).
import { createSound } from './sound.js';
import rainUrl from '../assets/audio/rain.mp3?url';
import trafficUrl from '../assets/audio/traffic.mp3?url';

function button(label, attrs = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}

export function mountSound(root = document.body) {
  const status = document.body.dataset;
  let storage;
  try { storage = window.localStorage; } catch { /* blocked: mute is not remembered */ }

  const enter = button('Enter', { id: 'enter' });
  const radio = button('Radio', { id: 'radio', 'aria-pressed': 'false' });
  const mute = button('Mute', { id: 'mute', 'aria-pressed': 'false' });
  const bar = document.createElement('div');
  bar.id = 'sound-controls';
  bar.style.cssText = 'position:fixed;top:0;right:0';
  bar.append(enter, radio, mute);
  root.prepend(bar);

  // State goes on body data attributes, like the rest of the page status.
  function publish(s) {
    status.audio = s.context;
    status.muted = String(s.muted);
    status.masterGain = String(s.masterGain);
    radio.setAttribute('aria-pressed', String(s.radio));
    mute.setAttribute('aria-pressed', String(s.muted));
  }

  const sound = createSound({
    createContext: () => new AudioContext(),
    fetchBytes: async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`audio ${r.status}`);
      return r.arrayBuffer();
    },
    urls: { rain: rainUrl, traffic: trafficUrl },
    storage,
    onChange: publish,
  });
  publish(sound.state()); // the remembered mute shows before Enter

  enter.addEventListener('click', () => {
    sound.enter();
    enter.hidden = true;
  });
  radio.addEventListener('click', () => sound.setRadio(!sound.state().radio));
  mute.addEventListener('click', () => sound.setMuted(!sound.state().muted));

  const preloadWhenShown = () => {
    if (status.ready !== 'true') return false;
    sound.preload();
    return true;
  };
  if (!preloadWhenShown()) {
    const watch = new MutationObserver(() => preloadWhenShown() && watch.disconnect());
    watch.observe(document.body, { attributes: true, attributeFilter: ['data-ready'] });
  }

  return sound;
}
