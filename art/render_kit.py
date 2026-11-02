"""Fixed-camera night renders of the kit, built from a FRESH IMPORT of the exported .glb files (not the build scene).
blender.exe --background --factory-startup --python art/render_kit.py -- <outdir>
Not reproduced from glTF: the baked building lightmap is wired to emission here as a stand-in for three.js lightMap."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import kit_lib as K
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
os.makedirs(OUT, exist_ok=True)
K.reset()
sc = bpy.context.scene
K.setup_cycles(96, bake=False)
sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = 0.3


def imp(name, offset=(0, 0, 0), rot_z=0, scale=1.0, lods=(0,)):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(K.EXP, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    res = {}
    for o in new:
        if o.type == 'MESH':
            idx = int(o.name.split('.')[0].split('LOD')[-1]) if 'LOD' in o.name else 9
            res[idx] = o
    for i, o in list(res.items()):
        if i not in lods and i != 9:
            bpy.data.objects.remove(o)
            del res[i]
    for o in res.values():
        if o.name.split('.')[0].endswith('_contact'):
            m = o.data.materials[0]
            nt = m.node_tree
            b = nt.nodes['Principled BSDF']
            t = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
            for l in list(b.inputs['Alpha'].links):
                nt.links.remove(l)
            nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
            for l in list(b.inputs['Base Color'].links):
                nt.links.remove(l)
            b.inputs['Base Color'].default_value = (0, 0, 0, 1)
            b.inputs['Roughness'].default_value = 1.0
            b.inputs['Specular IOR Level'].default_value = 0.0
            o.hide_render = False
    for i, o in res.items():
        o.location = Vector(offset)
        o.rotation_euler[2] = math.radians(rot_z)
        o.scale = (scale,) * 3
    return res


def emit_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0, 0, 0, 1)
    b.inputs['Emission Color'].default_value = (*color, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m


def sheet_mat(name, sheet, scale_uv=(0.5, 0.5), wet=0.5, puddles=False, vi=1):
    """trim sheet 'plain' band (v 0..0.25) tiled in world xy"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sp.inputs[0])
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = scale_uv[0]
    mv = nt.nodes.new('ShaderNodeMath'); mv.operation = 'MULTIPLY'; mv.inputs[1].default_value = scale_uv[1]
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'
    sv = nt.nodes.new('ShaderNodeMath'); sv.operation = 'MULTIPLY_ADD'; sv.inputs[1].default_value = 0.22; sv.inputs[2].default_value = 0.015
    nt.links.new(sp.outputs[0], mu.inputs[0]); nt.links.new(sp.outputs[vi], mv.inputs[0])
    nt.links.new(mv.outputs[0], fr.inputs[0]); nt.links.new(fr.outputs[0], sv.inputs[0])
    cb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(mu.outputs[0], cb.inputs[0]); nt.links.new(sv.outputs[0], cb.inputs[1])
    pre = 'trim_' + sheet
    ext = {'basecolor': 'jpg', 'orm': 'jpg', 'normal': 'jpg'}
    imgs = {}
    for k in ext:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = K.img('r_%s_%s' % (sheet, k), os.path.join(K.TEX, '%s_%s.%s' % (pre, k, ext[k])), k == 'basecolor')
        nt.links.new(cb.outputs[0], t.inputs[0])
        imgs[k] = t
    nt.links.new(imgs['basecolor'].outputs[0], b.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(imgs['orm'].outputs[0], sep.inputs[0])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(imgs['normal'].outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], b.inputs['Normal'])
    if puddles:   # wet street: low roughness where a noise mask is high
        no = nt.nodes.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 0.35
        nt.links.new(tc.outputs['Object'], no.inputs[0])
        cr = nt.nodes.new('ShaderNodeMapRange'); cr.inputs[1].default_value = 0.48; cr.inputs[2].default_value = 0.56
        cr.inputs[3].default_value = 1.0; cr.inputs[4].default_value = 0.0
        nt.links.new(no.outputs[0], cr.inputs[0])
        mu2 = nt.nodes.new('ShaderNodeMath'); mu2.operation = 'MULTIPLY'
        nt.links.new(sep.outputs[1], mu2.inputs[0]); nt.links.new(cr.outputs[0], mu2.inputs[1])
        mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = 0.04
        nt.links.new(mu2.outputs[0], mx.inputs[0])
        nt.links.new(mx.outputs[0], b.inputs['Roughness'])
    else:
        nt.links.new(sep.outputs[1], b.inputs['Roughness'])
    nt.links.new(sep.outputs[2], b.inputs['Metallic'])
    return m


