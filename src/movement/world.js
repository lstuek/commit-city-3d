// Collision world: axis-aligned boxes (walls, buildings) with a height, inside a
// rectangular boundary. Bodies are circles in plan view; a move is resolved one
// axis at a time, so a body stops at a wall face and slides along it.

export function createWorld({ boxes, bounds }) {
  // Resolve one axis as a sweep from pos[key] to target: returns the new
  // coordinate, stopped at the nearest face crossed (no tunnelling).
  function axis(pos, key, target, r) {
    const other = key === 'x' ? 'z' : 'x';
    const [lo, hi] = key === 'x' ? [bounds.minX + r, bounds.maxX - r] : [bounds.minZ + r, bounds.maxZ - r];
    let v = Math.min(hi, Math.max(lo, target));
    const from = pos[key];
    for (const box of boxes) {
      if (pos.y >= box.height) continue;
      const [oMin, oMax] = other === 'x' ? [box.minX, box.maxX] : [box.minZ, box.maxZ];
      if (pos[other] <= oMin - r || pos[other] >= oMax + r) continue;
      const [min, max] = key === 'x' ? [box.minX - r, box.maxX + r] : [box.minZ - r, box.maxZ + r];
      if (from <= min && v > min) v = min;
      else if (from >= max && v < max) v = max;
      else if (from > min && from < max) v = from; // already overlapping: do not move deeper
    }
    return v;
  }

  return {
    boxes,
    bounds,
    // pos {x,y,z}, delta {x,z}, radius r -> new {x,y,z} plus which axes were stopped.
    move(pos, delta, r) {
      const x = axis(pos, 'x', pos.x + delta.x, r);
      const z = axis({ ...pos, x }, 'z', pos.z + delta.z, r);
      return { x, y: pos.y, z, hitX: x !== pos.x + delta.x, hitZ: z !== pos.z + delta.z };
    },
  };
}

// The test scene: a few walls and a boundary, until the real city replaces it.
export const TEST_SCENE = {
  bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
  boxes: [
    { minX: -12, maxX: 12, minZ: -14, maxZ: -13, height: 3 },
    { minX: 8, maxX: 9, minZ: -6, maxZ: 6, height: 3 },
    { minX: -16, maxX: -10, minZ: 4, maxZ: 10, height: 12 },
    { minX: 14, maxX: 20, minZ: 12, maxZ: 18, height: 20 },
  ],
};
