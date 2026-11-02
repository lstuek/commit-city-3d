"""Builds the baked background building: blender.exe --background --factory-startup --python art/build_building.py
Walls use the concrete and painted-metal trim sheets plus trim normals (UV_Trim), windows pick cells of the
emissive window atlas, UV_Bake (a unique unwrap) carries the baked AO (glTF occlusion) and the baked neon
light (lightmap PNG, named in the material extras; glTF has no lightmap slot)."""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
import kit_lib as K
from mathutils import Vector

NAME = 'bg_building'
RES = 1024
rng = random.Random(5)


def pick_cell():
    r = rng.random()
    row = 0 if r < 0.55 else 1 if r < 0.66 else 2 if r < 0.75 else 3 if r < 0.83 else 4 if r < 0.89 else 5 if r < 0.95 else 6
    return (row, rng.randrange(8))


def build(P):
    rng.seed(5)
    P.box((0, 0, 3.0), (14, 12, 6), 'concrete', 'plain', bevel=0.08)                       # podium
    P.box((0, 0, 6.1), (14.8, 12.8, 0.35), 'paint', 'bevel', bevel=0.05)                      # cornice
    for i, x in enumerate((-4.6, 0, 4.6)):                                                   # shopfronts (interior cards)
        P.box((x, -6.08, 2.0), (3.6, 0.16, 3.0), 'window', cell=(7, (1, 4, 6)[i]), bevel=0)
        P.box((x, -6.14, 3.75), (3.8, 0.12, 0.35), 'paint', 'stripe', bevel=0.02)
    P.box((0, -6.75, 4.45), (14.8, 1.6, 0.25), 'paint', 'bevel', bevel=0.04)                 # awning
    P.box((0, -7.52, 4.45), (14.4, 0.06, 0.12), 'neon_mag', 'plain', bevel=0)
    P.box((0, 0, 21.0), (12, 10, 30), 'concrete', 'plain', bevel=0.08)                       # shaft
    for x in (-5.5, -3.3, -1.1, 1.1, 3.3, 5.5):                                              # pilasters
        P.box((x, -5.12, 21.0), (0.5, 0.26, 30), 'concrete', 'bevel', bevel=0.05)
    for f in range(0, 9):                                                                    # window bays front
        z = 7.9 + f * 3.2
        for c in range(5):
            x = -4.4 + c * 2.2
            P.box((x, -5.17, z), (1.5, 0.16, 2.0), 'window', cell=pick_cell(), bevel=0)
        P.box((0, -5.2, z - 1.2), (12.6, 0.18, 0.14), 'paint', 'groove', bevel=0.02)         # sill line
        for k in range(4):                                                                   # side windows
            y = -3.7 + k * 2.5
            P.box((6.1, y, z), (0.16, 1.5, 2.0), 'window', cell=pick_cell(), bevel=0)
            P.box((-6.1, y, z), (0.16, 1.5, 2.0), 'window', cell=pick_cell(), bevel=0)
    for z in (9.2, 18.8, 28.4, 36.1):                                                        # ledges
        P.box((0, 0, z), (13.4, 11.4, 0.5), 'paint', 'bevel', bevel=0.05)
    P.box((0, 0, 39.5), (8.6, 8.0, 7), 'concrete', 'plain', bevel=0.08)                      # crown
    P.box((0, 0, 43.1), (9.0, 8.4, 0.35), 'paint', 'stripe', bevel=0.05)
    for z in (38.4, 40.6):
        P.box((0, -4.06, z), (7.4, 0.14, 1.2), 'window', cell=(6, 3), bevel=0)
    P.cyl((-2.4, 1.6, 44.6), 1.2, 2.4, 'grime', 'ribs', bevel=0.05)                          # water tank
    P.cyl((-2.4, -1.6, 44.4), 0.9, 2.0, 'grime', 'ribs', bevel=0.05)                         # second tank
    P.box((1.6, -0.8, 45.0), (4.2, 3.6, 3.0), 'concrete', 'plain', bevel=0.06)                # roof setback
    P.box((1.6, -0.8, 46.6), (4.6, 4.0, 0.3), 'paint', 'stripe', bevel=0.04)
    P.box((-1.0, 2.8, 44.1), (2.0, 1.4, 1.0), 'paint', 'slats', bevel=0.04)                  # roof AC
    for sx in (-1, 1):                                                                       # parapet
        P.box((0, sx * 4.1, 43.6), (9.0, 0.25, 0.7), 'concrete', 'bevel', bevel=0.03)
        P.box((sx * 4.4, 0, 43.6), (0.25, 8.4, 0.7), 'concrete', 'bevel', bevel=0.03)
    for k, (ax, ay, h) in enumerate(((3.0, 2.6, 9.0), (-1.0, 3.0, 12.0), (2.4, -2.2, 7.0), (0.5, 0.8, 10.0))):   # roof antennas
        P.rod((ax, ay, 46.8 if k in (2, 3) else 43.4), (ax, ay, 46.8 + h if k in (2, 3) else 43.4 + h), 0.05, 'grime', 'ribs', segs=6)
        P.box((ax, ay, 46.8 + h - 1.5 if k in (2, 3) else 43.4 + h - 1.5), (1.6, 0.06, 0.06), 'grime', 'bevel', bevel=0)
    P.cyl((3.6, -1.0, 49.0), 0.7, 0.1, 'paint', 'bevel', rot=(70, 0, 25), bevel=0.01)       # dish
    P.cyl((0, 2.0, 50.0), 0.12, 14, 'grime', 'ribs', bevel=0.01, r2=0.07)                   # antenna
    P.box((0, 2.0, 52.2), (3.2, 0.1, 0.1), 'grime', 'bevel', bevel=0)
    P.box((0, 2.0, 57.1), (0.34, 0.34, 0.34), 'neon_mag', 'plain', bevel=0)                  # beacon
    # --- facade depth: balconies, wall AC units, sign blades, cable bundles ---
    for f in (1, 3, 5, 7):
        zb = 7.9 + f * 3.2 - 1.15
        for c in ((1, 3) if f % 4 == 1 else (0, 2, 4)):
            x = -4.4 + c * 2.2
            P.box((x, -5.75, zb), (1.9, 1.3, 0.2), 'paint', 'bevel', bevel=0.03)
            P.box((x, -6.36, zb + 0.55), (1.9, 0.06, 0.07), 'paint', 'stripe', bevel=0)
            for dx in (-0.85, 0.0, 0.85):
                P.box((x + dx, -6.36, zb + 0.3), (0.05, 0.05, 0.5), 'grime', 'ribs', bevel=0)
    for k in range(9):
        f = rng.randrange(0, 9)
        x = -4.4 + 2.2 * rng.randrange(0, 5)
        z = 7.9 + f * 3.2 - 1.5
        P.box((x, -5.38, z), (0.8, 0.42, 0.5), 'grime', 'slats', bevel=0)
        P.cyl((x, -5.60, z), 0.17, 0.02, 'paint', 'ribs', rot=(90, 0, 0), bevel=0, segs=8)
    for sx, z0, h, nt in ((1, 16.0, 6.4, 'neon_teal'), (-1, 25.0, 4.6, 'neon_mag')):
        P.box((sx * 6.9, -5.9, z0), (0.10, 1.2, h), 'paint', 'bevel', bevel=0.02)
        P.box((sx * 6.9, -5.9, z0), (0.16, 1.0, h - 0.4), nt, 'plain', bevel=0)
        P.box((sx * 6.45, -5.3, z0 + h / 2 - 0.4), (0.9, 0.1, 0.12), 'grime', 'bevel', bevel=0)
        P.box((sx * 6.45, -5.3, z0 - h / 2 + 0.4), (0.9, 0.1, 0.12), 'grime', 'bevel', bevel=0)
    for dz, dy in ((0.0, 0.0), (0.12, 0.1), (-0.1, 0.0)):                                  # cables to the street pole
        P.rod((3.4, -5.3, 9.0 + dz), (3.85, -7.8, 7.0 + dz), 0.04, 'grime', 'ribs', segs=6)
        P.rod((3.85, -7.8, 7.0 + dz), (4.2, -10.4 + dy, 6.3 + dz), 0.04, 'grime', 'ribs', segs=6)
    for z in (9.4, 18.9, 28.6):                                                              # cable runs along the facade
        P.rod((-6.0, -5.35, z), (6.0, -5.35, z + 0.08), 0.045, 'grime', 'ribs', segs=6)


