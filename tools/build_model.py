"""Build the original Grok chibi into a Cubism-compatible MOC3 package."""

import argparse
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


PROJECT = Path(__file__).resolve().parents[1]
NAME = "GrokChibi"
PAD = 28
SOURCE_WIDTH = 1122
SOURCE_HEIGHT = 1402
ATLAS_SIZE = 2048
PPU = 1000

TAIL = [(0, 0), (355, 0), (350, 92), (320, 139), (299, 184), (287, 240),
        (271, 302), (258, 367), (241, 426), (256, 490), (278, 547),
        (263, 592), (216, 617), (193, 653), (205, 698), (193, 752),
        (164, 804), (0, 804)]
HEAD = [(196, 0), (944, 0), (913, 478), (818, 563), (783, 609),
        (753, 638), (709, 652), (674, 627), (643, 609), (611, 590),
        (513, 590), (482, 610), (445, 629), (413, 652), (373, 643),
        (338, 618), (303, 576), (217, 480)]
WING = [(175, 567), (317, 573), (347, 619), (421, 665), (405, 704),
        (376, 735), (259, 803), (172, 765)]
ARM = [(334, 795), (378, 793), (404, 799), (435, 822), (424, 862),
       (413, 904), (394, 930), (353, 944), (345, 975), (316, 1013),
       (289, 1027), (218, 1014), (211, 971), (258, 925), (255, 889),
       (285, 855), (293, 829)]
EYES = [
    ("L", (439, 440), [(329, 421), (350, 399), (341, 380), (370, 384),
        (381, 361), (405, 378), (431, 378), (466, 387), (495, 403),
        (514, 420), (524, 442), (512, 463), (505, 476), (492, 490),
        (452, 493), (418, 498), (395, 488), (376, 466), (365, 441)]),
    ("R", (684, 440), [(598, 441), (606, 421), (625, 402), (649, 388),
        (684, 377), (715, 380), (742, 358), (751, 383), (778, 380),
        (771, 398), (789, 423), (757, 435), (743, 458), (726, 483),
        (706, 497), (670, 492), (629, 488), (614, 472), (605, 458)]),
]

PARAMETERS = {
    "ParamAngleX": (-30, 0, 30),
    "ParamAngleY": (-30, 0, 30),
    "ParamAngleZ": (-30, 0, 30),
    "ParamEyeLOpen": (0, 0.30, 0.65, 1),
    "ParamEyeROpen": (0, 0.30, 0.65, 1),
    "ParamWinkBlend": (0, 1),
    "ParamEyeBallX": (-1, 0, 1),
    "ParamEyeBallY": (-1, 0, 1),
    "ParamMouthOpenY": (0, 1),
    "ParamBreath": (0, 1),
    "ParamHairSwing": (-1, 0, 1),
    "ParamWing": (-1, 0, 1),
    "ParamArmL": (-1, 0, 1),
    "ParamArmR": (-1, 0, 1),
    "ParamStep": (-1, 0, 1),
}
HEAD_ANGLES = ["ParamAngleX", "ParamAngleY", "ParamAngleZ"]


def polygon(points):
    mask = Image.new("L", (SOURCE_WIDTH, SOURCE_HEIGHT))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def mirror(points):
    return [(SOURCE_WIDTH - 1 - x, y) for x, y in points]


def cut(image, mask):
    result = image.copy()
    result.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return result


def remove_feature(face, mask, center):
    """Extend nearby cheek color under a moving facial texture."""
    x0, y0, x1, y1 = mask.getbbox()
    cx, _ = center
    rgb = np.asarray(face.convert("RGB"), dtype=np.float32)
    bottom = np.median(rgb[y1 + 1:y1 + 10, cx - 13:cx + 13], axis=(0, 1))
    upper = np.median(rgb[y0 + 12:y0 + 37, 547:578], axis=(0, 1))
    if y0 > 500:
        upper = np.median(rgb[y0 - 11:y0 - 2, cx - 13:cx + 13], axis=(0, 1))
    fill = np.broadcast_to(bottom, (y1 - y0, x1 - x0, 3)).copy()
    strength = np.linspace(0.65, 0.04, y1 - y0)[:, None, None]
    fill += (upper - bottom)[None, None, :] * strength
    patch = Image.fromarray(np.uint8(fill.clip(0, 255))).convert("RGBA")
    face.paste(patch, (x0, y0), mask.crop((x0, y0, x1, y1)))


