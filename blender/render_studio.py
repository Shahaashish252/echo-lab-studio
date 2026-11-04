# Renders the studio stage that app/scripts/export-blender.ts exported (scene.glb + anim.json) with Blender Cycles on
# the GPU: real light, reflections, glass, soft shadows and lens blur - the photo-real look of the 3D studio videos.
#
#   blender -b -P render_studio.py -- scene.glb anim.json out_dir [first_frame last_frame] [samples] [step]
#
# anim.json comes from the three.js stage (Y up, units = cm treated as metres); the glTF importer turns Y-up into
# Blender's Z-up, and this script applies the same conversion to every keyed transform.
import json
import math
import os
import sys

import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
glb, anim_path, out_dir = argv[:3]
A = json.load(open(anim_path))
first = int(argv[3]) if len(argv) > 3 else 0
last = int(argv[4]) if len(argv) > 4 else A["frames"] - 1
samples = int(argv[5]) if len(argv) > 5 else 64
step = int(argv[6]) if len(argv) > 6 else 1  # >1: a quick preview of every n-th frame
# look experiments (kaggle_render.py "variants"): environment strength, view transform, clear-coat on/off
VAR = json.loads(os.environ.get("VARIANT") or "{}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
scene.render.fps = A["fps"]
scene.frame_start, scene.frame_end = first, last
scene.frame_step = step
objs = {o.name: o for o in bpy.data.objects}

# the three.js key / rim / fill lights are replaced by our own studio lighting below
lamps = set(A["lamps"])
for o in list(bpy.data.objects):
    if o.type == "LIGHT" and o.name not in lamps:
        bpy.data.objects.remove(o, do_unlink=True)


def keys_constant(obj):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"


# ---- moving parts and visibility ----
for name, tr in A["nodes"].items():
    o = objs.get(name)
    if not o:
        continue
    o.rotation_mode = "QUATERNION"
    for k in tr.get("trs", []):
        f, tx, ty, tz, qx, qy, qz, qw, sx, sy, sz = k
        o.location = (tx, -tz, ty)
        o.rotation_quaternion = (qw, qx, -qz, qy)
        o.scale = (sx, sz, sy)
        o.keyframe_insert("location", frame=f)
        o.keyframe_insert("rotation_quaternion", frame=f)
        o.keyframe_insert("scale", frame=f)
    for f, v in tr.get("vis", []):
        o.hide_render = v == 0
        o.hide_viewport = v == 0
        o.keyframe_insert("hide_render", frame=f)
        o.keyframe_insert("hide_viewport", frame=f)
    keys_constant(o)

# ---- no stray glow: the importer leaves every material's emission at white x 1.0 (Blender 4's default colour),
# which turned the whole picture into a white haze. Only the parts that really glow (keyed in anim.json) keep it.
glowing = set(A["mats"])
for m in bpy.data.materials:
    if m.use_nodes and m.name not in glowing and not m.name.startswith("glow"):
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED" and not n.inputs["Emission Color"].is_linked:
                n.inputs["Emission Strength"].default_value = 0.0

# ---- glows: beams, rings and energy are pure light (additive, see-through where dark) ----
def make_additive(m):
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    color = tuple(bsdf.inputs["Emission Color"].default_value) if bsdf else (1, 1, 1, 1)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = color
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Surface"])
    m.blend_method = "BLEND"
    return em.inputs["Strength"]


glow_strength = {}
for m in bpy.data.materials:
    if m.name.startswith("glow") and m.use_nodes:
        glow_strength[m.name] = make_additive(m)

# ---- glow strengths ----
for name, ks in A["mats"].items():
    m = bpy.data.materials.get(name)
    if not m or not m.use_nodes:
        continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    sock = glow_strength.get(name) or (bsdf.inputs.get("Emission Strength") if bsdf else None)
    if sock is None:
        continue
    for f, v in ks:
        sock.default_value = v
        sock.keyframe_insert("default_value", frame=f)
    if m.node_tree.animation_data and m.node_tree.animation_data.action:
        for fc in m.node_tree.animation_data.action.fcurves:
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"

# ---- lamps (LEDs, the street light, the flame) ----
for name, ks in A["lamps"].items():
    o = objs.get(name)
    if not o or o.type != "LIGHT":
        continue
    for f, v in ks:
        o.data.energy = v * 12.0
        o.data.keyframe_insert("energy", frame=f)

# ---- camera: matrix, field of view, focus and blur from the three.js director ----
cam_data = bpy.data.cameras.new("cam")
cam_data.sensor_fit = "VERTICAL"
cam_data.sensor_height = 24.0
cam_data.dof.use_dof = True
cam_data.clip_start, cam_data.clip_end = 0.1, 400
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam.rotation_mode = "QUATERNION"
C = mathutils.Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
for f in range(first, last + 1):
    row = A["camera"][f]
    e = row[:16]
    M = mathutils.Matrix(((e[0], e[4], e[8], e[12]), (e[1], e[5], e[9], e[13]), (e[2], e[6], e[10], e[14]), (e[3], e[7], e[11], e[15])))
    fov, focus, blur = row[16], row[17], row[18]
    cam.matrix_world = C @ M
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_quaternion", frame=f)
    cam_data.lens = 12.0 / math.tan(math.radians(fov) / 2)
    cam_data.keyframe_insert("lens", frame=f)
    cam_data.dof.focus_distance = focus
    # the stage's blur strength -> an aperture of comparable size in this scene's units
    radius = min(0.6, max(0.01, 0.025 * blur))
    cam_data.dof.aperture_fstop = max(0.05, cam_data.lens / 1000.0 / (2 * radius))
    cam_data.dof.keyframe_insert("focus_distance", frame=f)
    cam_data.dof.keyframe_insert("aperture_fstop", frame=f)

# ---- studio lighting: soft HDRI, a warm key sun, a cool rim sun; a dark backdrop for the camera ----
world = bpy.data.worlds.new("studio")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
hdri_dir = bpy.utils.system_resource("DATAFILES", path="studiolights/world")
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(hdri_dir, VAR.get("hdri_file", "interior.exr")))
bg_light = nt.nodes.new("ShaderNodeBackground")
bg_light.inputs["Strength"].default_value = VAR.get("hdri", 0.22)
nt.links.new(env.outputs["Color"], bg_light.inputs["Color"])
bg_cam = nt.nodes.new("ShaderNodeBackground")
bg_cam.inputs["Color"].default_value = (0.012, 0.013, 0.018, 1)
path = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMixShader")
out = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
nt.links.new(bg_light.outputs["Background"], mix.inputs[1])
nt.links.new(bg_cam.outputs["Background"], mix.inputs[2])
nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def sun(name, direction_three, strength, color, angle):
    d = mathutils.Vector((direction_three[0], -direction_three[2], direction_three[1])).normalized()
    s = bpy.data.lights.new(name, "SUN")
    s.energy = strength
    s.color = color
    s.angle = math.radians(angle)
    o = bpy.data.objects.new(name, s)
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(o)