SPECS = {'concrete': dict(kind='trim', sheet='concrete'), 'paint': dict(kind='trim', sheet='paint'),
         'grime': dict(kind='trim', sheet='grime'),
         'window': dict(kind='window', strength=3.0),
         'neon_mag': dict(kind='neon', color=(1.0, 0.1, 0.55), strength=8.0),
         'neon_teal': dict(kind='neon', color=(0.05, 0.95, 0.85), strength=8.0)}


def add_light(name, loc, rot, energy, color, size=6.0):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.color = color
    d.size = size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    bpy.context.scene.collection.objects.link(o)


K.reset()
K.setup_cycles(32)
P = K.PB(False)
build(P)
obj = P.to_object(NAME)
for k in P.mats:
    obj.data.materials.append(bpy.data.materials.new('slot_' + k))
K.unwrap_bake(obj, margin=0.004)
# lights for the baked neon light: teal and magenta street neon, warm shop spill, dim blue sky fill
w = bpy.data.worlds.new('night')
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.01, 0.018, 0.045, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
bpy.context.scene.world = w
add_light('teal', (-9, -14, 6), (80, 0, -25), 9000, (0.05, 0.9, 0.85), 8)
add_light('magenta', (11, -10, 9), (75, 0, 35), 9000, (1.0, 0.1, 0.55), 8)
add_light('warm', (0, -12, 1.5), (95, 0, 0), 2500, (1.0, 0.55, 0.2), 8)
add_light('side_teal', (14, 2, 20), (90, 0, 90), 5000, (0.05, 0.9, 0.85), 10)

