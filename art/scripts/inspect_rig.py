import bpy, sys, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(root,'sources','quaternius-ubc-male','Superhero_Male_FullBody.gltf'))
for o in bpy.data.objects:
    tris = sum(len(p.vertices)-2 for p in o.data.polygons) if o.type=='MESH' else 0
    print('OBJ', o.name, o.type, tuple(round(x,3) for x in o.location), tuple(round(x,3) for x in o.scale), 'tris',tris, 'parent', o.parent.name if o.parent else None, [m.name for m in o.material_slots] if o.type=='MESH' else '')
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
for b in arm.data.bones:
    if b.name in ('root','pelvis','spine_01','spine_02','spine_03','neck_01','Head','clavicle_l','upperarm_l','lowerarm_l','hand_l','thigh_l','calf_l','foot_l','ball_l'):
        print('BONE', b.name, tuple(round(x,3) for x in (arm.matrix_world@b.head_local)), tuple(round(x,3) for x in (arm.matrix_world@b.tail_local)))
print('ARM', arm.name, tuple(arm.rotation_euler), tuple(arm.scale), tuple(arm.location))
print('ACTIONS', [a.name for a in bpy.data.actions])
