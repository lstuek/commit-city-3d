import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { createController, MODES } from '../../src/movement/controller.js';
import { createInput } from '../../src/movement/input.js';
import { createWorld, TEST_SCENE } from '../../src/movement/world.js';

const setup = (opts = {}) => {
  const camera = new PerspectiveCamera();
  const input = createInput();
  const controller = createController({ camera, input, world: createWorld(TEST_SCENE), ...opts });
  return { camera, input, controller };
};
const run = (controller, seconds, hz) => {
  for (let i = 0; i < seconds * hz; i++) controller.update(1 / hz);
};
const pos = (camera) => camera.position.clone();

test('the five movement modes are first person, walk, drive, drone and orbit', () => {
  assert.deepEqual(MODES, ['first-person', 'walk', 'drive', 'drone', 'orbit']);
});

for (const mode of ['first-person', 'walk', 'drive', 'drone']) {
  test(`${mode}: holding forward moves the camera; no input keeps it still`, () => {
    const { camera, input, controller } = setup();
    controller.setMode(mode);
    run(controller, 1, 60);
    const rest = pos(camera);
    run(controller, 1, 60);
    assert.ok(pos(camera).distanceTo(rest) < 1e-6, 'camera drifted with no input');
    input.keyDown('KeyW');
    run(controller, 1, 60);
    assert.ok(pos(camera).distanceTo(rest) > 1, `camera moved only ${pos(camera).distanceTo(rest)}`);
  });

  test(`${mode}: a touch stick pushed forward moves the camera`, () => {
    const { camera, input, controller } = setup();
    controller.setMode(mode);
    run(controller, 1, 60);
    const rest = pos(camera);
    input.setStick(0, 1);
    run(controller, 1, 60);
    assert.ok(pos(camera).distanceTo(rest) > 1);
  });
}

test('orbit: the camera glides on its own and dragging turns it further', () => {
  const glide = setup();
  glide.controller.setMode('orbit');
  const start = pos(glide.camera);
  run(glide.controller, 1, 60);
  const glided = start.distanceTo(pos(glide.camera));
  assert.ok(glided > 0.1);

  const drag = setup();
  drag.controller.setMode('orbit');
  drag.input.look(300, 0);
  run(drag.controller, 1, 60);
  assert.ok(start.distanceTo(pos(drag.camera)) > glided + 1);
});

test('first person: mouse look turns the camera without moving it', () => {
  const { camera, input, controller } = setup();
  controller.setMode('first-person');
  run(controller, 0.1, 60);
  const [p, q] = [pos(camera), camera.quaternion.clone()];
  input.look(200, 0);
  run(controller, 0.1, 60);
  assert.ok(pos(camera).distanceTo(p) < 1e-9);
  assert.ok(camera.quaternion.angleTo(q) > 0.3);
});

for (const mode of ['first-person', 'walk', 'drive', 'drone', 'orbit']) {
  test(`${mode}: distance is the same at 30 and 120 updates per second`, () => {
    const results = [30, 120].map((hz) => {
      const { camera, input, controller } = setup();
      controller.setMode(mode);
      input.keyDown('KeyW');
      input.keyDown('KeyD');
      run(controller, 2, hz);
      return pos(camera);
    });
    assert.ok(results[0].distanceTo(results[1]) < 1e-6, `30 Hz ${results[0].toArray()} vs 120 Hz ${results[1].toArray()}`);
  });
}

test('switching mode reports the active mode and rejects unknown names', () => {
  const { controller } = setup();
  controller.setMode('drone');
  assert.equal(controller.mode, 'drone');
  assert.throws(() => controller.setMode('teleport'));
});

for (const mode of ['first-person', 'walk', 'drive', 'drone']) {
  test(`${mode}: driving into a building wall stops at the wall`, () => {
    // The 12 m tall test block spans z 4..10 at x -16..-10; start 4 m in front of it, facing it.
    const { camera, input, controller } = setup({ spawn: { x: -13, z: 14, yaw: 0 } });
    controller.setMode(mode);
    input.keyDown('KeyW');
    run(controller, 5, 60);
    assert.ok(camera.position.z > 10, `${mode} went through the wall to z ${camera.position.z}`);
  });
}

test('the city boundary stops a first-person walk', () => {
  const { camera, input, controller } = setup({ spawn: { x: 0, z: 20, yaw: Math.PI } });
  controller.setMode('first-person');
  input.keyDown('KeyW');
  run(controller, 10, 60);
  assert.equal(camera.position.z, 29.7);
});

const driveHeights = (reducedMotion) => {
  const { camera, input, controller } = setup({ reducedMotion, spawn: { x: 0, z: 25, yaw: 0 } });
  controller.setMode('drive');
  input.keyDown('KeyW');
  const ys = [];
  for (let i = 0; i < 90; i++) {
    controller.update(1 / 60);
    ys.push(camera.position.y);
  }
  return Math.max(...ys) - Math.min(...ys);
};

test('camera shake moves the drive camera at speed; reduced motion turns it off', () => {
  assert.ok(driveHeights(false) > 0.005);
  assert.equal(driveHeights(true), 0);
});

test('reduced motion skips the fly-in: the camera starts at the mode view', () => {
  const heights = [false, true].map((reducedMotion) => {
    const { camera, controller } = setup({ reducedMotion, flyIn: true });
    controller.setMode('orbit');
    controller.update(1 / 60);
    return camera.position.y;
  });
  assert.ok(heights[0] > 30, `fly-in should start high, got ${heights[0]}`);
  assert.ok(heights[1] < 15, `reduced motion should start at the orbit view, got ${heights[1]}`);
});
