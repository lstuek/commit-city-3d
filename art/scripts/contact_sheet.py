"""Contact sheets: look references (local only, read from the aios plan folder, never copied here) next to the renders.
blender.exe --background --factory-startup --python art/scripts/contact_sheet.py -- <refs dir>"""
import bpy, os, sys
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), 'archive', '2026-10-29-hero-assets')
REFS = sys.argv[sys.argv.index('--') + 1]


def load(path, h):
    img = bpy.data.images.load(path)
    w0, h0 = img.size
    w = max(1, round(w0 * h / h0))
    img.scale(w, h)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    a[..., 3] = 1
    bpy.data.images.remove(img)
    return a


def row(paths, h, gap=8):
    ims = [load(p, h) for p in paths]
    sep = np.full((h, gap, 4), 0.02, dtype=np.float32)
    out = []
    for i, a in enumerate(ims):
        out += [a] + ([sep] if i < len(ims) - 1 else [])
    return np.concatenate(out, axis=1)


def stack(rows, gap=8):
    W = max(r.shape[1] for r in rows)
    pad = []
    for r in rows:
        if r.shape[1] < W:
            r = np.concatenate([r, np.full((r.shape[0], W - r.shape[1], 4), 0.02, dtype=np.float32)], axis=1)
        pad += [r, np.full((gap, W, 4), 0.02, dtype=np.float32)]
    return np.concatenate(pad[:-1], axis=0)


def save(arr, name):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h)
    img.pixels = arr.ravel()
    img.filepath_raw = os.path.join(OUT, name)
    img.file_format = 'PNG'
    img.save()
    print('SHEET', name, w, h)


o = lambda n: os.path.join(OUT, n)
r = lambda n: os.path.join(REFS, n)
# sheet 1: cyborg. row 1 = refs (black armor, plates orange) + front; row 2 = 3/4, back, torso close-up
save(stack([
    row([r('character-cyborg-black-armor.png'), r('character-cyborg-plates-orange.png'), o('cyborg_front.png')], 560),
    row([o('cyborg_34.png'), o('cyborg_back.png'), o('cyborg_torso.png')], 560)]), 'sheet_cyborg.png')
# sheet 2: clips, 4 stills each, rows idle / walk / run / sprint
save(stack([row([o('clip_%s_%d.png' % (c, i)) for i in range(4)], 300) for c in ('idle', 'walk', 'run', 'sprint')]), 'sheet_cyborg_clips.png')
# sheet 3: car. reference | rear 3/4 | side | front 3/4
save(stack([row([r('car-wedge-orange-strips.png'), o('car_rear34.png')], 420),
            row([o('car_side.png'), o('car_front34.png')], 420)]), 'sheet_car.png')
