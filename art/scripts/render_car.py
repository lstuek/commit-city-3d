"""Re-import art/exports/car.glb and render fixed-camera night shots.
blender.exe --background --factory-startup --python art/scripts/render_car.py"""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_lib as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), 'archive', '2026-10-29-hero-assets')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'exports', 'car.glb'))
R.night_scene((960, 600))
cam = R.camera((3.6, 7.0, 1.5), (0, 0.2, 0.55), 45)  # rear three-quarter, like the reference
R.shot(os.path.join(OUT, 'car_rear34.png'))
R.aim(cam, (7.0, 0.0, 1.0), (0, 0, 0.5))
R.shot(os.path.join(OUT, 'car_side.png'))
R.aim(cam, (-3.8, -6.5, 1.3), (0, 0, 0.5))
R.shot(os.path.join(OUT, 'car_front34.png'))
