"""Builds one street prop: blender.exe --background --factory-startup --python art/build_props.py -- ac_unit|street_light|vending_machine
Front of every prop faces Blender -Y (glTF +Z). Units are metres, origin at the base centre.
hi=True adds real surface detail (louvres, rings, bolts, buttons) that is baked into the normal map of the low mesh."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_lib as K

NEON_TEAL = (0.05, 0.95, 0.85)
NEON_MAG = (1.0, 0.1, 0.55)
WARM = (1.0, 0.62, 0.28)


def bolts(P, pts, mat, axis_rot, r=0.014, d=0.012):
    if P.hi:
        for p in pts:
            P.cyl(p, r, d, mat, band='rivet', rot=axis_rot, bevel=0.003, segs=12)


def ac_unit(P):
    # wall-mounted condenser: wall patch behind (y=+0.215), fan shroud with blades and grille at the front (-Y)
    seg = 12 if P.hi else 6
    P.box((0, 0.215, 0.55), (1.5, 0.05, 1.3), 'concrete', 'plain', bevel=0.01)             # wall patch
    P.box((0, 0, 0.55), (0.90, 0.38, 0.62), 'paint', 'bevel', bevel=0.02)                  # cabinet
    P.box((0, 0, 0.885), (0.95, 0.42, 0.04), 'paint', 'stripe', bevel=0.012)               # lid
    P.box((0, -0.192, 0.55), (0.80, 0.012, 0.56), 'grime', 'plain', bevel=0.004)           # dark interior plate
    P.tube((0, -0.26, 0.55), 0.29, 0.255, 0.14, 'paint', 'bevel', rot=(90, 0, 0))          # deep shroud
    P.torus((0, -0.33, 0.55), 0.272, 0.022, 'paint', 'bevel', rot=(90, 0, 0))              # rim
    for i in range(5):                                                                     # fan blades
        a = i * 72
        P.box((0.10 * math.sin(math.radians(a)), -0.235, 0.55 + 0.10 * math.cos(math.radians(a))), (0.075, 0.012, 0.17), 'grime', 'plain', rot=(0, a, 0), bevel=0.002)
    P.cyl((0, -0.25, 0.55), 0.05, 0.06, 'paint', 'bevel', rot=(90, 0, 0), bevel=0.006)    # hub
    for R in (0.10, 0.17, 0.235):                                                          # grille rings
        P.torus((0, -0.31, 0.55), R, 0.006, 'grime', rot=(90, 0, 0))
    for i in range(6):                                                                     # grille spokes
        P.box((0, -0.31, 0.55), (0.012, 0.012, 0.50), 'grime', 'ribs', rot=(0, i * 30, 0), bevel=0.002)
    # right side louvres (real slats in the high-poly, baked)
    P.box((0.455, 0, 0.5), (0.02, 0.30, 0.40), 'grime', 'slats', bevel=0.006)
    if P.hi:
        for i in range(11):
            P.box((0.468, 0, 0.33 + i * 0.034), (0.012, 0.28, 0.018), 'grime', 'slats', rot=(18, 0, 0), bevel=0.002)
    P.box((0.28, -0.195, 0.30), (0.22, 0.014, 0.12), 'paint', 'groove', bevel=0.004)      # control panel
    if P.hi:
        for i in range(3):
            P.cyl((0.22 + i * 0.05, -0.206, 0.29), 0.013, 0.01, 'grime', 'rivet', rot=(90, 0, 0), bevel=0.002, segs=12)
    P.box((0.34, -0.205, 0.33), (0.03, 0.01, 0.018), 'led', 'plain', bevel=0)
    bolts(P, [(x, y, 0.91) for x in (-0.4, 0.4) for y in (-0.17, 0.17)] + [(0, -0.17, 0.91), (0, 0.17, 0.91)], 'grime', (0, 0, 0))
    for x in (-0.3, 0.3):                                                                  # wall bracket
        P.box((x, 0.02, 0.2), (0.06, 0.34, 0.05), 'grime', 'groove', bevel=0.008)
        P.box((x, 0.17, 0.14), (0.05, 0.04, 0.30), 'grime', 'bevel', bevel=0.006)
        P.box((x, 0.09, 0.12), (0.045, 0.045, 0.30), 'grime', 'bevel', rot=(-40, 0, 0), bevel=0.006)
    # pipe run: out of the right side, then into the wall
    P.rod((0.45, 0.04, 0.34), (0.74, 0.04, 0.34), 0.022, 'grime', 'ribs', segs=seg)
    P.rod((0.74, 0.04, 0.34), (0.74, 0.20, 0.34), 0.022, 'grime', 'ribs', segs=seg)
    P.rod((0.45, 0.00, 0.27), (0.66, 0.00, 0.27), 0.032, 'paint', 'ribs', segs=seg)
    P.rod((0.66, 0.00, 0.27), (0.66, 0.20, 0.27), 0.032, 'paint', 'ribs', segs=seg)
    for x in (0.52, 0.60):
        P.cyl((x, 0.0, 0.27), 0.04, 0.03, 'grime', 'groove', rot=(0, 90, 0), bevel=0.004, segs=seg)
    P.rod((0.35, 0.18, 0.86), (0.35, 0.18, 1.18), 0.015, 'grime', 'ribs', segs=seg)       # cable conduit up the wall


def street_light(P):
    # 6.2 m pole on a concrete footing, 1.8 m arm, lamp head with emissive lens
    P.cyl((0, 0, 0.30), 0.30, 0.60, 'concrete', 'plain', bevel=0.02, r2=0.24)
    P.cyl((0, 0, 0.62), 0.27, 0.06, 'grime', 'bevel', bevel=0.012)                  # base plate
    P.cyl((0, 0, 0.95), 0.13, 0.60, 'paint', 'ribs', bevel=0.008, r2=0.095)         # flared collar
    P.cyl((0, 0, 3.6), 0.085, 5.3, 'paint', 'plain', bevel=0.004, r2=0.065)         # pole
    P.box((0, -0.075, 1.5), (0.22, 0.05, 0.50), 'grime', 'groove', bevel=0.01)      # service hatch
    for z in (2.6, 3.4, 4.2):
        P.cyl((0, 0, z), 0.10 - (z - 2.6) * 0.012, 0.05, 'grime', 'bevel', bevel=0.008)   # clamp bands
    if P.hi:
        for a in range(8):
            ar = math.radians(a * 45)
            P.cyl((0.24 * math.cos(ar), 0.24 * math.sin(ar), 0.67), 0.022, 0.03, 'grime', 'rivet', bevel=0.004, segs=12)
        for x in (-0.08, 0.08):
            for z in (1.35, 1.65):
                P.cyl((x, -0.105, z), 0.012, 0.012, 'grime', 'rivet', rot=(90, 0, 0), bevel=0.002, segs=10)
    # arm: rising bar to the street side (-Y), then a head
    P.box((0, -0.55, 6.15), (0.07, 1.30, 0.07), 'paint', 'bevel', rot=(-10, 0, 0), bevel=0.006)
    P.box((0, -0.15, 5.95), (0.05, 0.05, 0.60), 'paint', 'bevel', rot=(40, 0, 0), bevel=0.005)
    P.box((0, -1.22, 6.02), (0.34, 0.80, 0.14), 'paint', 'stripe', rot=(-6, 0, 0), bevel=0.02)   # lamp housing
    P.box((0, -1.22, 5.945), (0.28, 0.70, 0.02), 'led', 'plain', rot=(-6, 0, 0), bevel=0)         # lens
    P.box((0, -1.56, 6.0), (0.30, 0.06, 0.12), 'grime', 'slats', bevel=0.008)
    if P.hi:
        for i in range(6):
            P.box((0, -1.0 - i * 0.065, 6.1), (0.30, 0.02, 0.03), 'grime', 'slats', rot=(-6, 0, 0), bevel=0.003)
    # cable and a small neon blade sign on the pole (teal)
    P.box((0.0, -0.17, 3.3), (0.05, 0.05, 0.9), 'grime', 'bevel', bevel=0.006)
    P.box((0.0, -0.205, 3.3), (0.025, 0.02, 0.78), 'neon_teal', 'plain', bevel=0)


def vending_machine(P):
    P.box((0, 0, 0.06), (0.98, 0.86, 0.10), 'grime', 'bevel', bevel=0.012)           # plinth
    P.box((0, 0, 0.98), (0.92, 0.80, 1.74), 'paint', 'bevel', bevel=0.025)           # cabinet
    # front frame and products window (emissive atlas screen cell)
    P.box((-0.09, -0.41, 1.12), (0.58, 0.02, 1.30), 'grime', 'groove', bevel=0.01)
    P.box((-0.09, -0.425, 1.12), (0.52, 0.012, 1.22), 'window', 'plain', cell=(6, 2), bevel=0)
    # shelves and product rows
    if P.hi:
        for i in range(5):
            P.box((-0.09, -0.438, 0.68 + i * 0.24), (0.52, 0.02, 0.012), 'grime', 'bevel', bevel=0.002)
    # right column: keypad, coin slot, card reader
    P.box((0.30, -0.41, 1.25), (0.20, 0.025, 0.36), 'grime', 'rivet', bevel=0.008)
    if P.hi:
        for r in range(4):
            for c in range(3):
                P.box((0.24 + c * 0.06, -0.428, 1.37 - r * 0.07), (0.04, 0.012, 0.04), 'paint', 'bevel', bevel=0.004)
        P.box((0.30, -0.430, 1.07), (0.10, 0.014, 0.025), 'grime', 'slats', bevel=0.003)
    else:
        P.box((0.30, -0.425, 1.07), (0.10, 0.014, 0.025), 'grime', 'slats', bevel=0)
    P.box((0.30, -0.425, 1.52), (0.16, 0.010, 0.06), 'neon_mag', 'plain', bevel=0)     # price display
    # dispense flap
    P.box((-0.04, -0.41, 0.30), (0.62, 0.03, 0.22), 'grime', 'groove', bevel=0.012)
    P.box((-0.04, -0.428, 0.30), (0.52, 0.01, 0.13), 'paint', 'slats', bevel=0.004)
    # top sign band and header
    P.box((0, -0.43, 1.92), (0.88, 0.06, 0.18), 'paint', 'stripe', bevel=0.012)
    P.box((0, -0.466, 1.92), (0.78, 0.01, 0.10), 'neon_mag', 'plain', bevel=0)
    P.box((0, 0.0, 1.88), (0.97, 0.85, 0.05), 'paint', 'bevel', bevel=0.015)
    # side vents (hi: louvre slats)
    P.box((0.465, 0.0, 0.5), (0.02, 0.5, 0.5), 'grime', 'slats', bevel=0.006)
    if P.hi:
        for i in range(12):
            P.box((0.477, 0.0, 0.28 + i * 0.037), (0.012, 0.46, 0.018), 'grime', 'slats', rot=(-15, 0, 0), bevel=0.002)
        for z in (0.3, 1.0, 1.7):
            P.cyl((0.47, 0.34, z), 0.014, 0.01, 'grime', 'rivet', rot=(0, 90, 0), bevel=0.002, segs=10)
    # foot pads
    for x in (-0.4, 0.4):
        for y in (-0.33, 0.33):
            P.box((x, y, 0.005), (0.10, 0.10, 0.02), 'grime', 'plain', bevel=0.004)


PROPS = {
    'ac_unit': (ac_unit, 1024, {'concrete': dict(kind='trim', sheet='concrete'), 'paint': dict(kind='trim', sheet='paint'), 'grime': dict(kind='trim', sheet='grime'),
                              'led': dict(kind='neon', color=NEON_TEAL, strength=8.0)}, dict(loc=(0, 0.185, 0.40), size=(2.0, 1.8), rot=(90, 0, 0), kind='wall')),
    'street_light': (street_light, 1024, {'concrete': dict(kind='trim', sheet='concrete'), 'grime': dict(kind='trim', sheet='grime'),
                                         'paint': dict(kind='trim', sheet='paint'),
                                         'led': dict(kind='neon', color=WARM, strength=10.0),
                                         'neon_teal': dict(kind='neon', color=NEON_TEAL, strength=8.0)}, dict(loc=(0, 0, 0.004), size=(1.6, 1.6))),
    'vending_machine': (vending_machine, 1024, {'paint': dict(kind='trim', sheet='paint'), 'grime': dict(kind='trim', sheet='grime'),
                                               'window': dict(kind='window', strength=2.5),
                                               'neon_mag': dict(kind='neon', color=NEON_MAG, strength=8.0)}, dict(loc=(0, 0.02, 0.004), size=(1.9, 1.7))),
}

if __name__ == '__main__':
    name = sys.argv[sys.argv.index('--') + 1]
    fn, res, specs, blob = PROPS[name]
    K.finish_prop(name, fn, res, specs, blob=blob)
