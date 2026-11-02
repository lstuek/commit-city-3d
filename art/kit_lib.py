"""Shared helpers for the street art kit scripts (run inside Blender, headless).
Props are built twice from one build function: hi=True (real bevels and surface detail) and hi=False
(game mesh). UV_Trim (UV0) maps faces onto the shared trim sheets; UV_Bake (UV1) is a unique unwrap that
holds the normal map baked from the high-poly and the baked AO."""
import bpy, bmesh, os, math, sys, random
from mathutils import Vector, Matrix, Euler

ART = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ART, 'textures')
EXP = os.path.join(ART, 'exports')
BAND = {'plain': (0, 256), 'bevel': (256, 128), 'groove': (384, 128), 'rivet': (512, 128),
        'slats': (640, 128), 'stripe': (768, 128), 'ribs': (896, 128)}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(EXP, exist_ok=True)


def setup_cycles(samples=16, bake=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.seed = 7
    sc.cycles.use_animated_seed = False
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.use_denoising = not bake
    prefs = bpy.context.preferences.addons['cycles'].preferences
    dev = 'CPU'
    for t in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type != 'CPU']
            if gpus:
                for d in prefs.devices:
                    d.use = d.type != 'CPU'
                dev = 'GPU'
                break
        except Exception:
            pass
    sc.cycles.device = dev
    print('CYCLES DEVICE', dev, getattr(prefs, 'compute_device_type', ''))


