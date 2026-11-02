// Browser bindings for movement: the unstyled mode switch, keyboard, mouse
// (pointer lock in first person, drag to look elsewhere) and touch (a virtual
// stick on the left half of the screen, drag to look on the right half; no
// pointer lock on touch). Writes into the input state from input.js.
import { MOVEMENT_KEYS } from './input.js';
import { MODES } from './controller.js';

const LABELS = { 'first-person': 'First person', walk: 'Walk', drive: 'Drive', drone: 'Drone', orbit: 'Orbit' };
const STICK_RADIUS = 60; // px of drag for full stick

export function bindMovement({ canvas, input, controller, onMode }) {
  // Mode switch. Styling belongs to the first-block design tickets.
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Movement mode');
  nav.dataset.movementSwitch = '';
  nav.style.cssText = 'position:fixed;top:0;left:0';
  const buttons = MODES.map((mode) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mode = mode;
    b.textContent = LABELS[mode];
    b.addEventListener('click', () => setMode(mode));
    nav.append(b);
    return b;
  });
  document.body.append(nav);

  function setMode(mode) {
    if (document.pointerLockElement) document.exitPointerLock();
    controller.setMode(mode);
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    onMode?.(mode);
  }

  // Keyboard: movement keys, and 1-5 to switch mode.
  const typing = (e) => e.target instanceof HTMLElement && e.target.matches('input, textarea, [contenteditable]');
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const digit = /^Digit([1-5])$/.exec(e.code);
    if (digit) return setMode(MODES[digit[1] - 1]);
    if (!MOVEMENT_KEYS.has(e.code)) return;
    e.preventDefault();
    input.keyDown(e.code);
  });
  window.addEventListener('keyup', (e) => input.keyUp(e.code));
  window.addEventListener('blur', () => input.clear());

  // Pointer: mouse look under pointer lock, drag to look, touch stick.
  canvas.style.touchAction = 'none';
  let stick = null; // { id, x, y }
  const drags = new Map(); // pointerId -> last {x, y}

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse' && controller.mode === 'first-person' && !document.pointerLockElement) {
      canvas.requestPointerLock?.()?.catch?.(() => {}); // can be refused (headless, no user gesture)
    }
    if (e.pointerType === 'touch' && !stick && e.clientX < window.innerWidth / 2) {
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (stick?.id === e.pointerId) {
      input.setStick((e.clientX - stick.x) / STICK_RADIUS, (stick.y - e.clientY) / STICK_RADIUS);
      return;
    }
    if (document.pointerLockElement === canvas) return input.look(e.movementX, e.movementY);
    const last = drags.get(e.pointerId);
    if (!last) return;
    input.look(e.clientX - last.x, e.clientY - last.y);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const release = (e) => {
    if (stick?.id === e.pointerId) {
      stick = null;
      input.setStick(0, 0);
    }
    drags.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  return { setMode };
}
