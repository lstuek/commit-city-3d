import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../../src/movement/world.js';

// One wall spanning x -5..5 at z -0.5..0.5, inside a 20 m square boundary.
const world = createWorld({
  boxes: [{ minX: -5, maxX: 5, minZ: -0.5, maxZ: 0.5, height: 4 }],
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
});

test('a move into a wall stops at the wall face, offset by the body radius', () => {
  const at = world.move({ x: 0, y: 1, z: 3 }, { x: 0, z: -6 }, 0.25);
  assert.equal(at.z, 0.75);
  assert.equal(at.x, 0);
});

test('a diagonal move into a wall slides along it', () => {
  const at = world.move({ x: 0, y: 1, z: 3 }, { x: 2, z: -6 }, 0.25);
  assert.equal(at.z, 0.75);
  assert.equal(at.x, 2);
});

test('a move past the boundary stops at the boundary', () => {
  const at = world.move({ x: 8, y: 1, z: 8 }, { x: 50, z: 50 }, 0.5);
  assert.deepEqual([at.x, at.z], [9.5, 9.5]);
});

test('a body above the wall height passes over it', () => {
  const at = world.move({ x: 0, y: 6, z: 3 }, { x: 0, z: -6 }, 0.25);
  assert.equal(at.z, -3);
});