class PB:
    """Part builder: boxes and cylinders into one bmesh, trim UVs per face."""
    def __init__(self, hi, bevel_hi=4):
        self.hi = hi
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UV_Trim')
        self.mats = []
        self.seg = bevel_hi if hi else 1
        self.smooth = set()

    def mat_index(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _finish(self, verts, mat, band, rot, loc, bevel, cyl=False, cell=None):
        bm = self.bm
        R = Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ R, verts=verts)
        faces = list(dict.fromkeys(f for v in verts for f in v.link_faces))   # ordered, not a set: set order follows memory addresses
        if cyl:
            self.smooth.update(faces)
        mi = self.mat_index(mat)
        # trim UVs: long face edge -> u (tiles along the strip), short edge -> v (spans the band)
        v0, hpx = BAND.get(band, (0, 256))
        hb = hpx / 1024.0
        for f in faces:
            f.material_index = mi
            n = (R.to_3x3().inverted() @ f.normal)  # normal in part-local frame
            cs = [(R.to_3x3().inverted() @ (l.vert.co - Vector(loc))) for l in f.loops]
            if cell is not None:  # window atlas cell: whole face -> one cell
                (cr, cc) = cell
                xs = [c.x for c in cs]; zs = [c.z if abs(n.z) < .7 else c.y for c in cs]
                for l, c in zip(f.loops, cs):
                    zz = c.z if abs(n.z) < .7 else c.y
                    xx = (c.x if abs(n.y) >= abs(n.x) or abs(n.z) >= .7 else c.y)
                    fu = (xx - min([k.x if abs(n.y) >= abs(n.x) or abs(n.z) >= .7 else k.y for k in cs])) / max(1e-6, (max([k.x if abs(n.y) >= abs(n.x) or abs(n.z) >= .7 else k.y for k in cs]) - min([k.x if abs(n.y) >= abs(n.x) or abs(n.z) >= .7 else k.y for k in cs])))
                    fv = (zz - min(zs)) / max(1e-6, (max(zs) - min(zs)))
                    l[self.uv].uv = ((cc + 0.04 + 0.92 * fu) / 8, 1 - (cr + 1) / 8 + 0.04 / 8 + 0.92 * fv / 8)
                continue
            if abs(n.z) > 0.7:
                A = [(c.x, c.y) for c in cs]
            elif cyl:
                ang0 = math.atan2(sum(c.y for c in cs), sum(c.x for c in cs))
                r = max(math.hypot(c.x, c.y) for c in cs)
                A = []
                for c in cs:
                    d = math.atan2(c.y, c.x) - ang0
                    d = (d + math.pi) % (2 * math.pi) - math.pi
                    A.append((d * r, c.z))
            elif abs(n.x) > abs(n.y):
                A = [(c.y, c.z) for c in cs]
            else:
                A = [(c.x, c.z) for c in cs]
            ua = [a[0] for a in A]; va = [a[1] for a in A]
            ea = max(ua) - min(ua); eb = max(va) - min(va)
            swap = eb > ea
            for l, a in zip(f.loops, A):
                p, q = (a[1], a[0]) if swap else (a[0], a[1])
                pe, qe = (eb, ea) if swap else (ea, eb)
                pm = min(va) if swap else min(ua); qm = min(ua) if swap else min(va)
                vv = (q - qm) / max(qe, 1e-6)
                uu = (p - pm) / max(qe, 1e-6) * hb
                l[self.uv].uv = (uu % 1.0 if False else uu, v0 / 1024.0 + 0.0 + vv * hb * 0.98 + 0.01 * hb)
        if bevel > 0:
            edges = list(dict.fromkeys(e for v in verts for e in v.link_edges))
            sel = [e for e in edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.5]
            if sel:
                bmesh.ops.bevel(bm, geom=sel, offset=bevel, segments=self.seg, profile=0.5, affect='EDGES', clamp_overlap=True)

    def box(self, loc, size, mat, band='plain', rot=(0, 0, 0), bevel=0.012, cell=None, skip_back=False):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = r['verts']
        bmesh.ops.scale(self.bm, vec=Vector(size), verts=verts, space=Matrix.Identity(4))
        self._finish(verts, mat, band, rot, Vector(loc), bevel, cell=cell)

    def cyl(self, loc, radius, depth, mat, band='ribs', rot=(0, 0, 0), bevel=0.01, segs=None, r2=None):
        segs = segs or (28 if self.hi else 12)
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radius,
                                  radius2=radius if r2 is None else r2, depth=depth)
        self._finish(r['verts'], mat, band, rot, Vector(loc), bevel, cyl=True)

    def torus(self, loc, R, r, mat, band='ribs', rot=(0, 0, 0), maj=None, mnr=None):
        maj = maj or (40 if self.hi else 12); mnr = mnr or (8 if self.hi else 4)
        bm = self.bm
        vs = [[bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
               for b in [2 * math.pi * j / mnr for j in range(mnr)]] for a in [2 * math.pi * i / maj for i in range(maj)]]
        allv = [v for row in vs for v in row]
        for i in range(maj):
            for j in range(mnr):
                bm.faces.new((vs[i][j], vs[(i + 1) % maj][j], vs[(i + 1) % maj][(j + 1) % mnr], vs[i][(j + 1) % mnr]))
        bmesh.ops.recalc_face_normals(bm, faces=list({f for v in allv for f in v.link_faces}))
        self._finish(allv, mat, band, rot, Vector(loc), 0, cyl=True)

    def tube(self, loc, r_out, r_in, depth, mat, band='ribs', rot=(0, 0, 0), segs=None):
        n = segs or (32 if self.hi else 16)
        bm = self.bm
        ring = lambda r, z: [bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
        oa, ob, ia, ib = ring(r_out, depth / 2), ring(r_out, -depth / 2), ring(r_in, depth / 2), ring(r_in, -depth / 2)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ob[i], ob[j], oa[j], oa[i]))
            bm.faces.new((ia[i], ia[j], ib[j], ib[i]))
            bm.faces.new((oa[i], oa[j], ia[j], ia[i]))
            bm.faces.new((ib[i], ib[j], ob[j], ob[i]))
        allv = oa + ob + ia + ib
        bmesh.ops.recalc_face_normals(bm, faces=list({f for v in allv for f in v.link_faces}))
        self._finish(allv, mat, band, rot, Vector(loc), 0, cyl=True)

    def rod(self, p0, p1, r, mat, band='ribs', segs=6):
        a, b = Vector(p0), Vector(p1)
        d = b - a
        eul = d.to_track_quat('Z', 'Y').to_euler()
        self.cyl((a + b) / 2, r, d.length, mat, band, rot=[math.degrees(x) for x in eul], bevel=0, segs=segs)

    def to_object(self, name):
        bm = self.bm
        # sharp edges where the angle is large so flat/smooth shading follows the bevels
        me = bpy.data.meshes.new(name)
        for e in bm.edges:
            e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6)
        for f in bm.faces:
            f.smooth = f in self.smooth
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        for e in me.edges:
            e.use_edge_sharp = not e.use_edge_sharp if False else False
        return obj


