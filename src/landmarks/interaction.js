import * as THREE from 'three';
import { nearestLandmark } from './panel.js';

export function addTestLandmarks(scene, keys, { radius = 1.2, y = -0.5 } = {}) {
  const geometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const material = new THREE.MeshBasicMaterial({ color: 0x33ccff, wireframe: true });
  return keys.map((key, i) => {
    const a = (i / keys.length) * Math.PI * 2;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    mesh.userData.landmark = key;
    scene.add(mesh);
    return mesh;
  });
}

export function setupInteraction({ camera, canvas, meshes, onSelect, nearRadius = 0.8 }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) onSelect(hit.object.userData.landmark);
  });
  const spots = meshes.map((m) => ({ key: m.userData.landmark, x: m.position.x, z: m.position.z }));
  let near = null;
  return {
    update() {
      const key = nearestLandmark(camera.position, spots, nearRadius);
      if (key && key !== near) onSelect(key);
      near = key;
    },
    screenPoint(key) {
      const mesh = meshes.find((m) => m.userData.landmark === key);
      const rect = canvas.getBoundingClientRect();
      const p = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
  };
}
