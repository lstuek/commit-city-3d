// Movement input state, shared by keyboard, mouse and touch. No DOM here: the
// DOM bindings (dom.js) write into it and the movement modes read from it.

const AXES = {
  forward: [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']],
  strafe: [['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']],
  rise: [['Space', 'KeyE'], ['ShiftLeft', 'ShiftRight', 'KeyQ']],
};
export const MOVEMENT_KEYS = new Set(Object.values(AXES).flat(2));

const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export function createInput() {
  const keys = new Set();
  const stick = { x: 0, y: 0 };
  const pending = { dx: 0, dy: 0 };
  const key = ([plus, minus]) => (plus.some((k) => keys.has(k)) ? 1 : 0) - (minus.some((k) => keys.has(k)) ? 1 : 0);

  return {
    keyDown: (code) => keys.add(code),
    keyUp: (code) => keys.delete(code),
    // Touch stick: x right, y forward, each -1..1.
    setStick(x, y) {
      stick.x = clamp1(x);
      stick.y = clamp1(y);
    },
    // Look deltas in screen pixels (mouse movement or touch drag).
    look(dx, dy) {
      pending.dx += dx;
      pending.dy += dy;
    },
    consumeLook() {
      const out = { ...pending };
      pending.dx = pending.dy = 0;
      return out;
    },
    axes: () => ({
      forward: clamp1(key(AXES.forward) + stick.y),
      strafe: clamp1(key(AXES.strafe) + stick.x),
      rise: key(AXES.rise),
    }),
    clear() {
      keys.clear();
      stick.x = stick.y = 0;
      pending.dx = pending.dy = 0;
    },
  };
}