def layers(source, blink, wink):
    alpha = source.getchannel("A")
    unassigned = Image.new("L", source.size, 255)

    def detach(mask):
        nonlocal unassigned
        clipped = ImageChops.multiply(unassigned, mask)
        unassigned = ImageChops.subtract(unassigned, clipped)
        return cut(source, clipped)

    tail_l, tail_r = (detach(polygon(p)) for p in (TAIL, mirror(TAIL)))
    face = detach(polygon(HEAD))
    wing_l, wing_r = (detach(polygon(p)) for p in (WING, mirror(WING)))
    arm_l, arm_r = (detach(polygon(p)) for p in (ARM, mirror(ARM)))
    leg_l = detach(polygon([(0, 1070), (559, 1070), (559, 1402), (0, 1402)]))
    leg_r = detach(polygon([(560, 1070), (1122, 1070), (1122, 1402), (560, 1402)]))
    body = detach(Image.new("L", source.size, 255))

    # The generated texture carries the face; move its eyes and mouth as meshes.
    eyes = []
    for side, center, points in EYES:
        mask = polygon(points).filter(ImageFilter.GaussianBlur(2))
        eye_parameter = f"ParamEye{side}Open"
        eyes.append((f"Eye{side}", cut(face, mask), HEAD_ANGLES + [
            eye_parameter, "ParamEyeBallX", "ParamEyeBallY"], center, 20))
        lid_parameters = HEAD_ANGLES + [eye_parameter]
        if side == "L":
            lid_parameters.append("ParamWinkBlend")
            eyes.append(("WinkL", cut(wink, mask), lid_parameters, center, 22))
        eyes.append((f"Lash{side}", cut(blink, mask), lid_parameters, center, 22))
        remove_feature(face, mask, center)

    mouth_center = (563, 531)
    mouth_mask = polygon([(530, 515), (598, 515), (598, 547), (530, 547)])
    mouth = cut(face, mouth_mask)
    remove_feature(face, mouth_mask, mouth_center)
    mouth_inside = Image.new("RGBA", source.size)
    ink = ImageDraw.Draw(mouth_inside)
    ink.rounded_rectangle((539, 517, 587, 551), radius=15, fill=(101, 36, 55, 255))
    ink.ellipse((551, 535, 576, 549), fill=(225, 105, 120, 255))

    # Fill behind the loose collar so the silhouette has a neck during turns.
    neck = Image.new("RGBA", source.size)
    ImageDraw.Draw(neck).ellipse((511, 555, 611, 633), fill=(240, 162, 140, 255))
    neck.putalpha(ImageChops.multiply(neck.getchannel("A"), alpha))
    return [
        ("WingL", wing_l, ["ParamWing", "ParamBreath"], (393, 683), 44),
        ("WingR", wing_r, ["ParamWing", "ParamBreath"], (729, 683), 44),
        ("LegL", leg_l, ["ParamStep"], (477, 1070), 45),
        ("LegR", leg_r, ["ParamStep"], (648, 1070), 45),
        ("Neck", neck, ["ParamBreath"], (563, 594), 36),
        ("ArmL", arm_l, ["ParamArmL", "ParamBreath"], (396, 802), 40),
        ("ArmR", arm_r, ["ParamArmR", "ParamBreath"], (726, 802), 40),
        ("Body", body, ["ParamBreath"], (561, 1000), 48),
        ("TailL", tail_l, HEAD_ANGLES + ["ParamHairSwing"], (323, 103), 42),
        ("TailR", tail_r, HEAD_ANGLES + ["ParamHairSwing"], (799, 103), 42),
        ("Head", face, HEAD_ANGLES, (561, 558), 43),
        *eyes,
        ("MouthInside", mouth_inside, HEAD_ANGLES + ["ParamMouthOpenY"], mouth_center, 19),
        ("Smile", mouth, HEAD_ANGLES + ["ParamMouthOpenY"], mouth_center, 19),
    ]


def allocate_textures(parts):
    tiles = {}
    for name, image, _, _, _ in parts:
        x0, y0, x1, y1 = image.getchannel("A").getbbox()
        bounds = (x0 - 3, y0 - 3, x1 + 3, y1 + 3)
        tiles[name] = (image.crop(bounds), bounds)

    atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE))
    layout = {}
    x, y, row = 4, 4, 0
    for name, (tile, bounds) in sorted(tiles.items(), key=lambda item: -item[1][0].height):
        if x + tile.width + 4 >= ATLAS_SIZE:
            x, y, row = 4, y + row + 6, 0
        if y + tile.height + 4 >= ATLAS_SIZE:
            raise ValueError("The art layers exceeded the 2048 pixel atlas")
        atlas.paste(tile, (x, y))
        layout[name] = (bounds, x, y)
        x += tile.width + 6
        row = max(row, tile.height)
    return atlas, layout


