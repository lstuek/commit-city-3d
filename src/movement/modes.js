// The five movement modes. Each has one interface:
//   enter(), update(dt, input), exit(), camera (an Object3D holding the pose
//   the mode wants for the view; the controller copies it to the real camera).
// Modes share `ctx`: { world, pose: {x, z, yaw}, reducedMotion, scene? }.
// pose carries the visitor's place across mode switches.
import { BoxGeometry, CapsuleGeometry, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';

const LOOK = 0.0025; // radians per pixel of mouse or drag
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const right = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

// A stand-in body mesh, only when the mode runs with a scene (not in unit tests).
function standIn(ctx, geometry) {
  if (!ctx.scene) return null;
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  mesh.visible = false;
  ctx.scene.add(mesh);
  return mesh;
}

function firstPerson(ctx) {
  const EYE = 1.7, SPEED = 4, R = 0.3;
  const camera = new Object3D();
  let x, z, yaw, pitch;
  const place = () => {
    camera.position.set(x, EYE, z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  };
  return {
    name: 'first-person',
    camera,
    enter() {
      ({ x, z, yaw } = ctx.pose);
      pitch = 0;
      place();
    },
    update(dt, input) {
      const { dx, dy } = input.consumeLook();
      yaw -= dx * LOOK;
      pitch = clamp(pitch - dy * LOOK, -1.4, 1.4);
      const { forward, strafe } = input.axes();
      const f = fwd(yaw), r = right(yaw), s = SPEED * dt;
      ({ x, z } = ctx.world.move({ x, y: 1, z }, { x: (f.x * forward + r.x * strafe) * s, z: (f.z * forward + r.z * strafe) * s }, R));
      place();
    },
    exit() {
      Object.assign(ctx.pose, { x, z, yaw });
    },
  };
}

function walk(ctx) {
  const SPEED = 3.5, R = 0.35, DIST = 4.5;
  const camera = new Object3D();
  const body = standIn(ctx, new CapsuleGeometry(0.35, 1.1, 4, 12));
  const head = new Vector3();
  let x, z, facing, yaw, pitch;
  const place = () => {
    head.set(x, 1.5, z);
    const back = fwd(yaw);
    camera.position.set(x - back.x * DIST * Math.cos(pitch), 1.5 + DIST * Math.sin(pitch), z - back.z * DIST * Math.cos(pitch));
    camera.lookAt(head);
    if (body) {
      body.position.set(x, 0.9, z);
      body.rotation.y = facing;
    }
  };
  return {
    name: 'walk',
    camera,
    enter() {
      ({ x, z, yaw } = ctx.pose);
      facing = yaw;
      pitch = 0.3;
      if (body) body.visible = true;
      place();
    },
    update(dt, input) {
      const { dx, dy } = input.consumeLook();
      yaw -= dx * LOOK;
      pitch = clamp(pitch + dy * LOOK, -0.1, 1.2);
      const { forward, strafe } = input.axes();
      const f = fwd(yaw), r = right(yaw);
      const mx = f.x * forward + r.x * strafe, mz = f.z * forward + r.z * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        const s = (SPEED * dt) / Math.max(1, len);
        ({ x, z } = ctx.world.move({ x, y: 1, z }, { x: mx * s, z: mz * s }, R));
        facing = Math.atan2(-mx, -mz);
      }
      place();
    },
    exit() {
      if (body) body.visible = false;
      Object.assign(ctx.pose, { x, z, yaw });
    },
  };
}

function drive(ctx) {
  const ACCEL = 14, MAX = 22, REVERSE = 6, TURN = 1.8, GRIP = 3, DRAG = 0.35, R = 1;
  const camera = new Object3D();
  const car = standIn(ctx, new BoxGeometry(1.8, 0.7, 3.6));
  const target = new Vector3();
  let x, z, heading, vx, vz, t;
  const place = () => {
    const f = fwd(heading);
    camera.position.set(x - f.x * 7, 3, z - f.z * 7);
    target.set(x + f.x * 4, 0.8, z + f.z * 4);
    camera.lookAt(target);
    // Camera shake grows with speed; reduced motion turns it off.
    const amount = ctx.reducedMotion ? 0 : 0.04 * Math.min(1, Math.hypot(vx, vz) / MAX);
    camera.position.y += amount * Math.sin(t * 41);
    camera.position.x += amount * Math.sin(t * 29) * f.z;
    if (car) {
      car.position.set(x, 0.5, z);
      car.rotation.y = heading;
    }
  };
  return {
    name: 'drive',
    camera,
    enter() {
      ({ x, z, yaw: heading } = ctx.pose);
      vx = vz = t = 0;
      if (car) car.visible = true;
      place();
    },
    update(dt, input) {
      input.consumeLook();
      t += dt;
      const { forward: throttle, strafe: steer } = input.axes();
      let f = fwd(heading);
      const along = vx * f.x + vz * f.z;
      heading -= steer * TURN * clamp(along / 6, -1, 1) * dt;
      f = fwd(heading);
      const r = right(heading);
      // Split velocity into along-heading and sideways; low sideways grip gives drift.
      let a = vx * f.x + vz * f.z;
      let s = vx * r.x + vz * r.z;
      a = clamp((a + throttle * ACCEL * dt) * Math.exp(-DRAG * dt), -REVERSE, MAX);
      s *= Math.exp(-GRIP * dt);
      vx = f.x * a + r.x * s;
      vz = f.z * a + r.z * s;
      if (!throttle && Math.hypot(vx, vz) < 0.05) vx = vz = 0;
      const at = ctx.world.move({ x, y: 0.5, z }, { x: vx * dt, z: vz * dt }, R);
      ({ x, z } = at);
      if (at.hitX) vx = 0;
      if (at.hitZ) vz = 0;
      place();
    },
    exit() {
      if (car) car.visible = false;
      Object.assign(ctx.pose, { x, z, yaw: heading });
    },
  };
}

function drone(ctx) {
  const SPEED = 9, R = 0.5, START = 6;
  const camera = new Object3D();
  const dir = new Vector3();
  let x, y, z, yaw, pitch;
  const place = () => {
    camera.position.set(x, y, z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  };
  return {
    name: 'drone',
    camera,
    enter() {
      ({ x, z, yaw } = ctx.pose);
      y = START;
      pitch = 0;
      place();
    },
    update(dt, input) {
      const { dx, dy } = input.consumeLook();
      yaw -= dx * LOOK;
      pitch = clamp(pitch - dy * LOOK, -1.4, 1.4);
      const { forward, strafe, rise } = input.axes();
      camera.getWorldDirection(dir);
      const r = right(yaw), s = SPEED * dt;
      const ny = clamp(y + (dir.y * forward + rise) * s, 0.5, 40);
      ({ x, z } = ctx.world.move({ x, y: Math.min(y, ny), z }, { x: (dir.x * forward + r.x * strafe) * s, z: (dir.z * forward + r.z * strafe) * s }, R));
      y = ny;
      place();
    },
    exit() {
      Object.assign(ctx.pose, { x, z, yaw });
    },
  };
}

function orbit(ctx) {
  const GLIDE = 0.12, TURN = 1, ZOOM = 8, CENTER = new Vector3(0, 2, 0);
  const camera = new Object3D();
  let angle, elevation, radius;
  const place = () => {
    const c = radius * Math.cos(elevation);
    camera.position.set(CENTER.x + c * Math.sin(angle), CENTER.y + radius * Math.sin(elevation), CENTER.z + c * Math.cos(angle));
    camera.lookAt(CENTER);
  };
  return {
    name: 'orbit',
    camera,
    enter() {
      angle = 0;
      elevation = 0.45;
      radius = 22;
      place();
    },
    update(dt, input) {
      const { dx, dy } = input.consumeLook();
      const { forward, strafe } = input.axes();
      angle -= dx * LOOK * 2 + (GLIDE + strafe * TURN) * dt;
      elevation = clamp(elevation + dy * LOOK, 0.1, 1.3);
      // Radius stays inside the boundary (the test scene is 60 m across).
      radius = clamp(radius - forward * ZOOM * dt, 6, 26);
      place();
    },
    exit() {},
  };
}

export const MODE_FACTORIES = { 'first-person': firstPerson, walk, drive, drone, orbit };