if not VAR.get("nolights"):
    sun("key", (4, 9, 6), 1.1, (1.0, 0.95, 0.9), 6)
    sun("rim", (-6, 4, -7), 0.8, (0.75, 0.85, 1.0), 4)
    sun("fill", (-4, 2, 6), 0.18, (1, 1, 1), 15)

# ---- Cycles on the GPU ----
r = scene.render
r.engine = "CYCLES"
r.resolution_x, r.resolution_y, r.resolution_percentage = A["width"], A["height"], 100
r.use_motion_blur = True
r.motion_blur_shutter = 0.5
r.image_settings.file_format = "PNG"
r.filepath = os.path.join(out_dir, "")
cy = scene.cycles
cy.device = "GPU"
cy.samples = samples
cy.use_adaptive_sampling = True
cy.use_denoising = True
cy.max_bounces = 8
cy.transmission_bounces = 8
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            break
    except TypeError:
        continue
for d in prefs.devices:
    d.use = d.type != "CPU"
# Kaggle's driver can't create the OptiX denoiser ("Failed to create OptiX denoiser"); Intel OIDN works everywhere
cy.denoiser = "OPENIMAGEDENOISE"
scene.view_settings.view_transform = VAR.get("view", "AgX")
if VAR.get("nocoat"):
    for m in bpy.data.materials:
        b = m.node_tree and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b and b.inputs.get("Coat Weight"):
            b.inputs["Coat Weight"].default_value = 0.0
try:
    scene.view_settings.look = "AgX - Punchy"
except TypeError:
    pass
if VAR.get("debug"):
    # what the camera sees at the first frame that glows or is see-through
    scene.frame_set(first)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in scene.objects:
        if o.type != "MESH" or o.hide_render:
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type != "BSDF_PRINCIPLED":
                    continue
                st = n.inputs.get("Emission Strength")
                tw = n.inputs.get("Transmission Weight")
                ec = n.inputs.get("Emission Color")
                lit = ec.is_linked or sum(ec.default_value[:3]) * st.default_value > 0.05
                if lit or tw.default_value > 0.2:
                    print("DBG", o.name, "size", [round(v, 1) for v in o.dimensions], "mat", m.name, "emit", round(st.default_value, 2), "color",
                          [round(c, 2) for c in ec.default_value[:3]], "linked" if ec.is_linked else "", "trans", round(tw.default_value, 2), flush=True)
    for o in scene.objects:
        if o.type == "LIGHT":
            print("DBG light", o.name, o.data.type, "energy", round(o.data.energy, 2), "hidden", o.hide_render, flush=True)
print(f"rendering frames {first}-{last} on {prefs.compute_device_type}: {[d.name for d in prefs.devices if d.use]}", flush=True)
bpy.ops.render.render(animation=True)
