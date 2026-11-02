"""Hover-car build (ticket #16, attempt 2), modeled from scratch (no free base fits, see art/CREDITS-art.md).
  blender.exe --background --factory-startup --python art/scripts/build_car.py
Low wide faceted wedge: wheels tucked into carved arches under flared fenders, raked cabin, layered deck panel,
integrated wing and diffuser, orange light strips (own emissive material), glowing rims.
Baked normal map (panel lines) and roughness map (per-panel variation) on the paint.
Wheels are four separate nodes sharing one mesh (so 6 glTF primitives in total). Faces -Y in Blender (+Z in glTF).
Outputs: art/exports/car.glb, art/car.blend"""
import bpy, bmesh, os, math, sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_lib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(ROOT, 'exports'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def mat(name, base, metal=0.0, rough=0.5, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


PAINT = mat('body_paint', (0.05, 0.055, 0.07), 0.85, 0.3)
TRIM = mat('body_trim', (0.008, 0.008, 0.01), 0.6, 0.45)
GLASS = mat('glass', (0.01, 0.02, 0.03), 0.2, 0.05)
TYRE = mat('tyre', (0.01, 0.01, 0.012), 0.0, 0.85)
RIM = mat('rim_glow', (0.05, 0.015, 0.0), 0.0, 0.4, (1.0, 0.22, 0.0), 1.8)
STRIP = mat('light_strip', (0.05, 0.015, 0.0), 0.0, 0.4, (1.0, 0.25, 0.0), 2.6)


def new_obj(name, me, material):
    o = bpy.data.objects.new(name, me)
    SC.collection.objects.link(o)
    me.materials.append(material)
    return o


def loft(name, stations, material):
    """stations: (y, halfwidth, z_bottom, z_top); chamfered ring per station, lofted along Y, faceted"""
    bm = bmesh.new()
    rings = []
    for y, w, zb, zt in stations:
        pts = [(0, zb), (w * .80, zb), (w, zb + .09), (w, zt - .10), (w * .80, zt), (0, zt)]
        full = pts + [(-x, z) for x, z in reversed(pts[1:-1])]
        rings.append([bm.verts.new((x, y, z)) for x, z in full])
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, material)


def box(name, loc, size, material, rot=(0, 0, 0), bevel=True):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(size) * 0.2, segments=1, affect='EDGES')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(name, me, material)
    o.location = loc
    o.rotation_euler = rot
    return o


def cylinder_x(name, r, depth, loc, material, seg=36):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(name, me, material)
    o.location = loc
    return o


def bake_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    mats = list(o.data.materials)
    o.data = me
    if not me.materials:
        for m in mats:
            me.materials.append(m)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


WX, WY, WZ, WR = 1.0, 1.5, 0.38, 0.38  # wheel centre x, y, z, tyre radius

# ---- paint panels: tub, layered deck, rear wing with pillars
tub = loft('tub', [(-2.45, .55, .22, .34), (-2.05, 1.00, .20, .60), (-1.5, 1.26, .20, .86), (-0.5, 1.22, .20, .80),
                   (0.9, 1.30, .20, .90), (2.0, 1.30, .24, .92), (2.45, 1.15, .30, .92)], PAINT)
for sx in (-1, 1):
    for sy in (-1, 1):
        cut = cylinder_x('cut', WR + 0.07, 0.9, (sx * (WX + 0.12), sy * WY, WZ), TRIM)
        bo = tub.modifiers.new('arch', 'BOOLEAN')
        bo.operation = 'DIFFERENCE'
        bo.solver = 'FLOAT'
        bo.object = cut
        print('TUB before', len(tub.data.polygons))
        bake_mods(tub)
        print('TUB after boolean', len(tub.data.polygons))
        bpy.data.objects.remove(cut, do_unlink=True)
bv = tub.modifiers.new('bevel', 'BEVEL')
bv.width = 0.022
bv.segments = 2
bv.limit_method = 'ANGLE'
bv.angle_limit = math.radians(25)
bake_mods(tub)
print('TUB after bevel', len(tub.data.polygons), [round(x,2) for x in tub.dimensions])
deck = loft('deck', [(-2.0, .45, .56, .60), (-1.2, .80, .76, .84), (0.0, .80, .78, .86), (1.6, .80, .90, .98), (2.3, .70, .92, .98)], PAINT)
dbv = deck.modifiers.new('bevel', 'BEVEL')
dbv.width = 0.015; dbv.segments = 1; dbv.limit_method = 'ANGLE'; dbv.angle_limit = math.radians(25)
bake_mods(deck)
deck.location.z += 0.045  # lifted so the gap between the layered panels reads
wing = box('wing', (0, 2.12, 1.16), (2.3, 0.50, 0.035), PAINT)
wing.rotation_euler = (math.radians(-6), 0, 0)
parts = [tub, deck, wing]
for sx in (-1, 1):
    parts.append(box('endplate', (sx * 1.18, 2.12, 1.08), (0.04, 0.58, 0.22), PAINT))
    parts.append(box('pillar', (sx * 0.5, 2.15, 1.04), (0.07, 0.20, 0.30), PAINT, rot=(math.radians(18), 0, 0)))
    parts.append(box('fender_lip_f', (sx * 1.22, -1.5, 0.90), (0.20, 1.1, 0.06), PAINT, rot=(0, math.radians(-12 * sx), 0)))
    parts.append(box('fender_lip_r', (sx * 1.28, 1.5, 0.94), (0.20, 1.1, 0.06), PAINT, rot=(0, math.radians(-12 * sx), 0)))