def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = obj.evaluated_get(dg).to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    obj.evaluated_get(dg).to_mesh_clear()
    return n


def img(name, path, srgb):
    im = bpy.data.images.get(name) or bpy.data.images.load(path)
    im.name = name
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    return im


def occlusion_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g is None:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def make_material(name, kind, sheet=None, normal=None, ao=None, color=None, strength=4.0, window=False):
    """kind: 'trim' (sheet), 'window' (atlas), 'neon' (solid emissive).
    normal/ao: baked images on UV_Bake."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    L = nt.links

    def tex(imgname, fname, srgb, uvname, loc):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(imgname, os.path.join(TEX, fname), srgb)
        t.location = loc
        t.interpolation = 'Linear'
        u = nt.nodes.new('ShaderNodeUVMap')
        u.uv_map = uvname
        u.location = (loc[0] - 200, loc[1])
        L.new(u.outputs[0], t.inputs[0])
        return t

    if kind == 'neon':
        bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
        bsdf.inputs['Roughness'].default_value = 0.4
        return m
    pre = 'trim_' + sheet if kind == 'trim' else 'window_atlas'
    ext = 'jpg' if kind == 'trim' else 'png'
    bc = tex(pre + '_basecolor', pre + '_basecolor.' + ext, True, 'UV_Trim', (-600, 200))
    orm = tex(pre + '_orm', pre + '_orm.' + ext, False, 'UV_Trim', (-600, -100))
    L.new(bc.outputs[0], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    sep.location = (-300, -100)
    L.new(orm.outputs[0], sep.inputs[0])
    L.new(sep.outputs[1], bsdf.inputs['Roughness'])
    L.new(sep.outputs[2], bsdf.inputs['Metallic'])
    if kind == 'window':
        em = tex('window_atlas_emissive', 'window_atlas_emissive.png', True, 'UV_Trim', (-600, -400))
        L.new(em.outputs[0], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = strength
        wn = tex('window_atlas_normal', 'window_atlas_normal.png', False, 'UV_Trim', (-600, -700))
        nm = nt.nodes.new('ShaderNodeNormalMap')
        L.new(wn.outputs[0], nm.inputs['Color'])
        L.new(nm.outputs[0], bsdf.inputs['Normal'])
    if normal is not None:
        nn = nt.nodes.new('ShaderNodeTexImage')
        nn.image = normal
        u = nt.nodes.new('ShaderNodeUVMap')
        u.uv_map = 'UV_Bake'
        L.new(u.outputs[0], nn.inputs[0])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'UV_Bake'
        L.new(nn.outputs[0], nm.inputs['Color'])
        L.new(nm.outputs[0], bsdf.inputs['Normal'])
    elif kind == 'trim':
        wn = tex(pre + '_normal', pre + '_normal.jpg', False, 'UV_Trim', (-600, -400))
        nm = nt.nodes.new('ShaderNodeNormalMap')
        L.new(wn.outputs[0], nm.inputs['Color'])
        L.new(nm.outputs[0], bsdf.inputs['Normal'])
    if ao is not None:
        at = nt.nodes.new('ShaderNodeTexImage')
        at.image = ao
        u = nt.nodes.new('ShaderNodeUVMap')
        u.uv_map = 'UV_Bake'
        L.new(u.outputs[0], at.inputs[0])
        sp = nt.nodes.new('ShaderNodeSeparateColor')
        L.new(at.outputs[0], sp.inputs[0])
        grp = nt.nodes.new('ShaderNodeGroup')
        grp.node_tree = occlusion_group()
        L.new(sp.outputs[0], grp.inputs['Occlusion'])
    return m


def contact_blob(name, loc, size, rot=(0, 0, 0), kind='floor', res=128):
    """Soft dark quad (own small RGBA texture) used as a contact shadow. kind: floor | wall (with grime runnels)."""
    import numpy as np
    rng = np.random.default_rng(3)
    y, x = (np.mgrid[0:res, 0:res].astype(np.float32) + 0.5) / res * 2 - 1
    if kind == 'floor':
        a = np.clip(1 - np.sqrt(np.maximum(x * x + y * y, 0)), 0, 1) ** 0.8 * 0.95
    else:
        box = np.clip(1 - np.maximum(np.abs(x) * 1.15, np.abs(y + 0.15) * 1.25), 0, 1) ** 0.8
        cols = rng.random(res).astype(np.float32)
        for _ in range(2):
            cols = (cols + np.roll(cols, 1) + np.roll(cols, -1)) / 3
        runnel = np.clip((cols - cols.mean()) * 9 + 0.55, 0, 1)[None, :] * np.clip(-(y + 0.1) * 1.4, 0, 1) * (1 - np.abs(x)) ** 0.5
        a = np.clip(box * 0.75 + runnel * 0.45 * (1 - box * 0.3), 0, 0.9)
    im = bpy.data.images.new(name + '_contact', res, res, alpha=True)
    arr = np.zeros((res, res, 4), np.float32)
    arr[..., 3] = a
    im.colorspace_settings.name = 'Non-Color'
    im.alpha_mode = 'STRAIGHT'
    im.pixels.foreach_set(arr.ravel())
    im.filepath_raw = os.path.join(TEX, name + '_contact.png')
    im.file_format = 'PNG'
    im.save()
    m = bpy.data.materials.new(name + '_contact')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1)
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular IOR Level'].default_value = 0.0
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = im
    nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        m.blend_method = 'BLEND'
    m.use_backface_culling = False
    me = bpy.data.meshes.new(name + '_contact')
    sx, sy = size[0] / 2, size[1] / 2
    me.from_pydata([(-sx, -sy, 0), (sx, -sy, 0), (sx, sy, 0), (-sx, sy, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UV_Trim')
    for l, c in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[l.index].uv = c
    me.materials.append(m)
    o = bpy.data.objects.new(name + '_contact', me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = [math.radians(a_) for a_ in rot]
    return o


def new_bake_image(name, res, fl=False):
    im = bpy.data.images.new(name, res, res, alpha=False, float_buffer=fl)
    im.colorspace_settings.name = 'Non-Color'
    return im


def bake(obj, im, btype, selected_to_active=False, margin=8, extrusion=0.04, samples=16):
    """Bake into image im on obj's UV_Bake map. All slots temporarily use one target material."""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    tmp = bpy.data.materials.new('bake_tmp')
    tmp.use_nodes = True
    t = tmp.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = im
    tmp.node_tree.nodes.active = t
    saved = [s.material for s in obj.material_slots]
    for s in obj.material_slots:
        s.material = tmp
    obj.data.uv_layers.active = obj.data.uv_layers['UV_Bake']
    b = sc.render.bake
    b.use_selected_to_active = selected_to_active
    b.margin = margin
    b.margin_type = 'EXTEND'
    b.cage_extrusion = extrusion
    b.use_clear = True
    b.normal_space = 'TANGENT'
    b.use_pass_direct = True
    b.use_pass_indirect = True
    b.use_pass_color = False
    bpy.ops.object.bake(type=btype)
    for s, m in zip(obj.material_slots, saved):
        s.material = m
    obj.data.uv_layers.active = obj.data.uv_layers['UV_Trim']
    bpy.data.materials.remove(tmp)


