// Dispose hook for content that leaves range (districts, chunks): removes the object
// from the scene and frees its geometry, materials and textures on the GPU.
// The world streamer calls track() when a chunk becomes visible and update() each frame
// (or each few frames) with the camera position.
import { Vector3 } from 'three';

export function disposeObject(root) {
  const textures = new Set();
  root.traverse((node) => {
    node.geometry?.dispose();
    for (const material of [node.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
  root.removeFromParent();
}

export function createRangeDisposer({ range, margin = 0, onDispose = () => {} }) {
  const tracked = new Set();
  const at = new Vector3();
  return {
    track(object) {
      tracked.add(object);
    },
    update(cameraPosition) {
      for (const object of tracked) {
        if (object.getWorldPosition(at).distanceTo(cameraPosition) <= range + margin) continue;
        tracked.delete(object);
        disposeObject(object);
        onDispose(object);
      }
    },
    get tracked() {
      return tracked.size;
    },
  };
}