def box(name, loc, size, mat):
    me = bpy.data.meshes.new(name)
    import bmesh
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.location = loc
    o.data.materials.append(mat)
    return o


def area(name, loc, target, energy, color, size):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.color = color; d.size = size
    o = bpy.data.objects.new(name, d); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(o)


def point(name, loc, energy, color, r=0.12):
    d = bpy.data.lights.new(name, 'POINT'); d.energy = energy; d.color = color; d.shadow_soft_size = r
    o = bpy.data.objects.new(name, d); o.location = loc; sc.collection.objects.link(o)


def world(density=0.006):
    w = bpy.data.worlds.new('night'); w.use_nodes = True
    nt = w.node_tree
    nt.nodes['Background'].inputs[0].default_value = (0.012, 0.02, 0.05, 1)
    nt.nodes['Background'].inputs[1].default_value = 1.0
    if density:
        v = nt.nodes.new('ShaderNodeVolumePrincipled')
        v.inputs['Density'].default_value = density
        v.inputs['Color'].default_value = (0.4, 0.5, 0.7, 1)
        v.inputs['Anisotropy'].default_value = 0.4
        nt.links.new(v.outputs[0], nt.nodes['World Output'].inputs['Volume'])
    sc.world = w


def baked_building_preview(o):
    """Stand-in for three.js lightMap + aoMap: emission = basecolor * (lightmap*scale + 0.03) * ao."""
    me = o.data
    uvb = me.uv_layers[1].name
    for m in me.materials:
        if m is None or not any(m.name.endswith(s) for s in ('concrete', 'paint', 'grime')):
            continue
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        base = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and 'basecolor' in n.image.name][0]
        lm = nt.nodes.new('ShaderNodeTexImage'); lm.image = K.img('lm', os.path.join(K.TEX, 'bg_building_lightmap.jpg'), False)
        ao = nt.nodes.new('ShaderNodeTexImage'); ao.image = K.img('ao', os.path.join(K.TEX, 'bg_building_ao.jpg'), False)
        for t in (lm, ao):
            u = nt.nodes.new('ShaderNodeUVMap'); u.uv_map = uvb; nt.links.new(u.outputs[0], t.inputs[0])
        ga = nt.nodes.new('ShaderNodeGamma'); ga.inputs[1].default_value = 2.2; nt.links.new(lm.outputs[0], ga.inputs[0])
        sc_ = nt.nodes.new('ShaderNodeMix'); sc_.data_type = 'RGBA'; sc_.blend_type = 'MULTIPLY'
        sc_.inputs[0].default_value = 1.0
        sc_.inputs[6].default_value = (0.0883, 0.0883, 0.0883, 1) if False else (1, 1, 1, 1)
        nt.links.new(ga.outputs[0], sc_.inputs[6])
        sc_.inputs[7].default_value = (1, 1, 1, 1)
        # light = gamma(lm) * lightmapScale * gain + ambient
        mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'; mul.inputs['Scale'].default_value = 0.0883 * 1.0
        nt.links.new(ga.outputs[0], mul.inputs[0])
        add = nt.nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'; add.inputs[1].default_value = (0.012, 0.016, 0.03)
        nt.links.new(mul.outputs[0], add.inputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
        nt.links.new(base.outputs[0], mx.inputs[6]); nt.links.new(add.outputs[0], mx.inputs[7])
        mx2 = nt.nodes.new('ShaderNodeMix'); mx2.data_type = 'RGBA'; mx2.blend_type = 'MULTIPLY'; mx2.inputs[0].default_value = 1
        nt.links.new(mx.outputs[2], mx2.inputs[6]); nt.links.new(ao.outputs[0], mx2.inputs[7])
        nt.links.new(mx2.outputs[2], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 9.0
        bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1) if False else bsdf.inputs['Base Color'].default_value


def street_scene(lods=(0,)):
    world()
    road = box('road', (0, -10, -0.2), (70, 40, 0.4), sheet_mat('road', 'asphalt', (0.35, 0.35), puddles=True))
    walk = box('walk', (0, 6.5, 0.0), (70, 13, 0.3), sheet_mat('walk', 'concrete', (0.25, 0.25)))
    walk.location.z = 0.0
    top = 0.15
    b = imp('bg_building', (0, 12, top), lods=lods)
    baked_building_preview(b[0])
    wall = box('acwall', (-10.5, 7.5, 1.9), (5.0, 0.3, 3.4), sheet_mat('acwall', 'concrete', (0.25, 0.25), vi=2))
    a = imp('ac_unit', (-10.5, 7.35 - 0.24, 1.2), 0)
    point('acwarm', (-11.6, 5.0, 2.7), 350, (1.0, 0.6, 0.3), 0.2)
    l = imp('street_light', (4.2, 1.6, top), 0)
    v = imp('vending_machine', (-2.2, 5.6, top), 0)
    # neon: teal and magenta signs, warm shop spill, street light cone
    s1 = box('sign_teal', (-13.8, 5.2, 3.8), (0.15, 0.5, 5.0), emit_mat('s1', (0.05, 0.95, 0.85), 14))
    s2 = box('sign_mag', (9.0, 4.8, 4.2), (0.15, 3.2, 1.2), emit_mat('s2', (1.0, 0.1, 0.55), 14))
    area('teal', (-12.6, 4.0, 3.8), (-9, 6, 1.0), 1500, (0.05, 0.9, 0.85), 3)
    area('mag', (8.0, 4.0, 4.0), (3, 6, 1.0), 1500, (1.0, 0.1, 0.55), 3)
    area('warm', (-2.0, 2.0, 2.8), (-2.0, 8, 1.0), 400, (1.0, 0.6, 0.25), 4)
    area('lamp', (4.2, -0.4, 6.2), (4.2, -0.4, 0.0), 1200, (1.0, 0.7, 0.4), 0.6)
    point('lamp_pt', (4.2, -0.5, 5.9), 900, (1.0, 0.7, 0.4))
    point('rim_teal', (14, -6, 3), 3000, (0.05, 0.9, 0.85), 1.0)
    return b, a, l, v


def shoot(name, loc, target, lens=35, dof=None):
    cam = bpy.data.cameras.new('c'); cam.lens = lens
    co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = co
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co)
    print('RENDERED', name)


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