def save_png(im, name, srgb=False, ext=None):
    """Copy the baked pixels into a fresh image and save that (saving the bake target directly wrote black)."""
    import numpy as np
    a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
    im.pixels.foreach_get(a)
    a[3::4] = 1.0
    c = bpy.data.images.new(name + '_out', im.size[0], im.size[1], alpha=False)
    c.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    c.pixels.foreach_set(a)
    c.filepath_raw = os.path.join(TEX, name)
    c.file_format = 'JPEG' if name.endswith('.jpg') else 'PNG'
    c.save()
    bpy.data.images.remove(c)
    bpy.data.images.remove(im)   # drop the bake buffer so materials load the saved file (the exporter encoded the empty buffer)
    return None


def unwrap_bake(obj, margin=0.02):
    me = obj.data
    me.uv_layers.new(name='UV_Bake')
    me.uv_layers.active = me.uv_layers['UV_Bake']
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects:
        o.select_set(o == obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    me.uv_layers.active = me.uv_layers['UV_Trim']


def make_lods(low, name, ratios=(0.5, 0.2)):
    """LOD0 = low, LOD1/2 = decimated copies. Returns the three objects, all named name_LODn."""
    low.name = name + '_LOD0'
    out = [low]
    dg = bpy.context.evaluated_depsgraph_get()
    for i, r in enumerate(ratios, 1):
        o = low.copy()
        o.data = low.data.copy()
        o.name = '%s_LOD%d' % (name, i)
        bpy.context.scene.collection.objects.link(o)
        md = o.modifiers.new('dec', 'DECIMATE')
        md.ratio = r
        md.use_collapse_triangulate = True
        md.delimit = {'UV'}
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()
        o.data = me
        out.append(o)
    return out


def export_glb(objs, path, extras=False):
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
                              export_image_format='AUTO', export_materials='EXPORT', export_yup=True,
                              export_cameras=False, export_lights=False, export_extras=extras,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_animations=False)


