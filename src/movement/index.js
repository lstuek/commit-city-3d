// Movement for the page: builds the test scene (walls, boundary, ground),
// the controller and the input bindings. main.js calls startMovement once and
// movement.update(time) every frame.
import { BoxGeometry, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { createController } from './controller.js';
import { createInput } from './input.js';
import { bindMovement } from './dom.js';
import { createWorld, TEST_SCENE } from './world.js';

const DEFAULT_MODE = 'orbit'; // Lincoln sets the real default after the first-block review.

function addTestScene(scene, { boxes, bounds }) {
  const material = new MeshStandardMaterial();
  for (const b of boxes) {
    const mesh = new Mesh(new BoxGeometry(b.maxX - b.minX, b.height, b.maxZ - b.minZ), material);
    mesh.position.set((b.minX + b.maxX) / 2, b.height / 2, (b.minZ + b.maxZ) / 2);
    scene.add(mesh);
  }
  const ground = new Mesh(new PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ), material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  scene.add(ground);
}

export function startMovement({ scene, camera, canvas, status }) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  addTestScene(scene, TEST_SCENE);
  const input = createInput();
  const controller = createController({
    camera, input, scene, world: createWorld(TEST_SCENE), reducedMotion: reduce.matches, flyIn: true,
  });
  reduce.addEventListener('change', (e) => controller.setReducedMotion(e.matches));
  const { setMode } = bindMovement({ canvas, input, controller, onMode: (mode) => (status.mode = mode) });
  setMode(DEFAULT_MODE);

  let last = null;
  return {
    // time: the animation loop timestamp in ms.
    update(time) {
      controller.update(last === null ? 0 : (time - last) / 1000);
      last = time;
      // Read by the page test.
      status.camera = camera.position.toArray().map((v) => v.toFixed(3)).join(',');
    },
  };
}
