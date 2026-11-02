"""Re-import art/exports/cyborg.glb and render fixed-camera night shots plus clip frames.
blender.exe --background --factory-startup --python art/scripts/render_cyborg.py"""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_lib as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), 'archive', '2026-10-29-hero-assets')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'exports', 'cyborg.glb'))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
print('IMPORTED actions', [a.name for a in bpy.data.actions])
R.night_scene((720, 900))
cam = R.camera((0, -4.3, 1.05), (0, 0, 0.92), 50)
sc = bpy.context.scene


def pose(clip, frame):
    ad = arm.animation_data_create()
    act = bpy.data.actions[clip]
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    sc.frame_set(frame)


pose('idle', 0)
R.shot(os.path.join(OUT, 'cyborg_front.png'))
R.aim(cam, (2.6, -3.4, 1.15), (0, 0, 0.92))
R.shot(os.path.join(OUT, 'cyborg_34.png'))
R.aim(cam, (-0.4, 3.8, 1.15), (0, 0, 0.92))
R.shot(os.path.join(OUT, 'cyborg_back.png'))
R.aim(cam, (0.5, -1.7, 1.45), (0, 0, 1.38))
R.shot(os.path.join(OUT, 'cyborg_torso.png'))

# clip frames: 4 stills per clip from the re-imported glTF
sc.render.resolution_x, sc.render.resolution_y = 360, 450
R.aim(cam, (3.4, -3.0, 1.1), (0, 0, 0.9))
for clip in ('idle', 'walk', 'run', 'sprint'):
    act = bpy.data.actions[clip]
    f0, f1 = act.frame_range
    for i in range(4):
        fr = round(f0 + (f1 - f0) * i / 4)
        pose(clip, fr)
        R.shot(os.path.join(OUT, 'clip_%s_%d.png' % (clip, i)))
    print('CLIP FRAMES', clip, (f0, f1))