def finish_prop(name, build, res, mat_specs, ao_samples=24, bake_samples=24, extrusion=0.03, blob=None):
    """build(P) fills a PB; mat_specs: {mat_key: dict(kind, sheet|color)}. Returns stats."""
    reset()
    setup_cycles(bake_samples)
    hi = PB(True)
    build(hi)
    lo = PB(False)
    build(lo)
    hi_o = hi.to_object(name + '_high')
    low_o = lo.to_object(name + '_low')
    mats0 = lo.mats
    # temp slots so the low mesh carries its material indices
    for k in mats0:
        low_o.data.materials.append(bpy.data.materials.new('slot_' + k))
    unwrap_bake(low_o)
    nim = new_bake_image(name + '_normal', res)
    bake_hi = hi_o
    for o in bpy.context.view_layer.objects:
        o.select_set(o == bake_hi)
    low_o.select_set(True)
    bpy.context.view_layer.objects.active = low_o
    bake(low_o, nim, 'NORMAL', selected_to_active=True, extrusion=extrusion, samples=bake_samples)
    import numpy as np
    def _stat(i):
        a = np.empty(i.size[0] * i.size[1] * 4, np.float32); i.pixels.foreach_get(a); b = a.reshape(-1, 4); return 'mean %.3f std %.4f nonflat %.3f' % (a.mean(), a.std(), float((np.abs(b[:, :2] - 0.5).max(1) > 0.02).mean()))
    print('BAKE normal', _stat(nim), 'mat idx', sorted({p.material_index for p in low_o.data.polygons}), 'uv', [u.name for u in low_o.data.uv_layers])
    save_png(nim, name + '_normal.png')
    bpy.data.objects.remove(hi_o)   # the high-poly must not shade the AO bake (coincident surfaces gave black patches)
    aim = new_bake_image(name + '_ao', res // 2)   # AO is deliberately a different size from the ORM: same-sized images get merged into one texture by the exporter, which breaks the UV1 AO
    bpy.ops.object.select_all(action='DESELECT')
    low_o.select_set(True)
    bpy.context.view_layer.objects.active = low_o
    bpy.context.scene.world = bpy.data.worlds.new('w')
    bake(low_o, aim, 'AO', samples=ao_samples)
    save_png(aim, name + '_ao.jpg')
    nim = img(name + '_normal', os.path.join(TEX, name + '_normal.png'), False)
    aim = img(name + '_ao', os.path.join(TEX, name + '_ao.jpg'), False)
    for i, k in enumerate(mats0):
        spec = dict(mat_specs[k])
        mat = make_material(name + '_' + k, spec.pop('kind'), normal=nim, ao=aim, **spec)
        low_o.data.materials[i] = mat
    lods = make_lods(low_o, name)
    extra = [contact_blob(name, **blob)] if blob else []
    stats = {o.name: tri_count(o) for o in lods + extra}
    export_glb(lods + extra, os.path.join(EXP, name + '.glb'))
    mat_count = len(low_o.data.materials)
    print('STATS', name, stats, 'materials', mat_count)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART, name + '.blend'), compress=True)
    return stats