shots = sys.argv[sys.argv.index('--') + 2:] or ['corner', 'ac', 'vend', 'light', 'building', 'lods']
street_scene()
if 'corner' in shots:
    shoot('shot_corner', (7.0, -3.0, 1.6), (-1.8, 6.0, 2.8), 22)
if 'ac' in shots:
    shoot('shot_ac_unit', (-9.7, 4.0, 1.8), (-10.5, 7.1, 1.7), 40)
if 'vend' in shots:
    shoot('shot_vending_machine', (-0.2, 1.3, 1.5), (-2.2, 5.6, 1.0), 38)
if 'light' in shots:
    shoot('shot_street_light', (11.0, -8.0, 1.0), (4.2, 0.0, 3.9), 28)
if 'building' in shots:
    shoot('shot_building_baked', (30, -22, 1.8), (0, 12, 26), 26)
if 'lods' in shots:
    clear(); world(0)
    box('floor', (0, 2, -0.2), (30, 24, 0.4), sheet_mat('f', 'asphalt', (0.35, 0.35), puddles=True))
    for r, (n, s_) in enumerate([('ac_unit', 1.0), ('vending_machine', 1.0), ('street_light', 0.3)]):
        for c in range(3):
            imp(n, (-3.2 + c * 3.2, r * 2.8 - 2.0, 0.0), 20, s_, lods=(c,))
    area('teal', (-6, -8, 5), (0, 0, 1), 2500, (0.05, 0.9, 0.85), 4)
    area('mag', (6, -8, 5), (0, 0, 1), 2500, (1.0, 0.1, 0.55), 4)
    area('top', (0, -4, 9), (0, 0, 1), 1200, (0.8, 0.85, 1.0), 6)
    shoot('shot_lods', (0, -13, 6.0), (0, 0.5, 1.2), 40)
