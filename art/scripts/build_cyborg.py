"""Cyborg build (ticket #16, attempt 2). Run headless:
  blender.exe --background --factory-startup --python art/scripts/build_cyborg.py

Base body: Quaternius "Universal Base Characters" Superhero_Male (CC0), UE mannequin rig.
Clips:     Quaternius "Universal Animation Library" Standard (CC0), same bone names, copied across by name.
Armor:     derived from the body's own faces (so it conforms and keeps the body's skin weights): chosen faces are
           pushed out along the vertex normals with side walls, in three materials (dark, blue seam, orange seam).
Detail:    engraved panel lines are baked into normal maps (armor, and the bare skin of chest and arms).
Outputs:   art/exports/cyborg.glb, art/cyborg.blend
"""
import bpy, bmesh, os, math, sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_lib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'sources')
OUT = os.path.join(ROOT, 'exports')
os.makedirs(OUT, exist_ok=True)
TEX = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'quaternius-ubc-male', 'Superhero_Male_FullBody.gltf'), import_pack_images=False)
base_objs = set(bpy.context.scene.objects)
arm = next(o for o in base_objs if o.type == 'ARMATURE')
arm.name = 'CyborgRig'
body = bpy.data.objects['SuperHero_Male']
body.name = 'CyborgBody'
for n in ('Icosphere', 'Eyebrows'):
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
eyes_obj = bpy.data.objects.get('Eyes')
eye_z = max(v.co.z for v in eyes_obj.data.vertices) - 0.012 if eyes_obj else 1.70

bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'quaternius-ual', 'UAL1_Standard.glb'), import_pack_images=False)
ual_objs = set(bpy.context.scene.objects) - base_objs
ual_arm = next(o for o in ual_objs if o.type == 'ARMATURE')

# ---------------------------------------------------------------- body decimation (rest pose, weights and UVs kept)
BODY_RATIO = 0.75
for m in body.modifiers:
    m.show_viewport = False
dm = body.modifiers.new('dec', 'DECIMATE')
dm.ratio = BODY_RATIO
dg = bpy.context.evaluated_depsgraph_get()
new_me = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
body.modifiers.remove(dm)
for m in body.modifiers:
    m.show_viewport = True
body.data = new_me
print('BODY tris after decimate', sum(len(p.vertices) - 2 for p in body.data.polygons))

