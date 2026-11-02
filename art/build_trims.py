"""Builds the 4 shared trim sheets and the emissive window atlas (1024x1024 each).
Run: blender.exe --background --factory-startup --python art/build_trims.py
Deterministic: fixed seeds, no time or machine input. Sources: ambientCG CC0 1K maps in art/src_textures.
Trim sheet layout (v from bottom, 1024 px): plain 0-256, bevel 256-384, groove 384-512, rivet 512-640,
slats 640-768, stripe 768-896, ribs 896-1024 (ribs = paving tiles on the asphalt sheet)."""
import bpy, numpy as np, os
ART = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ART, 'src_textures')
OUT = os.path.join(ART, 'textures')
os.makedirs(OUT, exist_ok=True)
N = 1024
BANDS = [('plain', 0, 256), ('bevel', 256, 128), ('groove', 384, 128), ('rivet', 512, 128),
         ('slats', 640, 128), ('stripe', 768, 128), ('ribs', 896, 128)]


def load(path):
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = 'Non-Color'
    a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(im.size[1], im.size[0], 4)[..., :3]
    # ambientCG maps tile seamlessly; some 1K maps are 1024x512, so tile up to N x N
    a = np.tile(a, (-(-N // a.shape[0]), -(-N // a.shape[1]), 1))[:N, :N]
    return a.copy()


def save(arr, name, ext='png'):
    h, w = arr.shape[:2]
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((h, w, 1), np.float32)], 2).astype(np.float32)
    im = bpy.data.images.new(name, w, h, alpha=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = os.path.join(OUT, name + '.' + ext)
    im.file_format = 'PNG' if ext == 'png' else 'JPEG'
    im.save()


def blur(a, r):
    for _ in range(r):
        a = (a + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 3
        p = np.pad(a, ((1, 1),) + ((0, 0),) * (a.ndim - 1), mode='edge')
        a = (p[:-2] + p[1:-1] + p[2:]) / 3
    return a


def noise(rng, n=N, cells=8, octaves=4):
    out = np.zeros((n, n), np.float32)
    amp = 1.0
    tot = 0
    for o in range(octaves):
        c = cells * 2 ** o
        g = rng.random((c, c)).astype(np.float32)
        idx = np.arange(n) * c / n
        i0 = idx.astype(int)
        f = idx - i0
        f = f * f * (3 - 2 * f)
        i1 = (i0 + 1) % c
        r0 = g[i0][:, i0] * (1 - f)[None] + g[i0][:, i1] * f[None]
        r1 = g[i1][:, i0] * (1 - f)[None] + g[i1][:, i1] * f[None]
        out += amp * (r0 * (1 - f)[:, None] + r1 * f[:, None])
        tot += amp
        amp *= 0.5
    return out / tot


def band_height(kind, hh):
    """height in pixels of relief, shape (hh, N)"""
    y = (np.arange(hh)[:, None] + 0.5) / hh
    x = np.arange(N)[None, :] + 0.5
    ones = np.ones((1, N))
    if kind == 'plain':
        return np.zeros((hh, N), np.float32)
    if kind == 'bevel':  # raised plate with rounded edges on both long sides
        t = np.clip(np.minimum(y, 1 - y) / 0.22, 0, 1)
        return (14 * np.sin(t * np.pi / 2) ** 0.8 * ones).astype(np.float32)
    if kind == 'groove':
        g = lambda c, w: np.clip(1 - np.abs(y - c) / w, 0, 1)
        return (-9 * (np.sin(g(0.3, 0.11) * np.pi / 2) + np.sin(g(0.7, 0.11) * np.pi / 2)) * ones).astype(np.float32)
    if kind == 'rivet':
        d = np.sqrt(((x % 64) - 32) ** 2 + ((y * hh) - hh / 2) ** 2)
        return (4 + 9 * np.sqrt(np.clip(1 - (d / 15) ** 2, 0, 1))).astype(np.float32)
    if kind == 'slats':
        k = (y * 6) % 1.0
        return ((np.where(k < 0.7, k / 0.7 * 10, (1 - k) / 0.3 * 10) - 5) * ones).astype(np.float32)
    if kind == 'stripe':
        lip = np.clip(np.minimum(y, 1 - y) / 0.08, 0, 1)
        return (6 * lip * ones).astype(np.float32)
    if kind == 'ribs':
        return (7 * (0.5 + 0.5 * np.cos(x / 32 * 2 * np.pi)) * np.ones((hh, 1))).astype(np.float32)
    if kind == 'tiles':  # paving grid, 128 px tiles, grout grooves
        gx = np.abs(((x % 128) - 64) / 64)
        gy = np.abs((((y * hh) % 128) - 64) / 64)
        return (-8 * np.clip((np.maximum(gx, gy) - 0.9) / 0.1, 0, 1)).astype(np.float32)
    raise ValueError(kind)


def height_to_normal(H, strength=1.0):
    gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / 2
    p = np.pad(H, 1, mode='edge')
    gy = (p[2:, 1:-1] - p[:-2, 1:-1]) / 2
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(H) * 4], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


SHEETS = {
    'concrete': dict(src='Concrete034', tint=(0.62, 0.64, 0.70), gain=0.62, accent=(0.85, 0.85, 0.80), metal=0.0, rmul=1.0, seed=11),
    'paint': dict(src='PaintedMetal004', tint=None, gain=1.0, accent=(0.95, 0.42, 0.06), metal=None, rmul=1.0, seed=12),
    'grime': dict(src='Metal029', tint=(0.50, 0.46, 0.44), gain=2.6, accent=(0.55, 0.12, 0.30), metal=None, rmul=1.0, seed=13),
    'asphalt': dict(src='Asphalt031', tint=(0.55, 0.58, 0.66), gain=0.55, accent=(0.92, 0.80, 0.25), metal=0.0, rmul=0.5, seed=14),
}


def build_sheet(name, p):
    rng = np.random.default_rng(p['seed'])
    d = os.path.join(SRC, p['src'])
    s = p['src'] + '_1K-JPG_'
    col = load(os.path.join(d, s + 'Color.jpg'))
    rough = load(os.path.join(d, s + 'Roughness.jpg'))[..., 0]
    nsrc = load(os.path.join(d, s + 'NormalGL.jpg'))
    mp = os.path.join(d, s + 'Metalness.jpg')
    metal = load(mp)[..., 0] if os.path.exists(mp) else np.full((N, N), p['metal'] or 0.0, np.float32)
    lum = col @ np.array([0.3, 0.55, 0.15], np.float32)
    if name == 'paint':  # red scratched paint -> dark teal paint, bare steel where scratched
        bare = np.clip((lum - 0.45) * 3, 0, 1)[..., None]
        col = (1 - bare) * np.array([0.07, 0.20, 0.24]) * (0.7 + 0.6 * lum[..., None]) + bare * 0.55
        metal = np.maximum(metal * 0.3, bare[..., 0])
    else:
        col = lum[..., None] * np.array(p['tint'], np.float32) * p['gain'] * 1.6
    if name == 'grime':
        n1 = noise(rng)
        streak = np.repeat(noise(rng, cells=3, octaves=3)[::16], 16, 0)
        col = col * (0.55 + 0.9 * n1[..., None]) * (0.7 + 0.5 * streak[..., None])
        rough = np.clip(rough * 0.8 + 0.35 * n1, 0, 1)
        metal = np.clip(metal * (0.4 + 0.6 * n1), 0, 1)
    col = col.astype(np.float32)
    H = np.zeros((N, N), np.float32)
    acc = np.zeros((N, N), np.float32)
    for kind, r0, hh in BANDS:
        k = 'tiles' if (name == 'asphalt' and kind == 'ribs') else kind
        H[r0:r0 + hh] = band_height(k, hh)
        if kind == 'stripe':
            acc[r0:r0 + hh] = 1
            if name == 'asphalt':
                acc[r0:r0 + hh] *= (((np.arange(N)[None, :] // 128) % 2) == 0)  # dashed line
    if name == 'concrete':   # panel seams every 64 px in the plain band
        yy_, xx_ = np.mgrid[0:256, 0:N]
        seam = np.clip(1 - np.minimum(np.abs(((xx_ + 2) % 64) - 2), np.abs(((yy_ + 2) % 64) - 2)) / 3.0, 0, 1)
        H[0:256] -= 12 * blur(seam.astype(np.float32), 1)
    cav = np.clip(0.5 + 0.5 * (blur(H, 3) - H) / 8, 0, 1)
    nn = height_to_normal(H, 1.0) * 2 - 1
    nd = nsrc * 2 - 1
    nn[..., :2] += nd[..., :2] * 0.6
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
    nrm = nn * 0.5 + 0.5
    a = np.array(p['accent'], np.float32)
    col = col * (0.6 + 0.4 * cav[..., None])
    col = np.where(acc[..., None] > 0, a * (0.75 + 0.25 * lum[..., None] * 1.5), col)
    if name == 'asphalt':
        col = col * np.where((H < -2)[..., None], 0.4, 1.0)
    ao = np.clip(cav ** 1.3, 0, 1)
    r = np.clip(rough * p['rmul'] + acc * 0.15, 0.02, 1)
    if name == 'asphalt':
        r = np.clip(r * (0.8 + 0.4 * (H < -2)), 0.03, 1)
    orm = np.stack([ao, r, metal], -1)
    save(col, 'trim_%s_basecolor' % name, 'jpg')
    save(nrm.astype(np.float32), 'trim_%s_normal' % name, 'jpg')
    save(orm, 'trim_%s_orm' % name, 'jpg')


def build_window_atlas():
    rng = np.random.default_rng(21)
    C = 128
    base = np.zeros((N, N, 3), np.float32)
    emis = np.zeros((N, N, 3), np.float32)
    H = np.zeros((N, N), np.float32)
    orm = np.zeros((N, N, 3), np.float32)
    orm[..., 0] = 1
    teal, mag, warm, white = (0.05, 0.85, 0.8), (0.95, 0.12, 0.6), (1.0, 0.55, 0.15), (0.75, 0.85, 1.0)
    rowcol = [None, teal, mag, warm, white, warm, None, teal]
    yy, xx = np.mgrid[0:C, 0:C].astype(np.float32)
    frame = (xx < 7) | (xx > C - 8) | (yy < 7) | (yy > C - 8) | (np.abs(xx - C / 2) < 3) | (np.abs(yy - C * 0.35) < 3)
    for r in range(8):  # r counts from the top of the image
        for c in range(8):
            y0 = N - (r + 1) * C
            x0 = c * C
            v = 0.55 + 0.45 * rng.random()
            g = np.zeros((C, C, 3), np.float32)
            e = np.zeros((C, C, 3), np.float32)
            g[:] = np.array((0.02, 0.035, 0.05)) + 0.04 * np.array([0.3, 0.8, 1.0]) * (yy / C)[..., None]
            col = rowcol[r]
            if r in (1, 2, 3, 4):
                e[:] = np.array(col) * v * ((0.5 + 0.5 * (yy / C)) ** 0.5)[..., None]
            if r == 5:
                e[:] = np.array(col) * v * (((yy.astype(int) // 9) % 2 == 0) & (yy < C * (0.35 + 0.1 * c)))[..., None]
            if r == 6:  # screen: colour bars
                bars = np.floor(xx / (C / (3 + c % 4))).astype(int) % 2
                e[:] = np.where(bars[..., None] == 0, np.array(teal), np.array(mag)) * 0.9 * (0.6 + 0.4 * np.sin(yy / 5))[..., None]
            if r == 7:  # shop interior card: sign band, back wall with ceiling-light falloff, shelves with items, counter
                pal = [teal, warm, mag, white][c % 4]
                band = (yy > C * 0.80) & (yy < C - 9) & ~frame
                e[band] = np.array(mag if c % 2 else teal) * (0.8 + 0.2 * ((xx[band] // 6) % 2))[:, None]
                inside = (yy > 8) & (yy <= C * 0.80) & ~frame
                fall = np.exp(-((xx - C / 2) / (0.55 * C)) ** 2) * np.exp(-((yy - C * 0.78) / (0.7 * C)) ** 2)
                e[inside] = np.array(pal)[None, :] * (0.06 + 0.55 * fall[inside][:, None])
                for k in range(3):
                    ys = int(C * 0.22 + k * C * 0.17)
                    sh = inside & (np.abs(yy - ys) < 2) & (xx > 12) & (xx < C - 12)
                    e[sh] = np.array(pal) * 0.95
                    e[inside & (yy < ys - 2) & (yy > ys - 7) & (xx > 12) & (xx < C - 12)] *= 0.35
                    for n in range(5):
                        x1 = 14 + n * 20 + int(rng.integers(0, 4))
                        hgt = int(rng.integers(6, 15))
                        ic = [teal, mag, warm, white][int(rng.integers(0, 4))]
                        reg = inside[ys + 2:ys + 2 + hgt, x1:x1 + 12]
                        sub = e[ys + 2:ys + 2 + hgt, x1:x1 + 12]
                        sub[reg] = np.array(ic) * 0.7
                e[inside & (yy < C * 0.13)] *= 0.25
                e[inside & (np.abs(yy - C * 0.13) < 2)] = np.array(pal) * 0.8
            if r == 0 and c < 3:
                e[:] = np.array(teal) * 0.04
            g = np.where(frame[..., None], np.array([0.05, 0.06, 0.07], np.float32), g)
            e = np.where(frame[..., None], 0, e)
            base[y0:y0 + C, x0:x0 + C] = g
            emis[y0:y0 + C, x0:x0 + C] = e
            H[y0:y0 + C, x0:x0 + C] = frame * 6.0
            orm[y0:y0 + C, x0:x0 + C, 1] = np.where(frame, 0.55, 0.12)
            orm[y0:y0 + C, x0:x0 + C, 2] = np.where(frame, 0.7, 0.0)
    H = blur(H, 1)
    save(base, 'window_atlas_basecolor')
    save(emis, 'window_atlas_emissive')
    save(orm, 'window_atlas_orm')
    save(height_to_normal(H, 1.0).astype(np.float32), 'window_atlas_normal')


for n, p in SHEETS.items():
    build_sheet(n, p)
build_window_atlas()
print('trims done')
