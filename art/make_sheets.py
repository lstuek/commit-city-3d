"""Contact sheets: each fixed-camera shot next to its look reference, with the checklist result under it.
Run with system Python (Pillow): python art/make_sheets.py <shots dir>. Reference images are read from the local plan
folder and only written into the gitignored archive folder, never into tracked files."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

D = sys.argv[1]
REFS = r'C:\Users\Lincoln\Downloads\aios\plans\2026-10-27-commit-city\refs'
F = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 15)
FB = ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 17)
# result words: PASS, PARTIAL, WEAK. Agent judgement from the renders, not a taste fact.
ROWS = [
    ('shot_corner', ['street-rain-subway-cables.png', 'street-wet-tiles-teal-magenta.png'], 'Street corner (building, street light, vending machine, ground), attempt 2', [
        ('silhouette', 'PARTIAL', 'tower with cornice, ledges, blades and a street pole read; vending machine still small next to the pole'),
        ('surface detail', 'PASS', 'panel seams, bevelled ledges and shop interior cards (shelves, items, light falloff) read at this range'),
        ('shadow contact', 'PARTIAL', 'soft blob quads exist under pole and vending machine but are faint; no building shadow on the sidewalk'),
        ('neon spill', 'PASS', 'teal and magenta spill on podium and sidewalk; lamp and teal sign reflect in the wet road')]),
    ('shot_building_baked', ['street-lowangle-purple-megatower.webp'], 'Baked background building (baked light + AO preview), attempt 2', [
        ('silhouette', 'PARTIAL', 'setback roof stage, tanks, antennas, dish, sign blades read; overall mass is still a regular box'),
        ('surface detail', 'PARTIAL', 'balconies, wall AC units, cable runs and panel seams are visible but small at about 40 m'),
        ('shadow contact', 'UNKNOWN', 'base is out of frame in this shot; the base blob is judged only in the corner shot'),
        ('neon spill', 'PARTIAL', 'baked teal and magenta tint on walls is subtle; most colour still comes from the window cells')]),
    ('shot_ac_unit', ['alley-graffiti-puddles-trash.png'], 'AC unit (pilot prop 1), rebuilt: wall-mounted condenser', [
        ('silhouette', 'PASS', 'cabinet, deep fan shroud, blades, grille, side pipes, wall bracket and wall patch read as a condenser'),
        ('surface detail', 'PASS', 'quarter-disc defect gone; rings, spokes and scratched paint read. Cause: AO bake ran with the coincident high-poly and big faces were smooth-shaded'),
        ('shadow contact', 'WEAK', 'wall shadow quad and grime runnels are barely visible in this shot'),
        ('neon spill', 'PARTIAL', 'teal tint on the wall and metal; the LED glow is too small to spill')]),
    ('shot_vending_machine', ['alley-graffiti-puddles-trash.png'], 'Vending machine (pilot prop 2)', [
        ('silhouette', 'PASS', 'cabinet, header sign, plinth and flap read as a vending machine'),
        ('surface detail', 'PARTIAL', 'worn paint, keypad and sign read; side louvres and bolts are not in view'),
        ('shadow contact', 'PARTIAL', 'blob quad grounds it a little, but its edge shows as a pale rectangle on the sidewalk'),
        ('neon spill', 'PASS', 'magenta header and teal shop light spill on the sidewalk and side')]),
    ('shot_street_light', ['street-rain-subway-cables.png'], 'Street light (pilot prop 3)', [
        ('silhouette', 'PASS', 'pole, arm and lamp head with glare read against the building'),
        ('surface detail', 'PARTIAL', 'collar, clamp bands and hatch present; the thin pole holds little visible detail'),
        ('shadow contact', 'PARTIAL', 'footing blob is faint; pale rectangle edge visible on the sidewalk'),
        ('neon spill', 'PASS', 'warm lamp cone and haze are strong; teal neon blade adds spill')]),
    ('shot_lods', [], 'LOD0, LOD1, LOD2 of each prop (left to right, same lights), attempt 2', [
        ('silhouette', 'PARTIAL', 'LOD1 keeps the silhouette; LOD2 loses grille and shroud depth'),
        ('surface detail', 'PARTIAL', 'LOD1 and LOD2 share the baked normal; the loss shows mostly at LOD2'),
        ('shadow contact', 'UNKNOWN', 'not judged on this shot'),
        ('neon spill', 'PASS', 'same teal and magenta key and fill on all nine')]),
]
COL = {'PASS': (90, 220, 120), 'PARTIAL': (240, 200, 70), 'WEAK': (240, 90, 90), 'UNKNOWN': (160, 160, 160)}


def row(shot, refs, title, checks):
    im = Image.open(os.path.join(D, shot + '.png')).convert('RGB').resize((960, 540))
    W, H = 1560, 540 + 150
    r = Image.new('RGB', (W, H), (14, 14, 20))
    r.paste(im, (0, 0))
    d = ImageDraw.Draw(r)
    d.text((970, 6), 'OURS (left) vs LOOK REFERENCE (right, local only)', font=F, fill=(180, 180, 200))
    y = 34
    for n in refs:
        ref = Image.open(os.path.join(REFS, n)).convert('RGB')
        ref.thumbnail((580, 250))
        r.paste(ref, (970, y))
        y += ref.size[1] + 8
    d.text((8, 548), title, font=FB, fill=(240, 240, 250))
    for i, (k, v, t) in enumerate(checks):
        yy = 574 + i * 28
        d.text((8, yy), k, font=F, fill=(200, 200, 215))
        d.text((150, yy), v, font=FB, fill=COL[v])
        d.text((250, yy), t, font=F, fill=(215, 215, 225))
    return r


rows = [row(*x) for x in ROWS]
for name, sel in (('contact_sheet_street.png', [0, 1]), ('contact_sheet_props.png', [2, 3, 4]), ('contact_sheet_lods.png', [5])):
    h = sum(rows[i].size[1] for i in sel)
    sh = Image.new('RGB', (1560, h))
    y = 0
    for i in sel:
        sh.paste(rows[i], (0, y)); y += rows[i].size[1]
    sh.save(os.path.join(D, name))
    print('wrote', name)