# ---------------------------------------------------------------- materials
def mat(name, base, metal=0.0, rough=0.5, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*base, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if emit:
        bs.inputs['Emission Color'].default_value = (*emit, 1)
        bs.inputs['Emission Strength'].default_value = strength
    return m

M_ARMOR = mat('armor_dark', (0.025, 0.027, 0.032), 0.85, 0.32)
M_BLUE = mat('seam_blue', (0.0, 0.02, 0.06), 0.0, 0.4, (0.0, 0.30, 1.0), 0.6)
M_ORANGE = mat('seam_orange', (0.05, 0.015, 0.0), 0.0, 0.4, (1.0, 0.20, 0.0), 1.3)
MATS = [M_ARMOR, M_BLUE, M_ORANGE]
THICK = [0.013, 0.007, 0.007]

# ---------------------------------------------------------------- classify the body's faces
bm = bmesh.new()
bm.from_mesh(body.data)
bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
bm.normal_update()
dl = bm.verts.layers.deform.verify()
gi = {g.name: g.index for g in body.vertex_groups}
FING = [n for n in gi if any(k in n for k in ('index', 'middle', 'pinky', 'ring', 'thumb'))]
idx = {}


def fw(f, names):
    ids = [gi[n] for n in names if n in gi]
    return sum(sum(v[dl].get(i, 0.0) for i in ids) for v in f.verts) / len(f.verts)


def bone_pts(name):
    b = arm.data.bones[name]
    return b.head_local.copy(), b.tail_local.copy()


def ax(bone, f):
    h, t = bone_pts(bone)
    a = t - h
    return (f.calc_center_median() - h).dot(a) / a.length_squared


def rule_bone(bone, s0, s1, m, cond=None, w=0.5, names=None):
    names = names or [bone]
    for f in bm.faces:
        if fw(f, names) >= w and s0 <= ax(bone, f) <= s1 and (cond is None or cond(f)):
            idx[f] = m


def inpoly(x, z, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            inside = not inside
    return inside


def poly(kind, cx, cz, w, h):
    if kind == 'hex':
        return [(cx + w * c, cz + h * s) for c, s in ((1, 0), (.5, .87), (-.5, .87), (-1, 0), (-.5, -.87), (.5, -.87))]
    if kind == 'dia':
        return [(cx, cz + h), (cx - w, cz), (cx, cz - h), (cx + w, cz)]
    if kind == 'rect':
        return [(cx - w, cz - h), (cx + w, cz - h), (cx + w, cz + h), (cx - w, cz + h)]


def plate(kind, cx, cz, w, h, rim, side=-1):
    outer = poly(kind, cx, cz, w, h)
    inner = poly(kind, cx, cz, w * 0.82, h * 0.80)
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.y * side > 0.2 and abs(c.x) < 0.25 and 1.0 < c.z < 1.52:
            if inpoly(c.x, c.z, inner):
                idx[f] = 0
            elif inpoly(c.x, c.z, outer):
                idx[f] = rim


B, O, D = 1, 2, 0
front = lambda f: f.normal.y < -0.35
for sfx, s in (('l', 1), ('r', -1)):
    up = lambda f: f.normal.z > -0.1
    rule_bone('upperarm_' + sfx, 0.0, 0.34, D, up)
    rule_bone('upperarm_' + sfx, 0.34, 0.39, B, up)
    rule_bone('lowerarm_' + sfx, 0.15, 0.90, D)
    rule_bone('lowerarm_' + sfx, 0.10, 0.15, B)
    rule_bone('lowerarm_' + sfx, 0.90, 0.96, O)
    fingers = [n for n in FING if n.endswith('_' + sfx)]
    rule_bone('hand_' + sfx, 0.04, 2.0, D, names=['hand_' + sfx] + fingers)
    rule_bone('hand_' + sfx, 0.0, 0.04, B, names=['hand_' + sfx])
    rule_bone('thigh_' + sfx, 0.10, 0.95, D)
    rule_bone('thigh_' + sfx, 0.95, 1.0, B)
    rule_bone('thigh_' + sfx, 0.15, 0.90, O, lambda f, s=s: front(f) and abs(abs(f.calc_center_median().x) - 0.114) < 0.016)
    rule_bone('calf_' + sfx, 0.12, 0.85, D)
    rule_bone('calf_' + sfx, 0.85, 0.91, O)
    rule_bone('calf_' + sfx, 0.15, 0.83, B, lambda f, s=s: front(f) and abs(abs(f.calc_center_median().x) - 0.114) < 0.012)
    rule_bone('foot_' + sfx, 0.0, 2.0, D, names=['foot_' + sfx, 'ball_' + sfx])
rule_bone('neck_01', 0.0, 0.55, D)
rule_bone('neck_01', 0.55, 0.70, B)
for f in bm.faces:  # belt
    c = f.calc_center_median()
    if abs(c.x) < 0.2 and 1.03 < c.z < 1.10 and fw(f, ['pelvis', 'spine_01']) > 0.4:
        idx[f] = D
    elif abs(c.x) < 0.2 and 1.10 <= c.z < 1.125 and fw(f, ['pelvis', 'spine_01']) > 0.4:
        idx[f] = O
for sfx, s in (('l', 1), ('r', -1)):
    plate('hex', 0.092 * s, 1.40, 0.092, 0.075, B)
    plate('hex', 0.056 * s, 1.275, 0.050, 0.038, B)
    plate('hex', 0.056 * s, 1.205, 0.050, 0.038, B)
    plate('hex', 0.105 * s, 1.07, 0.045, 0.035, B)
    plate('hex', 0.10 * s, 1.42, 0.075, 0.065, B, side=1)
plate('dia', 0.0, 1.35, 0.05, 0.10, O)
plate('dia', 0.0, 1.13, 0.03, 0.05, O)
plate('dia', 0.0, 1.38, 0.055, 0.13, B, side=1)
for f in bm.faces:  # head: cranial plate, seam lines, visor
    c = f.calc_center_median()
    if fw(f, ['Head']) < 0.5:
        continue
    if c.z > eye_z + 0.07:
        idx[f] = O if abs(c.x) < 0.007 else (B if c.z < eye_z + 0.085 else D)
    elif f.normal.y < -0.2 and abs(c.x) < 0.055 and eye_z - 0.012 <= c.z <= eye_z + 0.006:
        idx[f] = B
# majority filter: remove one-face teeth along plate edges (two passes)
for _ in range(2):
    snap = {f: idx.get(f, -1) for f in bm.faces}
    for f in bm.faces:
        nb_ = [snap[g] for e in f.edges for g in e.link_faces if g is not f]
        if not nb_:
            continue
        top = max(set(nb_), key=nb_.count)
        if top != snap[f] and nb_.count(top) >= 3:
            if top == -1:
                idx.pop(f, None)
            else:
                idx[f] = top
print('ARMOR faces by material', [sum(1 for v in idx.values() if v == m) for m in (0, 1, 2)])


# ---------------------------------------------------------------- shells from the chosen faces
group_names = [g.name for g in body.vertex_groups]
shells = []


def shell(m):
    faces = [f for f, k in idx.items() if k == m]
    fset = set(faces)
    nb = bmesh.new()
    dl2 = nb.verts.layers.deform.verify()
    vmap, base = {}, {}
    t = THICK[m]
    for f in faces:
        for v in f.verts:
            if v not in vmap:
                nv = nb.verts.new(v.co + v.normal * t)
                for k_, w_ in v[dl].items():
                    nv[dl2][k_] = w_
                vmap[v] = nv
        nb.faces.new([vmap[v] for v in f.verts])
    for f in faces:
        for l in f.loops:
            if sum(1 for lf in l.edge.link_faces if lf in fset) == 1:
                a, b = l.vert, l.link_loop_next.vert
                for v in (a, b):
                    if v not in base:
                        bv = nb.verts.new(v.co)
                        for k_, w_ in v[dl].items():
                            bv[dl2][k_] = w_
                        base[v] = bv
                nb.faces.new((vmap[a], base[a], base[b], vmap[b]))
    me = bpy.data.meshes.new('shell%d' % m)
    nb.to_mesh(me)
    nb.free()
    me.materials.append(MATS[m])
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new('shell%d' % m, me)
    bpy.context.scene.collection.objects.link(o)
    for n in group_names:
        o.vertex_groups.new(name=n)
    return o


for m in (0, 1, 2):
    shells.append(shell(m))
bm.free()

# UV for the dark armor only, then bake engraved panel lines into its normal map
ar = shells[0]
bpy.ops.object.select_all(action='DESELECT')
ar.select_set(True)
bpy.context.view_layer.objects.active = ar
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
img_armor = bake_lib.bake_normal(ar, M_ARMOR, 'T_Armor_Normal', 1024, scale=26.0, width=0.06, strength=0.9, dist=0.004)

# bare-skin tech lines on chest and arms: bake onto the body's own UV, on top of its original normal map
skin = body.material_slots[0].material
sn = skin.node_tree
nimg = next(n for n in sn.nodes if n.type == 'TEX_IMAGE' and 'Normal' in n.image.name)
img_skin = bake_lib.bake_normal(body, skin, 'T_Cyborg_Skin_Normal', 1024, scale=14.0, width=0.045, strength=0.7, dist=0.0025,
                                base_normal=nimg.outputs['Color'], mask_z=(1.08, 1.2, 1.5, 1.57))
bpy.context.scene.render.engine = 'BLENDER_EEVEE'

# join the three shells into one armor mesh bound to the rig with the body's weights
bpy.ops.object.select_all(action='DESELECT')
for o in shells:
    o.select_set(True)
bpy.context.view_layer.objects.active = shells[0]
bpy.ops.object.join()
armor = bpy.context.view_layer.objects.active
armor.name = 'CyborgArmor'
armor.data.name = 'CyborgArmor'
armor.parent = arm
mod = armor.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
skin.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55

# ---------------------------------------------------------------- clips: copy by bone name, NLA tracks
CLIPS = {'idle': 'Idle_Loop', 'walk': 'Walk_Loop', 'run': 'Jog_Fwd_Loop', 'sprint': 'Sprint_Loop'}
ad = arm.animation_data_create()
for dst, src in CLIPS.items():
    act = bpy.data.actions[src].copy()
    act.name = dst
    ad.action = act
    if hasattr(ad, 'action_slot') and act.slots:
        ad.action_slot = act.slots[0]
    tr = ad.nla_tracks.new()
    tr.name = dst
    st = tr.strips.new(dst, int(act.frame_range[0]), act)
    st.name = dst
    if hasattr(st, 'action_slot') and act.slots:
        st.action_slot = act.slots[0]
    ad.action = None
for o in list(ual_objs):
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a.users == 0 and a.name not in CLIPS:
        bpy.data.actions.remove(a)

tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons)
print('TRIS total', tris)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'cyborg.blend'), compress=True)
for img in bpy.data.images:
    if img.size[0] > TEX:
        img.scale(TEX, TEX)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'cyborg.glb'), export_format='GLB',
    export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True,
    export_image_format='JPEG', export_jpeg_quality=88, export_yup=True,
    export_apply=False, export_cameras=False, export_lights=False)
print('EXPORTED')