def make_mesh(mesh_type, tile, spacing):
    (x0, y0, x1, y1), ax, ay = tile
    nx = max(3, math.ceil((x1 - x0) / spacing) + 1)
    ny = max(3, math.ceil((y1 - y0) / spacing) + 1)
    x, y = np.meshgrid(np.linspace(x0, x1, nx), np.linspace(y0, y1, ny))
    points = np.column_stack((x.ravel(), y.ravel()))
    vertices = (points - [SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2]) / [PPU, -PPU]
    uvs = (points - [x0 - ax, y0 - ay]) / ATLAS_SIZE
    indices = []
    for row in range(ny - 1):
        for col in range(nx - 1):
            top = row * nx + col
            below = top + nx
            indices.extend([top, below, top + 1, top + 1, below, below + 1])
    return mesh_type(vertices.astype(np.float32), uvs.astype(np.float32), np.uint16(indices)), points


def rotate(points, anchor, angle):
    sin, cos = math.sin(angle), math.cos(angle)
    points[:] = (points - anchor) @ np.array([[cos, sin], [-sin, cos]]) + anchor


def deform_mesh(name, anchor, parameters, points):
    def deform(key_indices):
        values = {pid: PARAMETERS[pid][index] for pid, index in zip(parameters, key_indices)}
        result = points.copy()
        x, y = result.T
        side = -1 if name.endswith("L") else 1
        if name.startswith("Eye"):
            open_fraction = values[f"ParamEye{name[-1]}Open"]
            proximity = np.exp(-((x - anchor[0]) / 53) ** 2 - ((y - anchor[1]) / 37) ** 2)
            x += values["ParamEyeBallX"] * proximity * 8 * open_fraction
            y -= values["ParamEyeBallY"] * proximity * 6 * open_fraction
            y[:] = anchor[1] + (y - anchor[1]) * (0.065 + 0.935 * open_fraction) + (1 - open_fraction) * 22
        if name == "MouthInside":
            opening = values["ParamMouthOpenY"]
            y[:] = anchor[1] + (y - anchor[1]) * (0.075 + 0.925 * opening) + opening * 6
        if name == "Smile":
            opening = values["ParamMouthOpenY"]
            y += 16 * opening
            x[:] = anchor[0] + (x - anchor[0]) * (1 - opening * 0.2)
        if name.startswith("Tail"):
            sway = values["ParamHairSwing"]
            weight = np.clip((y - anchor[1]) / 650, 0, 1) ** 1.4
            x += sway * weight * 32
            y -= abs(sway) * weight * 11
        if name.startswith("Wing"):
            rotate(result, anchor, side * values["ParamWing"] * 0.22)
        if name.startswith("Arm"):
            lift = values[f"Param{name}"]
            angle = 1.85 * lift if lift >= 0 else 0.22 * lift
            rotate(result, anchor, -side * angle)
        if name.startswith("Leg"):
            step = side * values["ParamStep"]
            weight = np.clip((y - anchor[1]) / 330, 0, 1)
            x += step * weight * 38
            y -= max(0, step) * weight * 42
        if "ParamBreath" in values:
            breath = values["ParamBreath"]
            y -= breath * np.clip((1090 - y) / 480, 0, 1) * 9
        if "ParamAngleX" in values:
            yaw = values["ParamAngleX"] / 30
            yaw_weight = np.clip((650 - y) / 490, 0, 1)
            x += yaw * (13 + 12 * yaw_weight) - abs(yaw) * (x - 561) * 0.028
            y -= (values["ParamAngleY"] / 30) * (6 + 11 * yaw_weight)
            rotate(result, (561, 575), values["ParamAngleZ"] / 30 * 0.095)
        return ((result - [SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2]) / [PPU, -PPU]).astype(np.float32)

    return deform


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")


