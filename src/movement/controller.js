// Movement controller: owns the five modes, switches between them, and steps
// the active mode on real elapsed time in fixed steps, so movement is the same
// at any render rate. Copies the active mode's camera pose to the real camera,
// blended by the opening fly-in unless reduced motion is on.
import { Quaternion, Vector3 } from 'three';
import { MODE_FACTORIES } from './modes.js';

export const MODES = Object.keys(MODE_FACTORIES);
const STEP = 1 / 120;
const MAX_FRAME = 0.25; // a stalled tab does not jump the visitor across the city
const FLY_IN = 2.5;

export function createController({ camera, input, world, scene = null, reducedMotion = false, flyIn = false, spawn = { x: 0, z: 8, yaw: 0 } }) {
  const ctx = { world, scene, reducedMotion, pose: { ...spawn } };
  const modes = Object.fromEntries(MODES.map((name) => [name, MODE_FACTORIES[name](ctx)]));
  let active = null;
  let carry = 0;
  let fly = null;

  function apply() {
    const rig = active.camera;
    if (!fly) {
      camera.position.copy(rig.position);
      camera.quaternion.copy(rig.quaternion);
      return;
    }
    const k = Math.min(1, fly.t / FLY_IN);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(fly.from, rig.position, e);
    camera.quaternion.slerpQuaternions(fly.fromQ, rig.quaternion, e);
    if (k === 1) fly = null;
  }

  const controller = {
    get mode() {
      return active?.name ?? null;
    },
    setMode(name) {
      if (!modes[name]) throw new Error(`unknown movement mode: ${name}`);
      if (active?.name === name) return;
      if (!active && flyIn && !ctx.reducedMotion) {
        fly = { t: 0, from: new Vector3(0, 45, 45), fromQ: new Quaternion() };
        camera.position.copy(fly.from);
        camera.lookAt(0, 0, 0);
        fly.fromQ.copy(camera.quaternion);
      }
      active?.exit();
      input.clear();
      active = modes[name];
      active.enter();
      carry = 0;
      apply();
    },
    // dt: real seconds since the last call.
    update(dt) {
      if (!active) return;
      carry += Math.min(dt, MAX_FRAME);
      while (carry >= STEP - 1e-9) {
        active.update(STEP, input);
        carry -= STEP;
      }
      if (fly) fly.t += ctx.reducedMotion ? FLY_IN : Math.min(dt, MAX_FRAME);
      apply();
    },
    setReducedMotion(on) {
      ctx.reducedMotion = on;
    },
  };
  return controller;
}
