import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRangeDisposer } from '../../src/quality/dispose.js';

function chunk(x) {
  const texture = new THREE.Texture();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
  const group = new THREE.Group().add(mesh);
  group.position.set(x, 0, 0);
  const disposed = [];
  for (const [name, thing] of [['geometry', mesh.geometry], ['material', mesh.material], ['texture', texture]]) {
    thing.addEventListener('dispose', () => disposed.push(name));
  }
  return { group, disposed };
}

test('a chunk that leaves range is removed from the scene and its GPU resources disposed', () => {
  const scene = new THREE.Scene();
  const near = chunk(10);
  const far = chunk(500);
  scene.add(near.group, far.group);
  const left = [];
  const disposer = createRangeDisposer({ range: 200, onDispose: (g) => left.push(g) });
  disposer.track(near.group);
  disposer.track(far.group);

  disposer.update(new THREE.Vector3(0, 0, 0));

  assert.deepEqual(far.disposed.sort(), ['geometry', 'material', 'texture']);
  assert.equal(far.group.parent, null);
  assert.deepEqual(near.disposed, []);
  assert.equal(near.group.parent, scene);
  assert.deepEqual(left, [far.group]);
  assert.equal(disposer.tracked, 1);
});

test('a chunk inside range plus the margin is kept', () => {
  const edge = chunk(210);
  new THREE.Scene().add(edge.group);
  const disposer = createRangeDisposer({ range: 200, margin: 20 });
  disposer.track(edge.group);
  disposer.update(new THREE.Vector3(0, 0, 0));
  assert.deepEqual(edge.disposed, []);
});