aim = K.new_bake_image(NAME + '_ao', RES // 2)   # different size from the ORM so the exporter keeps AO separate (UV1)
for o in bpy.context.view_layer.objects:
    o.select_set(o == obj)
bpy.context.view_layer.objects.active = obj
K.bake(obj, aim, 'AO', samples=48)
K.save_png(aim, NAME + '_ao.jpg')
lim = K.new_bake_image(NAME + '_lightmap', RES, True)
K.bake(obj, lim, 'DIFFUSE', samples=96)
a = np.empty(RES * RES * 4, np.float32)
lim.pixels.foreach_get(a)
b = a.reshape(-1, 4)
p99 = float(np.percentile(b[:, :3].max(1), 99.5))
scale = 0.9 / max(p99, 1e-4)
b[:, :3] = np.clip(b[:, :3] * scale, 0, 1) ** (1 / 2.2)     # store sRGB-encoded, auto-exposed
lim.pixels.foreach_set(b.ravel())
K.save_png(lim, NAME + '_lightmap.jpg', srgb=False)
print('LIGHTMAP scale', scale)

aim = K.img(NAME + '_ao', os.path.join(K.TEX, NAME + '_ao.jpg'), False)
mats = []
for i, k in enumerate(P.mats):
    spec = dict(SPECS[k])
    m = K.make_material(NAME + '_' + k, spec.pop('kind'), normal=None, ao=aim, **spec)
    m['lightmap'] = NAME + '_lightmap.jpg'
    m['lightmapScale'] = scale
    m['lightmapEncoding'] = 'sRGB-encoded, auto-exposed: multiply by lightmapScale after decoding'
    obj.data.materials[i] = m
for o in list(bpy.context.scene.objects):
    if o.type == 'LIGHT':
        bpy.data.objects.remove(o)
lods = K.make_lods(obj, NAME, ratios=(0.5, 0.15))
blob = K.contact_blob(NAME, loc=(0, 0, 0.004), size=(26, 24))
stats = {o.name: K.tri_count(o) for o in lods + [blob]}
K.export_glb(lods + [blob], os.path.join(K.EXP, NAME + '.glb'), extras=True)
print('STATS', NAME, stats, 'materials', len(obj.data.materials))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(K.ART, NAME + '.blend'))