body = join(parts, 'body')
for p_ in body.data.polygons:
    p_.material_index = 0  # the boolean cutter added its trim slot; paint only
body.data.materials.clear()
body.data.materials.append(PAINT)
for p in body.data.polygons:
    p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(32))
except Exception as e:
    print('auto smooth', e)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
bake_lib.bake_normal(body, PAINT, 'T_Car_Normal', 1024, scale=1.7, width=0.03, strength=0.6, dist=0.012)
bake_lib.bake_roughness(body, PAINT, 'T_Car_Roughness', 1024, scale=2.4, lo=0.18, hi=0.55)
SC.render.engine = 'BLENDER_EEVEE'

# ---- cabin: raked windshield, fastback
cab = loft('canopy', [(-0.95, .55, .80, .84), (-0.1, .66, .82, 1.14), (0.9, .70, .84, 1.16), (2.0, .80, .86, .98)], GLASS)
cab.location.z += 0.045
cbv = cab.modifiers.new('bevel', 'BEVEL')
cbv.width = 0.02; cbv.segments = 1; cbv.limit_method = 'ANGLE'; cbv.angle_limit = math.radians(25)
bake_mods(cab)

# ---- trim: diffuser with fins, splitter, side skirts, vents, intakes
trim_parts = [box('splitter', (0, -2.40, 0.20), (1.9, 0.40, 0.04), TRIM), box('diffuser', (0, 2.28, 0.28), (1.7, 0.36, 0.07), TRIM, rot=(math.radians(14), 0, 0))]
for i in range(-3, 4):
    trim_parts.append(box('fin', (0.2 * i, 2.40, 0.30), (0.03, 0.30, 0.16), TRIM))
for sx in (-1, 1):
    trim_parts.append(box('skirt', (sx * 1.30, 0.0, 0.26), (0.06, 1.7, 0.10), TRIM))
    trim_parts.append(box('intake', (sx * 1.31, 0.2, 0.52), (0.05, 0.9, 0.18), TRIM))
    for i in range(4):
        trim_parts.append(box('vent', (sx * 0.30, -1.35 + 0.16 * i, 0.82 + 0.015 * i), (0.34, 0.05, 0.02), TRIM))
trim = join(trim_parts, 'trim')
for p in trim.data.polygons:
    p.use_smooth = False

# ---- light strips: one emissive material
S = []
S.append(box('s_tail', (0, 2.465, 0.82), (2.0, 0.05, 0.045), STRIP, bevel=False))
for sx in (-1, 1):
    S.append(box('s_tail_u', (sx * 0.85, 2.465, 0.56), (0.045, 0.05, 0.34), STRIP, rot=(0, math.radians(14 * sx), 0), bevel=False))
    S.append(box('s_side', (sx * 1.315, 0.2, 0.44), (0.04, 3.2, 0.04), STRIP, bevel=False))
    S.append(box('s_hood', (sx * 0.78, -1.1, 0.80), (0.035, 1.6, 0.03), STRIP, rot=(math.radians(2), 0, 0), bevel=False))
S.append(box('s_nose', (0, -2.46, 0.30), (1.0, 0.04, 0.035), STRIP, bevel=False))
strips = join(S, 'light_strips')

# ---- wheels: four nodes sharing one mesh (tyre + hub dark, rim ring glowing on the +X face)
tyre = cylinder_x('tyre', WR, 0.36, (0, 0, 0), TYRE)
rim = cylinder_x('rim', 0.30, 0.02, (0.185, 0, 0), RIM)
hub = cylinder_x('hub', 0.21, 0.03, (0.20, 0, 0), TYRE)
wheel_obj = join([tyre, rim, hub], 'wheel_mesh')
for p in wheel_obj.data.polygons:
    p.use_smooth = True
wheel_me = wheel_obj.data
bpy.data.objects.remove(wheel_obj, do_unlink=True)
wheels = []
for nm, sx, sy in (('wheel_fl', -1, -1), ('wheel_fr', 1, -1), ('wheel_rl', -1, 1), ('wheel_rr', 1, 1)):
    w = bpy.data.objects.new(nm, wheel_me)
    SC.collection.objects.link(w)
    w.location = (sx * WX, sy * WY, WZ)
    if sx < 0:
        w.rotation_euler = (0, 0, math.pi)  # rim face outward
    wheels.append(w)

root = bpy.data.objects.new('CommitCar', None)
SC.collection.objects.link(root)
for o in [body, cab, trim, strips] + wheels:
    o.parent = root

tris = sum(len(p.vertices) - 2 for o in (body, cab, trim, strips) for p in o.data.polygons) + 4 * sum(len(p.vertices) - 2 for p in wheel_me.polygons)
print('TRIS (instances counted)', tris)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'car.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'exports', 'car.glb'), export_format='GLB',
                          export_image_format='JPEG', export_jpeg_quality=88,
                          export_apply=True, export_yup=True, export_animations=False,
                          export_cameras=False, export_lights=False)
print('EXPORTED CAR')
