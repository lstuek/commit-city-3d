"""Procedural groove height -> baked tangent normal map (and roughness map), run inside Blender (Cycles bake, CPU).
Everything is generated from the object coordinates, so the maps are deterministic."""
import bpy


def _height_nodes(nt, scale, width, mask_z=None, vscale=None):
    """groove height in [0,1] (1 = flat, 0 = groove): voronoi edge distance in object space, optional z mask"""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.0
    mr.inputs['From Max'].default_value = width
    nt.links.new(vor.outputs['Distance'], mr.inputs['Value'])
    out = mr.outputs['Result']
    if mask_z:
        z0, z1, z2, z3 = mask_z  # ramp up z0..z1, ramp down z2..z3
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
        up = nt.nodes.new('ShaderNodeMapRange')
        up.inputs['From Min'].default_value, up.inputs['From Max'].default_value = z0, z1
        nt.links.new(sep.outputs['Z'], up.inputs['Value'])
        dn = nt.nodes.new('ShaderNodeMapRange')
        dn.inputs['From Min'].default_value, dn.inputs['From Max'].default_value = z2, z3
        dn.inputs['To Min'].default_value, dn.inputs['To Max'].default_value = 1.0, 0.0
        nt.links.new(sep.outputs['Z'], dn.inputs['Value'])
        m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'
        nt.links.new(up.outputs['Result'], m1.inputs[0]); nt.links.new(dn.outputs['Result'], m1.inputs[1])
        # height = 1 - mask * (1 - groove)
        inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
        nt.links.new(out, inv.inputs[1])
        m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'
        nt.links.new(inv.outputs[0], m2.inputs[0]); nt.links.new(m1.outputs[0], m2.inputs[1])
        fin = nt.nodes.new('ShaderNodeMath'); fin.operation = 'SUBTRACT'; fin.inputs[0].default_value = 1.0
        nt.links.new(m2.outputs[0], fin.inputs[1])
        out = fin.outputs[0]
    return out, vor


def bake_normal(obj, material, name, size, scale, width, strength, dist, base_normal=None, mask_z=None):
    """bake normal (base normal map + engraved grooves) into a new image, then wire the image into the material"""
    nt = material.node_tree
    bsdf = nt.nodes['Principled BSDF']
    before = set(nt.nodes)
    h, vor = _height_nodes(nt, scale, width, mask_z)
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = dist
    nt.links.new(h, bump.inputs['Height'])
    if base_normal is not None:
        nm0 = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(base_normal, nm0.inputs['Color'])
        nt.links.new(nm0.outputs['Normal'], bump.inputs['Normal'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.render.bake.margin = 6
    sc.render.bake.use_selected_to_active = False
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='NORMAL')
    # final material: baked map only, procedural nodes dropped
    for n in list(nt.nodes):
        if n not in before and n != tex:
            nt.nodes.remove(n)
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return img


def bake_roughness(obj, material, name, size, scale, lo, hi, groove_scale=None):
    """roughness map: per-panel (voronoi cell) random value between lo and hi, grooves rougher; wired through Separate Color G"""
    nt = material.node_tree
    bsdf = nt.nodes['Principled BSDF']
    before = set(nt.nodes)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'F1'
    vor.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(vor.outputs['Color'], sep.inputs['Color'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = lo, hi
    nt.links.new(sep.outputs['Red'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], bsdf.inputs['Roughness'])
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='ROUGHNESS')
    for n in list(nt.nodes):
        if n not in before and n != tex:
            nt.nodes.remove(n)
    sp = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tex.outputs['Color'], sp.inputs['Color'])
    nt.links.new(sp.outputs['Green'], bsdf.inputs['Roughness'])
    return img
