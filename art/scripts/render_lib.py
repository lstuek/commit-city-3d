"""Shared night-scene render helpers for the appearance checks (run inside Blender)."""
import bpy, os, math
import numpy as np
from mathutils import Vector


def night_scene(res=(720, 900), samples=48):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = samples
        sc.eevee.use_raytracing = True
    except Exception as e:
        print('eevee opts', e)
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    w = bpy.data.worlds.new('night')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.006, 0.010, 0.030, 1)
    bg.inputs['Strength'].default_value = 1.0
    sc.world = w
    # wet dark street
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    g = bpy.context.active_object
    m = bpy.data.materials.new('wet')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.012, 0.014, 0.02, 1)
    b.inputs['Roughness'].default_value = 0.28
    b.inputs['Metallic'].default_value = 0.3
    g.data.materials.append(m)
    g.name = 'ground'

    def area(name, loc, color, energy, size=3.0, target=(0, 0, 0.9)):
        d = bpy.data.lights.new(name, 'AREA')
        d.color = color
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc
        v = Vector(target) - Vector(loc)
        o.rotation_euler = v.to_track_quat('-Z', 'Y').to_euler()
        return o
    area('teal', (-3.5, 2.0, 2.2), (0.1, 0.9, 0.95), 300)
    area('magenta', (3.5, 2.0, 2.0), (1.0, 0.1, 0.7), 250)
    area('fill', (0.0, -4.0, 2.5), (0.55, 0.65, 1.0), 120, size=4)
    return sc


def camera(loc, target, lens=50):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    o = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(o)
    aim(o, loc, target)
    bpy.context.scene.camera = o
    return o


def aim(o, loc, target):
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def _blur(a, sigma):
    h, w = a.shape[:2]
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    k = np.exp(-2 * (np.pi * sigma) ** 2 * (kx ** 2 + ky ** 2))
    out = np.empty_like(a)
    for c in range(a.shape[2]):
        out[..., c] = np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * k))
    return out


def bloom(path, strength=0.5, thresh=0.82):
    """glow pass on the saved PNG (compositor glare is not scriptable headless here): bright pixels blurred at 3 scales, added back"""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    lum = rgb.max(axis=2, keepdims=True)
    bright = rgb * np.clip((lum - thresh) / (1 - thresh), 0, 1)
    glow = _blur(bright, 3) * 0.5 + _blur(bright, 9) * 0.8 + _blur(bright, 24) * 1.1
    px[..., :3] = np.clip(rgb + glow * strength, 0, 1)
    img.pixels = px.ravel()
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def shot(path, glow=True):
    sc = bpy.context.scene
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    if glow:
        bloom(path)