def set_lid_opacity(rig, moc, parameters):
    for index, spec in enumerate(rig.meshes):
        if not spec.name.startswith(("Eye", "Lash", "Wink")):
            continue
        eye_axis = spec.bound_params.index(parameters[f"ParamEye{spec.name[-1]}Open"])
        stride = math.prod(rig.params[pid].n_keys for pid in spec.bound_params[:eye_axis])
        weights = (0, 0.58, 1, 1) if spec.name.startswith("Eye") else (1, 0.59, 0, 0)
        wink_axis = parameters["ParamWinkBlend"]
        wink_stride = 0
        if wink_axis in spec.bound_params:
            wink_stride = math.prod(rig.params[pid].n_keys for pid in spec.bound_params[:spec.bound_params.index(wink_axis)])
        first = moc.sections["art_mesh_src.keyform_off"][index]
        count = moc.sections["art_mesh_src.key_len"][index]
        for cell in range(count):
            weight = weights[(cell // stride) % len(weights)]
            if wink_stride and bool((cell // wink_stride) % 2) != spec.name.startswith("Wink"):
                weight = 0
            moc.sections["art_mesh_key_src.opacity"][first + cell] = weight


def build(upstream, output):
    sys.path.insert(0, str(upstream.resolve() / "src"))
    from autorig.build import ArtMeshSpec, RigBuilder
    from autorig.emit import cdi3, eye_blink_group, lipsync_group, model3
    from autorig.mesh import Mesh

    source, blink, wink = (Image.open(PROJECT / "assets/source" / f"grok-{expression}.png").convert("RGBA")
                            for expression in ("chibi", "blink", "wink"))
    if any(plate.size != (SOURCE_WIDTH, SOURCE_HEIGHT) for plate in (source, blink, wink)):
        raise ValueError("The original and both expressions need the same 1122 × 1402 framing")
    parts = layers(source, blink, wink)
    atlas, layout = allocate_textures(parts)
    canvas_w, canvas_h = SOURCE_WIDTH + PAD * 2, SOURCE_HEIGHT + PAD * 2
    rig = RigBuilder(canvas_w, canvas_h, PPU)
    # The canvas header stores pixel dimensions. Only the vertices use model units.
    rig.canvas.origin_x = canvas_w / 2
    rig.canvas.origin_y = canvas_h / 2
    rig.canvas.canvas_width = canvas_w
    rig.canvas.canvas_height = canvas_h
    parameters = {pid: rig.add_param(pid, keys[0], keys[-1],
                  1 if pid in ("ParamEyeLOpen", "ParamEyeROpen") else 0, list(keys))
                  for pid, keys in PARAMETERS.items()}
    root = rig.add_part("Pet")
    for order, (name, _, bindings, anchor, spacing) in enumerate(parts):
        mesh, points = make_mesh(Mesh, layout[name], spacing)
        rig.add_mesh(ArtMeshSpec(name=name, mesh=mesh, part_index=rig.add_part(name, root),
                     draw_order=500 + order, bound_params=[parameters[pid] for pid in bindings],
                     deform=deform_mesh(name, anchor, bindings, points)))

    output.mkdir(parents=True, exist_ok=True)
    atlas.save(output / "Atlas.png", optimize=True)
    moc = rig.build()
    set_lid_opacity(rig, moc, parameters)
    (output / f"{NAME}.moc3").write_bytes(moc.to_bytes())
    manifest = model3(NAME, ["Atlas.png"], False, True,
                      [eye_blink_group(list(parameters)), lipsync_group(list(parameters))])
    manifest["HitAreas"] = [{"Id": "Head", "Name": "Head"}, {"Id": "Body", "Name": "Body"}]
    write_json(output / f"{NAME}.model3.json", manifest)
    display_info = cdi3(rig.params, rig.parts)
    for param in display_info["Parameters"]:
        if param["Id"] == "ParamWinkBlend":
            param["GroupId"] = "GroupFace"
        elif param["GroupId"] == "" or param["Id"] in ("ParamWing", "ParamHairSwing", "ParamArmL", "ParamArmR", "ParamStep"):
            param["GroupId"] = "GroupBody"
    write_json(output / f"{NAME}.cdi3.json", display_info)
    icon = source.crop((174, 0, 940, 766))
    icon.thumbnail((96, 96), Image.Resampling.LANCZOS)
    icon.save(output / "Icon.png")
    padded = Image.new("L", (SOURCE_WIDTH + 2 * PAD, SOURCE_HEIGHT + 2 * PAD))
    padded.paste(source.getchannel("A"), (PAD, PAD))
    pixels = np.asarray(padded.resize((64, 80), Image.Resampling.LANCZOS).filter(ImageFilter.MaxFilter(3)))
    write_json(output / "HitMask.json", ["".join("1" if pixel > 46 else "0" for pixel in row) for row in pixels])
    print(f"{NAME}: {len(rig.meshes)} art meshes, {len(rig.params)} parameters, {ATLAS_SIZE}px texture atlas")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True, help="live2d-autorig-claude checkout")
    parser.add_argument("--out", type=Path, default=PROJECT / "assets/model")
    args = parser.parse_args()
    build(args.upstream, args.out)
