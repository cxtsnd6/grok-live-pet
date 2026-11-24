/*! Mochi2D 0.24.1 | MIT License | Copyright (c) 2026 Mochi2D contributors | third-party notices: THIRD_PARTY_NOTICES.md */
/*! fflate 0.8.3 | MIT License | Copyright (c) 2026 Arjun Barrett */
/*! musl 1.2.6 (atan2f, atanf, sinf, cosf; ported) | MIT License | Copyright © 2005-2020 Rich Felker, et al.; Copyright (C) 1993 by Sun Microsystems, Inc. */

// src/anim/sound-format.ts
var at = (b, o, s) => o + s.length <= b.length && [...s].every((c, i2) => b[o + i2] === c.charCodeAt(0));
function soundFormat(b) {
  if (at(b, 0, "RIFF") && at(b, 8, "WAVE")) return "wav";
  if (at(b, 0, "OggS")) return "ogg";
  if (at(b, 0, "fLaC")) return "flac";
  if (at(b, 0, "ID3") || b[0] === 255 && (b[1] & 224) === 224 && (b[1] & 6) !== 0)
    return "mp3";
  if (at(b, 4, "ftyp") || b[0] === 255 && (b[1] & 246) === 240) return "aac";
  if (b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163) return "webm";
  return "unknown";
}
var NAMES = {
  wav: "a WAV",
  mp3: "an MP3",
  ogg: "an Ogg",
  flac: "a FLAC",
  aac: "an AAC/MP4",
  webm: "a WebM",
  unknown: "an unrecognized"
};
function skippedSoundReason(bytes, options = {}) {
  const f = soundFormat(bytes);
  if (f === "wav" || options.compressed) return null;
  return f === "unknown" ? "not a WAV file" : `${NAMES[f]} file: a model's motion sounds play only as WAV files unless the view is given sounds: { compressed: true }`;
}
function skippedSoundWarning(path, reason) {
  return `${path}: motion sound not played: ${reason}`;
}
function motionSounds(settings) {
  const out = [];
  for (const g of settings.motions)
    for (const e of g.entries) if (e.sound && !out.includes(e.sound)) out.push(e.sound);
  return out;
}
function motionSoundWarnings(settings, options = {}) {
  const out = [];
  for (const s of motionSounds(settings)) {
    if (options.played === false)
      out.push(`${s}: motion sound not played: a view's items play no motion sounds`);
    else if (!options.compressed && !/\.wave?$/i.test(s))
      out.push(
        `${s}: motion sound not played: not named .wav, and a model's motion sounds play only as WAV files unless the view is given sounds: { compressed: true }`
      );
  }
  return out;
}

// src/core/binary/utf8.ts
function decodeUtf8(bytes) {
  let out = "";
  const chunk = [];
  const flush = () => {
    out += String.fromCharCode(...chunk);
    chunk.length = 0;
  };
  for (let i2 = 0; i2 < bytes.length; ) {
    const b0 = bytes[i2];
    let cp = 65533;
    let len = 1;
    if (b0 < 128) {
      cp = b0;
    } else if (b0 >= 194 && b0 < 224) {
      len = 2;
    } else if (b0 >= 224 && b0 < 240) {
      len = 3;
    } else if (b0 >= 240 && b0 < 245) {
      len = 4;
    }
    if (len > 1) {
      let ok = i2 + len <= bytes.length;
      let v = b0 & 255 >> len + 1;
      for (let k = 1; ok && k < len; k++) {
        const b = bytes[i2 + k];
        if ((b & 192) !== 128) ok = false;
        else v = v << 6 | b & 63;
      }
      const min = len === 2 ? 128 : len === 3 ? 2048 : 65536;
      if (ok && v >= min && v <= 1114111 && !(v >= 55296 && v <= 57343)) {
        cp = v;
      } else {
        cp = 65533;
        len = 1;
      }
    }
    i2 += len;
    if (cp > 65535) {
      cp -= 65536;
      chunk.push(55296 + (cp >> 10), 56320 + (cp & 1023));
    } else {
      chunk.push(cp);
    }
    if (chunk.length > 4096) flush();
  }
  flush();
  return out;
}
function encodeUtf8(text) {
  const out = [];
  for (let i2 = 0; i2 < text.length; i2++) {
    let cp = text.charCodeAt(i2);
    if (cp >= 55296 && cp <= 56319) {
      const lo = i2 + 1 < text.length ? text.charCodeAt(i2 + 1) : 0;
      if (lo >= 56320 && lo <= 57343) {
        cp = 65536 + (cp - 55296 << 10) + (lo - 56320);
        i2++;
      } else cp = 65533;
    } else if (cp >= 56320 && cp <= 57343) cp = 65533;
    if (cp < 128) out.push(cp);
    else if (cp < 2048) out.push(192 | cp >> 6, 128 | cp & 63);
    else if (cp < 65536) out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    else
      out.push(
        240 | cp >> 18,
        128 | cp >> 12 & 63,
        128 | cp >> 6 & 63,
        128 | cp & 63
      );
  }
  return Uint8Array.from(out);
}

// src/core/io/file-source.ts
var FileNotFoundError = class extends Error {
  constructor(path, source) {
    super(`File not found: "${path}" in ${source}`);
    this.path = path;
    this.source = source;
    this.name = "FileNotFoundError";
  }
  path;
  source;
};
function normalizePath(path) {
  const parts = [];
  for (const seg of path.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) throw new Error(`Path escapes the source root: "${path}"`);
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}
function dirnameOf(path) {
  const i2 = path.lastIndexOf("/");
  return i2 < 0 ? "" : path.slice(0, i2);
}
function joinPath(base, ref) {
  return normalizePath(base ? `${base}/${ref}` : ref);
}
var MemoryFileSource = class _MemoryFileSource {
  constructor(label, entries = []) {
    this.label = label;
    for (const [p, data] of entries) this.set(p, data);
  }
  label;
  files = /* @__PURE__ */ new Map();
  /** NFC form of each path → the path as stored. */
  composed = /* @__PURE__ */ new Map();
  /**
   * In-memory files by path, as a record or a map: bytes, an ArrayBuffer, or
   * text (stored as UTF-8).
   */
  static fromFiles(files, label = "files") {
    const src = new _MemoryFileSource(label);
    const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);
    for (const [path, data] of entries)
      src.set(
        path,
        typeof data === "string" ? encodeUtf8(data) : data instanceof Uint8Array ? data : new Uint8Array(data)
      );
    return src;
  }
  set(path, data) {
    const p = normalizePath(path);
    this.files.set(p, data);
    this.composed.set(p.normalize("NFC"), p);
  }
  list() {
    return [...this.files.keys()].sort();
  }
  async read(path) {
    const p = normalizePath(path);
    const data = this.files.get(p) ?? this.files.get(this.composed.get(p.normalize("NFC")) ?? "");
    if (!data) throw new FileNotFoundError(path, this.label);
    return data;
  }
};
async function readText(source, path) {
  const bytes = await source.read(path);
  const text = decodeUtf8(bytes);
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
var OverlayFileSource = class {
  constructor(label, layers) {
    this.label = label;
    this.layers = layers;
  }
  label;
  layers;
  list() {
    const lists = this.layers.map((l) => l.list());
    if (lists.every((l) => l === void 0)) return void 0;
    return [...new Set(lists.flatMap((l) => l ?? []))].sort();
  }
  async read(path) {
    for (const layer of this.layers) {
      try {
        return await layer.read(path);
      } catch (e) {
        if (!(e instanceof FileNotFoundError)) throw e;
      }
    }
    throw new FileNotFoundError(path, this.label);
  }
};

// src/core/settings/model-settings.ts
var SettingsFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SettingsFormatError";
  }
};
var LAYOUT_KEYS = [
  "width",
  "height",
  "x",
  "y",
  "center_x",
  "center_y",
  "top",
  "bottom",
  "left",
  "right"
];
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var str = (v) => typeof v === "string" ? v : void 0;
var num = (v) => typeof v === "number" ? v : void 0;
function parseModelSettings(bytes, label = "model settings") {
  let text = decodeUtf8(bytes);
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new SettingsFormatError(`${label}: invalid JSON (${e.message})`);
  }
  return settingsFromJson(json, label);
}
function settingsFromJson(json, label = "model settings") {
  if (!isObject(json)) throw new SettingsFormatError(`${label}: not a JSON object`);
  const raw = json;
  const r = raw.FileReferences;
  if (!isObject(r)) throw new SettingsFormatError(`${label}: no FileReferences object`);
  if (typeof r.Moc !== "string" || r.Moc === "")
    throw new SettingsFormatError(`${label}: FileReferences.Moc is missing`);
  const textures = r.Textures;
  if (textures !== void 0 && !(Array.isArray(textures) && textures.every((t) => typeof t === "string"))) {
    throw new SettingsFormatError(`${label}: FileReferences.Textures must be a list of strings`);
  }
  const expressions = [];
  if (Array.isArray(r.Expressions)) {
    for (const e of r.Expressions)
      if (isObject(e) && typeof e.File === "string")
        expressions.push({ name: str(e.Name) ?? e.File, file: e.File });
  }
  const motions = [];
  if (isObject(r.Motions))
    for (const [group, list] of Object.entries(r.Motions)) {
      const entries = [];
      if (Array.isArray(list))
        for (const m of list) {
          if (!isObject(m) || typeof m.File !== "string") continue;
          const entry = { file: m.File };
          const fi = num(m.FadeInTime);
          const fo = num(m.FadeOutTime);
          const sound = str(m.Sound);
          const sync = str(m.MotionSync);
          if (fi !== void 0) entry.fadeInTime = fi;
          if (fo !== void 0) entry.fadeOutTime = fo;
          if (sound) entry.sound = sound;
          if (sync) entry.motionSync = sync;
          entries.push(entry);
        }
      motions.push({ group, entries });
    }
  const groups = [];
  if (Array.isArray(raw.Groups)) {
    for (const g of raw.Groups)
      if (isObject(g))
        groups.push({
          target: str(g.Target) ?? "",
          name: str(g.Name) ?? "",
          ids: Array.isArray(g.Ids) ? g.Ids.filter((x2) => typeof x2 === "string") : []
        });
  }
  const hitAreas = [];
  if (Array.isArray(raw.HitAreas)) {
    for (const h of raw.HitAreas)
      if (isObject(h) && typeof h.Id === "string")
        hitAreas.push({ id: h.Id, name: str(h.Name) ?? "" });
  }
  const layout = {};
  if (isObject(raw.Layout))
    for (const k of LAYOUT_KEYS) {
      const v = num(raw.Layout[k]);
      if (v !== void 0) layout[k] = v;
    }
  const optional = (k) => {
    const v = r[k];
    return typeof v === "string" && v !== "" ? v : void 0;
  };
  const settings = {
    moc: r.Moc,
    textures: textures ?? [],
    expressions,
    motions,
    groups,
    hitAreas,
    layout,
    raw
  };
  const physics = optional("Physics");
  const pose = optional("Pose");
  const userData = optional("UserData");
  const displayInfo = optional("DisplayInfo");
  const motionSync = optional("MotionSync");
  if (motionSync) settings.motionSync = motionSync;
  if (physics) settings.physics = physics;
  if (pose) settings.pose = pose;
  if (userData) settings.userData = userData;
  if (displayInfo) settings.displayInfo = displayInfo;
  return settings;
}
function parameterGroupIds(settings, name2) {
  return settings.groups.find((g) => g.name === name2)?.ids ?? [];
}

// src/core/moc/schema.ts
var MIN_VERSION = 1;
var MAX_VERSION = 6;
var HEADER_SIZE = 64;
var MAGIC = "MOC3";
function slotTableLength(version) {
  return version >= 6 ? 1440 : 480;
}
function countTableLength(version) {
  return version >= 5 ? 64 : 32;
}
var Count = {
  Parts: 0,
  Deformers: 1,
  Warps: 2,
  Rotations: 3,
  ArtMeshes: 4,
  Parameters: 5,
  PartKeyforms: 6,
  WarpKeyforms: 7,
  RotationKeyforms: 8,
  ArtMeshKeyforms: 9,
  PositionFloats: 10,
  BindingIndexEntries: 11,
  Bands: 12,
  ParameterBindings: 13,
  KeyValues: 14,
  UvFloats: 15,
  TriangleIndexEntries: 16,
  MaskEntries: 17,
  DrawOrderGroups: 18,
  DrawOrderGroupObjects: 19,
  Glues: 20,
  GlueInfoEntries: 21,
  GlueKeyforms: 22,
  MultiplyColors: 23,
  ScreenColors: 24,
  BlendShapeParameterBindings: 25,
  BlendShapeKeyformBindings: 26,
  WarpBlendShapeTargets: 27,
  ArtMeshBlendShapeTargets: 28,
  BlendShapeConstraintIndexEntries: 29,
  BlendShapeConstraints: 30,
  BlendShapeConstraintValues: 31,
  PartBlendShapeTargets: 32,
  RotationBlendShapeTargets: 33,
  GlueBlendShapeTargets: 34,
  Offscreens: 35,
  OffscreenKeyforms: 36,
  OffscreenBlendShapeTargets: 37
};
function countSince(index) {
  if (index <= 22) return 1;
  if (index <= 31) return 4;
  if (index <= 34) return 5;
  if (index <= 37) return 6;
  return Number.POSITIVE_INFINITY;
}
var COUNT_NAMES = {
  0: "parts",
  1: "deformers",
  2: "warp deformers",
  3: "rotation deformers",
  4: "art meshes",
  5: "parameters",
  6: "part keyforms",
  7: "warp keyforms",
  8: "rotation keyforms",
  9: "art-mesh keyforms",
  10: "keyform position floats",
  11: "binding-index entries",
  12: "keyform bindings",
  13: "parameter bindings",
  14: "key values",
  15: "UV floats",
  16: "triangle-index entries",
  17: "mask entries",
  18: "draw-order groups",
  19: "draw-order group objects",
  20: "glues",
  21: "glue-info entries",
  22: "glue keyforms",
  23: "multiply-color entries",
  24: "screen-color entries",
  25: "blend-shape parameter bindings",
  26: "blend-shape keyform bindings",
  27: "warp blend-shape targets",
  28: "art-mesh blend-shape targets",
  29: "blend-shape constraint-index entries",
  30: "blend-shape constraints",
  31: "blend-shape constraint values",
  32: "part blend-shape targets",
  33: "rotation blend-shape targets",
  34: "glue blend-shape targets",
  35: "offscreens",
  36: "offscreen keyforms",
  37: "unknown v6 group"
};
var ELEMENT_SIZE = {
  name: 64,
  placeholder: 8,
  i32: 4,
  f32: 4,
  u16: 2,
  u8: 1
};
var FIELD_TABLE = [
  // Parts
  ["part.reserved", 2, "placeholder", Count.Parts],
  ["part.id", 3, "name", Count.Parts],
  ["part.band", 4, "i32", Count.Parts],
  ["part.firstKeyform", 5, "i32", Count.Parts],
  ["part.keyformCount", 6, "i32", Count.Parts],
  ["part.initiallyVisible", 7, "i32", Count.Parts],
  ["part.enabled", 8, "i32", Count.Parts],
  ["part.parent", 9, "i32", Count.Parts],
  ["part.offscreen", 152, "i32", Count.Parts, 6],
  // Deformers
  ["deformer.reserved", 10, "placeholder", Count.Deformers],
  ["deformer.id", 11, "name", Count.Deformers],
  ["deformer.band", 12, "i32", Count.Deformers],
  ["deformer.visible", 13, "i32", Count.Deformers],
  ["deformer.enabled", 14, "i32", Count.Deformers],
  ["deformer.part", 15, "i32", Count.Deformers],
  ["deformer.parent", 16, "i32", Count.Deformers],
  ["deformer.kind", 17, "i32", Count.Deformers],
  ["deformer.kindIndex", 18, "i32", Count.Deformers],
  // Warp deformers
  ["warp.band", 19, "i32", Count.Warps],
  ["warp.firstKeyform", 20, "i32", Count.Warps],
  ["warp.keyformCount", 21, "i32", Count.Warps],
  ["warp.pointCount", 22, "i32", Count.Warps],
  ["warp.rows", 23, "i32", Count.Warps],
  ["warp.columns", 24, "i32", Count.Warps],
  ["warp.bilinear", 101, "i32", Count.Warps, 2],
  ["warp.firstColor", 105, "i32", Count.Warps, 4],
  // Rotation deformers
  ["rotation.band", 25, "i32", Count.Rotations],
  ["rotation.firstKeyform", 26, "i32", Count.Rotations],
  ["rotation.keyformCount", 27, "i32", Count.Rotations],
  ["rotation.baseAngle", 28, "f32", Count.Rotations],
  ["rotation.firstColor", 106, "i32", Count.Rotations, 4],
  // Art meshes
  ["mesh.reserved0", 29, "placeholder", Count.ArtMeshes],
  ["mesh.reserved1", 30, "placeholder", Count.ArtMeshes],
  ["mesh.reserved2", 31, "placeholder", Count.ArtMeshes],
  ["mesh.reserved3", 32, "placeholder", Count.ArtMeshes],
  ["mesh.id", 33, "name", Count.ArtMeshes],
  ["mesh.band", 34, "i32", Count.ArtMeshes],
  ["mesh.firstKeyform", 35, "i32", Count.ArtMeshes],
  ["mesh.keyformCount", 36, "i32", Count.ArtMeshes],
  ["mesh.visible", 37, "i32", Count.ArtMeshes],
  ["mesh.enabled", 38, "i32", Count.ArtMeshes],
  ["mesh.part", 39, "i32", Count.ArtMeshes],
  ["mesh.deformer", 40, "i32", Count.ArtMeshes],
  ["mesh.texture", 41, "i32", Count.ArtMeshes],
  ["mesh.flags", 42, "u8", Count.ArtMeshes],
  ["mesh.vertexCount", 43, "i32", Count.ArtMeshes],
  ["mesh.firstUv", 44, "i32", Count.ArtMeshes],
  ["mesh.firstTriangleIndex", 45, "i32", Count.ArtMeshes],
  ["mesh.triangleIndexCount", 46, "i32", Count.ArtMeshes],
  ["mesh.firstMask", 47, "i32", Count.ArtMeshes],
  ["mesh.maskCount", 48, "i32", Count.ArtMeshes],
  ["mesh.firstColor", 107, "i32", Count.ArtMeshes, 4],
  ["mesh.blendMode", 153, "i32", Count.ArtMeshes, 6],
  // Parameters
  ["parameter.reserved", 49, "placeholder", Count.Parameters],
  ["parameter.id", 50, "name", Count.Parameters],
  ["parameter.max", 51, "f32", Count.Parameters],
  ["parameter.min", 52, "f32", Count.Parameters],
  ["parameter.default", 53, "f32", Count.Parameters],
  ["parameter.repeat", 54, "i32", Count.Parameters],
  ["parameter.decimals", 55, "i32", Count.Parameters],
  ["parameter.firstBinding", 56, "i32", Count.Parameters],
  ["parameter.bindingCount", 57, "i32", Count.Parameters],
  ["parameter.reserved4", 102, "placeholder", Count.Parameters, 4],
  ["parameter.firstKey", 103, "i32", Count.Parameters, 4],
  ["parameter.keyCount", 104, "i32", Count.Parameters, 4],
  ["parameter.type", 114, "i32", Count.Parameters, 4],
  ["parameter.firstBlendShapeBinding", 115, "i32", Count.Parameters, 4],
  ["parameter.blendShapeBindingCount", 116, "i32", Count.Parameters, 4],
  // Keyforms
  ["partKeyform.drawOrder", 58, "f32", Count.PartKeyforms],
  ["partKeyform.offscreenKeyform", 160, "i32", Count.PartKeyforms, 6],
  ["warpKeyform.opacity", 59, "f32", Count.WarpKeyforms],
  ["warpKeyform.firstPosition", 60, "i32", Count.WarpKeyforms],
  ["warpKeyform.multiplyColor", 137, "i32", Count.WarpKeyforms, 5],
  ["warpKeyform.screenColor", 138, "i32", Count.WarpKeyforms, 5],
  ["rotationKeyform.opacity", 61, "f32", Count.RotationKeyforms],
  ["rotationKeyform.angle", 62, "f32", Count.RotationKeyforms],
  ["rotationKeyform.originX", 63, "f32", Count.RotationKeyforms],
  ["rotationKeyform.originY", 64, "f32", Count.RotationKeyforms],
  ["rotationKeyform.scale", 65, "f32", Count.RotationKeyforms],
  ["rotationKeyform.mirrorX", 66, "i32", Count.RotationKeyforms],
  ["rotationKeyform.mirrorY", 67, "i32", Count.RotationKeyforms],
  ["rotationKeyform.multiplyColor", 139, "i32", Count.RotationKeyforms, 5],
  ["rotationKeyform.screenColor", 140, "i32", Count.RotationKeyforms, 5],
  ["meshKeyform.opacity", 68, "f32", Count.ArtMeshKeyforms],
  ["meshKeyform.drawOrder", 69, "f32", Count.ArtMeshKeyforms],
  ["meshKeyform.firstPosition", 70, "i32", Count.ArtMeshKeyforms],
  ["meshKeyform.multiplyColor", 141, "i32", Count.ArtMeshKeyforms, 5],
  ["meshKeyform.screenColor", 142, "i32", Count.ArtMeshKeyforms, 5],
  ["offscreenKeyform.opacity", 161, "f32", Count.OffscreenKeyforms, 6],
  ["offscreenKeyform.multiplyColor", 162, "i32", Count.OffscreenKeyforms, 6],
  ["offscreenKeyform.screenColor", 163, "i32", Count.OffscreenKeyforms, 6],
  ["glueKeyform.intensity", 100, "f32", Count.GlueKeyforms],
  // Shared pools and bindings
  ["positions", 71, "f32", Count.PositionFloats],
  ["bindingIndex", 72, "i32", Count.BindingIndexEntries],
  ["band.firstEntry", 73, "i32", Count.Bands],
  ["band.entryCount", 74, "i32", Count.Bands],
  ["binding.firstKey", 75, "i32", Count.ParameterBindings],
  ["binding.keyCount", 76, "i32", Count.ParameterBindings],
  ["keys", 77, "f32", Count.KeyValues],
  ["uvs", 78, "f32", Count.UvFloats],
  ["triangleIndices", 79, "u16", Count.TriangleIndexEntries],
  ["maskEntries", 80, "i32", Count.MaskEntries],
  // Draw-order groups
  ["group.firstObject", 81, "i32", Count.DrawOrderGroups],
  ["group.objectCount", 82, "i32", Count.DrawOrderGroups],
  ["group.entryCount", 83, "i32", Count.DrawOrderGroups],
  ["group.maxDrawOrder", 84, "i32", Count.DrawOrderGroups],
  ["group.minDrawOrder", 85, "i32", Count.DrawOrderGroups],
  ["groupObject.kind", 86, "i32", Count.DrawOrderGroupObjects],
  ["groupObject.index", 87, "i32", Count.DrawOrderGroupObjects],
  ["groupObject.nestedGroup", 88, "i32", Count.DrawOrderGroupObjects],
  // Glues
  ["glue.reserved", 89, "placeholder", Count.Glues],
  ["glue.id", 90, "name", Count.Glues],
  ["glue.band", 91, "i32", Count.Glues],
  ["glue.firstKeyform", 92, "i32", Count.Glues],
  ["glue.keyformCount", 93, "i32", Count.Glues],
  ["glue.meshA", 94, "i32", Count.Glues],
  ["glue.meshB", 95, "i32", Count.Glues],
  ["glue.firstInfo", 96, "i32", Count.Glues],
  ["glue.infoCount", 97, "i32", Count.Glues],
  ["glueInfo.weight", 98, "f32", Count.GlueInfoEntries],
  ["glueInfo.vertex", 99, "u16", Count.GlueInfoEntries],
  // Colors (v4)
  ["multiplyColor.r", 108, "f32", Count.MultiplyColors, 4],
  ["multiplyColor.g", 109, "f32", Count.MultiplyColors, 4],
  ["multiplyColor.b", 110, "f32", Count.MultiplyColors, 4],
  ["screenColor.r", 111, "f32", Count.ScreenColors, 4],
  ["screenColor.g", 112, "f32", Count.ScreenColors, 4],
  ["screenColor.b", 113, "f32", Count.ScreenColors, 4],
  // Blend shapes (v4, v5)
  ["bsBinding.firstKey", 117, "i32", Count.BlendShapeParameterBindings, 4],
  ["bsBinding.keyCount", 118, "i32", Count.BlendShapeParameterBindings, 4],
  ["bsBinding.baseKey", 119, "i32", Count.BlendShapeParameterBindings, 4],
  ["bsKeyformBinding.binding", 120, "i32", Count.BlendShapeKeyformBindings, 4],
  ["bsKeyformBinding.firstKeyform", 121, "i32", Count.BlendShapeKeyformBindings, 4],
  ["bsKeyformBinding.keyformCount", 122, "i32", Count.BlendShapeKeyformBindings, 4],
  ["bsKeyformBinding.firstConstraintEntry", 123, "i32", Count.BlendShapeKeyformBindings, 4],
  ["bsKeyformBinding.constraintEntryCount", 124, "i32", Count.BlendShapeKeyformBindings, 4],
  ["warpTarget.warp", 125, "i32", Count.WarpBlendShapeTargets, 4],
  ["warpTarget.firstBinding", 126, "i32", Count.WarpBlendShapeTargets, 4],
  ["warpTarget.bindingCount", 127, "i32", Count.WarpBlendShapeTargets, 4],
  ["meshTarget.mesh", 128, "i32", Count.ArtMeshBlendShapeTargets, 4],
  ["meshTarget.firstBinding", 129, "i32", Count.ArtMeshBlendShapeTargets, 4],
  ["meshTarget.bindingCount", 130, "i32", Count.ArtMeshBlendShapeTargets, 4],
  ["constraintIndex", 131, "i32", Count.BlendShapeConstraintIndexEntries, 4],
  ["constraint.parameter", 132, "i32", Count.BlendShapeConstraints, 4],
  ["constraint.firstValue", 133, "i32", Count.BlendShapeConstraints, 4],
  ["constraint.valueCount", 134, "i32", Count.BlendShapeConstraints, 4],
  ["constraintValue.key", 135, "f32", Count.BlendShapeConstraintValues, 4],
  ["constraintValue.weight", 136, "f32", Count.BlendShapeConstraintValues, 4],
  ["partTarget.part", 143, "i32", Count.PartBlendShapeTargets, 5],
  ["partTarget.firstBinding", 144, "i32", Count.PartBlendShapeTargets, 5],
  ["partTarget.bindingCount", 145, "i32", Count.PartBlendShapeTargets, 5],
  ["rotationTarget.rotation", 146, "i32", Count.RotationBlendShapeTargets, 5],
  ["rotationTarget.firstBinding", 147, "i32", Count.RotationBlendShapeTargets, 5],
  ["rotationTarget.bindingCount", 148, "i32", Count.RotationBlendShapeTargets, 5],
  ["glueTarget.glue", 149, "i32", Count.GlueBlendShapeTargets, 5],
  ["glueTarget.firstBinding", 150, "i32", Count.GlueBlendShapeTargets, 5],
  ["glueTarget.bindingCount", 151, "i32", Count.GlueBlendShapeTargets, 5],
  // Offscreens (v6)
  ["offscreen.reserved", 154, "placeholder", Count.Offscreens, 6],
  ["offscreen.part", 155, "i32", Count.Offscreens, 6],
  ["offscreen.flags", 156, "u8", Count.Offscreens, 6],
  ["offscreen.blendMode", 157, "i32", Count.Offscreens, 6],
  ["offscreen.firstMask", 158, "i32", Count.Offscreens, 6],
  ["offscreen.maskCount", 159, "i32", Count.Offscreens, 6],
  // Offscreen blend-shape targets (v6): their keyforms are offscreen keyforms.
  ["offscreenTarget.offscreen", 164, "i32", Count.OffscreenBlendShapeTargets, 6],
  ["offscreenTarget.firstBinding", 165, "i32", Count.OffscreenBlendShapeTargets, 6],
  ["offscreenTarget.bindingCount", 166, "i32", Count.OffscreenBlendShapeTargets, 6]
];
var FIELDS = FIELD_TABLE.map((row) => ({
  key: row[0],
  slot: row[1],
  type: row[2],
  count: row[3],
  since: row.length > 4 ? row[4] : 1
}));
var COUNT_TABLE_SLOT = 0;
var CANVAS_SLOT = 1;
var CANVAS_BLOCK_SIZE = 64;
function fieldsForVersion(version) {
  return FIELDS.filter((fs) => fs.since <= version);
}

// src/core/binary/byte-reader.ts
var HOST_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
var BinaryReadError = class extends Error {
  constructor(message, offset, length2, byteLength, label) {
    super(message);
    this.offset = offset;
    this.length = length2;
    this.byteLength = byteLength;
    this.label = label;
    this.name = "BinaryReadError";
  }
  offset;
  length;
  byteLength;
  label;
};
function hex(n) {
  return "0x" + n.toString(16).padStart(8, "0");
}
var ByteReader = class _ByteReader {
  view;
  bytes;
  pos = 0;
  /** True when multi-byte values are little-endian. */
  littleEndian;
  /** Typed arrays can be copied directly when the data matches the host byte order. */
  fastPath;
  constructor(data, offset = 0, length2, littleEndian = true) {
    this.littleEndian = littleEndian;
    this.fastPath = littleEndian === HOST_LITTLE_ENDIAN;
    if (ArrayBuffer.isView(data)) {
      const base = data.byteOffset + offset;
      const len = length2 ?? data.byteLength - offset;
      if (offset < 0 || len < 0 || offset + len > data.byteLength) {
        throw new RangeError(
          `ByteReader window [${offset}, +${len}) exceeds ${data.byteLength} bytes`
        );
      }
      this.view = new DataView(data.buffer, base, len);
    } else {
      const len = length2 ?? data.byteLength - offset;
      if (offset < 0 || len < 0 || offset + len > data.byteLength) {
        throw new RangeError(
          `ByteReader window [${offset}, +${len}) exceeds ${data.byteLength} bytes`
        );
      }
      this.view = new DataView(data, offset, len);
    }
    this.bytes = new Uint8Array(this.view.buffer, this.view.byteOffset, this.view.byteLength);
  }
  /** Total number of bytes in this reader's window. */
  get byteLength() {
    return this.view.byteLength;
  }
  /** Current cursor position (relative to the window start). */
  get position() {
    return this.pos;
  }
  /** Bytes left between the cursor and the end of the window. */
  get remaining() {
    return this.view.byteLength - this.pos;
  }
  /** Moves the cursor to an absolute position (end of window is allowed). */
  seek(offset, label) {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.view.byteLength) {
      throw new BinaryReadError(
        `${label ? label + ": " : ""}seek to ${offset} outside [0, ${this.view.byteLength}]`,
        offset,
        0,
        this.view.byteLength,
        label
      );
    }
    this.pos = offset;
    return this;
  }
  skip(count, label) {
    this.check(this.pos, count, label);
    this.pos += count;
    return this;
  }
  /** Throws unless `[offset, offset + length)` lies inside the window. */
  check(offset, length2, label) {
    if (!Number.isInteger(offset) || !Number.isInteger(length2) || offset < 0 || length2 < 0 || offset + length2 > this.view.byteLength) {
      const what = label ? `${label}: ` : "";
      throw new BinaryReadError(
        `${what}read of ${length2} byte(s) at ${hex(offset)} exceeds buffer of ${this.view.byteLength} byte(s)`,
        offset,
        length2,
        this.view.byteLength,
        label
      );
    }
  }
  /** Returns `true` if `[offset, offset + length)` lies inside the window. */
  inBounds(offset, length2) {
    return Number.isInteger(offset) && Number.isInteger(length2) && offset >= 0 && length2 >= 0 && offset + length2 <= this.view.byteLength;
  }
  // ---- absolute reads (do not move the cursor) ----
  u8At(offset, label) {
    this.check(offset, 1, label);
    return this.view.getUint8(offset);
  }
  i8At(offset, label) {
    this.check(offset, 1, label);
    return this.view.getInt8(offset);
  }
  u16At(offset, label) {
    this.check(offset, 2, label);
    return this.view.getUint16(offset, this.littleEndian);
  }
  i16At(offset, label) {
    this.check(offset, 2, label);
    return this.view.getInt16(offset, this.littleEndian);
  }
  u32At(offset, label) {
    this.check(offset, 4, label);
    return this.view.getUint32(offset, this.littleEndian);
  }
  i32At(offset, label) {
    this.check(offset, 4, label);
    return this.view.getInt32(offset, this.littleEndian);
  }
  f32At(offset, label) {
    this.check(offset, 4, label);
    return this.view.getFloat32(offset, this.littleEndian);
  }
  f64At(offset, label) {
    this.check(offset, 8, label);
    return this.view.getFloat64(offset, this.littleEndian);
  }
  /** 64-bit unsigned integer; throws if it does not fit a safe JS integer. */
  u64At(offset, label) {
    this.check(offset, 8, label);
    const v = this.view.getBigUint64(offset, this.littleEndian);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BinaryReadError(
        `${label ? label + ": " : ""}u64 value ${v} at ${hex(offset)} exceeds 2^53-1`,
        offset,
        8,
        this.view.byteLength,
        label
      );
    }
    return Number(v);
  }
  /** Copy of `length` bytes at `offset`. */
  bytesAt(offset, length2, label) {
    this.check(offset, length2, label);
    return this.bytes.slice(offset, offset + length2);
  }
  /** Zero-copy view of `length` bytes at `offset` (shares memory with the source). */
  viewAt(offset, length2, label) {
    this.check(offset, length2, label);
    return this.bytes.subarray(offset, offset + length2);
  }
  /** `count` float32 values starting at `offset` (copied, alignment-independent). */
  f32ArrayAt(offset, count, label) {
    this.check(offset, count * 4, label);
    if (this.fastPath) return new Float32Array(this.copyBytes(offset, count * 4));
    const out = new Float32Array(count);
    for (let i2 = 0; i2 < count; i2++)
      out[i2] = this.view.getFloat32(offset + i2 * 4, this.littleEndian);
    return out;
  }
  i32ArrayAt(offset, count, label) {
    this.check(offset, count * 4, label);
    if (this.fastPath) return new Int32Array(this.copyBytes(offset, count * 4));
    const out = new Int32Array(count);
    for (let i2 = 0; i2 < count; i2++) out[i2] = this.view.getInt32(offset + i2 * 4, this.littleEndian);
    return out;
  }
  u32ArrayAt(offset, count, label) {
    this.check(offset, count * 4, label);
    const out = new Uint32Array(count);
    for (let i2 = 0; i2 < count; i2++) out[i2] = this.view.getUint32(offset + i2 * 4, this.littleEndian);
    return out;
  }
  u16ArrayAt(offset, count, label) {
    this.check(offset, count * 2, label);
    if (this.fastPath) return new Uint16Array(this.copyBytes(offset, count * 2));
    const out = new Uint16Array(count);
    for (let i2 = 0; i2 < count; i2++) out[i2] = this.view.getUint16(offset + i2 * 2, this.littleEndian);
    return out;
  }
  i16ArrayAt(offset, count, label) {
    this.check(offset, count * 2, label);
    const out = new Int16Array(count);
    for (let i2 = 0; i2 < count; i2++) out[i2] = this.view.getInt16(offset + i2 * 2, this.littleEndian);
    return out;
  }
  /**
   * Fixed-size, NUL-padded string field decoded as UTF-8. Bytes after the first
   * NUL are ignored.
   */
  fixedStringAt(offset, size, label) {
    const raw = this.viewAt(offset, size, label);
    let end = raw.indexOf(0);
    if (end < 0) end = size;
    return decodeUtf8(raw.subarray(0, end));
  }
  // ---- sequential reads (advance the cursor) ----
  u8(label) {
    const v = this.u8At(this.pos, label);
    this.pos += 1;
    return v;
  }
  i8(label) {
    const v = this.i8At(this.pos, label);
    this.pos += 1;
    return v;
  }
  u16(label) {
    const v = this.u16At(this.pos, label);
    this.pos += 2;
    return v;
  }
  i16(label) {
    const v = this.i16At(this.pos, label);
    this.pos += 2;
    return v;
  }
  u32(label) {
    const v = this.u32At(this.pos, label);
    this.pos += 4;
    return v;
  }
  i32(label) {
    const v = this.i32At(this.pos, label);
    this.pos += 4;
    return v;
  }
  f32(label) {
    const v = this.f32At(this.pos, label);
    this.pos += 4;
    return v;
  }
  f64(label) {
    const v = this.f64At(this.pos, label);
    this.pos += 8;
    return v;
  }
  u64(label) {
    const v = this.u64At(this.pos, label);
    this.pos += 8;
    return v;
  }
  readBytes(length2, label) {
    const v = this.bytesAt(this.pos, length2, label);
    this.pos += length2;
    return v;
  }
  fixedString(size, label) {
    const v = this.fixedStringAt(this.pos, size, label);
    this.pos += size;
    return v;
  }
  /** Advances the cursor to the next multiple of `alignment`. */
  align(alignment, label) {
    const rem = this.pos % alignment;
    if (rem !== 0) this.skip(alignment - rem, label);
    return this;
  }
  /** Copies bytes into a fresh, aligned ArrayBuffer. */
  copyBytes(offset, length2) {
    const out = new Uint8Array(length2);
    out.set(this.bytes.subarray(offset, offset + length2));
    return out.buffer;
  }
  /** A reader over a sub-range of this one (offsets in the child start at 0). */
  slice(offset, length2, label) {
    this.check(offset, length2, label);
    return new _ByteReader(this.view, offset, length2, this.littleEndian);
  }
};

// src/core/moc/read.ts
var MocFormatError = class extends Error {
  constructor(message, code = "invalid") {
    super(message);
    this.code = code;
    this.name = "MocFormatError";
  }
  code;
};
function fail(message, code = "invalid") {
  throw new MocFormatError(message, code);
}
function readNames(r, offset, count, field) {
  const out = new Array(count);
  for (let i2 = 0; i2 < count; i2++) {
    const raw = r.viewAt(offset + i2 * 64, 64, field.key);
    const end = raw.indexOf(0);
    if (end < 0)
      fail(`${field.key}[${i2}]: name has no NUL terminator within 64 bytes`, "name-terminator");
    out[i2] = decodeUtf8(raw.subarray(0, end));
  }
  return out;
}
function readMocSections(data, options = {}) {
  try {
    return readUnchecked(data, options.lenient === true);
  } catch (e) {
    if (e instanceof MocFormatError) throw e;
    if (e instanceof BinaryReadError) throw new MocFormatError(e.message, "section-bounds");
    throw e;
  }
}
function readUnchecked(data, lenient) {
  const issues = [];
  const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
  const byteLength = bytes.byteLength;
  if (byteLength < HEADER_SIZE)
    fail(`file is ${byteLength} bytes, shorter than the 64-byte header`, "file-length");
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAGIC) fail(`bad magic ${JSON.stringify(magic)} (expected "MOC3")`, "magic");
  const version = bytes[4];
  if (version < MIN_VERSION || version > MAX_VERSION) {
    fail(
      `unsupported file version ${version} (supported ${MIN_VERSION}\u2013${MAX_VERSION})`,
      "version"
    );
  }
  if (byteLength % 64 !== 0) {
    const message = `file length ${byteLength} is not a multiple of 64`;
    if (!lenient) fail(message, "file-length");
    issues.push({ code: "file-length", message });
  }
  const bigEndian = bytes[5] !== 0;
  const r = new ByteReader(bytes, 0, byteLength, !bigEndian);
  const slotCount = slotTableLength(version);
  if (HEADER_SIZE + slotCount * 4 > byteLength) {
    fail(`offset table (${slotCount} slots) extends past end of file`, "section-bounds");
  }
  const slots = r.u32ArrayAt(HEADER_SIZE, slotCount, "offset table");
  const countOffset = slots[COUNT_TABLE_SLOT];
  const countEntries = countTableLength(version);
  if (countOffset + countEntries * 4 > byteLength)
    fail(`count table at ${countOffset} extends past end of file`, "section-bounds");
  const rawCounts = r.i32ArrayAt(countOffset, countEntries, "count table");
  const counts = new Int32Array(countEntries);
  for (let i2 = 0; i2 < countEntries; i2++) {
    if (countSince(i2) > version) continue;
    const n = rawCounts[i2];
    if (n < 0) fail(`negative count ${n} for ${COUNT_NAMES[i2] ?? `count ${i2}`}`, "negative-count");
    counts[i2] = n;
  }
  const canvasOffset = slots[CANVAS_SLOT];
  if (canvasOffset + CANVAS_BLOCK_SIZE > byteLength)
    fail(`canvas block at ${canvasOffset} extends past end of file`, "section-bounds");
  const canvas = {
    pixelsPerUnit: r.f32At(canvasOffset),
    originX: r.f32At(canvasOffset + 4),
    originY: r.f32At(canvasOffset + 8),
    width: r.f32At(canvasOffset + 12),
    height: r.f32At(canvasOffset + 16),
    flags: r.u8At(canvasOffset + 20)
  };
  const fields = /* @__PURE__ */ new Map();
  const sections = [
    {
      slot: COUNT_TABLE_SLOT,
      what: "count table",
      start: countOffset,
      end: countOffset + countEntries * 4
    },
    {
      slot: CANVAS_SLOT,
      what: "canvas block",
      start: canvasOffset,
      end: canvasOffset + CANVAS_BLOCK_SIZE
    }
  ];
  for (const field of fieldsForVersion(version)) {
    const count = counts[field.count];
    const offset = slots[field.slot];
    const size = count * ELEMENT_SIZE[field.type];
    if (count > 0 && offset + size > byteLength) {
      fail(
        `section ${field.key} (slot ${field.slot}, ${count} \xD7 ${ELEMENT_SIZE[field.type]} bytes at ${offset}) extends past end of file (${byteLength} bytes)`,
        "section-bounds"
      );
    }
    if (size > 0)
      sections.push({
        slot: field.slot,
        what: `section ${field.key}`,
        start: offset,
        end: offset + size
      });
    let value;
    switch (field.type) {
      case "placeholder":
        value = null;
        break;
      case "name":
        value = readNames(r, offset, count, field);
        break;
      case "i32":
        value = count ? r.i32ArrayAt(offset, count, field.key) : new Int32Array(0);
        break;
      case "f32":
        value = count ? r.f32ArrayAt(offset, count, field.key) : new Float32Array(0);
        break;
      case "u16":
        value = count ? r.u16ArrayAt(offset, count, field.key) : new Uint16Array(0);
        break;
      case "u8":
        value = count ? r.bytesAt(offset, count, field.key) : new Uint8Array(0);
        break;
    }
    fields.set(field.key, value);
  }
  const order = slotOrderProblem(sections, HEADER_SIZE + slotCount * 4);
  if (order) {
    if (!lenient) fail(order, "slot-order");
    issues.push({ code: "slot-order", message: order });
  }
  return { version, bigEndian, byteLength, counts, canvas, fields, issues };
}
function slotOrderProblem(sections, tableEnd) {
  const inOrder = [...sections].sort((a, b) => a.slot - b.slot);
  let prev = { what: "the offset table", slot: -1, end: tableEnd };
  for (const s of inOrder) {
    if (s.start < prev.end)
      return `${s.what} (slot ${s.slot}) starts at byte ${s.start}, before the end (${prev.end}) of ${prev.slot >= 0 ? `${prev.what} (slot ${prev.slot})` : prev.what}: sections must be in slot order without overlaps`;
    prev = s;
  }
  return null;
}
var SectionAccess = class {
  constructor(sections) {
    this.sections = sections;
  }
  sections;
  has(key) {
    return this.sections.fields.has(key);
  }
  i32(key) {
    const v = this.sections.fields.get(key);
    if (v === void 0) return new Int32Array(0);
    if (!(v instanceof Int32Array)) throw new Error(`${key} is not an i32 field`);
    return v;
  }
  f32(key) {
    const v = this.sections.fields.get(key);
    if (v === void 0) return new Float32Array(0);
    if (!(v instanceof Float32Array)) throw new Error(`${key} is not an f32 field`);
    return v;
  }
  u16(key) {
    const v = this.sections.fields.get(key);
    if (v === void 0) return new Uint16Array(0);
    if (!(v instanceof Uint16Array)) throw new Error(`${key} is not a u16 field`);
    return v;
  }
  u8(key) {
    const v = this.sections.fields.get(key);
    if (v === void 0) return new Uint8Array(0);
    if (!(v instanceof Uint8Array)) throw new Error(`${key} is not a u8 field`);
    return v;
  }
  names(key) {
    const v = this.sections.fields.get(key);
    if (v === void 0) return [];
    if (!Array.isArray(v)) throw new Error(`${key} is not a name field`);
    return v;
  }
  count(index) {
    return this.sections.counts[index] ?? 0;
  }
};

// src/core/eval/f32.ts
var fr = Math.fround;
var KEY_EPSILON = fr(1e-3);
function keyTolerance(decimals) {
  return decimals >= 0 ? fr(Number(`1e-${decimals}`)) : fr(10 ** -decimals);
}
var DRAW_ORDER_TOLERANCE = fr(1e-3);
var TARGET_DRAW_ORDER_MAX = 1e3;
function keyformDrawOrder(v, target2, version) {
  const n = Math.trunc(fr(v + DRAW_ORDER_TOLERANCE));
  if (!target2 || version < 5) return n;
  return Math.min(TARGET_DRAW_ORDER_MAX, Math.max(0, Math.trunc(fr(n + DRAW_ORDER_TOLERANCE))));
}
function clampTarget(x2, lo, hi) {
  return x2 < lo ? lo : x2 > hi ? hi : x2;
}
var TARGET_SCALE_MIN = fr(1e-4);
var TARGET_SCALE_MAX = 100;
var TARGET_ANGLE_LIMIT = 3600;
var PI_32 = fr(Math.PI);
var TWO_PI_32 = fr(2 * Math.PI);
var HALF_PI_32 = fr(Math.PI / 2);
function radians32(degrees) {
  return fr(fr(degrees * PI_32) / 180);
}

// src/core/moc/structure.ts
var Report = class {
  constructor(strict) {
    this.strict = strict;
  }
  strict;
  list = [];
  error(level, code, kind2, message, index, field) {
    if (level === "official" || this.strict)
      this.list.push({
        code,
        severity: "error",
        kind: kind2,
        ...index !== void 0 ? { index } : {},
        ...field !== void 0 ? { field } : {},
        message
      });
  }
  warn(code, kind2, message, index, field) {
    if (this.strict)
      this.list.push({
        code,
        severity: "warning",
        kind: kind2,
        ...index !== void 0 ? { index } : {},
        ...field !== void 0 ? { field } : {},
        message
      });
  }
  get errors() {
    return this.list.filter((d) => d.severity === "error").length;
  }
};
function checkStructure(d, v, r) {
  const ids = (kind2, i2) => {
    const id = d[kind2].ids[i2];
    return id !== void 0 ? ` (${id})` : "";
  };
  const name2 = (kind2, i2) => kind2 === "parts" || kind2 === "deformers" || kind2 === "artMeshes" || kind2 === "parameters" || kind2 === "glues" ? `${kind2}[${i2}]${ids(kind2, i2)}` : `${kind2}[${i2}]`;
  const isIndex = (x2, lo, hi) => Number.isInteger(x2) && x2 >= lo && x2 < hi;
  const index = (level, kind2, i2, field, value, lo, hi, target2) => {
    if (isIndex(value, lo, hi)) return true;
    r.error(
      level,
      "index-out-of-range",
      kind2,
      `${name2(kind2, i2)}${field ? `.${field}` : ""} = ${value} is out of range [${lo}, ${hi}) of ${target2}`,
      i2,
      field
    );
    return false;
  };
  const range = (level, kind2, i2, field, first, count, total, target2) => {
    if (count < 0) {
      r.error(
        level,
        "negative-count",
        kind2,
        `${name2(kind2, i2)}: negative count ${count} for ${target2}`,
        i2,
        field
      );
      return false;
    }
    if (count === 0) return true;
    if (first >= 0 && first + count <= total) return true;
    r.error(
      level,
      "range-out-of-bounds",
      kind2,
      `${name2(kind2, i2)}.${field}: [${first}, ${first + count}) is out of bounds of ${target2} (0\u2026${total})`,
      i2,
      field
    );
    return false;
  };
  const n = {
    parts: d.parts.ids.length,
    deformers: d.deformers.ids.length,
    warps: d.warpDeformers.band.length,
    rotations: d.rotationDeformers.band.length,
    meshes: d.artMeshes.ids.length,
    parameters: d.parameters.ids.length,
    partKeyforms: d.partKeyforms.drawOrder.length,
    warpKeyforms: d.warpKeyforms.opacity.length,
    rotationKeyforms: d.rotationKeyforms.opacity.length,
    meshKeyforms: d.artMeshKeyforms.opacity.length,
    positions: d.keyformPositions.length,
    bindingEntries: d.bindingIndices.length,
    bands: d.bands.firstEntry.length,
    bindings: d.parameterBindings.firstKey.length,
    keys: d.keys.length,
    uvs: d.uvs.length,
    triangles: d.triangleIndices.length,
    masks: d.maskEntries.length,
    groups: d.drawOrderGroups.firstObject.length,
    groupObjects: d.drawOrderGroupObjects.kind.length,
    glues: d.glues.ids.length,
    glueInfo: d.glueInfo.weight.length,
    glueKeyforms: d.glueKeyforms.intensity.length,
    multiplyColors: d.multiplyColors?.r.length ?? 0,
    screenColors: d.screenColors?.r.length ?? 0,
    offscreens: d.offscreens?.part.length ?? 0,
    offscreenKeyforms: d.offscreenKeyforms?.opacity.length ?? 0
  };
  if (!(d.canvas.pixelsPerUnit > 0))
    r.warn(
      "canvas",
      "canvas",
      `canvas.pixelsPerUnit = ${d.canvas.pixelsPerUnit} is not positive`,
      void 0,
      "pixelsPerUnit"
    );
  const flags = (kind2, field, values) => {
    for (let i2 = 0; i2 < values.length; i2++)
      if (values[i2] !== 0 && values[i2] !== 1)
        r.error(
          "official",
          "flag-value",
          kind2,
          `${name2(kind2, i2)}.${field} = ${values[i2]}, but a flag is 0 or 1`,
          i2,
          field
        );
  };
  flags("parts", "initiallyVisible", d.parts.initiallyVisible);
  flags("parts", "enabled", d.parts.enabled);
  flags("deformers", "visible", d.deformers.visible);
  flags("deformers", "enabled", d.deformers.enabled);
  flags("artMeshes", "visible", d.artMeshes.visible);
  flags("artMeshes", "enabled", d.artMeshes.enabled);
  flags("parameters", "repeat", d.parameters.repeat);
  const keys = d.keys;
  const bindingKeyCount = new Int32Array(n.bindings).fill(-1);
  const keysOk = (kind2, i2, firstField, first, count) => {
    if (!range("strict", kind2, i2, firstField, first, count, n.keys, "keys")) return false;
    for (let k = first + 1; k < first + count; k++)
      if (!(keys[k] > keys[k - 1])) {
        r.error(
          "strict",
          "keys-unsorted",
          kind2,
          `${name2(kind2, i2)}: keys are not strictly ascending (${keys[k - 1]} then ${keys[k]})`,
          i2,
          firstField
        );
        return false;
      }
    return true;
  };
  for (let b = 0; b < n.bindings; b++) {
    const first = d.parameterBindings.firstKey[b];
    const count = d.parameterBindings.keyCount[b];
    if (count === 0) {
      r.error(
        "strict",
        "no-keys",
        "parameterBindings",
        `parameterBindings[${b}]: has no keys`,
        b,
        "keyCount"
      );
      continue;
    }
    if (keysOk("parameterBindings", b, "firstKey", first, count)) bindingKeyCount[b] = count;
  }
  const bindingOwner = new Int32Array(n.bindings).fill(-1);
  for (let p = 0; p < n.parameters; p++) {
    const min = d.parameters.min[p];
    const max2 = d.parameters.max[p];
    const def = d.parameters.defaultValue[p];
    if (min > max2)
      r.error(
        "strict",
        "min-above-max",
        "parameters",
        `${name2("parameters", p)}: min ${min} > max ${max2}`,
        p,
        "min"
      );
    else if (def < min || def > max2)
      r.warn(
        "default-outside-range",
        "parameters",
        `${name2("parameters", p)}: default ${def} is outside [${min}, ${max2}]`,
        p,
        "defaultValue"
      );
    if (d.parameters.decimals[p] < 0)
      r.error(
        "official",
        "value-range",
        "parameters",
        `${name2("parameters", p)}.decimals = ${d.parameters.decimals[p]} is negative (S6)`,
        p,
        "decimals"
      );
    const first = d.parameters.firstBinding[p];
    const count = d.parameters.bindingCount[p];
    if (range(
      "strict",
      "parameters",
      p,
      "firstBinding",
      first,
      count,
      n.bindings,
      "parameterBindings"
    ))
      for (let b = first; b < first + count; b++) {
        if (bindingOwner[b] !== -1)
          r.error(
            "strict",
            "binding-ownership",
            "parameterBindings",
            `parameterBindings[${b}] is owned by parameters ${bindingOwner[b]} and ${p}`,
            b
          );
        else bindingOwner[b] = p;
      }
    if (v >= 4) {
      const t = d.parameters.type[p];
      if (t !== 0 && t !== 1)
        r.error(
          "strict",
          "parameter-type",
          "parameters",
          `${name2("parameters", p)}.type = ${t} (0 = normal, 1 = blend shape)`,
          p,
          "type"
        );
      range(
        "strict",
        "parameters",
        p,
        "firstKey",
        d.parameters.firstKey[p],
        d.parameters.keyCount[p],
        n.keys,
        "keys"
      );
    }
  }
  for (let b = 0; b < n.bindings; b++)
    if (bindingOwner[b] === -1)
      r.error(
        "strict",
        "binding-ownership",
        "parameterBindings",
        `parameterBindings[${b}] is owned by no parameter`,
        b
      );
  for (let e = 0; e < n.bindingEntries; e++)
    index(
      "official",
      "bindingIndices",
      e,
      void 0,
      d.bindingIndices[e],
      0,
      n.bindings,
      "parameterBindings"
    );
  const bandKeyforms = new Float64Array(n.bands).fill(-1);
  for (let b = 0; b < n.bands; b++) {
    const first = d.bands.firstEntry[b];
    const count = d.bands.entryCount[b];
    if (!range("strict", "bands", b, "firstEntry", first, count, n.bindingEntries, "bindingIndices"))
      continue;
    let size = 1;
    let ok = true;
    for (let j = first; j < first + count; j++) {
      const binding = d.bindingIndices[j];
      const keyCount = isIndex(binding, 0, n.bindings) ? bindingKeyCount[binding] : -1;
      if (keyCount < 0) {
        ok = false;
        break;
      }
      size *= keyCount;
    }
    if (!ok) continue;
    if (size > 2147483647) {
      r.error(
        "strict",
        "band-overflow",
        "bands",
        `bands[${b}]: keyform count ${size} overflows`,
        b
      );
      continue;
    }
    bandKeyforms[b] = size;
  }
  const keyforms = (kind2, i2, band, first, count, total, target2) => {
    const bandOk = index("official", kind2, i2, "band", band, 0, n.bands, "bands");
    const rangeOk = range("strict", kind2, i2, "firstKeyform", first, count, total, target2);
    if (bandOk && bandKeyforms[band] >= 0 && count !== bandKeyforms[band])
      r.error(
        "strict",
        "keyform-count",
        kind2,
        `${name2(kind2, i2)}: ${count} keyforms, but its band's bindings need ${bandKeyforms[band]}`,
        i2,
        "keyformCount"
      );
    return rangeOk;
  };
  const colorsN = Math.min(n.multiplyColors, n.screenColors);
  const normalOwner = (count) => new Int32Array(count).fill(-1);
  const warpNormal = normalOwner(n.warpKeyforms);
  const rotationNormal = normalOwner(n.rotationKeyforms);
  const meshNormal = normalOwner(n.meshKeyforms);
  const colors = (kind2, i2, first, count, firstColor, keyformKind, owner) => {
    const end = Math.min(owner.length, first + count);
    for (let k = Math.max(0, first); k < end; k++) owner[k] = i2;
    if (v < 4 || !firstColor) return;
    const fc = firstColor[i2];
    if (fc < 0)
      r.error(
        "official",
        "index-out-of-range",
        kind2,
        `${name2(kind2, i2)}.firstColor = ${fc} is negative`,
        i2,
        "firstColor"
      );
    else range("official", kind2, i2, "firstColor", fc, count, colorsN, "the color entries");
    if (v < 5) return;
    const kf = d[keyformKind];
    for (let p = 0; p < count; p++) {
      const k = first + p;
      if (k < 0 || k >= kf.opacity.length) break;
      const m = kf.multiplyColor[k];
      const s = kf.screenColor[k];
      if (m !== fc + p || s !== fc + p)
        r.warn(
          "color-index",
          keyformKind,
          `${keyformKind}[${k}]: color indices ${m}/${s}, but the runtime uses ${name2(kind2, i2)}'s first color entry + ${p} = ${fc + p} for both (C5)`,
          k,
          "multiplyColor"
        );
    }
  };
  const keyformColorIndices = (keyformKind) => {
    if (v < 5) return;
    const kf = d[keyformKind];
    for (const [field, N] of [
      ["multiplyColor", n.multiplyColors],
      ["screenColor", n.screenColors]
    ]) {
      const values = kf[field];
      for (let k = 0; k < values.length; k++) {
        const x2 = values[k];
        if (x2 >= 0 && x2 < N) continue;
        r.error(
          x2 === N ? "strict" : "official",
          "index-out-of-range",
          keyformKind,
          `${keyformKind}[${k}].${field} = ${x2} is out of range [0, ${N}) of the color entries${x2 === N ? " (the official check accepts N)" : ""}`,
          k,
          field
        );
      }
    }
  };
  const partOffscreen = d.parts.offscreen ?? new Int32Array(n.parts).fill(-1);
  for (let p = 0; p < n.parts; p++) {
    const parent = d.parts.parent[p];
    if (index("official", "parts", p, "parent", parent, -1, n.parts, "parts") && !(parent < p))
      r.error(
        "strict",
        "parent-order",
        "parts",
        `${name2("parts", p)}.parent = ${parent} must be -1 or an earlier part`,
        p,
        "parent"
      );
    keyforms(
      "parts",
      p,
      d.parts.band[p],
      d.parts.firstKeyform[p],
      d.parts.keyformCount[p],
      n.partKeyforms,
      "partKeyforms"
    );
    if (v >= 6)
      index("strict", "parts", p, "offscreen", partOffscreen[p], -1, n.offscreens, "offscreens");
  }
  for (let i2 = 0; i2 < n.deformers; i2++) {
    const kind2 = d.deformers.kind[i2];
    if (kind2 !== 0 && kind2 !== 1)
      r.error(
        "official",
        "kind",
        "deformers",
        `${name2("deformers", i2)}.kind = ${kind2} (0 = warp, 1 = rotation)`,
        i2,
        "kind"
      );
    else
      index(
        "official",
        "deformers",
        i2,
        "kindIndex",
        d.deformers.kindIndex[i2],
        0,
        kind2 === 0 ? n.warps : n.rotations,
        kind2 === 0 ? "warpDeformers" : "rotationDeformers"
      );
    index("official", "deformers", i2, "part", d.deformers.part[i2], -1, n.parts, "parts");
    const parent = d.deformers.parent[i2];
    if (index("official", "deformers", i2, "parent", parent, -1, n.deformers, "deformers") && !(parent < i2))
      r.error(
        "strict",
        "parent-order",
        "deformers",
        `${name2("deformers", i2)}.parent = ${parent} must be -1 or an earlier deformer`,
        i2,
        "parent"
      );
    const band = d.deformers.band[i2];
    if (index("official", "deformers", i2, "band", band, 0, n.bands, "bands")) {
      const k = d.deformers.kindIndex[i2];
      const own = kind2 === 0 && isIndex(k, 0, n.warps) ? d.warpDeformers.band[k] : kind2 === 1 && isIndex(k, 0, n.rotations) ? d.rotationDeformers.band[k] : band;
      if (own !== band)
        r.warn(
          "band-mismatch",
          "deformers",
          `${name2("deformers", i2)}.band = ${band}, but its ${kind2 === 0 ? "warp" : "rotation"} record has band ${own}, which is the one evaluated`,
          i2,
          "band"
        );
    }
  }
  const positionRuns = [];
  for (let w = 0; w < n.warps; w++) {
    const R = d.warpDeformers.rows[w];
    const C = d.warpDeformers.columns[w];
    const points = d.warpDeformers.pointCount[w];
    if (!(R >= 1 && C >= 1))
      r.error(
        "strict",
        "grid-size",
        "warpDeformers",
        `warpDeformers[${w}]: grid of ${R}\xD7${C} cells`,
        w,
        "rows"
      );
    if (points !== (R + 1) * (C + 1))
      r.error(
        "official",
        "grid-points",
        "warpDeformers",
        `warpDeformers[${w}]: ${points} grid points, but (rows+1)(columns+1) = ${(R + 1) * (C + 1)}`,
        w,
        "pointCount"
      );
    const first = d.warpDeformers.firstKeyform[w];
    const count = d.warpDeformers.keyformCount[w];
    if (keyforms(
      "warpDeformers",
      w,
      d.warpDeformers.band[w],
      first,
      count,
      n.warpKeyforms,
      "warpKeyforms"
    ))
      for (let k = first; k < first + count; k++)
        positionRuns.push({
          kind: "warpDeformers",
          i: w,
          keyform: "warpKeyforms",
          k,
          floats: 2 * points
        });
    colors(
      "warpDeformers",
      w,
      first,
      count,
      d.warpDeformers.firstColor,
      "warpKeyforms",
      warpNormal
    );
  }
  for (let i2 = 0; i2 < n.rotations; i2++) {
    const first = d.rotationDeformers.firstKeyform[i2];
    const count = d.rotationDeformers.keyformCount[i2];
    keyforms(
      "rotationDeformers",
      i2,
      d.rotationDeformers.band[i2],
      first,
      count,
      n.rotationKeyforms,
      "rotationKeyforms"
    );
    colors(
      "rotationDeformers",
      i2,
      first,
      count,
      d.rotationDeformers.firstColor,
      "rotationKeyforms",
      rotationNormal
    );
  }
  const meshes = d.artMeshes;
  const maskEntries = (kind2, i2, first, count) => {
    range("strict", kind2, i2, "firstMask", first, count, n.masks, "maskEntries");
  };
  for (let e = 0; e < n.masks; e++) {
    const m = d.maskEntries[e];
    if (!isIndex(m, -1, n.meshes))
      r.error(
        "official",
        "index-out-of-range",
        "maskEntries",
        `maskEntries[${e}] = ${m} is not an art mesh (\u22121 or 0\u2026${n.meshes - 1})`,
        e
      );
  }
  for (let m = 0; m < n.meshes; m++) {
    const V = meshes.vertexCount[m];
    if (V < 0)
      r.error(
        "strict",
        "value-range",
        "artMeshes",
        `${name2("artMeshes", m)}: negative vertex count ${V}`,
        m,
        "vertexCount"
      );
    const first = meshes.firstKeyform[m];
    const count = meshes.keyformCount[m];
    if (keyforms("artMeshes", m, meshes.band[m], first, count, n.meshKeyforms, "artMeshKeyforms") && V >= 0)
      for (let k = first; k < first + count; k++)
        positionRuns.push({
          kind: "artMeshes",
          i: m,
          keyform: "artMeshKeyforms",
          k,
          floats: 2 * V
        });
    index("strict", "artMeshes", m, "part", meshes.part[m], -1, n.parts, "parts");
    index(
      "official",
      "artMeshes",
      m,
      "deformer",
      meshes.deformer[m],
      -1,
      n.deformers,
      "deformers"
    );
    if (meshes.texture[m] < 0)
      r.error(
        "official",
        "texture-negative",
        "artMeshes",
        `${name2("artMeshes", m)}.texture = ${meshes.texture[m]} is negative`,
        m,
        "texture"
      );
    range(
      "official",
      "artMeshes",
      m,
      "firstUv",
      meshes.firstUv[m],
      2 * Math.max(V, 0),
      n.uvs,
      "uvs"
    );
    const tFirst = meshes.firstTriangleIndex[m];
    const tCount = meshes.triangleIndexCount[m];
    if (range(
      "strict",
      "artMeshes",
      m,
      "firstTriangleIndex",
      tFirst,
      tCount,
      n.triangles,
      "triangleIndices"
    )) {
      if (tCount % 3 !== 0)
        r.error(
          "strict",
          "triangle-count",
          "artMeshes",
          `${name2("artMeshes", m)}: ${tCount} triangle indices, not a multiple of 3`,
          m,
          "triangleIndexCount"
        );
      for (let t = tFirst; t < tFirst + tCount; t++)
        if (d.triangleIndices[t] >= V) {
          r.error(
            "strict",
            "triangle-index",
            "artMeshes",
            `${name2("artMeshes", m)}: triangle index ${d.triangleIndices[t]} \u2265 vertex count ${V}`,
            m,
            "firstTriangleIndex"
          );
          break;
        }
    }
    maskEntries("artMeshes", m, meshes.firstMask[m], meshes.maskCount[m]);
    colors("artMeshes", m, first, count, meshes.firstColor, "artMeshKeyforms", meshNormal);
  }
  keyformColorIndices("warpKeyforms");
  keyformColorIndices("rotationKeyforms");
  keyformColorIndices("artMeshKeyforms");
  for (let g = 0; g < n.glues; g++) {
    const gl = d.glues;
    keyforms(
      "glues",
      g,
      gl.band[g],
      gl.firstKeyform[g],
      gl.keyformCount[g],
      n.glueKeyforms,
      "glueKeyforms"
    );
    const aOk = index("strict", "glues", g, "artMeshA", gl.artMeshA[g], 0, n.meshes, "artMeshes");
    const bOk = index("strict", "glues", g, "artMeshB", gl.artMeshB[g], 0, n.meshes, "artMeshes");
    const first = gl.firstInfo[g];
    const count = gl.infoCount[g];
    if (!range("strict", "glues", g, "firstInfo", first, count, n.glueInfo, "glueInfo")) continue;
    if (count % 2 !== 0) {
      r.error(
        "strict",
        "glue-pairs",
        "glues",
        `${name2("glues", g)}: odd glue-info count ${count} (2 per vertex pair)`,
        g,
        "infoCount"
      );
      continue;
    }
    for (let e = first; e < first + count; e += 2) {
      if (aOk && d.glueInfo.vertex[e] >= meshes.vertexCount[gl.artMeshA[g]])
        r.error(
          "strict",
          "index-out-of-range",
          "glueInfo",
          `glueInfo[${e}].vertex = ${d.glueInfo.vertex[e]} is not a vertex of art mesh A of ${name2("glues", g)}`,
          e,
          "vertex"
        );
      if (bOk && d.glueInfo.vertex[e + 1] >= meshes.vertexCount[gl.artMeshB[g]])
        r.error(
          "strict",
          "index-out-of-range",
          "glueInfo",
          `glueInfo[${e + 1}].vertex = ${d.glueInfo.vertex[e + 1]} is not a vertex of art mesh B of ${name2("glues", g)}`,
          e + 1,
          "vertex"
        );
    }
  }
  const partOffscreenKeyform = d.partKeyforms.offscreenKeyform ?? new Int32Array(n.partKeyforms).fill(-1);
  if (v >= 6 && d.offscreens && d.offscreenKeyforms) {
    const o = d.offscreens;
    for (let i2 = 0; i2 < n.offscreens; i2++) {
      if (index("strict", "offscreens", i2, "part", o.part[i2], 0, n.parts, "parts") && partOffscreen[o.part[i2]] !== i2)
        r.error(
          "strict",
          "offscreen-link",
          "offscreens",
          `offscreens[${i2}]: its part ${o.part[i2]} does not point back to it`,
          i2,
          "part"
        );
      maskEntries("offscreens", i2, o.firstMask[i2], o.maskCount[i2]);
    }
    for (let p = 0; p < n.parts; p++) {
      const off = partOffscreen[p];
      if (isIndex(off, 0, n.offscreens) && o.part[off] !== p)
        r.error(
          "strict",
          "offscreen-link",
          "parts",
          `${name2("parts", p)}.offscreen = ${off}, but that offscreen names part ${o.part[off]}`,
          p,
          "offscreen"
        );
    }
    for (let k = 0; k < n.partKeyforms; k++)
      index(
        "official",
        "partKeyforms",
        k,
        "offscreenKeyform",
        partOffscreenKeyform[k],
        -1,
        n.offscreenKeyforms,
        "offscreenKeyforms"
      );
    const okColors = Int32Array.from(d.offscreenKeyforms.multiplyColor);
    const okScreen = Int32Array.from(d.offscreenKeyforms.screenColor);
    for (let p = 0; p < n.parts; p++) {
      if (partOffscreen[p] < 0) continue;
      const first = d.parts.firstKeyform[p];
      const count = d.parts.keyformCount[p];
      if (!(first >= 0 && first + count <= n.partKeyforms)) continue;
      const base = partOffscreenKeyform[first];
      for (let j = 0; j < count; j++) {
        const ok = partOffscreenKeyform[first + j];
        if (isIndex(ok, 0, n.offscreenKeyforms) && isIndex(base, 0, n.offscreenKeyforms)) {
          okColors[ok] = d.offscreenKeyforms.multiplyColor[base] + j;
          okScreen[ok] = d.offscreenKeyforms.multiplyColor[base] + j;
        }
      }
    }
    for (let k = 0; k < n.offscreenKeyforms; k++) {
      index(
        "strict",
        "offscreenKeyforms",
        k,
        "multiplyColor",
        okColors[k],
        0,
        n.multiplyColors,
        "multiplyColors"
      );
      index(
        "strict",
        "offscreenKeyforms",
        k,
        "screenColor",
        okScreen[k],
        0,
        n.screenColors,
        "screenColors"
      );
    }
  }
  const blendShapeTargets = (t, objects) => {
    const out = new Uint8Array(objects);
    if (t) {
      for (let i2 = 0; i2 < t.object.length; i2++)
        if (t.bindingCount[i2] > 0 && isIndex(t.object[i2], 0, objects)) out[t.object[i2]] = 1;
    }
    return out;
  };
  const meshTarget = blendShapeTargets(d.artMeshBlendShapeTargets, n.meshes);
  const partTarget = blendShapeTargets(d.partBlendShapeTargets, n.parts);
  const groups = d.drawOrderGroups;
  const objs = d.drawOrderGroupObjects;
  for (let i2 = 0; i2 < n.groupObjects; i2++) {
    const kind2 = objs.kind[i2];
    if (kind2 !== 0 && kind2 !== 1)
      r.error(
        "official",
        "kind",
        "drawOrderGroupObjects",
        `drawOrderGroupObjects[${i2}].kind = ${kind2} (0 = art mesh, 1 = part)`,
        i2,
        "kind"
      );
    else
      index(
        "official",
        "drawOrderGroupObjects",
        i2,
        "index",
        objs.index[i2],
        0,
        kind2 === 0 ? n.meshes : n.parts,
        kind2 === 0 ? "artMeshes" : "parts"
      );
    index(
      "official",
      "drawOrderGroupObjects",
      i2,
      "nestedGroup",
      objs.nestedGroup[i2],
      -1,
      n.groups,
      "drawOrderGroups"
    );
  }
  if (n.groups === 0 && n.meshes > 0)
    r.error(
      "strict",
      "group-structure",
      "drawOrderGroups",
      "there are art meshes but no draw-order groups"
    );
  const groupOk = new Uint8Array(n.groups);
  for (let g = 0; g < n.groups; g++) {
    const first = groups.firstObject[g];
    const count = groups.objectCount[g];
    if (!range(
      "strict",
      "drawOrderGroups",
      g,
      "firstObject",
      first,
      count,
      n.groupObjects,
      "drawOrderGroupObjects"
    ))
      continue;
    let ok = true;
    for (let i2 = first; i2 < first + count; i2++) {
      const kind2 = objs.kind[i2];
      if (kind2 === 0) ok &&= isIndex(objs.index[i2], 0, n.meshes);
      else if (kind2 === 1) {
        ok &&= isIndex(objs.index[i2], 0, n.parts);
        if (!index(
          "strict",
          "drawOrderGroupObjects",
          i2,
          "nestedGroup",
          objs.nestedGroup[i2],
          0,
          n.groups,
          "drawOrderGroups"
        ))
          ok = false;
      } else ok = false;
    }
    groupOk[g] = ok ? 1 : 0;
  }
  if (n.groups > 0 && groupOk.every((x2) => x2 === 1)) {
    const meshSeen = new Uint8Array(n.meshes);
    const offscreenSeen = new Uint8Array(n.offscreens);
    const state = new Uint8Array(n.groups);
    const totals = new Float64Array(n.groups).fill(-1);
    let broken = false;
    const visit = (g) => {
      if (state[g] !== 0) {
        r.error(
          "strict",
          "group-structure",
          "drawOrderGroups",
          `drawOrderGroups[${g}] is reached twice or forms a cycle`,
          g
        );
        broken = true;
        return 0;
      }
      state[g] = 1;
      let total = 0;
      for (let i2 = groups.firstObject[g]; i2 < groups.firstObject[g] + groups.objectCount[g]; i2++) {
        const idx = objs.index[i2];
        if (objs.kind[i2] === 0) {
          if (meshSeen[idx])
            r.error(
              "strict",
              "group-structure",
              "artMeshes",
              `${name2("artMeshes", idx)} appears in more than one draw-order position`,
              idx
            );
          meshSeen[idx] = 1;
          total += 1;
        } else {
          const off = partOffscreen[idx];
          if (isIndex(off, 0, n.offscreens)) {
            if (offscreenSeen[off])
              r.error(
                "strict",
                "group-structure",
                "offscreens",
                `offscreens[${off}] is reached twice`,
                off
              );
            offscreenSeen[off] = 1;
            total += 1;
          }
          if (broken) return total;
          total += visit(objs.nestedGroup[i2]);
        }
      }
      state[g] = 2;
      totals[g] = total;
      return total;
    };
    visit(0);
    if (!broken) {
      for (let g = 0; g < n.groups; g++)
        if (state[g] === 2 && groups.entryCount[g] !== totals[g])
          r.error(
            "strict",
            "group-total",
            "drawOrderGroups",
            `drawOrderGroups[${g}].entryCount = ${groups.entryCount[g]}, but the group holds ${totals[g]} render-order entries (C6)`,
            g,
            "entryCount"
          );
      for (let m = 0; m < n.meshes; m++)
        if (!meshSeen[m])
          r.error(
            "strict",
            "group-structure",
            "artMeshes",
            `${name2("artMeshes", m)} is in no draw-order group`,
            m
          );
      for (let o = 0; o < n.offscreens; o++)
        if (!offscreenSeen[o])
          r.error(
            "strict",
            "group-structure",
            "offscreens",
            `offscreens[${o}] is in no draw-order group`,
            o
          );
      for (let g = 0; g < n.groups; g++) {
        if (state[g] !== 2) continue;
        for (let i2 = groups.firstObject[g]; i2 < groups.firstObject[g] + groups.objectCount[g]; i2++) {
          const mesh = objs.kind[i2] === 0;
          const idx = objs.index[i2];
          const kind2 = mesh ? "artMeshes" : "parts";
          const first = (mesh ? meshes.firstKeyform : d.parts.firstKeyform)[idx];
          const count = (mesh ? meshes.keyformCount : d.parts.keyformCount)[idx];
          const orders = mesh ? d.artMeshKeyforms.drawOrder : d.partKeyforms.drawOrder;
          if (!(first >= 0 && first + count <= orders.length)) continue;
          const target2 = (mesh ? meshTarget : partTarget)[idx] === 1;
          const outside = [];
          for (let k = first; k < first + count; k++) {
            const o = orders[k];
            const order = keyformDrawOrder(o, target2, v);
            if (!(order >= groups.minDrawOrder[g] && order <= groups.maxDrawOrder[g]))
              outside.push(o);
          }
          if (outside.length)
            r.warn(
              "draw-order-range",
              kind2,
              `${name2(kind2, idx)}: keyform draw order${outside.length > 1 ? "s" : ""} ${outside.join(", ")} outside the range [${groups.minDrawOrder[g]}, ${groups.maxDrawOrder[g]}] of drawOrderGroups[${g}] (drawn by the evaluated value)`,
              idx
            );
        }
      }
    }
  }
  if (v >= 4) {
    const bsp = d.blendShapeParameterBindings;
    const nBs = bsp.firstKey.length;
    const bsOwner = new Int32Array(nBs).fill(-1);
    for (let p = 0; p < n.parameters; p++) {
      const first = d.parameters.firstBlendShapeBinding[p];
      const count = d.parameters.blendShapeBindingCount[p];
      if (!range(
        "strict",
        "parameters",
        p,
        "firstBlendShapeBinding",
        first,
        count,
        nBs,
        "blendShapeParameterBindings"
      ))
        continue;
      for (let b = first; b < first + count; b++) {
        if (bsOwner[b] !== -1)
          r.error(
            "strict",
            "binding-ownership",
            "blendShapeParameterBindings",
            `blendShapeParameterBindings[${b}] is owned by parameters ${bsOwner[b]} and ${p}`,
            b
          );
        else bsOwner[b] = p;
      }
    }
    const bsKeyCount = new Int32Array(nBs).fill(-1);
    for (let b = 0; b < nBs; b++) {
      if (bsOwner[b] === -1)
        r.error(
          "strict",
          "binding-ownership",
          "blendShapeParameterBindings",
          `blendShapeParameterBindings[${b}] is owned by no parameter`,
          b
        );
      const count = bsp.keyCount[b];
      if (count === 0) {
        r.error(
          "strict",
          "no-keys",
          "blendShapeParameterBindings",
          `blendShapeParameterBindings[${b}]: has no keys`,
          b,
          "keyCount"
        );
        continue;
      }
      if (!keysOk("blendShapeParameterBindings", b, "firstKey", bsp.firstKey[b], count)) continue;
      bsKeyCount[b] = count;
      index(
        "strict",
        "blendShapeParameterBindings",
        b,
        "baseKey",
        bsp.baseKey[b],
        0,
        count,
        "its keys"
      );
    }
    const con = d.blendShapeConstraints;
    const nCon = con.parameter.length;
    const values = d.blendShapeConstraintValues;
    for (let c = 0; c < nCon; c++) {
      index(
        "strict",
        "blendShapeConstraints",
        c,
        "parameter",
        con.parameter[c],
        0,
        n.parameters,
        "parameters"
      );
      const first = con.firstValue[c];
      const count = con.valueCount[c];
      if (!range(
        "strict",
        "blendShapeConstraints",
        c,
        "firstValue",
        first,
        count,
        values.key.length,
        "blendShapeConstraintValues"
      ))
        continue;
      if (count < 1) {
        r.error(
          "strict",
          "no-keys",
          "blendShapeConstraints",
          `blendShapeConstraints[${c}]: no values`,
          c,
          "valueCount"
        );
        continue;
      }
      for (let k = first + 1; k < first + count; k++)
        if (!(values.key[k] > values.key[k - 1])) {
          r.error(
            "strict",
            "keys-unsorted",
            "blendShapeConstraints",
            `blendShapeConstraints[${c}]: keys not ascending`,
            c,
            "firstValue"
          );
          break;
        }
    }
    const entries = d.blendShapeConstraintEntries;
    for (let e = 0; e < entries.length; e++)
      index(
        "strict",
        "blendShapeConstraintEntries",
        e,
        void 0,
        entries[e],
        0,
        nCon,
        "blendShapeConstraints"
      );
    const kb = d.blendShapeKeyformBindings;
    const nKb = kb.parameterBinding.length;
    const bsKeyformOwner = {
      warp: new Int32Array(n.warpKeyforms).fill(-1),
      rotation: new Int32Array(n.rotationKeyforms).fill(-1),
      mesh: new Int32Array(n.meshKeyforms).fill(-1)
    };
    const targets = (kind2, objectCount, objectKind, keyformTotal, after) => {
      const t = d[kind2];
      if (!t) return;
      for (let i2 = 0; i2 < t.object.length; i2++) {
        const objectOk = index(
          "strict",
          kind2,
          i2,
          "object",
          t.object[i2],
          0,
          objectCount,
          objectKind
        );
        const first = t.firstBinding[i2];
        const count = t.bindingCount[i2];
        if (!range("strict", kind2, i2, "firstBinding", first, count, nKb, "blendShapeKeyformBindings"))
          continue;
        for (let b = first; b < first + count; b++) {
          const pb = kb.parameterBinding[b];
          const pbOk = index(
            "strict",
            "blendShapeKeyformBindings",
            b,
            "parameterBinding",
            pb,
            0,
            nBs,
            "blendShapeParameterBindings"
          );
          const kFirst = kb.firstKeyform[b];
          const kCount = kb.keyformCount[b];
          const kOk = range(
            "strict",
            "blendShapeKeyformBindings",
            b,
            "firstKeyform",
            kFirst,
            kCount,
            keyformTotal,
            `the ${objectKind} keyforms`
          );
          if (pbOk && bsKeyCount[pb] >= 0 && kCount !== bsKeyCount[pb])
            r.error(
              "strict",
              "keyform-count",
              "blendShapeKeyformBindings",
              `blendShapeKeyformBindings[${b}]: ${kCount} keyforms for ${bsKeyCount[pb]} keys`,
              b,
              "keyformCount"
            );
          range(
            "strict",
            "blendShapeKeyformBindings",
            b,
            "firstConstraintEntry",
            kb.firstConstraintEntry[b],
            kb.constraintEntryCount[b],
            entries.length,
            "blendShapeConstraintEntries"
          );
          if (objectOk && kOk) after(t.object[i2], kFirst, kCount, b);
        }
      }
    };
    targets(
      "warpBlendShapeTargets",
      n.warps,
      "warpDeformers",
      n.warpKeyforms,
      (w, first, count) => {
        for (let k = first; k < first + count; k++) {
          bsKeyformOwner.warp[k] = w;
          positionRuns.push({
            kind: "warpDeformers",
            i: w,
            keyform: "warpKeyforms",
            k,
            floats: 2 * d.warpDeformers.pointCount[w]
          });
        }
      }
    );
    targets(
      "artMeshBlendShapeTargets",
      n.meshes,
      "artMeshes",
      n.meshKeyforms,
      (m, first, count) => {
        for (let k = first; k < first + count; k++) {
          bsKeyformOwner.mesh[k] = m;
          if (meshes.vertexCount[m] >= 0)
            positionRuns.push({
              kind: "artMeshes",
              i: m,
              keyform: "artMeshKeyforms",
              k,
              floats: 2 * meshes.vertexCount[m]
            });
        }
      }
    );
    if (v >= 5) {
      targets("partBlendShapeTargets", n.parts, "parts", n.partKeyforms, () => {
      });
      targets(
        "rotationBlendShapeTargets",
        n.rotations,
        "rotationDeformers",
        n.rotationKeyforms,
        (rot, first, count) => {
          for (let k = first; k < first + count; k++) bsKeyformOwner.rotation[k] = rot;
        }
      );
      targets("glueBlendShapeTargets", n.glues, "glues", n.glueKeyforms, () => {
      });
    }
    if (v >= 6)
      targets(
        "offscreenBlendShapeTargets",
        n.offscreens,
        "offscreens",
        n.offscreenKeyforms,
        () => {
        }
      );
  }
  const officialRuns = (keyformKind, objectKind, objects, length2) => {
    const starts = d[keyformKind].firstPosition;
    for (let i2 = 0; i2 < objects && i2 < starts.length; i2++) {
      const end = starts[i2] + length2(i2);
      if (end >= 0 && end <= n.positions) continue;
      r.error(
        "official",
        "position-run",
        keyformKind,
        `${keyformKind}[${i2}].firstPosition = ${starts[i2]}: the official level tests keyform ${i2} with the run length ${length2(i2)} of ${name2(objectKind, i2)}, and ${starts[i2]} + ${length2(i2)} = ${end} is outside [0, ${n.positions}]`,
        i2,
        "firstPosition"
      );
    }
  };
  officialRuns("artMeshKeyforms", "artMeshes", n.meshes, (i2) => 2 * meshes.vertexCount[i2]);
  officialRuns("warpKeyforms", "warpDeformers", n.warps, (i2) => 2 * d.warpDeformers.pointCount[i2]);
  for (const run of positionRuns) {
    if (run.floats <= 0) continue;
    const first = (run.keyform === "warpKeyforms" ? d.warpKeyforms.firstPosition : d.artMeshKeyforms.firstPosition)[run.k];
    if (first === void 0) continue;
    if (!(first >= 0 && first + run.floats <= n.positions))
      r.error(
        "strict",
        "range-out-of-bounds",
        run.keyform,
        `${run.keyform}[${run.k}].firstPosition: [${first}, ${first + run.floats}) (of ${name2(run.kind, run.i)}) is out of bounds of keyformPositions (0\u2026${n.positions})`,
        run.k,
        "firstPosition"
      );
  }
  let nonFinite = 0;
  let firstNonFinite = -1;
  for (let i2 = 0; i2 < n.positions; i2++)
    if (!Number.isFinite(d.keyformPositions[i2])) {
      if (firstNonFinite < 0) firstNonFinite = i2;
      nonFinite++;
    }
  if (nonFinite)
    r.warn(
      "position-value",
      "keyformPositions",
      `keyformPositions holds ${nonFinite} non-finite value${nonFinite > 1 ? "s" : ""}, the first at ${firstNonFinite}`,
      firstNonFinite
    );
  for (const [kind2, values] of [
    ["warpKeyforms", d.warpKeyforms.opacity],
    ["rotationKeyforms", d.rotationKeyforms.opacity],
    ["artMeshKeyforms", d.artMeshKeyforms.opacity],
    ["offscreenKeyforms", d.offscreenKeyforms?.opacity]
  ]) {
    if (!values) continue;
    for (let k = 0; k < values.length; k++)
      if (!Number.isFinite(values[k]))
        r.error(
          "strict",
          "opacity-value",
          kind2,
          `${kind2}[${k}].opacity = ${values[k]} is not finite (the official check accepts it)`,
          k,
          "opacity"
        );
  }
  for (const kind2 of ["parts", "deformers", "artMeshes", "parameters", "glues"]) {
    const seen = /* @__PURE__ */ new Map();
    d[kind2].ids.forEach((id, i2) => {
      const before = seen.get(id);
      if (before !== void 0)
        r.warn(
          "duplicate-id",
          kind2,
          `${kind2}[${i2}] has the ID "${id}" of ${kind2}[${before}] (an ID lookup finds the first)`,
          i2,
          "ids"
        );
      else seen.set(id, i2);
    });
  }
}

// src/core/moc/data.ts
var MOC_DATA_LAYOUT = {
  parts: {
    count: Count.Parts,
    fields: {
      ids: "part.id",
      band: "part.band",
      firstKeyform: "part.firstKeyform",
      keyformCount: "part.keyformCount",
      initiallyVisible: "part.initiallyVisible",
      enabled: "part.enabled",
      parent: "part.parent",
      offscreen: "part.offscreen"
    }
  },
  deformers: {
    count: Count.Deformers,
    fields: {
      ids: "deformer.id",
      band: "deformer.band",
      visible: "deformer.visible",
      enabled: "deformer.enabled",
      part: "deformer.part",
      parent: "deformer.parent",
      kind: "deformer.kind",
      kindIndex: "deformer.kindIndex"
    }
  },
  warpDeformers: {
    count: Count.Warps,
    fields: {
      band: "warp.band",
      firstKeyform: "warp.firstKeyform",
      keyformCount: "warp.keyformCount",
      pointCount: "warp.pointCount",
      rows: "warp.rows",
      columns: "warp.columns",
      bilinear: "warp.bilinear",
      firstColor: "warp.firstColor"
    }
  },
  rotationDeformers: {
    count: Count.Rotations,
    fields: {
      band: "rotation.band",
      firstKeyform: "rotation.firstKeyform",
      keyformCount: "rotation.keyformCount",
      baseAngle: "rotation.baseAngle",
      firstColor: "rotation.firstColor"
    }
  },
  artMeshes: {
    count: Count.ArtMeshes,
    fields: {
      ids: "mesh.id",
      band: "mesh.band",
      firstKeyform: "mesh.firstKeyform",
      keyformCount: "mesh.keyformCount",
      visible: "mesh.visible",
      enabled: "mesh.enabled",
      part: "mesh.part",
      deformer: "mesh.deformer",
      texture: "mesh.texture",
      flags: "mesh.flags",
      vertexCount: "mesh.vertexCount",
      firstUv: "mesh.firstUv",
      firstTriangleIndex: "mesh.firstTriangleIndex",
      triangleIndexCount: "mesh.triangleIndexCount",
      firstMask: "mesh.firstMask",
      maskCount: "mesh.maskCount",
      firstColor: "mesh.firstColor",
      blendMode: "mesh.blendMode"
    }
  },
  parameters: {
    count: Count.Parameters,
    fields: {
      ids: "parameter.id",
      max: "parameter.max",
      min: "parameter.min",
      defaultValue: "parameter.default",
      repeat: "parameter.repeat",
      decimals: "parameter.decimals",
      firstBinding: "parameter.firstBinding",
      bindingCount: "parameter.bindingCount",
      firstKey: "parameter.firstKey",
      keyCount: "parameter.keyCount",
      type: "parameter.type",
      firstBlendShapeBinding: "parameter.firstBlendShapeBinding",
      blendShapeBindingCount: "parameter.blendShapeBindingCount"
    }
  },
  partKeyforms: {
    count: Count.PartKeyforms,
    fields: {
      drawOrder: "partKeyform.drawOrder",
      offscreenKeyform: "partKeyform.offscreenKeyform"
    }
  },
  warpKeyforms: {
    count: Count.WarpKeyforms,
    fields: {
      opacity: "warpKeyform.opacity",
      firstPosition: "warpKeyform.firstPosition",
      multiplyColor: "warpKeyform.multiplyColor",
      screenColor: "warpKeyform.screenColor"
    }
  },
  rotationKeyforms: {
    count: Count.RotationKeyforms,
    fields: {
      opacity: "rotationKeyform.opacity",
      angle: "rotationKeyform.angle",
      originX: "rotationKeyform.originX",
      originY: "rotationKeyform.originY",
      scale: "rotationKeyform.scale",
      mirrorX: "rotationKeyform.mirrorX",
      mirrorY: "rotationKeyform.mirrorY",
      multiplyColor: "rotationKeyform.multiplyColor",
      screenColor: "rotationKeyform.screenColor"
    }
  },
  artMeshKeyforms: {
    count: Count.ArtMeshKeyforms,
    fields: {
      opacity: "meshKeyform.opacity",
      drawOrder: "meshKeyform.drawOrder",
      firstPosition: "meshKeyform.firstPosition",
      multiplyColor: "meshKeyform.multiplyColor",
      screenColor: "meshKeyform.screenColor"
    }
  },
  keyformPositions: { count: Count.PositionFloats, pool: "positions" },
  bindingIndices: { count: Count.BindingIndexEntries, pool: "bindingIndex" },
  bands: {
    count: Count.Bands,
    fields: { firstEntry: "band.firstEntry", entryCount: "band.entryCount" }
  },
  parameterBindings: {
    count: Count.ParameterBindings,
    fields: { firstKey: "binding.firstKey", keyCount: "binding.keyCount" }
  },
  keys: { count: Count.KeyValues, pool: "keys" },
  uvs: { count: Count.UvFloats, pool: "uvs" },
  triangleIndices: { count: Count.TriangleIndexEntries, pool: "triangleIndices" },
  maskEntries: { count: Count.MaskEntries, pool: "maskEntries" },
  drawOrderGroups: {
    count: Count.DrawOrderGroups,
    fields: {
      firstObject: "group.firstObject",
      objectCount: "group.objectCount",
      entryCount: "group.entryCount",
      maxDrawOrder: "group.maxDrawOrder",
      minDrawOrder: "group.minDrawOrder"
    }
  },
  drawOrderGroupObjects: {
    count: Count.DrawOrderGroupObjects,
    fields: {
      kind: "groupObject.kind",
      index: "groupObject.index",
      nestedGroup: "groupObject.nestedGroup"
    }
  },
  glues: {
    count: Count.Glues,
    fields: {
      ids: "glue.id",
      band: "glue.band",
      firstKeyform: "glue.firstKeyform",
      keyformCount: "glue.keyformCount",
      artMeshA: "glue.meshA",
      artMeshB: "glue.meshB",
      firstInfo: "glue.firstInfo",
      infoCount: "glue.infoCount"
    }
  },
  glueInfo: {
    count: Count.GlueInfoEntries,
    fields: { weight: "glueInfo.weight", vertex: "glueInfo.vertex" }
  },
  glueKeyforms: { count: Count.GlueKeyforms, fields: { intensity: "glueKeyform.intensity" } },
  multiplyColors: {
    count: Count.MultiplyColors,
    fields: { r: "multiplyColor.r", g: "multiplyColor.g", b: "multiplyColor.b" }
  },
  screenColors: {
    count: Count.ScreenColors,
    fields: { r: "screenColor.r", g: "screenColor.g", b: "screenColor.b" }
  },
  blendShapeParameterBindings: {
    count: Count.BlendShapeParameterBindings,
    fields: {
      firstKey: "bsBinding.firstKey",
      keyCount: "bsBinding.keyCount",
      baseKey: "bsBinding.baseKey"
    }
  },
  blendShapeKeyformBindings: {
    count: Count.BlendShapeKeyformBindings,
    fields: {
      parameterBinding: "bsKeyformBinding.binding",
      firstKeyform: "bsKeyformBinding.firstKeyform",
      keyformCount: "bsKeyformBinding.keyformCount",
      firstConstraintEntry: "bsKeyformBinding.firstConstraintEntry",
      constraintEntryCount: "bsKeyformBinding.constraintEntryCount"
    }
  },
  warpBlendShapeTargets: {
    count: Count.WarpBlendShapeTargets,
    fields: {
      object: "warpTarget.warp",
      firstBinding: "warpTarget.firstBinding",
      bindingCount: "warpTarget.bindingCount"
    }
  },
  artMeshBlendShapeTargets: {
    count: Count.ArtMeshBlendShapeTargets,
    fields: {
      object: "meshTarget.mesh",
      firstBinding: "meshTarget.firstBinding",
      bindingCount: "meshTarget.bindingCount"
    }
  },
  blendShapeConstraintEntries: {
    count: Count.BlendShapeConstraintIndexEntries,
    pool: "constraintIndex"
  },
  blendShapeConstraints: {
    count: Count.BlendShapeConstraints,
    fields: {
      parameter: "constraint.parameter",
      firstValue: "constraint.firstValue",
      valueCount: "constraint.valueCount"
    }
  },
  blendShapeConstraintValues: {
    count: Count.BlendShapeConstraintValues,
    fields: { key: "constraintValue.key", weight: "constraintValue.weight" }
  },
  partBlendShapeTargets: {
    count: Count.PartBlendShapeTargets,
    fields: {
      object: "partTarget.part",
      firstBinding: "partTarget.firstBinding",
      bindingCount: "partTarget.bindingCount"
    }
  },
  rotationBlendShapeTargets: {
    count: Count.RotationBlendShapeTargets,
    fields: {
      object: "rotationTarget.rotation",
      firstBinding: "rotationTarget.firstBinding",
      bindingCount: "rotationTarget.bindingCount"
    }
  },
  glueBlendShapeTargets: {
    count: Count.GlueBlendShapeTargets,
    fields: {
      object: "glueTarget.glue",
      firstBinding: "glueTarget.firstBinding",
      bindingCount: "glueTarget.bindingCount"
    }
  },
  offscreens: {
    count: Count.Offscreens,
    fields: {
      part: "offscreen.part",
      flags: "offscreen.flags",
      blendMode: "offscreen.blendMode",
      firstMask: "offscreen.firstMask",
      maskCount: "offscreen.maskCount"
    }
  },
  offscreenKeyforms: {
    count: Count.OffscreenKeyforms,
    fields: {
      opacity: "offscreenKeyform.opacity",
      multiplyColor: "offscreenKeyform.multiplyColor",
      screenColor: "offscreenKeyform.screenColor"
    }
  },
  offscreenBlendShapeTargets: {
    count: Count.OffscreenBlendShapeTargets,
    fields: {
      object: "offscreenTarget.offscreen",
      firstBinding: "offscreenTarget.firstBinding",
      bindingCount: "offscreenTarget.bindingCount"
    }
  }
};
var MOC_DATA_GROUPS = Object.keys(MOC_DATA_LAYOUT).sort(
  (a, b) => MOC_DATA_LAYOUT[a].count - MOC_DATA_LAYOUT[b].count
);

// src/core/moc/io.ts
var MocWriteError = class extends Error {
  constructor(diagnostics) {
    super(
      `cannot write the .moc3 file: ${diagnostics[0]?.message ?? "invalid data"}` + (diagnostics.length > 1 ? ` (and ${diagnostics.length - 1} more)` : "")
    );
    this.diagnostics = diagnostics;
    this.name = "MocWriteError";
  }
  diagnostics;
};
var WRITABLE_VERSIONS = [1, 2, 3, 4, 5, 6];
var fieldSpec = new Map(FIELDS.map((f) => [f.key, f]));
var TYPED = {
  i32: "Int32Array",
  f32: "Float32Array",
  u16: "Uint16Array",
  u8: "Uint8Array"
};
var tag = (v) => Object.prototype.toString.call(v).slice(8, -1);
var hostLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
function groupSince(group) {
  const layout = MOC_DATA_LAYOUT[group];
  if ("pool" in layout) return fieldSpec.get(layout.pool).since;
  return Math.min(...Object.values(layout.fields).map((k) => fieldSpec.get(k).since));
}
function copyValue(value, type) {
  if (value === null) return null;
  if (Array.isArray(value)) return [...value];
  switch (type) {
    case "i32":
      return Int32Array.from(value);
    case "f32":
      return new Float32Array(value);
    case "u16":
      return Uint16Array.from(value);
    case "u8":
      return Uint8Array.from(value);
    default:
      return value;
  }
}
function mocDataFromSections(sections) {
  const v = sections.version;
  const value = (key) => {
    const spec = fieldSpec.get(key);
    return copyValue(sections.fields.get(key) ?? null, spec.type);
  };
  const c = sections.canvas;
  const data = {
    canvas: {
      pixelsPerUnit: c.pixelsPerUnit,
      originX: c.originX,
      originY: c.originY,
      width: c.width,
      height: c.height,
      flags: c.flags
    }
  };
  for (const group of MOC_DATA_GROUPS) {
    if (groupSince(group) > v) continue;
    const layout = MOC_DATA_LAYOUT[group];
    if ("pool" in layout) {
      data[group] = value(layout.pool);
      continue;
    }
    const out = {};
    for (const [name2, key] of Object.entries(layout.fields))
      if (fieldSpec.get(key).since <= v) out[name2] = value(key);
    data[group] = out;
  }
  return data;
}
function readMoc(bytes) {
  let sections;
  try {
    sections = readMocSections(bytes, { lenient: true });
  } catch (e) {
    throw endiannessError(bytes, e) ?? e;
  }
  const diagnostics = sections.issues.map((i2) => ({
    code: i2.code,
    severity: "error",
    kind: "file",
    message: i2.message
  }));
  if (sections.bigEndian)
    diagnostics.push({
      code: "big-endian",
      severity: "warning",
      kind: "file",
      message: "big-endian file: Mochi2D and the official loader read it, but the official consistency check rejects it"
    });
  return {
    data: mocDataFromSections(sections),
    version: sections.version,
    diagnostics
  };
}
function endiannessError(bytes, e) {
  const view = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
  if (!(e instanceof MocFormatError) || view.length < 64 || view[5] === 0) return null;
  const copy = view.slice();
  copy[5] = 0;
  try {
    readMocSections(copy, { lenient: true });
  } catch {
    return null;
  }
  return new MocFormatError(
    "the endianness byte (byte 5) is set, but the data is little-endian",
    "endianness"
  );
}
var encoder = (s) => {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    n += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
  }
  return n;
};
function checkMocDataShape(data, version) {
  const diagnostics = [];
  const error = (code, kind2, message, where = {}) => diagnostics.push({ code, severity: "error", kind: kind2, ...where, message });
  if (!(Number.isInteger(version) && version >= MIN_VERSION && version <= MAX_VERSION)) {
    error("version", "file", `version ${version} is not a .moc3 version (1\u20136)`);
    return { diagnostics };
  }
  if (typeof data !== "object" || data === null) {
    error("value-type", "file", "the data must be an object");
    return { diagnostics };
  }
  const d = data;
  const canvas = d.canvas;
  if (typeof canvas !== "object" || canvas === null)
    error("missing-field", "canvas", "canvas is missing");
  else {
    for (const f of ["pixelsPerUnit", "originX", "originY", "width", "height"]) {
      const x2 = canvas[f];
      if (typeof x2 !== "number")
        error("value-type", "canvas", `canvas.${f} must be a number`, { field: f });
      else if (!Object.is(Math.fround(x2), x2))
        error(
          "not-float32",
          "canvas",
          `canvas.${f} = ${x2} is not a float32 value (the file stores float32: use Math.fround)`,
          { field: f }
        );
    }
    const flags = canvas.flags;
    if (!(Number.isInteger(flags) && flags >= 0 && flags <= 255))
      error("value-range", "canvas", `canvas.flags = ${String(flags)} must be an integer 0\u2013255`, {
        field: "flags"
      });
    for (const k of Object.keys(canvas))
      if (!["pixelsPerUnit", "originX", "originY", "width", "height", "flags"].includes(k))
        error("unknown-field", "canvas", `canvas.${k} is not a field of the canvas`, { field: k });
  }
  for (const k of Object.keys(d))
    if (k !== "canvas" && !(k in MOC_DATA_LAYOUT))
      error("unknown-field", "file", `${k} is not a group of the model data`);
  const counts = new Int32Array(countTableLength(version));
  const values = /* @__PURE__ */ new Map();
  const checkArray = (group, name2, key, value) => {
    const spec = fieldSpec.get(key);
    const where = name2 ? { field: name2 } : {};
    const label = name2 ? `${group}.${name2}` : group;
    if (spec.type === "name") {
      if (!Array.isArray(value)) {
        error("value-type", group, `${label} must be an array of strings`, where);
        return null;
      }
      value.forEach((s, i2) => {
        if (typeof s !== "string")
          error("value-type", group, `${label}[${i2}] must be a string`, { ...where, index: i2 });
        else if (s.includes("\0"))
          error("name-nul", group, `${label}[${i2}] contains a NUL character`, {
            ...where,
            index: i2
          });
        else if (encoder(s) > 63)
          error(
            "name-too-long",
            group,
            `${label}[${i2}] "${s}" is ${encoder(s)} bytes in UTF-8; IDs are at most 63`,
            { ...where, index: i2 }
          );
      });
    } else if (spec.type !== "placeholder") {
      const want = TYPED[spec.type];
      if (tag(value) !== want) {
        error("value-type", group, `${label} must be an ${want} (it is ${tag(value)})`, where);
        return null;
      }
    }
    values.set(key, value);
    return value.length;
  };
  for (const group of MOC_DATA_GROUPS) {
    const layout = MOC_DATA_LAYOUT[group];
    const present = d[group];
    const since = groupSince(group);
    if (since > version) {
      if (present !== void 0)
        error(
          "field-not-in-version",
          group,
          `${group} needs version ${since} or later; version ${version} cannot hold it`
        );
      continue;
    }
    if (present === void 0) {
      error("missing-field", group, `${group} is missing (version ${version} has it)`);
      continue;
    }
    if ("pool" in layout) {
      const n = checkArray(group, void 0, layout.pool, present);
      if (n !== null) counts[layout.count] = n;
      continue;
    }
    if (typeof present !== "object" || present === null || ArrayBuffer.isView(present)) {
      error("value-type", group, `${group} must be an object of arrays`);
      continue;
    }
    const obj2 = present;
    for (const k of Object.keys(obj2))
      if (!(k in layout.fields) && obj2[k] !== void 0)
        error("unknown-field", group, `${group}.${k} is not a field of ${group}`, { field: k });
    let length2 = null;
    let lengthFrom = "";
    for (const [name2, key] of Object.entries(layout.fields)) {
      const spec = fieldSpec.get(key);
      const value = obj2[name2];
      if (spec.since > version) {
        if (value !== void 0)
          error(
            "field-not-in-version",
            group,
            `${group}.${name2} needs version ${spec.since} or later; version ${version} cannot hold it`,
            { field: name2 }
          );
        continue;
      }
      if (value === void 0) {
        error("missing-field", group, `${group}.${name2} is missing (version ${version} has it)`, {
          field: name2
        });
        continue;
      }
      const n = checkArray(group, name2, key, value);
      if (n === null) continue;
      if (length2 === null) {
        length2 = n;
        lengthFrom = name2;
      } else if (n !== length2)
        error(
          "length-mismatch",
          group,
          `${group}.${name2} has ${n} elements, but ${group}.${lengthFrom} has ${length2}: the arrays of a group are parallel`,
          { field: name2 }
        );
    }
    if (length2 !== null) counts[layout.count] = length2;
  }
  for (let i2 = 0; i2 < counts.length; i2++) if (countSince(i2) > version) counts[i2] = 0;
  return diagnostics.length ? { diagnostics } : { diagnostics, encodable: { counts, values } };
}
function writeMoc(data, options) {
  const version = checkWritableVersion(options?.version);
  const { diagnostics, encodable } = checkMocDataShape(data, version);
  if (!encodable) throw new MocWriteError(diagnostics);
  const report = new Report(false);
  checkStructure(data, version, report);
  if (report.errors) throw new MocWriteError(report.list);
  return encode(version, data.canvas, encodable);
}
function checkWritableVersion(version) {
  if (!WRITABLE_VERSIONS.includes(version))
    throw new MocWriteError([
      {
        code: "version-unsupported",
        severity: "error",
        kind: "file",
        message: `cannot write version ${String(version)}: writeMoc writes versions 1\u20136`
      }
    ]);
  return version;
}
function encode(version, canvas, input) {
  const { counts, values } = input;
  const slots = slotTableLength(version);
  const countEntries = countTableLength(version);
  const fields = [...fieldsForVersion(version)].sort((a, b) => a.slot - b.slot);
  const align = (x2) => Math.ceil(x2 / 64) * 64;
  const offsets = new Uint32Array(slots);
  let end = HEADER_SIZE + slots * 4;
  const place = (size, packed) => {
    const start = packed && size > 0 ? end : align(end);
    if (size > 0) end = start + size;
    return start;
  };
  offsets[COUNT_TABLE_SLOT] = place(countEntries * 4, false);
  offsets[CANVAS_SLOT] = place(CANVAS_BLOCK_SIZE, false);
  const placed = [];
  for (const spec of fields) {
    const count = counts[spec.count];
    const start = place(count * ELEMENT_SIZE[spec.type], spec.type === "name");
    offsets[spec.slot] = start;
    placed.push({ spec, start, count });
  }
  const bytes = new Uint8Array(align(end));
  const dv = new DataView(bytes.buffer);
  bytes.set([77, 79, 67, 51, version, 0], 0);
  for (let i2 = 0; i2 < slots; i2++) dv.setUint32(HEADER_SIZE + i2 * 4, offsets[i2], true);
  for (let i2 = 0; i2 < countEntries; i2++)
    dv.setInt32(offsets[COUNT_TABLE_SLOT] + i2 * 4, counts[i2], true);
  const c = offsets[CANVAS_SLOT];
  dv.setFloat32(c, canvas.pixelsPerUnit, true);
  dv.setFloat32(c + 4, canvas.originX, true);
  dv.setFloat32(c + 8, canvas.originY, true);
  dv.setFloat32(c + 12, canvas.width, true);
  dv.setFloat32(c + 16, canvas.height, true);
  bytes[c + 20] = canvas.flags;
  for (const { spec, start, count } of placed) {
    if (count === 0 || spec.type === "placeholder") continue;
    const value = values.get(spec.key);
    if (spec.type === "name") {
      const names = value;
      for (let i2 = 0; i2 < count; i2++) writeName(bytes, start + i2 * 64, names[i2]);
      continue;
    }
    const arr2 = value;
    const size = ELEMENT_SIZE[spec.type];
    if (hostLittleEndian || size === 1) {
      bytes.set(new Uint8Array(arr2.buffer, arr2.byteOffset, count * size), start);
      continue;
    }
    const src = new Uint8Array(arr2.buffer, arr2.byteOffset, count * size);
    for (let i2 = 0; i2 < count * size; i2 += size)
      for (let b = 0; b < size; b++) bytes[start + i2 + b] = src[i2 + size - 1 - b];
  }
  return bytes;
}
function writeName(bytes, at4, s) {
  let o = at4;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 128) bytes[o++] = cp;
    else if (cp < 2048) {
      bytes[o++] = 192 | cp >> 6;
      bytes[o++] = 128 | cp & 63;
    } else if (cp < 65536) {
      bytes[o++] = 224 | cp >> 12;
      bytes[o++] = 128 | cp >> 6 & 63;
      bytes[o++] = 128 | cp & 63;
    } else {
      bytes[o++] = 240 | cp >> 18;
      bytes[o++] = 128 | cp >> 12 & 63;
      bytes[o++] = 128 | cp >> 6 & 63;
      bytes[o++] = 128 | cp & 63;
    }
  }
}

// src/runtime/moc-input.ts
function mocInputBytes(moc) {
  if (moc instanceof Uint8Array) return moc;
  if (moc instanceof ArrayBuffer) return new Uint8Array(moc);
  return writeMoc(moc.data, { version: moc.version });
}
async function mocPathOf(source, settingsPath) {
  const settings = parseModelSettings(await source.read(settingsPath));
  return joinPath(dirnameOf(settingsPath), settings.moc);
}
async function sourceWithMoc(source, settingsPath, bytes) {
  return sourceWithMocAt(source, await mocPathOf(source, settingsPath), bytes);
}
function sourceWithMocAt(source, mocPath, bytes) {
  return new OverlayFileSource(source.label, [
    MemoryFileSource.fromFiles({ [mocPath]: bytes }),
    source
  ]);
}

// src/lib/events.ts
var Emitter = class {
  listeners = /* @__PURE__ */ new Map();
  /** Adds a listener. Returns a function that removes it. */
  on(type, listener) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, set = /* @__PURE__ */ new Set());
    set.add(listener);
    return () => this.off(type, listener);
  }
  /** Adds a listener that is removed after its first call. */
  once(type, listener) {
    const off = this.on(type, (e) => {
      off();
      listener(e);
    });
    return off;
  }
  off(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  /** Whether anything listens to `type`. */
  has(type) {
    return (this.listeners.get(type)?.size ?? 0) > 0;
  }
  /** Calls the listeners of `type`; a listener that throws does not stop the others. */
  emit(type, event) {
    for (const l of [...this.listeners.get(type) ?? []]) {
      try {
        l(event);
      } catch (e) {
        queueMicrotask(() => {
          throw e;
        });
      }
    }
  }
  clear() {
    this.listeners.clear();
  }
};

// src/lib/gestures.ts
var GestureTracker = class {
  constructor(h, options = {}) {
    this.h = h;
    this.o = {
      slop: options.slop ?? 6,
      tapTime: options.tapTime ?? 500,
      doubleTapTime: options.doubleTapTime ?? 350,
      doubleTapDistance: options.doubleTapDistance ?? 30
    };
  }
  h;
  pointers = /* @__PURE__ */ new Map();
  mode = "none";
  /** The current press may still become a tap. */
  tapCandidate = false;
  /** A second finger joined: no tap or drag until every pointer is up. */
  multi = false;
  pinchLast = null;
  lastTap = null;
  o;
  /** Scales the distance thresholds (e.g. by the device pixel ratio). */
  setScale(scale2, base = {}) {
    this.o.slop = (base.slop ?? 6) * scale2;
    this.o.doubleTapDistance = (base.doubleTapDistance ?? 30) * scale2;
  }
  get active() {
    return this.pointers.size > 0;
  }
  down(id, x2, y, t, info) {
    if (this.pointers.has(id)) return;
    const p = { id, x: x2, y, startX: x2, startY: y, startTime: t, info };
    this.pointers.set(id, p);
    if (this.pointers.size === 1) {
      this.multi = false;
      this.tapCandidate = true;
      this.mode = this.h.press?.(x2, y, info) ?? "none";
    } else if (this.pointers.size === 2) {
      if (this.mode !== "none") this.h.release?.(this.mode);
      this.mode = "none";
      this.tapCandidate = false;
      this.multi = true;
      this.pinchLast = this.pinchState();
    }
  }
  move(id, x2, y) {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x2 - p.x;
    const dy = y - p.y;
    p.x = x2;
    p.y = y;
    if (this.pointers.size >= 2) {
      const s = this.pinchState();
      const last = this.pinchLast;
      if (s && last && last.d > 0)
        this.h.pinch?.(s.d / last.d, s.cx, s.cy, s.cx - last.cx, s.cy - last.cy);
      this.pinchLast = s;
      return;
    }
    if (this.multi) return;
    if (Math.hypot(x2 - p.startX, y - p.startY) > this.o.slop) this.tapCandidate = false;
    if (this.mode !== "none") this.h.drag?.(x2, y, dx, dy, this.mode);
  }
  up(id, t) {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (this.pointers.size >= 2) {
      this.pinchLast = this.pinchState();
      return;
    }
    if (this.pointers.size === 1) {
      this.pinchLast = null;
      return;
    }
    if (this.multi) {
      this.multi = false;
      return;
    }
    if (this.mode !== "none") this.h.release?.(this.mode);
    this.mode = "none";
    if (this.tapCandidate && t - p.startTime <= this.o.tapTime) {
      const prev = this.lastTap;
      if (prev && t - prev.t <= this.o.doubleTapTime && Math.hypot(p.x - prev.x, p.y - prev.y) <= this.o.doubleTapDistance) {
        this.lastTap = null;
        if (this.h.doubleTap) this.h.doubleTap(p.x, p.y, p.info);
        else this.h.tap?.(p.x, p.y, p.info);
      } else {
        this.lastTap = { x: p.x, y: p.y, t };
        this.h.tap?.(p.x, p.y, p.info);
      }
    }
    this.tapCandidate = false;
  }
  /** The pointer was taken away (e.g. by a browser gesture): no tap. */
  cancel(id) {
    if (!this.pointers.has(id)) return;
    this.tapCandidate = false;
    this.up(id, Infinity);
  }
  wheel(deltaY, x2, y, pinch) {
    this.h.wheel?.(Math.exp(-deltaY * (pinch ? 0.01 : 15e-4)), x2, y);
  }
  hover(x2, y) {
    if (this.pointers.size === 0) this.h.hover?.(x2, y);
  }
  leave() {
    if (this.pointers.size === 0) this.h.leave?.();
  }
  pinchState() {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
};
function bindGestures(canvas, handlers, options = {}) {
  const tracker = new GestureTracker(handlers, options);
  const scale2 = () => canvas.width / Math.max(1, canvas.clientWidth);
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      (e.clientX - r.left) * canvas.width / Math.max(1, r.width),
      (e.clientY - r.top) * canvas.height / Math.max(1, r.height)
    ];
  };
  const onDown = (e) => {
    if (e.button > 2) return;
    tracker.setScale(scale2(), options);
    const [x2, y] = pos(e);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
    }
    tracker.down(e.pointerId, x2, y, e.timeStamp, {
      button: e.button,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
      pointerType: e.pointerType
    });
    if (e.pointerType !== "mouse") e.preventDefault();
  };
  const onMove = (e) => {
    const [x2, y] = pos(e);
    if (tracker.active) tracker.move(e.pointerId, x2, y);
    else if (e.pointerType === "mouse") tracker.hover(x2, y);
  };
  const onUp = (e) => tracker.up(e.pointerId, e.timeStamp);
  const onCancel = (e) => tracker.cancel(e.pointerId);
  const onLeave = (e) => {
    if (e.pointerType === "mouse") tracker.leave();
  };
  const onWheel = (e) => {
    e.preventDefault();
    const [x2, y] = pos(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
    tracker.wheel(e.deltaY * unit, x2, y, e.ctrlKey);
  };
  const prevent = (e) => e.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("contextmenu", prevent);
  canvas.addEventListener("gesturestart", prevent);
  canvas.addEventListener("gesturechange", prevent);
  const wheel = options.wheel ?? true;
  if (wheel) canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onCancel);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("contextmenu", prevent);
    canvas.removeEventListener("gesturestart", prevent);
    canvas.removeEventListener("gesturechange", prevent);
    if (wheel) canvas.removeEventListener("wheel", onWheel);
  };
}

// src/core/render/framing.ts
function frameImage(canvas, width, height, view) {
  if (view) return { width, height, k: view.pixelsPerUnit, centerX: view.x, centerY: view.y };
  const ppu = canvas.pixelsPerUnit;
  return {
    width,
    height,
    k: Math.min(width / canvas.width, height / canvas.height) * ppu,
    centerX: (canvas.width / 2 - canvas.originX) / ppu,
    centerY: (canvas.originY - canvas.height / 2) / ppu
  };
}
function turnOf(degrees) {
  const d = (degrees % 360 + 360) % 360;
  if (d === 0) return [1, 0];
  if (d === 90) return [0, 1];
  if (d === 180) return [-1, 0];
  if (d === 270) return [0, -1];
  const r = d * Math.PI / 180;
  return [Math.cos(r), Math.sin(r)];
}
function imagePosition(f, x2, y) {
  if (!f.rotation)
    return [f.width / 2 + f.k * (x2 - f.centerX), f.height / 2 - f.k * (y - f.centerY)];
  const [c, s] = turnOf(f.rotation);
  const u = f.k * (x2 - f.centerX);
  const v = f.k * (y - f.centerY);
  return [f.width / 2 + (c * u - s * v), f.height / 2 - (s * u + c * v)];
}
function outputPosition(f, P, Q) {
  if (!f.rotation)
    return [f.centerX + (P - f.width / 2) / f.k, f.centerY - (Q - f.height / 2) / f.k];
  const [c, s] = turnOf(f.rotation);
  const u = P - f.width / 2;
  const v = f.height / 2 - Q;
  return [f.centerX + (c * u + s * v) / f.k, f.centerY + (c * v - s * u) / f.k];
}
function outputStep(f, dx, dy) {
  if (!f.rotation) return [dx / f.k, -dy / f.k];
  const [c, s] = turnOf(f.rotation);
  return [(c * dx - s * dy) / f.k, (-s * dx - c * dy) / f.k];
}
function visibleBox(f, margin = 0) {
  let hw = (f.width / 2 + margin) / f.k;
  let hh = (f.height / 2 + margin) / f.k;
  if (f.rotation) {
    const [c, s] = turnOf(f.rotation);
    [hw, hh] = [Math.abs(c) * hw + Math.abs(s) * hh, Math.abs(s) * hw + Math.abs(c) * hh];
  }
  return { x0: f.centerX - hw, y0: f.centerY - hh, x1: f.centerX + hw, y1: f.centerY + hh };
}
function clipTransform(f) {
  const sx = 2 * f.k / f.width;
  const sy = 2 * f.k / f.height;
  return [sx, sy, -f.centerX * sx, -f.centerY * sy];
}
function clipTurn(f) {
  if (!f.rotation) return [1, 0, 0];
  const [c, s] = turnOf(f.rotation);
  return [c, s * f.height / f.width, s * f.width / f.height];
}

// src/core/eval/static-output.ts
function outputFlipsY(model) {
  return (model.canvas.flags & 1) === 0;
}
function outputTriangles(model, i2) {
  const t = Uint16Array.from(model.meshes.triangles[i2]);
  if (outputFlipsY(model)) {
    for (let k = 0; k + 2 < t.length; k += 3) {
      const a = t[k];
      t[k] = t[k + 2];
      t[k + 2] = a;
    }
  }
  return t;
}

// src/core/render/mask-matrix.ts
var f32 = Math.fround;
function identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function translation(x2, y) {
  const m = identity();
  m[3] = f32(x2);
  m[7] = f32(y);
  return m;
}
function scale(x2, y) {
  const m = identity();
  m[0] = f32(x2);
  m[5] = f32(y);
  return m;
}
function multiplyF32(a, b) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let sum = a[4 * r] * b[c];
      for (let k = 1; k < 4; k++) sum = f32(sum + a[4 * r + k] * b[4 * k + c]);
      out[4 * r + c] = sum;
    }
  return out;
}
function composeF32(factors) {
  let m = identity();
  for (const f of factors) m = multiplyF32(m, f);
  return m;
}
function maskMatrices(map) {
  const tail = [
    translation(map.lx ?? 0, map.ly ?? 0),
    scale(map.sx, map.sy),
    translation(-f32(map.ox), -f32(map.oy))
  ];
  return {
    texture: composeF32(tail),
    clip: composeF32([translation(-1, -1), scale(2, 2), ...tail])
  };
}
function columnMajor(m) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[4 * c + r] = m[4 * r + c];
  return out;
}
function viewMatrix(view, turn = [1, 0, 0]) {
  const [sx, sy, tx, ty] = view;
  const [c, hs, ws] = turn;
  const m = identity();
  m[0] = f32(c * sx);
  m[1] = f32(-hs * sy);
  m[3] = f32(c * tx - hs * ty);
  m[4] = f32(ws * sx);
  m[5] = f32(c * sy);
  m[7] = f32(ws * tx + c * ty);
  return m;
}
function inverseView(v) {
  const [a, b, tx] = [v[0], v[1], v[3]];
  const [c, d, ty] = [v[4], v[5], v[7]];
  const det = a * d - b * c;
  const i00 = d / det;
  const i01 = -b / det;
  const i10 = -c / det;
  const i11 = a / det;
  const m = identity();
  m[0] = f32(i00);
  m[1] = f32(i01);
  m[3] = f32(-(i00 * tx + i01 * ty));
  m[4] = f32(i10);
  m[5] = f32(i11);
  m[7] = f32(-(i10 * tx + i11 * ty));
  return m;
}
function layerMaskMatrix(map, view) {
  return multiplyF32(maskMatrices(map).texture, inverseView(view));
}

// src/core/render/sampling.ts
function sampledV(v) {
  return Math.fround(1 - Math.fround(1 - v));
}
function sampledUvs(uvs) {
  const out = Float32Array.from(uvs);
  for (let i2 = 1; i2 < out.length; i2 += 2) out[i2] = sampledV(out[i2]);
  return out;
}

// src/core/render/compositing.ts
function legacyBlendOf(flags) {
  return flags & 1 ? "additive" : flags & 2 ? "multiplicative" : "normal";
}
var colorPart = (code) => code & 255;
var alphaPart = (code) => code >> 8 & 255;
function isCompatibleBlend(code) {
  const c = colorPart(code);
  return code === 0 || c === 1 || c === 2;
}
function compatibleBlendMode(code) {
  const c = colorPart(code);
  return c === 1 ? "additive" : c === 2 ? "multiplicative" : "normal";
}

// src/core/render/masks.ts
function maskGroups(lists) {
  const groupOf = new Int32Array(lists.length).fill(-1);
  const groups = [];
  const byKey = /* @__PURE__ */ new Map();
  lists.forEach((list, i2) => {
    if (list.length === 0) return;
    const key = [...new Set(Array.from(list))].sort((a, b) => a - b).join(",");
    let g = byKey.get(key);
    if (g === void 0) {
      g = groups.length;
      byKey.set(key, g);
      groups.push({ masks: Int32Array.from(list), members: [] });
    }
    groups[g].members.push(i2);
    groupOf[i2] = g;
  });
  return {
    groups: groups.map((g) => ({ masks: g.masks, members: Int32Array.from(g.members) })),
    groupOf
  };
}
function drawablesBox(drawables, vertices, quirk) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = quirk ? Number.MIN_VALUE : -Infinity;
  let maxY = maxX;
  for (let k = 0; k < drawables.length; k++) {
    const v = vertices[drawables[k]];
    for (let i2 = 0; i2 + 1 < v.length; i2 += 2) {
      const x2 = v[i2];
      const y = v[i2 + 1];
      if (x2 < minX) minX = x2;
      if (x2 > maxX) maxX = x2;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { x0: minX, y0: minY, w: maxX - minX, h: maxY - minY };
}
function mapToMask(map, x2, y) {
  return [(x2 - map.ox) * map.sx + (map.lx ?? 0), (y - map.oy) * map.sy + (map.ly ?? 0)];
}
function maskMapping(box, ppu, size) {
  const axis2 = (origin, extent) => extent * ppu <= size ? [origin, ppu / size] : [origin - 0.05 * extent, 1 / (1.1 * extent)];
  const [ox, sx] = axis2(box.x0, box.w);
  const [oy, sy] = axis2(box.y0, box.h);
  return { ox, sx, oy, sy };
}
function isSelfOrAncestor(parents, a, p) {
  for (let q2 = p; q2 >= 0; q2 = parents[q2]) if (q2 === a) return true;
  return false;
}
function drawablesUnder(meshParts, partParents, owner) {
  const out = [];
  for (let d = 0; d < meshParts.length; d++)
    if (isSelfOrAncestor(partParents, owner, meshParts[d])) out.push(d);
  return out;
}

// src/render/gl/context.ts
var GlError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GlError";
  }
};
function createGl2Context(canvas, options = {}) {
  const attrs = {
    alpha: options.alpha ?? true,
    premultipliedAlpha: options.premultipliedAlpha ?? true,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
    antialias: options.antialias ?? false,
    stencil: options.stencil ?? true,
    depth: false
  };
  const gl = canvas.getContext("webgl2", attrs);
  if (!gl) throw new GlError("WebGL2 is not available in this browser / environment.");
  return gl;
}
function resizeCanvasToDisplaySize(canvas, dpr = globalThis.devicePixelRatio || 1) {
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

// src/render/gl/geometry-stream.ts
var DirtyRanges = class {
  ranges = [];
  add(start, end) {
    if (end > start) this.ranges.push([start, end]);
  }
  /** Sorted, merged ranges. Gaps smaller than `mergeGap` elements are bridged. */
  take(mergeGap) {
    const r = this.ranges.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [s, e] of r) {
      const last = out[out.length - 1];
      if (last && s <= last[1] + mergeGap) last[1] = Math.max(last[1], e);
      else out.push([s, e]);
    }
    this.ranges = [];
    return out;
  }
  get empty() {
    return this.ranges.length === 0;
  }
};
var MERGE_GAP_BYTES = 4096;
var GeometryStream = class {
  constructor(gl, attributes, options = {}) {
    this.gl = gl;
    if (attributes.length === 0) throw new GlError("GeometryStream needs at least one attribute");
    this.vertexCapacity = Math.max(16, options.initialVertices ?? 4096);
    this.indexCapacity = Math.max(16, options.initialIndices ?? 8192);
    this.memory = options.memory;
    this.label = options.label ?? "geometry";
    const vao = gl.createVertexArray();
    if (!vao) throw new GlError("createVertexArray returned null (context lost?)");
    this.vao = vao;
    const usageOf = (u) => u === "static" ? gl.STATIC_DRAW : u === "dynamic" ? gl.DYNAMIC_DRAW : gl.STREAM_DRAW;
    gl.bindVertexArray(vao);
    this.attributes = attributes.map((spec) => {
      if (this.byName.has(spec.name)) throw new GlError(`Duplicate attribute "${spec.name}"`);
      const buffer = gl.createBuffer();
      if (!buffer) throw new GlError("createBuffer returned null (context lost?)");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(spec.location);
      gl.vertexAttribPointer(spec.location, spec.components, gl.FLOAT, false, 0, 0);
      const a = {
        ...spec,
        stream: {
          buffer,
          data: new Float32Array(this.vertexCapacity * spec.components),
          gpuElements: 0,
          dirty: new DirtyRanges(),
          usage: usageOf(spec.usage),
          target: gl.ARRAY_BUFFER
        }
      };
      this.byName.set(spec.name, a);
      return a;
    });
    const ib = gl.createBuffer();
    if (!ib) throw new GlError("createBuffer returned null (context lost?)");
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    this.indices = {
      buffer: ib,
      data: new Uint32Array(this.indexCapacity),
      gpuElements: 0,
      dirty: new DirtyRanges(),
      usage: gl.DYNAMIC_DRAW,
      target: gl.ELEMENT_ARRAY_BUFFER
    };
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  gl;
  vao;
  attributes;
  byName = /* @__PURE__ */ new Map();
  indices;
  slots = [];
  vertexCount = 0;
  indexCount = 0;
  vertexCapacity;
  indexCapacity;
  lastUploadBytes = 0;
  lastUploadCalls = 0;
  memory;
  label;
  get meshes() {
    return this.slots;
  }
  /**
   * Reserves space for a mesh. `indices` are local (0 … vertexCount-1) and are
   * stored offset by the mesh's first vertex.
   */
  addMesh(vertexCount, indices) {
    if (!Number.isInteger(vertexCount) || vertexCount < 0)
      throw new GlError(`Invalid vertex count ${vertexCount}`);
    this.ensureVertexCapacity(this.vertexCount + vertexCount);
    this.ensureIndexCapacity(this.indexCount + indices.length);
    const slot = {
      index: this.slots.length,
      vertexStart: this.vertexCount,
      vertexCount,
      indexStart: this.indexCount,
      indexCount: indices.length
    };
    this.slots.push(slot);
    this.vertexCount += vertexCount;
    this.indexCount += indices.length;
    this.setIndices(slot, indices);
    return slot;
  }
  /** Writes per-vertex data for one attribute of a mesh (`vertexCount × components` floats). */
  setAttribute(slot, name2, values) {
    const a = this.byName.get(name2);
    if (!a) throw new GlError(`Unknown attribute "${name2}"`);
    const n = slot.vertexCount * a.components;
    if (values.length !== n) {
      throw new GlError(
        `Attribute "${name2}" of mesh ${slot.index}: got ${values.length} floats, expected ${n}`
      );
    }
    const start = slot.vertexStart * a.components;
    a.stream.data.set(values, start);
    a.stream.dirty.add(start, start + n);
  }
  /** Replaces a mesh's indices (same count as when it was added). */
  setIndices(slot, indices) {
    if (indices.length !== slot.indexCount) {
      throw new GlError(
        `Mesh ${slot.index}: got ${indices.length} indices, expected ${slot.indexCount}`
      );
    }
    const d = this.indices.data;
    for (let i2 = 0; i2 < indices.length; i2++) {
      const v = indices[i2];
      if (!(v >= 0 && v < slot.vertexCount) || !Number.isInteger(v)) {
        throw new GlError(
          `Mesh ${slot.index}: index ${v} at ${i2} is outside [0, ${slot.vertexCount})`
        );
      }
      d[slot.indexStart + i2] = slot.vertexStart + v;
    }
    this.indices.dirty.add(slot.indexStart, slot.indexStart + indices.length);
  }
  /** Removes all meshes (buffers keep their capacity). */
  clear() {
    this.slots.length = 0;
    this.vertexCount = 0;
    this.indexCount = 0;
  }
  /** Sends every dirty range to the GPU. Call once per frame before drawing. */
  upload() {
    const gl = this.gl;
    let bytes = 0;
    let calls = 0;
    const flush = (s, usedElements) => {
      gl.bindBuffer(s.target, s.buffer);
      if (s.gpuElements < s.data.length) {
        gl.bufferData(s.target, s.data.byteLength, s.usage);
        s.gpuElements = s.data.length;
        if (usedElements > 0) {
          gl.bufferSubData(s.target, 0, s.data, 0, usedElements);
          bytes += usedElements * 4;
          calls++;
        }
        s.dirty.take(0);
        return;
      }
      if (s.dirty.empty) return;
      const ranges = s.dirty.take(MERGE_GAP_BYTES / 4);
      for (const [start, end0] of ranges) {
        const end = Math.min(end0, usedElements);
        if (end <= start) continue;
        gl.bufferSubData(s.target, start * 4, s.data, start, end - start);
        bytes += (end - start) * 4;
        calls++;
      }
    };
    gl.bindVertexArray(this.vao);
    for (const a of this.attributes) flush(a.stream, this.vertexCount * a.components);
    flush(this.indices, this.indexCount);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.lastUploadBytes = bytes;
    this.lastUploadCalls = calls;
    this.memory?.set(this, "buffer", this.label, this.gpuBytes());
  }
  /** Binds the VAO. Call before {@link draw}. */
  bind() {
    this.gl.bindVertexArray(this.vao);
  }
  /** Draws one mesh as triangles (the VAO must be bound). */
  draw(slot) {
    if (slot.indexCount === 0) return;
    this.gl.drawElements(
      this.gl.TRIANGLES,
      slot.indexCount,
      this.gl.UNSIGNED_INT,
      slot.indexStart * 4
    );
  }
  /** Draws a contiguous run of meshes with one call (they must be adjacent slots). */
  drawRange(first, last) {
    const count = last.indexStart + last.indexCount - first.indexStart;
    if (count > 0)
      this.gl.drawElements(this.gl.TRIANGLES, count, this.gl.UNSIGNED_INT, first.indexStart * 4);
  }
  unbind() {
    this.gl.bindVertexArray(null);
  }
  get stats() {
    return {
      meshes: this.slots.length,
      vertices: this.vertexCount,
      indices: this.indexCount,
      uploadedBytes: this.lastUploadBytes,
      uploadCalls: this.lastUploadCalls,
      gpuBytes: this.gpuBytes()
    };
  }
  gpuBytes() {
    let b = this.indices.gpuElements * 4;
    for (const a of this.attributes) b += a.stream.gpuElements * 4;
    return b;
  }
  ensureVertexCapacity(n) {
    if (n <= this.vertexCapacity) return;
    let cap = this.vertexCapacity;
    while (cap < n) cap *= 2;
    this.vertexCapacity = cap;
    for (const a of this.attributes) {
      const grown = new Float32Array(cap * a.components);
      grown.set(a.stream.data);
      a.stream.data = grown;
      a.stream.gpuElements = 0;
    }
  }
  ensureIndexCapacity(n) {
    if (n <= this.indexCapacity) return;
    let cap = this.indexCapacity;
    while (cap < n) cap *= 2;
    this.indexCapacity = cap;
    const grown = new Uint32Array(cap);
    grown.set(this.indices.data);
    this.indices.data = grown;
    this.indices.gpuElements = 0;
  }
  dispose() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    for (const a of this.attributes) gl.deleteBuffer(a.stream.buffer);
    gl.deleteBuffer(this.indices.buffer);
    this.memory?.delete(this);
  }
};

// src/render/gl/shader.ts
var ShaderCompileError = class extends GlError {
  constructor(stage, log, source, label) {
    super(
      `${label ? `[${label}] ` : ""}${stage} shader failed to compile:
${log.trim()}
--- source ---
${numberLines(source, log)}`
    );
    this.stage = stage;
    this.log = log;
    this.source = source;
    this.label = label;
    this.name = "ShaderCompileError";
  }
  stage;
  log;
  source;
  label;
};
var ProgramLinkError = class extends GlError {
  constructor(log, label) {
    super(`${label ? `[${label}] ` : ""}program failed to link:
${log.trim()}`);
    this.log = log;
    this.label = label;
    this.name = "ProgramLinkError";
  }
  log;
  label;
};
function numberLines(source, log) {
  const bad = /* @__PURE__ */ new Set();
  for (const m of log.matchAll(/\d+:(\d+)/g)) bad.add(Number(m[1]));
  return source.split("\n").map((line, i2) => `${bad.has(i2 + 1) ? ">>" : "  "}${String(i2 + 1).padStart(4)}| ${line}`).join("\n");
}
function compileShader(gl, stage, source, label) {
  const shader = gl.createShader(stage === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
  if (!shader) throw new GlError(`createShader(${stage}) returned null (context lost?)`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(no log)";
    gl.deleteShader(shader);
    throw new ShaderCompileError(stage, log, source, label);
  }
  return shader;
}
var ShaderProgram = class {
  constructor(gl, vertexSource, fragmentSource2, label, attribBindings = {}) {
    this.gl = gl;
    this.label = label;
    const vs = compileShader(gl, "vertex", vertexSource, label);
    let fs;
    try {
      fs = compileShader(gl, "fragment", fragmentSource2, label);
    } catch (e) {
      gl.deleteShader(vs);
      throw e;
    }
    const program = gl.createProgram();
    if (!program) throw new GlError("createProgram returned null (context lost?)");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    for (const [name2, loc] of Object.entries(attribBindings))
      gl.bindAttribLocation(program, loc, name2);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "(no log)";
      gl.deleteProgram(program);
      throw new ProgramLinkError(log, label);
    }
    this.program = program;
  }
  gl;
  label;
  program;
  uniforms = /* @__PURE__ */ new Map();
  attribs = /* @__PURE__ */ new Map();
  use() {
    this.gl.useProgram(this.program);
    return this;
  }
  /** Uniform location; `null` if the uniform is unused/optimized out. */
  uniform(name2) {
    let loc = this.uniforms.get(name2);
    if (loc === void 0) {
      loc = this.gl.getUniformLocation(this.program, name2);
      this.uniforms.set(name2, loc);
    }
    return loc;
  }
  /** Attribute location; -1 if unused. */
  attrib(name2) {
    let loc = this.attribs.get(name2);
    if (loc === void 0) {
      loc = this.gl.getAttribLocation(this.program, name2);
      this.attribs.set(name2, loc);
    }
    return loc;
  }
  dispose() {
    this.gl.deleteProgram(this.program);
  }
};

// src/render/gl/render-target.ts
var RenderTarget = class {
  constructor(gl, width, height, options = {}) {
    this.gl = gl;
    const opts = typeof options === "boolean" ? { stencil: options } : options;
    this.withStencil = opts.stencil ?? false;
    this.filter = opts.filter ?? "linear";
    this.memory = opts.memory;
    this.label = opts.label ?? "render target";
    const fb = gl.createFramebuffer();
    const tex = gl.createTexture();
    if (!fb || !tex) throw new GlError("Failed to create framebuffer/texture (context lost?)");
    this.framebuffer = fb;
    this.texture = tex;
    this.resize(width, height);
  }
  gl;
  framebuffer;
  texture;
  withStencil;
  filter;
  stencil = null;
  _width = 0;
  _height = 0;
  memory;
  label;
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  /** Nominal GPU bytes (color + stencil). */
  get bytes() {
    return this._width * this._height * (4 + (this.withStencil ? 1 : 0));
  }
  resize(width, height) {
    if (width === this._width && height === this._height) return;
    const gl = this.gl;
    const max2 = Math.min(
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_TEXTURE_SIZE)
    );
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > max2 || height > max2) {
      throw new GlError(`Render target size ${width}x${height} outside [1, ${max2}]`);
    }
    this._width = width;
    this._height = height;
    const filter = this.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    if (this.withStencil) {
      if (!this.stencil) this.stencil = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.stencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, width, height);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.STENCIL_ATTACHMENT,
        gl.RENDERBUFFER,
        this.stencil
      );
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new GlError(`Framebuffer incomplete: 0x${status.toString(16)} (${width}x${height})`);
    }
    this.memory?.set(
      this,
      "render-target",
      `${this.label} ${width}x${height}${this.withStencil ? "+stencil" : ""}`,
      this.bytes
    );
  }
  /** Binds this target for drawing and sets the viewport to its full size. */
  bind() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.viewport(0, 0, this._width, this._height);
  }
  /** Reads back RGBA8 pixels exactly as stored, rows top-to-bottom. */
  readPixels() {
    const gl = this.gl;
    const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    const px = readFramebufferRgba(gl, 0, 0, this._width, this._height);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
    return px;
  }
  dispose() {
    this.gl.deleteFramebuffer(this.framebuffer);
    this.gl.deleteTexture(this.texture);
    if (this.stencil) this.gl.deleteRenderbuffer(this.stencil);
    this.memory?.delete(this);
  }
};
function readFramebufferRgba(gl, x2, y, width, height) {
  const px = new Uint8Array(width * height * 4);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.readPixels(x2, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const row = width * 4;
  const tmp = new Uint8Array(row);
  for (let r = 0; r < height >> 1; r++) {
    const a = r * row;
    const b = (height - 1 - r) * row;
    tmp.set(px.subarray(a, a + row));
    px.copyWithin(a, b, b + row);
    px.set(tmp, b);
  }
  return px;
}

// src/render/gl/state-cache.ts
var UNKNOWN = /* @__PURE__ */ Symbol("unknown");
var GlStateCache = class {
  constructor(gl) {
    this.gl = gl;
  }
  gl;
  /** State-changing GL calls issued and skipped. */
  issued = 0;
  skipped = 0;
  /** Framebuffer binds issued (each can end a render pass on tiled GPUs). */
  framebufferBinds = 0;
  program = UNKNOWN;
  drawFb = UNKNOWN;
  readFb = UNKNOWN;
  vao = UNKNOWN;
  vp = [NaN, NaN, NaN, NaN];
  sc = [NaN, NaN, NaN, NaN];
  cc = [NaN, NaN, NaN, NaN];
  caps = /* @__PURE__ */ new Map();
  blendFn = [NaN, NaN, NaN, NaN];
  blendEq = NaN;
  mask = -1;
  unit = -1;
  units = [];
  /** Forgets everything (the next call of each kind is issued). */
  reset() {
    this.program = this.drawFb = this.readFb = this.vao = UNKNOWN;
    this.vp.fill(NaN);
    this.sc.fill(NaN);
    this.cc.fill(NaN);
    this.caps.clear();
    this.blendFn.fill(NaN);
    this.blendEq = NaN;
    this.mask = -1;
    this.unit = -1;
    this.units.length = 0;
  }
  hit() {
    this.skipped++;
    return true;
  }
  useProgram(p) {
    if (this.program === p && this.hit()) return;
    this.gl.useProgram(p);
    this.program = p;
    this.issued++;
  }
  /** Binds `fb` for drawing and reading. */
  bindFramebuffer(fb) {
    if (this.drawFb === fb && this.readFb === fb && this.hit()) return;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
    this.drawFb = this.readFb = fb;
    this.issued++;
    this.framebufferBinds++;
  }
  bindDrawFramebuffer(fb) {
    if (this.drawFb === fb && this.hit()) return;
    this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, fb);
    this.drawFb = fb;
    this.issued++;
    this.framebufferBinds++;
  }
  bindReadFramebuffer(fb) {
    if (this.readFb === fb && this.hit()) return;
    this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, fb);
    this.readFb = fb;
    this.issued++;
    this.framebufferBinds++;
  }
  bindVertexArray(vao) {
    if (this.vao === vao && this.hit()) return;
    this.gl.bindVertexArray(vao);
    this.vao = vao;
    this.issued++;
  }
  same4(a, x2, y, z, w) {
    return a[0] === x2 && a[1] === y && a[2] === z && a[3] === w;
  }
  viewport(x2, y, w, h) {
    if (this.same4(this.vp, x2, y, w, h) && this.hit()) return;
    this.gl.viewport(x2, y, w, h);
    this.vp.splice(0, 4, x2, y, w, h);
    this.issued++;
  }
  scissor(x2, y, w, h) {
    if (this.same4(this.sc, x2, y, w, h) && this.hit()) return;
    this.gl.scissor(x2, y, w, h);
    this.sc.splice(0, 4, x2, y, w, h);
    this.issued++;
  }
  clearColor(r, g, b, a) {
    const c = this.cc;
    if (Object.is(c[0], r) && Object.is(c[1], g) && Object.is(c[2], b) && Object.is(c[3], a)) {
      if (this.hit()) return;
    }
    this.gl.clearColor(r, g, b, a);
    this.cc.splice(0, 4, r, g, b, a);
    this.issued++;
  }
  /** Enables or disables a capability (BLEND, CULL_FACE, SCISSOR_TEST, …). */
  set(cap, on) {
    if (this.caps.get(cap) === on && this.hit()) return;
    if (on) this.gl.enable(cap);
    else this.gl.disable(cap);
    this.caps.set(cap, on);
    this.issued++;
  }
  blendEquation(mode) {
    if (this.blendEq === mode && this.hit()) return;
    this.gl.blendEquation(mode);
    this.blendEq = mode;
    this.issued++;
  }
  blendFuncSeparate(srcRgb, dstRgb, srcA, dstA) {
    if (this.same4(this.blendFn, srcRgb, dstRgb, srcA, dstA) && this.hit()) return;
    this.gl.blendFuncSeparate(srcRgb, dstRgb, srcA, dstA);
    this.blendFn.splice(0, 4, srcRgb, dstRgb, srcA, dstA);
    this.issued++;
  }
  colorMask(r, g, b, a) {
    const m = (r ? 1 : 0) | (g ? 2 : 0) | (b ? 4 : 0) | (a ? 8 : 0);
    if (this.mask === m && this.hit()) return;
    this.gl.colorMask(r, g, b, a);
    this.mask = m;
    this.issued++;
  }
  /** Binds a 2D texture to a texture unit. */
  bindTexture(unit, tex) {
    if (this.units[unit] === tex && this.hit()) return;
    if (this.unit !== unit) {
      this.gl.activeTexture(this.gl.TEXTURE0 + unit);
      this.unit = unit;
      this.issued++;
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.units[unit] = tex;
    this.issued++;
  }
};
var CachedUniform = class {
  constructor(gl, location2, counter) {
    this.gl = gl;
    this.location = location2;
    this.counter = counter;
  }
  gl;
  location;
  counter;
  last = new Float64Array(4);
  known = false;
  same(n, a, b, c, d) {
    const l = this.last;
    if (!this.known) return false;
    return Object.is(l[0], a) && (n < 2 || Object.is(l[1], b)) && (n < 3 || Object.is(l[2], c)) && (n < 4 || Object.is(l[3], d));
  }
  store(a, b, c, d) {
    const l = this.last;
    l[0] = a;
    l[1] = b;
    l[2] = c;
    l[3] = d;
    this.known = true;
    this.counter.sent++;
  }
  set1i(a) {
    if (this.location === null) return;
    if (this.same(1, a, 0, 0, 0)) {
      this.counter.skipped++;
      return;
    }
    this.gl.uniform1i(this.location, a);
    this.store(a, 0, 0, 0);
  }
  set1f(a) {
    if (this.location === null) return;
    if (this.same(1, a, 0, 0, 0)) {
      this.counter.skipped++;
      return;
    }
    this.gl.uniform1f(this.location, a);
    this.store(a, 0, 0, 0);
  }
  set2f(a, b) {
    if (this.location === null) return;
    if (this.same(2, a, b, 0, 0)) {
      this.counter.skipped++;
      return;
    }
    this.gl.uniform2f(this.location, a, b);
    this.store(a, b, 0, 0);
  }
  set3f(a, b, c) {
    if (this.location === null) return;
    if (this.same(3, a, b, c, 0)) {
      this.counter.skipped++;
      return;
    }
    this.gl.uniform3f(this.location, a, b, c);
    this.store(a, b, c, 0);
  }
  lastMatrix = null;
  /** A 4 × 4 matrix, column-major (as WebGL takes it). */
  setMatrix4(m) {
    if (this.location === null) return;
    const l = this.lastMatrix;
    if (l && l.every((v, i2) => Object.is(v, m[i2]))) {
      this.counter.skipped++;
      return;
    }
    this.gl.uniformMatrix4fv(this.location, false, m);
    this.lastMatrix = Float32Array.from(m);
    this.counter.sent++;
  }
  set4f(a, b, c, d) {
    if (this.location === null) return;
    if (this.same(4, a, b, c, d)) {
      this.counter.skipped++;
      return;
    }
    this.gl.uniform4f(this.location, a, b, c, d);
    this.store(a, b, c, d);
  }
};

// src/render/gl/gpu-timer.ts
var GpuTimer = class _GpuTimer {
  constructor(gl, ext) {
    this.gl = gl;
    this.ext = ext;
  }
  gl;
  ext;
  latest = null;
  pool = [];
  pending = [];
  frame = null;
  active = null;
  /** A timer, or null if the extension is unavailable. */
  static create(gl) {
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    return ext ? new _GpuTimer(gl, ext) : null;
  }
  beginFrame() {
    this.collect();
    this.frame = [];
  }
  /** Ends the running phase and starts timing `name`. */
  phase(name2) {
    if (!this.frame || this.active === name2) return;
    this.stop();
    const query = this.pool.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.frame.push({ name: name2, query });
    this.active = name2;
  }
  endFrame() {
    this.stop();
    if (this.frame?.length) this.pending.push(this.frame);
    this.frame = null;
    while (this.pending.length > 6) this.release(this.pending.shift());
  }
  stop() {
    if (this.active === null) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.active = null;
  }
  release(frame) {
    for (const f of frame) this.pool.push(f.query);
  }
  /** Reads the frames whose queries have all completed. */
  collect() {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const frame = this.pending[0];
      if (!frame.every((f) => gl.getQueryParameter(f.query, gl.QUERY_RESULT_AVAILABLE))) break;
      this.pending.shift();
      if (!disjoint) {
        const phases = {};
        let total = 0;
        for (const f of frame) {
          const ms = gl.getQueryParameter(f.query, gl.QUERY_RESULT) / 1e6;
          phases[f.name] = (phases[f.name] ?? 0) + ms;
          total += ms;
        }
        this.latest = { totalMs: total, phases };
      }
      this.release(frame);
    }
  }
  dispose() {
    this.stop();
    for (const f of this.pending) this.release(f);
    this.pending = [];
    for (const q2 of this.pool) this.gl.deleteQuery(q2);
    this.pool.length = 0;
  }
};

// src/render/model/mask-atlas.ts
var ATLAS_GUTTER = 2;
var QUANTUM = 16;
function axis(origin, extent, density, maxTexels) {
  const e = extent > 0 && Number.isFinite(extent) ? extent : 0;
  if (e * density <= maxTexels) return [origin, density, Math.ceil(e * density)];
  return [origin - 0.05 * e, maxTexels / (1.1 * e), maxTexels];
}
function packMaskAtlas(boxes, density, size, maxRegion, textureSize = size) {
  const T = textureSize;
  const g = ATLAS_GUTTER;
  const maxTexels = maxRegion - 2 * g;
  const out = [];
  let x2 = 0;
  let y = 0;
  let shelf = 0;
  for (const box of boxes) {
    if (!box) {
      out.push(null);
      continue;
    }
    const [X0, sx, nx] = axis(box.x0, box.w, density, maxTexels);
    const [Y0, sy, ny] = axis(box.y0, box.h, density, maxTexels);
    const w = Math.ceil((nx + 2 * g) / QUANTUM) * QUANTUM;
    const h = Math.ceil((ny + 2 * g) / QUANTUM) * QUANTUM;
    if (w > size || h > size) return null;
    if (x2 + w > size) {
      x2 = 0;
      y += shelf;
      shelf = 0;
    }
    if (y + h > size) return null;
    out.push({
      x: x2,
      y,
      w,
      h,
      map: { ox: X0, sx: sx / T, oy: Y0, sy: sy / T, lx: (x2 + g) / T, ly: (y + g) / T }
    });
    x2 += w;
    shelf = Math.max(shelf, h);
  }
  return out;
}
var ATLAS_LAYOUTS = [
  { size: 2048, maxRegion: 2048, densityScale: 1 },
  { size: 4096, maxRegion: 4096, densityScale: 1 },
  { size: 4096, maxRegion: 2048, densityScale: 0.5 },
  { size: 4096, maxRegion: 1024, densityScale: 0.25 }
];
function clipBox(box, view) {
  const x0 = Math.max(box.x0, view.x0);
  const y0 = Math.max(box.y0, view.y0);
  const x1 = Math.min(box.x0 + box.w, view.x1);
  const y1 = Math.min(box.y0 + box.h, view.y1);
  const cx = Math.min(Math.max(x0, view.x0), view.x1);
  const cy = Math.min(Math.max(y0, view.y0), view.y1);
  return {
    x0: x1 >= x0 ? x0 : cx,
    y0: y1 >= y0 ? y0 : cy,
    w: x1 >= x0 ? x1 - x0 : 0,
    h: y1 >= y0 ? y1 - y0 : 0
  };
}

// src/render/model/shaders.ts
var MESH_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
uniform vec4 uView;    // clip = aPos * uView.xy + uView.zw
uniform vec3 uTurn;    // view rotation in clip space (clipTurn); (1, 0, 0) for none
uniform mat4 uMaskTex; // output space \u2192 mask texture (maskMatrices)
out vec2 vUv;
out vec2 vMask;
void main() {
  vUv = aUv; // origin at the image's top-left = texture row 0
  vMask = (uMaskTex * vec4(aPos, 0.0, 1.0)).xy;
  vec2 p = aPos * uView.xy + uView.zw;
  if (uTurn != vec3(1.0, 0.0, 0.0))
    p = vec2(uTurn.x * p.x - uTurn.y * p.y, uTurn.z * p.x + uTurn.x * p.y);
  gl_Position = vec4(p, 0.0, 1.0);
}`;
var LAYER_VS = `#version 300 es
uniform mat4 uMaskTex; // clip space \u2192 mask texture (layerMaskMatrix)
out vec2 vUv;
out vec2 vMask;
void main() {
  vec2 uv = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 clip = uv * 2.0 - 1.0;
  vUv = uv;
  vMask = (uMaskTex * vec4(clip, 0.0, 1.0)).xy;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;
var MASK_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
uniform mat4 uMaskClip; // output space \u2192 the mask buffer's clip space (maskMatrices)
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uMaskClip * vec4(aPos, 0.0, 1.0);
}`;
var MASK_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  outColor = vec4(0.0, 0.0, 0.0, texture(uTex, vUv).a);
}`;
var ADVANCED_FUNCTIONS = `
float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
float satOf(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  vec3 o = c;
  if (n < 0.0) o = l + (o - l) * l / (l - n);
  if (x > 1.0) o = l + (o - l) * (1.0 - l) / (x - l);
  return o;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
vec3 setSat(vec3 c, float s) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float md = c.r + c.g + c.b - mx - mn;
  float nmx = 0.0;
  float nmd = 0.0;
  float nmn = 0.0;
  if (mn < mx) {
    nmx = s;
    nmd = (md - mn) * s / (mx - mn);
  }
  if (c.r == mx) return c.b < c.g ? vec3(nmx, nmd, nmn) : vec3(nmx, nmn, nmd);
  if (c.g == mx) return c.r < c.b ? vec3(nmn, nmx, nmd) : vec3(nmd, nmx, nmn);
  return c.g < c.r ? vec3(nmd, nmn, nmx) : vec3(nmn, nmd, nmx);
}
float channel(int code, float s, float d) {
  if (code == 3) return min(s + d, 1.0);
  if (code == 4) return s + d;
  if (code == 5) return min(s, d);
  if (code == 6) return s * d;
  if (code == 7) return abs(d - 1.0) < 1e-6 ? 1.0 : (abs(s) < 1e-6 ? 0.0 : 1.0 - min(1.0, (1.0 - d) / s));
  if (code == 8) return max(0.0, s + d - 1.0);
  if (code == 9) return max(s, d);
  if (code == 10) return s + d - s * d;
  if (code == 11) return d <= 0.0 ? 0.0 : (s == 1.0 ? 1.0 : min(1.0, d / (1.0 - s)));
  if (code == 12) return d < 0.5 ? 2.0 * s * d : 1.0 - 2.0 * (1.0 - s) * (1.0 - d);
  if (code == 13) {
    if (s <= 0.5) return d - (1.0 - 2.0 * s) * d * (1.0 - d);
    if (d <= 0.25) return d + (2.0 * s - 1.0) * d * ((16.0 * d - 12.0) * d + 3.0);
    return d + (2.0 * s - 1.0) * (sqrt(d) - d);
  }
  if (code == 14) return s < 0.5 ? 2.0 * s * d : 1.0 - 2.0 * (1.0 - s) * (1.0 - d);
  if (code == 15) return s < 0.5 ? max(0.0, 2.0 * s + d - 1.0) : min(1.0, 2.0 * (s - 0.5) + d);
  return s;
}
vec3 blendColor(int code, vec3 s, vec3 d) {
  if (code == 16) return setLum(setSat(s, satOf(d)), lum(d));
  if (code == 17) return setLum(s, lum(d));
  return vec3(channel(code, s.r, d.r), channel(code, s.g, d.g), channel(code, s.b, d.b));
}
vec3 weights(int mode, float As, float Ad) {
  if (mode == 1) return vec3(As * Ad, 0.0, Ad * (1.0 - As));
  if (mode == 2) return vec3(0.0, 0.0, Ad * (1.0 - As));
  if (mode == 3) return vec3(min(As, Ad), max(As - Ad, 0.0), max(Ad - As, 0.0));
  if (mode == 4) return vec3(max(As + Ad - 1.0, 0.0), min(As, 1.0 - Ad), min(Ad, 1.0 - As));
  return vec3(As * Ad, As * (1.0 - Ad), Ad * (1.0 - As));
}
`;
function fragmentSource(advanced) {
  return `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in vec2 vMask;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform highp sampler2D uDst;
uniform vec3 uMultiply;
uniform vec3 uScreen;
uniform vec3 uTint;     // an application tint of the final color (not reference behavior)
uniform float uOpacity;
uniform int uMaskMode; // 0 none, 1 normal, 2 inverted
uniform int uColorFn;
uniform int uAlphaMode;
out vec4 outColor;
// Each channel clamped to [0, 1], NaN becoming 0 (the comparison is false for NaN).
float unit1(float x) { return x > 0.0 ? min(x, 1.0) : 0.0; }
vec4 unit(vec4 v) { return vec4(unit1(v.r), unit1(v.g), unit1(v.b), unit1(v.a)); }
${advanced ? ADVANCED_FUNCTIONS : ""}
float maskFactor() {
  if (uMaskMode == 0) return 1.0;
  float m = 1.0 - texture(uMask, vMask).r;
  return uMaskMode == 1 ? m : 1.0 - m;
}
void main() {
  vec4 t = texture(uTex, vUv);
  vec3 rgb = t.rgb * uMultiply;
${advanced ? `  rgb = rgb + uScreen - rgb * uScreen; // no factor a (\xA72h.3)
  if (uTint != vec3(1.0)) rgb *= uTint;
  // A tint above 1 brightens up to white: the color (straight) is limited to 1.
  if (any(greaterThan(uTint, vec3(1.0)))) rgb = min(rgb, vec3(t.a));
  vec4 c = vec4(rgb, t.a) * uOpacity;
  float As = c.a;
  vec3 Cs = As >= 1e-5 ? c.rgb / As : vec3(0.0);
  As *= maskFactor();
  vec4 d = texelFetch(uDst, ivec2(gl_FragCoord.xy), 0);
  float Ad = d.a;
  vec3 Cd = Ad >= 1e-5 ? d.rgb / Ad : vec3(0.0);
  vec3 B = blendColor(uColorFn, Cs, Cd);
  vec3 p = weights(uAlphaMode, As, Ad);
  // The source alpha is not clamped above; the stored result is.
  outColor = unit(vec4(p.x * B + p.y * Cs + p.z * Cd, p.x + p.y + p.z));` : `  rgb = rgb + uScreen * t.a - rgb * uScreen;
  if (uTint != vec3(1.0)) rgb *= uTint;
  // A tint above 1 brightens up to white: the color (premultiplied) is limited to its alpha.
  if (any(greaterThan(uTint, vec3(1.0)))) rgb = min(rgb, vec3(t.a));
  // The opacity is not clamped before the product (+\u221E saturates); the source is.
  outColor = unit(vec4(rgb, t.a) * uOpacity * maskFactor());`}
}`;
}

// src/render/model/model-renderer.ts
var REFERENCE_MASK_SIZE = 4096;
var OFFSCREEN_MASK_SIZE = 256;
var DOUBLE_SIDED = 4;
var INVERTED_MASK = 8;
var Program = class {
  constructor(shader, counter) {
    this.shader = shader;
    this.counter = counter;
  }
  shader;
  counter;
  uniforms = /* @__PURE__ */ new Map();
  u(name2) {
    let u = this.uniforms.get(name2);
    if (!u) {
      u = new CachedUniform(this.shader.gl, this.shader.uniform(name2), this.counter);
      this.uniforms.set(name2, u);
    }
    return u;
  }
};
var NO_MASK = 2147483647;
var emptyStats = (pipeline, masks) => ({
  pipeline,
  masks,
  drawn: 0,
  masked: 0,
  maskBuilds: 0,
  masksReused: 0,
  maskMeshDraws: 0,
  layers: 0,
  advancedDraws: 0,
  drawCalls: 0,
  meshesUploaded: 0,
  uploads: 0,
  uploadBytes: 0,
  stateChanges: 0,
  stateSkipped: 0,
  framebufferBinds: 0,
  uniforms: 0,
  uniformsSkipped: 0,
  cpuMs: { upload: 0, masks: 0, draw: 0, total: 0 },
  gpuMs: null
});
var sameMap = (a, b) => a.ox === b.ox && a.sx === b.sx && a.oy === b.oy && a.sy === b.sy && (a.lx ?? 0) === (b.lx ?? 0) && (a.ly ?? 0) === (b.ly ?? 0);
var matricesOf = /* @__PURE__ */ new WeakMap();
function glMatrices(map) {
  let m = matricesOf.get(map);
  if (!m) {
    const { texture, clip } = maskMatrices(map);
    m = { texture: columnMajor(texture), clip: columnMajor(clip) };
    matricesOf.set(map, m);
  }
  return m;
}
var NO_MASK_MATRIX = new Float32Array(16);
var ModelRenderer = class {
  constructor(gl, model, textures, options = {}) {
    this.gl = gl;
    this.model = model;
    this.textures = textures;
    const m = model;
    this.size = options.maskSize ?? REFERENCE_MASK_SIZE;
    this.offscreenSize = options.offscreenMaskSize ?? OFFSCREEN_MASK_SIZE;
    this.maskMeshes = options.maskMeshes ?? "all";
    this.maskMode = options.masks ?? "per-drawable";
    this.oversample = options.maskOversample ?? 2;
    this.memory = options.memory;
    this.state = new GlStateCache(gl);
    this.timer = options.gpuTiming ? GpuTimer.create(gl) : null;
    const c = this.uniformCounter;
    const vs = MESH_VS;
    this.meshCompatible = new Program(new ShaderProgram(gl, vs, fragmentSource(false), "mesh"), c);
    this.meshAdvanced = new Program(
      new ShaderProgram(gl, vs, fragmentSource(true), "mesh advanced"),
      c
    );
    this.layerCompatible = new Program(
      new ShaderProgram(gl, LAYER_VS, fragmentSource(false), "layer"),
      c
    );
    this.layerAdvanced = new Program(
      new ShaderProgram(gl, LAYER_VS, fragmentSource(true), "layer advanced"),
      c
    );
    this.maskProgram = new Program(new ShaderProgram(gl, MASK_VS, MASK_FS, "mask"), c);
    const vao = gl.createVertexArray();
    if (!vao) throw new GlError("createVertexArray returned null (context lost?)");
    this.fullscreenVao = vao;
    const N = m.meshes.ids.length;
    this.stream = new GeometryStream(
      gl,
      [
        { name: "position", location: 0, components: 2, usage: "dynamic" },
        { name: "uv", location: 1, components: 2, usage: "static" }
      ],
      {
        initialVertices: Math.max(
          16,
          m.meshes.vertexCount.reduce((a, b) => a + b, 0)
        ),
        initialIndices: Math.max(
          16,
          m.meshes.triangles.reduce((a, t) => a + t.length, 0)
        ),
        ...options.memory ? { memory: options.memory } : {},
        label: "model geometry"
      }
    );
    for (let i2 = 0; i2 < N; i2++) {
      const slot = this.stream.addMesh(m.meshes.vertexCount[i2], outputTriangles(m, i2));
      this.stream.setAttribute(slot, "uv", sampledUvs(m.meshes.uvs[i2]));
      this.slots.push(slot);
    }
    this.staged = new Uint32Array(N);
    this.layered = m.offscreens.part.length > 0 || Array.from(m.meshes.blendMode).some((c2) => !isCompatibleBlend(c2));
    this.blendOf = Array.from(
      m.meshes.flags,
      (f, i2) => this.layered ? compatibleBlendMode(m.meshes.blendMode[i2]) : legacyBlendOf(f)
    );
    this.drawableGroups = maskGroups(m.meshes.masks);
    this.offscreenGroups = maskGroups(m.offscreens.masks);
    this.offscreenBoxMembers = this.offscreenGroups.groups.map((g) => {
      const set = /* @__PURE__ */ new Set();
      for (const o of g.members)
        for (const d of drawablesUnder(m.meshes.part, m.parts.parent, m.offscreens.part[o]))
          set.add(d);
      return Int32Array.from([...set].sort((a, b) => a - b));
    });
    this.atlasEntries = new Array(
      this.drawableGroups.groups.length + this.offscreenGroups.groups.length
    ).fill(null);
    this.order = new Int32Array(N + m.offscreens.part.length);
    this.stats = emptyStats(this.layered ? "layered" : "direct", this.maskMode);
  }
  gl;
  model;
  textures;
  size;
  offscreenSize;
  /** Which mask meshes are rasterized (C13). */
  maskMeshes;
  maskMode;
  oversample;
  /** True if the file needs the layered pipeline (§2h.1). */
  layered;
  stream;
  slots = [];
  uniformCounter = { sent: 0, skipped: 0 };
  meshCompatible;
  meshAdvanced;
  layerCompatible;
  layerAdvanced;
  maskProgram;
  fullscreenVao;
  state;
  timer;
  maskTarget = null;
  offscreenMaskTarget = null;
  atlas = null;
  atlasGeneration = 0;
  /** Atlas entries: drawable groups first, then offscreen groups. */
  atlasEntries;
  /** This frame's atlas regions, or null when the frame uses per-drawable masks. */
  atlasRegions = null;
  drawableGroups;
  offscreenGroups;
  /** Drawables under each offscreen group's owners (box members, §2h.4). */
  offscreenBoxMembers;
  blendOf;
  layerPool = [];
  dstCopy = null;
  inst = null;
  /** Per drawable: the instance's vertex version last staged for upload. */
  staged;
  meshesStaged = 0;
  /** Entries in render order: drawable d as d, offscreen o as −1 − o. */
  order;
  /** Per-drawable mode, per frame: box and mapping of each mask group, computed on first use. */
  groupMap = [];
  offscreenMap = [];
  framing = null;
  /** This frame's tints (FrameOptions.tints), or null. */
  tints = null;
  view = [0, 0, 0, 0];
  /** The view rotation in clip space (see clipTurn). */
  turn = [1, 0, 0];
  /** Drawable mask group held by the drawable mask buffer, and offscreen group by the offscreen one. */
  maskHolds = NO_MASK;
  offscreenMaskHolds = NO_MASK;
  memory;
  stats;
  /** Per-drawable mask buffer size S. */
  get maskSize() {
    return this.size;
  }
  /** Offscreen mask buffer size (C8). */
  get offscreenMaskSize() {
    return this.offscreenSize;
  }
  get masks() {
    return this.maskMode;
  }
  /** True if GPU frame times are being measured. */
  get gpuTimed() {
    return this.timer !== null;
  }
  /** Changes the per-drawable mask buffer size S (the reference is 4096). */
  setMaskSize(size) {
    if (size === this.size) return;
    this.size = size;
    this.maskTarget?.dispose();
    this.maskTarget = null;
    this.maskHolds = this.offscreenMaskHolds = NO_MASK;
    this.groupMap.fill(null);
    this.offscreenMap.fill(null);
  }
  /** Switches mask modes; `oversample` sets the atlas's texels per image pixel. */
  setMaskMode(mode, oversample = this.oversample) {
    this.maskMode = mode;
    this.oversample = oversample;
    this.maskHolds = this.offscreenMaskHolds = NO_MASK;
  }
  /** Takes the instance's current outputs (call after evaluate()). */
  update(inst) {
    const fresh = inst !== this.inst;
    this.inst = inst;
    const version = inst.drawableVertexVersion;
    let n = 0;
    for (let i2 = 0; i2 < this.slots.length; i2++) {
      if (!fresh && this.staged[i2] === version[i2]) continue;
      this.stream.setAttribute(this.slots[i2], "position", inst.drawableVertices[i2]);
      this.staged[i2] = version[i2];
      n++;
    }
    this.meshesStaged += n;
    const order = this.order;
    order.fill(2147483647);
    inst.drawableRenderOrder.forEach((pos, d) => order[pos] = d);
    inst.offscreenRenderOrder.forEach((pos, o) => order[pos] = -1 - o);
    this.groupMap = new Array(this.drawableGroups.groups.length).fill(null);
    this.offscreenMap = new Array(this.offscreenGroups.groups.length).fill(null);
  }
  /** Draws the last updated state. */
  draw(frame) {
    const inst = this.inst;
    if (!inst) throw new GlError("ModelRenderer.draw() before update()");
    const gl = this.gl;
    const t0 = performance.now();
    const f = frame.framing;
    this.framing = f;
    this.tints = frame.tints ?? null;
    this.view = clipTransform(f);
    this.turn = clipTurn(f);
    const s = this.stats = emptyStats(this.layered ? "layered" : "direct", this.maskMode);
    this.timer?.beginFrame();
    this.timer?.phase("draws");
    this.maskHolds = this.offscreenMaskHolds = NO_MASK;
    this.stream.upload();
    const up = this.stream.stats;
    s.uploads = up.uploadCalls;
    s.uploadBytes = up.uploadedBytes;
    s.meshesUploaded = this.meshesStaged;
    this.meshesStaged = 0;
    const t1 = performance.now();
    s.cpuMs.upload = t1 - t0;
    const st = this.state;
    st.reset();
    st.issued = st.skipped = st.framebufferBinds = 0;
    this.uniformCounter.sent = this.uniformCounter.skipped = 0;
    this.atlasRegions = this.maskMode === "atlas" ? this.prepareAtlas() : null;
    const [r, g, b, a] = frame.background ?? [0, 0, 0, 0];
    st.bindFramebuffer(frame.target);
    st.viewport(0, 0, f.width, f.height);
    this.baseState();
    if (frame.clear ?? true) {
      st.clearColor(r * a, g * a, b * a, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const n = this.order.length;
    const from = Math.max(0, Math.min(n, frame.range?.from ?? 0));
    const to = Math.max(from, Math.min(n, frame.range?.to ?? n));
    const inserts = frame.inserts ?? null;
    if (this.layered) this.drawLayered(frame, from, to, inserts);
    else this.drawDirect(frame.target, from, to, inserts);
    st.set(gl.BLEND, false);
    st.set(gl.CULL_FACE, false);
    st.bindVertexArray(null);
    st.bindTexture(2, null);
    st.bindTexture(1, null);
    st.bindTexture(0, null);
    this.timer?.endFrame();
    s.stateChanges = st.issued;
    s.stateSkipped = st.skipped;
    s.framebufferBinds = st.framebufferBinds;
    s.uniforms = this.uniformCounter.sent;
    s.uniformsSkipped = this.uniformCounter.skipped;
    s.gpuMs = this.timer?.latest ?? null;
    s.cpuMs.total = performance.now() - t0;
    s.cpuMs.draw = s.cpuMs.total - s.cpuMs.upload - s.cpuMs.masks;
  }
  // ------------------------------------------------------------ pipelines
  /** The fixed state that every draw of a frame relies on. */
  baseState() {
    const gl = this.gl;
    const st = this.state;
    st.set(gl.SCISSOR_TEST, false);
    st.set(gl.DEPTH_TEST, false);
    st.set(gl.STENCIL_TEST, false);
    st.colorMask(true, true, true, true);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    st.issued += 2;
  }
  /** Runs inserted drawing into `fb`, then takes up the frame's state again. */
  runInserts(hooks, fb) {
    const st = this.state;
    const f = this.framing;
    for (const hook of hooks) {
      st.bindFramebuffer(fb);
      st.viewport(0, 0, f.width, f.height);
      hook(fb);
      st.reset();
      this.baseState();
    }
  }
  /** §2d: every visible drawable straight into the destination, in render order. */
  drawDirect(target2, from, to, inserts) {
    const inst = this.inst;
    for (let k = from; k < to; k++) {
      const d = this.order[k];
      if (d < 0 || d === 2147483647) continue;
      const ins = inserts?.get(d);
      if (ins?.below) this.runInserts(ins.below, target2);
      if (inst.drawableVisible[d]) this.drawMesh(d, target2, null);
      if (ins?.above) this.runInserts(ins.above, target2);
    }
  }
  /**
   * Whether render-order element e (a drawable, or offscreen o as −1 − o)
   * closes the layer of offscreen `o`: an offscreen element closes the layers
   * whose owner is not a proper ancestor of its owner; a drawable those whose
   * owner is not its part or an ancestor of it.
   */
  closesLayer(o, e) {
    const m = this.model;
    const parents = m.parts.parent;
    const owner = m.offscreens.part[o];
    if (e < 0) {
      const next = m.offscreens.part[-1 - e];
      return owner === next || !isSelfOrAncestor(parents, owner, next);
    }
    return !isSelfOrAncestor(parents, owner, m.meshes.part[e]);
  }
  /** §2h.2: layers for offscreens; L₀ composited over the destination at the end. */
  drawLayered(frame, from, to, inserts) {
    const inst = this.inst;
    const stack = [{ target: this.acquireLayer(), offscreen: -1 }];
    const top = () => stack[stack.length - 1];
    const closeTop = () => {
      const layer = stack.pop();
      this.compositeOffscreen(layer, top());
      this.releaseLayer(layer.target);
    };
    const skips = (e) => e >= 0 && !inst.drawableVisible[e] && !inserts?.has(e);
    const open = [];
    for (let k = 0; k < from; k++) {
      const e = this.order[k];
      if (e === 2147483647 || skips(e)) continue;
      while (open.length && this.closesLayer(open[open.length - 1], e)) open.pop();
      if (e < 0) open.push(-1 - e);
    }
    for (const o of open) {
      stack.push({ target: this.acquireLayer(), offscreen: o });
      this.stats.layers++;
    }
    for (let k = from; k < to; k++) {
      const e = this.order[k];
      if (e === 2147483647 || skips(e)) continue;
      while (top().offscreen >= 0 && this.closesLayer(top().offscreen, e)) closeTop();
      if (e < 0) {
        stack.push({ target: this.acquireLayer(), offscreen: -1 - e });
        this.stats.layers++;
        continue;
      }
      const layer = top().target;
      const ins = inserts?.get(e);
      if (ins?.below) this.runInserts(ins.below, layer.framebuffer);
      if (inst.drawableVisible[e]) this.drawMesh(e, layer.framebuffer, layer);
      if (ins?.above) this.runInserts(ins.above, layer.framebuffer);
    }
    while (stack.length > 1) closeTop();
    const l0 = stack.pop();
    this.state.bindFramebuffer(frame.target);
    this.state.viewport(0, 0, frame.framing.width, frame.framing.height);
    this.compositeLayer(l0.target, {
      multiply: [1, 1, 1],
      screen: [0, 0, 0],
      opacity: 1,
      code: 0,
      mask: null,
      inverted: false
    });
    this.releaseLayer(l0.target);
  }
  // -------------------------------------------------------------- drawing
  /**
   * Draws drawable d into `fb`. `layer` is the layer behind `fb` (needed for
   * advanced blend codes, which read a copy of it); null in the direct pipeline.
   */
  drawMesh(d, fb, layer) {
    const gl = this.gl;
    const st = this.state;
    const inst = this.inst;
    const m = this.model;
    const tex = this.textures[m.meshes.texture[d]];
    if (!tex) return;
    const tints = this.tints;
    const opacity = tints ? inst.drawableOpacity[d] * tints[4 * d + 3] : inst.drawableOpacity[d];
    if (opacity === 0 || tints && tints[4 * d + 3] === 0) return;
    const f = this.framing;
    const code = m.meshes.blendMode[d];
    const advanced = this.layered && !isCompatibleBlend(code);
    const group = this.drawableGroups.groupOf[d];
    let mask = null;
    if (group >= 0) {
      mask = this.drawableMask(group);
      this.stats.masked++;
    }
    if (advanced && layer) this.copyDestination(layer);
    st.bindFramebuffer(fb);
    st.viewport(0, 0, f.width, f.height);
    const p = advanced ? this.meshAdvanced : this.meshCompatible;
    st.useProgram(p.shader.program);
    const v = this.view;
    p.u("uView").set4f(v[0], v[1], v[2], v[3]);
    p.u("uTurn").set3f(this.turn[0], this.turn[1], this.turn[2]);
    this.setColors(p, inst.drawableMultiply, inst.drawableScreen, d, opacity);
    if (tints) p.u("uTint").set3f(tints[4 * d], tints[4 * d + 1], tints[4 * d + 2]);
    else p.u("uTint").set3f(1, 1, 1);
    this.setMask(p, mask, (m.meshes.flags[d] & INVERTED_MASK) !== 0);
    st.bindTexture(0, tex.texture);
    p.u("uTex").set1i(0);
    if (advanced) {
      p.u("uColorFn").set1i(colorPart(code));
      p.u("uAlphaMode").set1i(alphaPart(code));
      st.bindTexture(2, this.dstCopy.texture);
      p.u("uDst").set1i(2);
      st.set(gl.BLEND, false);
      this.stats.advancedDraws++;
    } else {
      this.applyBlend(this.blendOf[d]);
    }
    st.set(gl.CULL_FACE, (m.meshes.flags[d] & DOUBLE_SIDED) === 0);
    st.bindVertexArray(this.stream.vao);
    this.drawSlot(d);
    this.stats.drawn++;
  }
  drawSlot(d) {
    const slot = this.slots[d];
    if (slot.indexCount === 0) return;
    this.stream.draw(slot);
    this.stats.drawCalls++;
  }
  setColors(p, multiply, screen, i2, opacity) {
    p.u("uMultiply").set3f(multiply[3 * i2], multiply[3 * i2 + 1], multiply[3 * i2 + 2]);
    p.u("uScreen").set3f(screen[3 * i2], screen[3 * i2 + 1], screen[3 * i2 + 2]);
    p.u("uOpacity").set1f(opacity);
  }
  /**
   * The mask of a draw: a mesh looks it up through the mask's texture matrix
   * from output space (rule M), a whole layer through D = A · V⁻¹ from clip
   * space (rule I).
   */
  setMask(p, mask, inverted, layer = false) {
    if (!mask) {
      p.u("uMaskMode").set1i(0);
      p.u("uMaskTex").setMatrix4(NO_MASK_MATRIX);
      return;
    }
    p.u("uMaskMode").set1i(inverted ? 2 : 1);
    p.u("uMaskTex").setMatrix4(
      layer ? columnMajor(layerMaskMatrix(mask.map, viewMatrix(this.view, this.turn))) : glMatrices(mask.map).texture
    );
    this.state.bindTexture(1, mask.texture);
    p.u("uMask").set1i(1);
  }
  applyBlend(mode) {
    const gl = this.gl;
    const st = this.state;
    st.set(gl.BLEND, true);
    st.blendEquation(gl.FUNC_ADD);
    if (mode === "additive") st.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    else if (mode === "multiplicative")
      st.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    else st.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  // ---------------------------------------------------------------- masks
  drawableMask(g) {
    const regions = this.atlasRegions;
    const r = regions?.[g];
    if (r) return { map: r.map, texture: this.atlas.texture };
    return this.buildDrawableMask(g);
  }
  offscreenMask(g) {
    const regions = this.atlasRegions;
    const r = regions?.[this.drawableGroups.groups.length + g];
    if (r) return { map: r.map, texture: this.atlas.texture };
    return this.buildOffscreenMask(g);
  }
  ensureMaskTarget(offscreen) {
    const existing = offscreen ? this.offscreenMaskTarget : this.maskTarget;
    if (existing) return existing;
    const size = offscreen ? this.offscreenSize : this.size;
    const t = new RenderTarget(this.gl, size, size, {
      filter: "linear",
      label: offscreen ? "offscreen mask buffer" : "mask buffer",
      ...this.memory ? { memory: this.memory } : {}
    });
    this.state.reset();
    if (offscreen) this.offscreenMaskTarget = t;
    else this.maskTarget = t;
    return t;
  }
  /** Regenerates the mask buffer for drawable group g (§2g.3; box with the quirk of §2g.2). */
  buildDrawableMask(g) {
    let gm = this.groupMap[g];
    if (!gm) {
      const box = drawablesBox(
        this.drawableGroups.groups[g].members,
        this.inst.drawableVertices,
        true
      );
      gm = { box, map: maskMapping(box, this.model.canvas.pixelsPerUnit, this.size) };
      this.groupMap[g] = gm;
    }
    if (this.maskHolds !== g) {
      this.rasterizeMasks(this.drawableGroups.groups[g].masks, gm.map, gm.box, false);
      this.maskHolds = g;
    }
    return { map: gm.map, texture: this.maskTarget.texture };
  }
  /**
   * Mask buffer for an offscreen's group: §2h.4 (box over all drawables under
   * the owners, no quirk; the union over several owners, C9), in the
   * offscreen buffer of 256 × 256 (C8) with the mapping of §2g.3.
   *
   * When the layer is composited, the mask is looked up through
   * D = A · V⁻¹ from the quad's clip-space corners (rule I).
   */
  buildOffscreenMask(g) {
    let gm = this.offscreenMap[g];
    if (!gm) {
      const box = drawablesBox(this.offscreenBoxMembers[g], this.inst.drawableVertices, false);
      gm = { box, map: maskMapping(box, this.model.canvas.pixelsPerUnit, this.offscreenSize) };
      this.offscreenMap[g] = gm;
    }
    if (this.offscreenMaskHolds !== g) {
      this.rasterizeMasks(this.offscreenGroups.groups[g].masks, gm.map, gm.box, true);
      this.offscreenMaskHolds = g;
    }
    return { map: gm.map, texture: this.offscreenMaskTarget.texture };
  }
  /**
   * Clears a mask buffer (the drawable or the offscreen one) to (1, 1, 1, 1)
   * and multiplies red by (1 − α) for its group's mask meshes, within the
   * scissor rectangle the box maps to.
   */
  rasterizeMasks(masks, map, box, offscreen) {
    const t0 = performance.now();
    const gl = this.gl;
    const st = this.state;
    this.timer?.phase("masks");
    const S = offscreen ? this.offscreenSize : this.size;
    const target2 = this.ensureMaskTarget(offscreen);
    st.bindFramebuffer(target2.framebuffer);
    st.viewport(0, 0, S, S);
    this.stats.maskBuilds++;
    const [a0, b0] = mapToMask(map, box.x0, box.y0);
    const [a1, b1] = mapToMask(map, box.x0 + box.w, box.y0 + box.h);
    const x0 = Math.max(0, Math.floor(a0 * S) - 2);
    const y0 = Math.max(0, Math.floor(b0 * S) - 2);
    const x1 = Math.min(S, Math.ceil(a1 * S) + 2);
    const y1 = Math.min(S, Math.ceil(b1 * S) + 2);
    const full = !(x1 > x0 && y1 > y0 && Number.isFinite(x0 + x1 + y0 + y1));
    st.set(gl.SCISSOR_TEST, true);
    if (full) st.scissor(0, 0, S, S);
    else st.scissor(x0, y0, x1 - x0, y1 - y0);
    st.colorMask(true, true, true, true);
    st.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawMaskMeshes(masks, map);
    st.colorMask(true, true, true, true);
    st.set(gl.SCISSOR_TEST, false);
    this.timer?.phase("draws");
    this.stats.cpuMs.masks += performance.now() - t0;
  }
  /**
   * Multiplies red by (1 − α) for the mask meshes (the target is bound): all
   * of them, inactive ones at their stale vertices, or only the active ones
   * (see {@link MaskMeshes}).
   */
  drawMaskMeshes(masks, map) {
    const gl = this.gl;
    const st = this.state;
    const inst = this.inst;
    const m = this.model;
    st.colorMask(true, false, false, false);
    st.set(gl.BLEND, true);
    st.blendEquation(gl.FUNC_ADD);
    st.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    const p = this.maskProgram;
    st.useProgram(p.shader.program);
    p.u("uMaskClip").setMatrix4(glMatrices(map).clip);
    p.u("uTex").set1i(0);
    st.bindVertexArray(this.stream.vao);
    const activeOnly = this.maskMeshes === "active";
    for (let k = 0; k < masks.length; k++) {
      const mm = masks[k];
      if (activeOnly && !inst.drawableActive[mm]) continue;
      const tex = this.textures[m.meshes.texture[mm]];
      if (!tex) continue;
      st.bindTexture(0, tex.texture);
      st.set(gl.CULL_FACE, (m.meshes.flags[mm] & DOUBLE_SIDED) === 0);
      this.drawSlot(mm);
      this.stats.maskMeshDraws++;
    }
  }
  /**
   * Atlas mode: lays out a region for every mask group this frame needs and
   * builds the regions whose inputs changed. Returns the regions, or null if
   * they do not fit (the frame then uses per-drawable masks).
   */
  prepareAtlas() {
    const t0 = performance.now();
    const gl = this.gl;
    const st = this.state;
    const inst = this.inst;
    const m = this.model;
    const f = this.framing;
    const G = this.drawableGroups.groups.length;
    const view = visibleBox(f, 2);
    const boxes = new Array(this.atlasEntries.length).fill(null);
    const groupOf = this.drawableGroups.groupOf;
    for (let d = 0; d < groupOf.length; d++) {
      const g = groupOf[d];
      if (g < 0 || boxes[g] || !inst.drawableVisible[d] || !this.textures[m.meshes.texture[d]])
        continue;
      const members = this.drawableGroups.groups[g].members;
      boxes[g] = clipBox(drawablesBox(members, inst.drawableVertices, true), view);
    }
    const density = Math.min(m.canvas.pixelsPerUnit, this.oversample * f.k);
    let regions = null;
    let size = 0;
    for (const layout of ATLAS_LAYOUTS) {
      const texture = Math.max(layout.size, this.atlas?.width ?? 0);
      const d = density * layout.densityScale;
      regions = packMaskAtlas(boxes, d, layout.size, layout.maxRegion, texture);
      if (regions) {
        size = texture;
        break;
      }
    }
    if (!regions) return null;
    if (!this.atlas || this.atlas.width < size) {
      this.atlas?.dispose();
      this.atlas = new RenderTarget(gl, size, size, {
        filter: "linear",
        label: "mask atlas",
        ...this.memory ? { memory: this.memory } : {}
      });
      this.atlasGeneration++;
      st.reset();
    }
    const atlas = this.atlas;
    let bound = false;
    for (let k = 0; k < regions.length; k++) {
      const r = regions[k];
      const e = this.atlasEntries[k];
      if (!r) {
        this.atlasEntries[k] = null;
        continue;
      }
      const masks = k < G ? this.drawableGroups.groups[k].masks : this.offscreenGroups.groups[k - G].masks;
      if (e && e.generation === this.atlasGeneration && e.inst === inst && e.region.x === r.x && e.region.y === r.y && e.region.w === r.w && e.region.h === r.h && sameMap(e.region.map, r.map) && this.masksUnchanged(e, masks)) {
        this.stats.masksReused++;
        continue;
      }
      if (!bound) {
        this.timer?.phase("masks");
        st.bindFramebuffer(atlas.framebuffer);
        st.viewport(0, 0, atlas.width, atlas.height);
        st.set(gl.SCISSOR_TEST, true);
        bound = true;
      }
      st.scissor(r.x, r.y, r.w, r.h);
      st.colorMask(true, true, true, true);
      st.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawMaskMeshes(masks, r.map);
      this.stats.maskBuilds++;
      this.atlasEntries[k] = {
        region: r,
        generation: this.atlasGeneration,
        inst,
        versions: Uint32Array.from(masks, (mm) => inst.drawableVertexVersion[mm]),
        active: Uint8Array.from(masks, (mm) => inst.drawableActive[mm])
      };
    }
    if (bound) {
      st.colorMask(true, true, true, true);
      st.set(gl.SCISSOR_TEST, false);
      this.timer?.phase("draws");
    }
    this.stats.cpuMs.masks += performance.now() - t0;
    return regions;
  }
  masksUnchanged(e, masks) {
    const inst = this.inst;
    for (let k = 0; k < masks.length; k++) {
      const mm = masks[k];
      if (e.versions[k] !== inst.drawableVertexVersion[mm]) return false;
      if (e.active[k] !== inst.drawableActive[mm]) return false;
    }
    return true;
  }
  // --------------------------------------------------------------- layers
  acquireLayer() {
    const gl = this.gl;
    const st = this.state;
    const f = this.framing;
    let t = this.layerPool.pop();
    if (t) {
      if (t.width !== f.width || t.height !== f.height) {
        t.resize(f.width, f.height);
        st.reset();
      }
    } else {
      t = new RenderTarget(gl, f.width, f.height, {
        // Rule L: layers are read through a linearly filtered quad.
        filter: "linear",
        label: "layer",
        ...this.memory ? { memory: this.memory } : {}
      });
      st.reset();
    }
    st.bindFramebuffer(t.framebuffer);
    st.viewport(0, 0, f.width, f.height);
    st.set(gl.SCISSOR_TEST, false);
    st.colorMask(true, true, true, true);
    st.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return t;
  }
  releaseLayer(t) {
    this.layerPool.push(t);
  }
  /** Copies a layer into the destination copy read by advanced blends. */
  copyDestination(layer) {
    const gl = this.gl;
    const st = this.state;
    const f = this.framing;
    if (!this.dstCopy) {
      this.dstCopy = new RenderTarget(gl, f.width, f.height, {
        filter: "nearest",
        label: "destination copy",
        ...this.memory ? { memory: this.memory } : {}
      });
      st.reset();
    } else if (this.dstCopy.width !== f.width || this.dstCopy.height !== f.height) {
      this.dstCopy.resize(f.width, f.height);
      st.reset();
    }
    st.set(gl.SCISSOR_TEST, false);
    st.bindReadFramebuffer(layer.framebuffer);
    st.bindDrawFramebuffer(this.dstCopy.framebuffer);
    gl.blitFramebuffer(
      0,
      0,
      f.width,
      f.height,
      0,
      0,
      f.width,
      f.height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );
  }
  /** §2h.4: the offscreen's layer composited into the layer below it. */
  compositeOffscreen(layer, below) {
    const inst = this.inst;
    const m = this.model;
    const f = this.framing;
    const o = layer.offscreen;
    const g = this.offscreenGroups.groupOf[o];
    const mask = g >= 0 ? this.offscreenMask(g) : null;
    const code = m.offscreens.blendMode[o];
    if (!isCompatibleBlend(code)) this.copyDestination(below.target);
    this.state.bindFramebuffer(below.target.framebuffer);
    this.state.viewport(0, 0, f.width, f.height);
    this.compositeLayer(layer.target, {
      multiply: [
        inst.offscreenMultiply[3 * o],
        inst.offscreenMultiply[3 * o + 1],
        inst.offscreenMultiply[3 * o + 2]
      ],
      screen: [
        inst.offscreenScreen[3 * o],
        inst.offscreenScreen[3 * o + 1],
        inst.offscreenScreen[3 * o + 2]
      ],
      opacity: inst.offscreenOpacity[o],
      code,
      mask,
      inverted: (m.offscreens.flags[o] & INVERTED_MASK) !== 0
    });
  }
  /** Draws a whole layer as a drawable covering the image into the bound framebuffer. */
  compositeLayer(layer, s) {
    const gl = this.gl;
    const st = this.state;
    const f = this.framing;
    const advanced = !isCompatibleBlend(s.code);
    const p = advanced ? this.layerAdvanced : this.layerCompatible;
    st.useProgram(p.shader.program);
    p.u("uMultiply").set3f(...s.multiply);
    p.u("uScreen").set3f(...s.screen);
    p.u("uTint").set3f(1, 1, 1);
    p.u("uOpacity").set1f(s.opacity);
    this.setMask(p, s.mask, s.inverted, true);
    st.bindTexture(0, layer.texture);
    p.u("uTex").set1i(0);
    if (advanced) {
      p.u("uColorFn").set1i(colorPart(s.code));
      p.u("uAlphaMode").set1i(alphaPart(s.code));
      st.bindTexture(2, this.dstCopy.texture);
      p.u("uDst").set1i(2);
      st.set(gl.BLEND, false);
      this.stats.advancedDraws++;
    } else {
      this.applyBlend(compatibleBlendMode(s.code));
    }
    st.set(gl.CULL_FACE, false);
    st.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.stats.drawCalls++;
  }
  dispose() {
    const gl = this.gl;
    this.stream.dispose();
    for (const p of [
      this.meshCompatible,
      this.meshAdvanced,
      this.layerCompatible,
      this.layerAdvanced,
      this.maskProgram
    ])
      p.shader.dispose();
    gl.deleteVertexArray(this.fullscreenVao);
    this.maskTarget?.dispose();
    this.offscreenMaskTarget?.dispose();
    this.atlas?.dispose();
    this.dstCopy?.dispose();
    for (const t of this.layerPool) t.dispose();
    this.timer?.dispose();
  }
};

// src/lib/texture-notice.ts
function downscaleNotice(textures) {
  const scaled = textures.filter((t) => t.width < t.originalWidth || t.height < t.originalHeight);
  if (scaled.length === 0) return null;
  const name2 = (label) => label.slice(label.lastIndexOf("/") + 1);
  const list = scaled.map((t) => `${name2(t.label)} ${t.originalWidth}\xD7${t.originalHeight} \u2192 ${t.width}\xD7${t.height}`).join(", ");
  return `${scaled.length} of ${textures.length} textures downscaled to fit this device: ${list}. Fine detail is lost; reference renders never downscale.`;
}

// src/lib/live-model.ts
var DEFAULT_MASK_SETTING = "atlas";
var FALLBACK_MASK_SIZE = 2048;
var DEFAULT_FIT = 0.95;
var LiveModel = class _LiveModel {
  constructor(gl, runtime, textures, loader, options = {}) {
    this.gl = gl;
    this.textures = textures;
    this.loader = loader;
    this.options = options;
    this.runtime = runtime;
    this.name = runtime.settingsPath;
    this.fit = options.fit ?? DEFAULT_FIT;
    this.textureLimits = options.textureLimits;
    this.parameters = runtime.parameters.map((p) => ({
      id: p.id,
      label: p.name + (p.blendShape ? " (blend shape)" : ""),
      ...p.group !== void 0 ? { group: p.group } : {},
      min: p.min,
      max: p.max,
      default: p.default
    }));
    this.parts = runtime.parts.map((p) => ({
      id: p.id,
      label: p.name,
      defaultOpacity: p.defaultOpacity
    }));
    const masks = options.masks ?? DEFAULT_MASK_SETTING;
    this.maskSetting = masks;
    this.renderer = new ModelRenderer(
      gl,
      runtime.model,
      textures.map((t) => t.texture),
      {
        ..._LiveModel.rendererMasks(masks),
        // After its first frame, a viewer's flags hold only the latest
        // evaluation's recomputed meshes: the active ones (C13).
        maskMeshes: options.maskMeshes ?? "active",
        gpuTiming: options.gpuTiming ?? true,
        ...options.memory ? { memory: options.memory } : {}
      }
    );
    this.textureNotice = downscaleNotice(
      textures.map((t) => ({
        label: t.label,
        originalWidth: t.originalWidth,
        originalHeight: t.originalHeight,
        width: t.texture.width,
        height: t.texture.height
      }))
    );
  }
  gl;
  textures;
  loader;
  options;
  name;
  parameters;
  parts;
  runtime;
  renderer;
  /**
   * View relative to the default framing: zoom factor, the model point at the
   * image center as an offset from the default one (output units, y up), and
   * the counterclockwise turn of the picture about the image center (degrees).
   */
  view = { zoom: 1, dx: 0, dy: 0, rotation: 0 };
  /** Text of the downscaled-textures notice, or null. */
  textureNotice;
  fit;
  /** The texture caps the model was loaded with (its textures load again with them). */
  textureLimits;
  /** Milliseconds of the last animation frame, evaluation, and vertex hand-off. */
  lastAnimationMs = 0;
  lastEvaluationMs = 0;
  lastUpdateMs = 0;
  /** Called after each animation frame that ran. */
  onFrame = null;
  /** Drawn with the model and updated after it (a view's items), or null. */
  overlay = null;
  /** Counts the evaluations handed to the renderer. */
  renderVersion = 0;
  /** The instance's evaluation count the renderer was last given. */
  shownEvaluation = -1;
  /** Something changed since the last draw. */
  changed = true;
  drawnKey = "";
  maskSetting;
  disposed = false;
  // ------------------------------------------------- runtime pass-through
  get instance() {
    return this.runtime.instance;
  }
  get animator() {
    return this.runtime.animator;
  }
  /** The settings, settings path and `.moc3` model. */
  get loaded() {
    const r = this.runtime;
    return { settings: r.settings, settingsPath: r.settingsPath, model: r.model };
  }
  get displayInfo() {
    return this.runtime.bundle.displayInfo;
  }
  get physicsDriven() {
    return this.runtime.physicsDriven;
  }
  get lipSyncFallback() {
    return this.runtime.lipSyncFallback;
  }
  get warnings() {
    return this.runtime.warnings;
  }
  get lastFrame() {
    return this.runtime.lastFrame;
  }
  get recentEvents() {
    return this.runtime.recentEvents;
  }
  // ------------------------------------------------------------- masks
  static rendererMasks(setting) {
    if (setting === "atlas" || setting === "atlas-fine")
      return {
        masks: "atlas",
        maskSize: FALLBACK_MASK_SIZE,
        maskOversample: setting === "atlas" ? 2 : 4
      };
    return {
      masks: "per-drawable",
      maskSize: setting === "4096" ? REFERENCE_MASK_SIZE : 2048,
      maskOversample: 2
    };
  }
  get masks() {
    return this.maskSetting;
  }
  setMasks(setting) {
    if (setting === this.maskSetting) return;
    this.maskSetting = setting;
    const r = _LiveModel.rendererMasks(setting);
    this.renderer.setMaskMode(r.masks, r.maskOversample);
    this.renderer.setMaskSize(r.maskSize);
    this.changed = true;
  }
  // ------------------------------------------------------------ inputs
  getParameter(id) {
    return this.runtime.getParameter(id);
  }
  setParameter(id, value) {
    this.runtime.setParameter(id, value);
  }
  getPartOpacity(id) {
    return this.runtime.getPartOpacity(id);
  }
  setPartOpacity(id, value) {
    this.runtime.setPartOpacity(id, value);
  }
  effect(name2) {
    return this.runtime.effect(name2);
  }
  effectAvailable(name2) {
    return this.runtime.effectAvailable(name2);
  }
  setEffect(name2, on) {
    this.runtime.setEffect(name2, on);
  }
  lookRouting() {
    return this.runtime.lookRouting();
  }
  /** Starts a motion with the defaults of answer Q8 (priority 2, the file's fades). */
  playMotion(motion, opts = {}) {
    const accepted = this.runtime.playMotion(motion, {
      loop: opts.loop ?? false,
      ...opts.hold ? { hold: true } : {},
      ...opts.blinkWhileHeld === false ? { blinkWhileHeld: false } : {},
      ...opts.fadeIn !== void 0 ? { fadeIn: opts.fadeIn } : {},
      ...opts.fadeOut !== void 0 ? { fadeOut: opts.fadeOut } : {}
    });
    if (accepted && opts.sound !== void 0) this.startLipSync(opts.sound);
    return accepted;
  }
  playExpression(expression) {
    this.runtime.playExpression(expression);
  }
  /** Stops all motions and clears the current priority (see {@link ModelRuntime.stopMotions}). */
  stopMotions() {
    this.runtime.stopMotions();
  }
  /** Starts lip sync on a WAV file (3s.1); returns false if it cannot be analysed. */
  startLipSync(bytes) {
    return this.runtime.startLipSyncWav(bytes);
  }
  /** Image pixel → look target, the way the reference viewer maps the pointer (3r.2). */
  lookTarget(px, py, width, height) {
    const [x2, y] = outputPosition(this.framing(width, height), px, py);
    const base = this.baseFraming(width, height);
    const half = Math.min(width, height) / 2;
    return [base.k * (x2 - base.centerX) / half, base.k * (y - base.centerY) / half];
  }
  /**
   * Sets the look target from an image pixel: origin at the canvas center, y
   * up, the shorter side spanning [−1, 1], with the view's zoom and pan
   * applied (3r.2).
   */
  lookAtPixel(px, py, width, height) {
    const [x2, y] = this.lookTarget(px, py, width, height);
    this.runtime.lookAt(x2, y);
  }
  releaseLook() {
    this.runtime.releaseLook();
  }
  // ------------------------------------------------------------- frames
  update(dt) {
    const t0 = performance.now();
    const r = this.runtime.animate(dt);
    const t1 = performance.now();
    if (r) this.lastAnimationMs = t1 - t0;
    const evaluated = this.runtime.evaluate();
    const inst = this.runtime.instance;
    if (inst.evaluations !== this.shownEvaluation) {
      const t2 = performance.now();
      this.renderer.update(inst);
      this.shownEvaluation = inst.evaluations;
      this.renderVersion++;
      if (evaluated) this.lastEvaluationMs = t2 - t1;
      this.lastUpdateMs = performance.now() - t2;
      this.changed = true;
    }
    if (r) this.onFrame?.(r);
    this.overlay?.update(dt, this);
  }
  needsRedraw(width, height) {
    return this.changed || this.drawKey(width, height) !== this.drawnKey || (this.overlay?.needsRedraw(width, height, this) ?? false);
  }
  drawKey(width, height) {
    const v = this.view;
    const tints = this.runtime.tintVersion;
    return `${width}x${height} ${v.zoom} ${v.dx} ${v.dy} ${v.rotation} ${this.fit} ${tints}`;
  }
  // ---------------------------------------------------------------- view
  baseFraming(width, height) {
    const f = frameImage(this.runtime.model.canvas, width, height);
    return { ...f, k: f.k * this.fit };
  }
  /** The framing of a width × height image under the current view. */
  framing(width, height) {
    const f = this.baseFraming(width, height);
    const rotation = this.view.rotation;
    return {
      ...f,
      k: f.k * this.view.zoom,
      centerX: f.centerX + this.view.dx,
      centerY: f.centerY + this.view.dy,
      ...rotation ? { rotation } : {}
    };
  }
  /** Image pixel → model output units (y up). */
  toModel(px, py, width, height) {
    return outputPosition(this.framing(width, height), px, py);
  }
  /** Model output units (y up) → image pixel: the inverse of {@link toModel}. */
  toImage(x2, y, width, height) {
    return imagePosition(this.framing(width, height), x2, y);
  }
  /** Zooms by `factor`, keeping the model point under image pixel (px, py) in place. */
  zoomAt(factor, px, py, width, height) {
    const [x0, y0] = outputPosition(this.framing(width, height), px, py);
    this.view.zoom = Math.min(64, Math.max(1 / 16, this.view.zoom * factor));
    const [x1, y1] = outputPosition(this.framing(width, height), px, py);
    this.view.dx += x0 - x1;
    this.view.dy += y0 - y1;
  }
  /** An image-pixel step (y down) as a step in model output units (y up), under the view. */
  toModelStep(dx, dy, width, height) {
    return outputStep(this.framing(width, height), dx, dy);
  }
  /** Moves the model by (dx, dy) image pixels (y down) on screen, whatever the rotation. */
  panBy(dx, dy, width, height) {
    const [ux, uy] = this.toModelStep(dx, dy, width, height);
    this.view.dx -= ux;
    this.view.dy -= uy;
  }
  /** Turns the picture to `degrees` (counterclockwise) about the image center. */
  setRotation(degrees) {
    this.view.rotation = Number.isFinite(degrees) ? degrees : 0;
  }
  resetView() {
    this.view.zoom = 1;
    this.view.dx = 0;
    this.view.dy = 0;
    this.view.rotation = 0;
  }
  // ---------------------------------------------------------- hit areas
  /**
   * Image-space boxes of the settings' hit areas, from the latest evaluation
   * (3t). Under a rotated view, each is the box around the turned area.
   */
  hitAreaBoxes(width, height) {
    const f = this.framing(width, height);
    return this.runtime.hitAreaBounds().map((a) => {
      const b = a.bounds;
      if (!f.rotation) {
        const [x02, y02] = imagePosition(f, b.minX, b.maxY);
        const [x1, y1] = imagePosition(f, b.maxX, b.minY);
        return { name: a.name, id: a.id, x: x02, y: y02, w: x1 - x02, h: y1 - y02 };
      }
      const corners = [
        imagePosition(f, b.minX, b.minY),
        imagePosition(f, b.maxX, b.minY),
        imagePosition(f, b.minX, b.maxY),
        imagePosition(f, b.maxX, b.maxY)
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      return {
        name: a.name,
        id: a.id,
        x: x0,
        y: y0,
        w: Math.max(...xs) - x0,
        h: Math.max(...ys) - y0
      };
    });
  }
  /**
   * What lies under an image pixel: the hit areas whose drawable's box
   * contains it (3t), and the topmost visible drawable whose box does.
   */
  hitsAt(px, py, width, height) {
    const [x2, y] = this.toModel(px, py, width, height);
    return { hitAreas: this.runtime.hitAreasAt(x2, y), topDrawable: this.runtime.drawableAt(x2, y) };
  }
  draw(width, height) {
    const overlay = this.overlay;
    if (overlay) {
      overlay.prepare(width, height, this);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      overlay.draw(width, height, this, false);
    }
    this.renderer.draw({
      framing: this.framing(width, height),
      target: null,
      clear: false,
      tints: this.runtime.activeTints,
      inserts: overlay?.inserts?.(width, height, this) ?? null
    });
    overlay?.draw(width, height, this, true);
    this.drawnKey = this.drawKey(width, height);
    this.changed = false;
  }
  /**
   * Replaces texture `index`, or the region of it at (x, y), with `source`
   * (straight alpha), prepared as at load; drawn from the next frame.
   */
  updateTexture(index, source, x2 = 0, y = 0) {
    const t = this.textures[index];
    if (!t) throw new RangeError(`texture ${index}: the model has ${this.textures.length}`);
    this.loader.updateTexture(t, source, x2, y);
    this.renderVersion++;
    this.changed = true;
  }
  /**
   * The same model shown with another runtime (other model data, for
   * `MochiModel.replace`): a new renderer over this one's textures, with this
   * one's view, fit and mask settings. This one hands its textures over and
   * is disposed.
   */
  withRuntime(runtime) {
    const fresh = new _LiveModel(this.gl, runtime, this.textures, this.loader, {
      ...this.options,
      masks: this.maskSetting,
      fit: this.fit
    });
    Object.assign(fresh.view, this.view);
    this.disposed = true;
    this.renderer.dispose();
    return fresh;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.dispose();
    this.loader.release(this.textures);
    this.loader.dispose();
  }
};

// src/core/image/png-info.ts
var SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function readPngInfo(bytes) {
  if (bytes.length < 33) return null;
  for (let i2 = 0; i2 < 8; i2++) if (bytes[i2] !== SIGNATURE[i2]) return null;
  const be322 = (o) => (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0;
  if (be322(8) !== 13) return null;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null;
  const width = be322(16);
  const height = be322(20);
  if (width === 0 || height === 0) return null;
  return {
    width,
    height,
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlaced: bytes[28] === 1
  };
}

// src/core/image/image-headers.ts
var ImageHeaderError = class extends Error {
};
var be16 = (b, o) => b[o] << 8 | b[o + 1];
var be32 = (b, o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
var le16 = (b, o) => b[o] | b[o + 1] << 8;
var le24 = (b, o) => b[o] | b[o + 1] << 8 | b[o + 2] << 16;
var le32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
var at2 = (b, o, s) => o + s.length <= b.length && [...s].every((c, i2) => b[o + i2] === c.charCodeAt(0));
function imageFormat(b) {
  if (at2(b, 0, "\x89PNG\r\n\n")) return "png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpeg";
  if (at2(b, 0, "RIFF") && at2(b, 8, "WEBP")) return "webp";
  if (at2(b, 0, "GIF87a") || at2(b, 0, "GIF89a")) return "gif";
  if (at2(b, 0, "BM")) return "bmp";
  if (b.length >= 6 && le16(b, 0) === 0 && (le16(b, 2) === 1 || le16(b, 2) === 2) && le16(b, 4) > 0)
    return "ico";
  if (at2(b, 4, "ftyp")) return { other: "AVIF or HEIF" };
  if (at2(b, 0, "II*\0") || at2(b, 0, "MM\0*")) return { other: "TIFF" };
  if (at2(b, 0, "\xFF\n") || at2(b, 4, "JXL ")) return { other: "JPEG XL" };
  if (at2(b, 0, "<svg") || at2(b, 0, "<?xml")) return { other: "SVG" };
  return null;
}
function pngBitsPerPixel(colorType, bitDepth) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[colorType];
  if (!channels || !depths?.includes(bitDepth)) return 0;
  return channels * bitDepth;
}
function pngDataBytes(b) {
  let n = 0;
  for (let o = 8; o + 8 <= b.length; ) {
    const len = be32(b, o);
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const avail = Math.max(0, Math.min(len, b.length - (o + 8)));
    if (type === "IDAT") n += avail;
    if (type === "IEND" || avail < len) break;
    o += 12 + len;
  }
  return n;
}
function readPng(b) {
  const info = readPngInfo(b);
  if (!info) throw new ImageHeaderError("damaged PNG header");
  const bpp = pngBitsPerPixel(info.colorType, info.bitDepth);
  if (bpp === 0)
    throw new ImageHeaderError(
      `damaged PNG header (color type ${info.colorType}, bit depth ${info.bitDepth})`
    );
  const raw = info.height * (1 + Math.ceil(info.width * bpp / 8));
  const data = pngDataBytes(b);
  return {
    format: "png",
    width: info.width,
    height: info.height,
    // The whole file: the rest of it, and at least raw / 1,032 bytes of image data.
    minBytes: b.length - data + Math.max(0, Math.ceil((raw - 64) / 1032)),
    decoded: "exact"
  };
}
function readJpeg(b) {
  for (let o = 2; o + 4 <= b.length; ) {
    if (b[o] !== 255) throw new ImageHeaderError("damaged JPEG: no frame header before the data");
    const m = b[o + 1];
    if (m === 255) {
      o++;
      continue;
    }
    if (m === 216 || m >= 208 && m <= 215 || m === 1) {
      o += 2;
      continue;
    }
    if (m === 218 || m === 217) break;
    const len = be16(b, o + 2);
    if (len < 2) throw new ImageHeaderError("damaged JPEG segment");
    const sof = m >= 192 && m <= 207 && m !== 196 && m !== 200 && m !== 204;
    if (sof) {
      if (o + 9 > b.length) throw new ImageHeaderError("JPEG frame header cut off");
      const height = be16(b, o + 5);
      const width = be16(b, o + 7);
      if (width === 0 || height === 0)
        throw new ImageHeaderError("JPEG frame header without a size (a DNL height is not read)");
      const sequential = m === 192 || m === 193;
      const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
      return {
        format: "jpeg",
        width,
        height,
        minBytes: sequential ? Math.floor(blocks / 4) : 0,
        decoded: "exact"
      };
    }
    o += 2 + len;
  }
  throw new ImageHeaderError("damaged JPEG: no frame header before the data");
}
function readWebp(b) {
  let width = 0;
  let height = 0;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    const size = le32(b, o + 4);
    const d = o + 8;
    if (id === "VP8X" && d + 10 <= b.length) {
      width = Math.max(width, le24(b, d + 4) + 1);
      height = Math.max(height, le24(b, d + 7) + 1);
    } else if (id === "VP8 " && d + 10 <= b.length) {
      if (b[d + 3] !== 157 || b[d + 4] !== 1 || b[d + 5] !== 42)
        throw new ImageHeaderError("damaged WebP (VP8) frame header");
      width = Math.max(width, le16(b, d + 6) & 16383);
      height = Math.max(height, le16(b, d + 8) & 16383);
    } else if (id === "VP8L" && d + 5 <= b.length) {
      if (b[d] !== 47) throw new ImageHeaderError("damaged WebP (VP8L) header");
      const bits3 = le32(b, d + 1);
      width = Math.max(width, (bits3 & 16383) + 1);
      height = Math.max(height, (bits3 >>> 14 & 16383) + 1);
    }
    o = d + size + (size & 1);
  }
  if (width === 0 || height === 0) throw new ImageHeaderError("WebP without a readable size");
  return { format: "webp", width, height, minBytes: 0, decoded: "exact" };
}
function readGif(b) {
  if (b.length < 13) throw new ImageHeaderError("GIF header cut off");
  let width = le16(b, 6);
  let height = le16(b, 8);
  let o = 13 + (b[10] & 128 ? 3 * (2 << (b[10] & 7)) : 0);
  while (o < b.length) {
    if (b[o] === 33) {
      o += 2;
      while (o < b.length && b[o] !== 0) o += 1 + b[o];
      o++;
    } else if (b[o] === 44 && o + 10 <= b.length) {
      width = Math.max(width, le16(b, o + 1) + le16(b, o + 5));
      height = Math.max(height, le16(b, o + 3) + le16(b, o + 7));
      break;
    } else break;
  }
  if (width === 0 || height === 0) throw new ImageHeaderError("GIF without a size");
  return { format: "gif", width, height, minBytes: 0, decoded: "at-most" };
}
function readDib(b, o, iconHeight) {
  if (o + 16 > b.length) throw new ImageHeaderError("bitmap header cut off");
  const size = le32(b, o);
  let width;
  let height;
  let bpp;
  let compression = 0;
  if (size === 12) {
    width = le16(b, o + 4);
    height = le16(b, o + 6);
    bpp = le16(b, o + 10);
  } else if (size >= 40 && o + 20 <= b.length) {
    width = Math.abs(le32(b, o + 4) | 0);
    height = Math.abs(le32(b, o + 8) | 0);
    bpp = le16(b, o + 14);
    compression = le32(b, o + 16);
  } else throw new ImageHeaderError(`bitmap header of ${size} bytes`);
  if (iconHeight) height = Math.floor(height / 2);
  if (width === 0 || height === 0) throw new ImageHeaderError("bitmap without a size");
  return { width, height, bpp, compression };
}
function readBmp(b) {
  if (b.length < 26) throw new ImageHeaderError("BMP header cut off");
  const { width, height, bpp, compression } = readDib(b, 14, false);
  const uncompressed = compression === 0 || compression === 3 || compression === 6;
  const stride = Math.ceil(width * bpp / 32) * 4;
  const minBytes = uncompressed && bpp > 0 ? le32(b, 10) + stride * (height - 1) + Math.ceil(width * bpp / 8) : 0;
  return { format: "bmp", width, height, minBytes, decoded: "exact" };
}
function readIco(b) {
  const count = le16(b, 4);
  if (6 + 16 * count > b.length) throw new ImageHeaderError("ICO directory cut off");
  let width = 0;
  let height = 0;
  for (let i2 = 0; i2 < count; i2++) {
    const e = 6 + 16 * i2;
    const size = le32(b, e + 8);
    const offset = le32(b, e + 12);
    if (offset + 8 > b.length) throw new ImageHeaderError(`ICO entry ${i2} lies past the file`);
    const image = b.subarray(offset, Math.min(b.length, offset + size));
    let w;
    let h;
    if (imageFormat(image) === "png") {
      const p = readPng(image);
      if (p.minBytes > image.length)
        throw new ImageHeaderError(`ICO entry ${i2}: too little image data`);
      [w, h] = [p.width, p.height];
    } else ({ width: w, height: h } = readDib(b, offset, true));
    width = Math.max(width, w);
    height = Math.max(height, h);
  }
  if (width === 0 || height === 0) throw new ImageHeaderError("ICO without images");
  return { format: "ico", width, height, minBytes: 0, decoded: "at-most" };
}
var READERS = {
  png: readPng,
  jpeg: readJpeg,
  webp: readWebp,
  gif: readGif,
  bmp: readBmp,
  ico: readIco
};
function readImageHeader(format, bytes) {
  return READERS[format](bytes);
}

// src/core/image/texture-limits.ts
var DEFAULT_TEXTURE_LIMITS = Object.freeze({
  maxSide: 16384,
  maxPixels: 2 ** 28,
  maxTotalPixels: 2 ** 30
});
var TextureLimitError = class extends Error {
  constructor(path, kind2, limit, size, width, height) {
    super(
      kind2 === "side" ? `"${path}" declares ${width}\xD7${height} pixels, more than the ${limit} allowed on a side` : kind2 === "pixels" ? `"${path}" declares ${width}\xD7${height} = ${size} pixels, more than the ${limit} allowed for one texture` : `"${path}" (${width}\xD7${height}) takes the model's textures to ${size} pixels, more than the ${limit} allowed in total`
    );
    this.path = path;
    this.kind = kind2;
    this.limit = limit;
    this.size = size;
    this.width = width;
    this.height = height;
    this.name = "TextureLimitError";
  }
  path;
  kind;
  limit;
  size;
  width;
  height;
};
var TextureFormatError = class extends Error {
  constructor(path, message) {
    super(`"${path}": ${message}`);
    this.path = path;
    this.name = "TextureFormatError";
  }
  path;
};
function resolveTextureLimits(limits = {}) {
  const out = { ...DEFAULT_TEXTURE_LIMITS };
  for (const key of ["maxSide", "maxPixels", "maxTotalPixels"]) {
    const v = limits[key];
    if (v === void 0) continue;
    if (typeof v !== "number" || Number.isNaN(v) || v < 0)
      throw new RangeError(`${key} must be a number \u2265 0 (Infinity for no cap)`);
    out[key] = v;
  }
  return out;
}
var NAMES2 = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
  gif: "GIF",
  bmp: "BMP",
  ico: "ICO"
};
function readTextureHeader(path, bytes) {
  const format = imageFormat(bytes);
  if (format === null || typeof format === "object")
    throw new TextureFormatError(
      path,
      format ? `a ${format.other} image, whose declared size Mochi2D does not read; textures must be PNG, JPEG, WebP, GIF, BMP or ICO files` : "not an image file Mochi2D reads (PNG, JPEG, WebP, GIF, BMP or ICO), or its header is damaged"
    );
  let h;
  try {
    h = readImageHeader(format, bytes);
  } catch (e) {
    if (e instanceof ImageHeaderError) throw new TextureFormatError(path, e.message);
    throw e;
  }
  if (bytes.length < h.minBytes)
    throw new TextureFormatError(
      path,
      `declares ${h.width}\xD7${h.height} pixels but is ${bytes.length} bytes, too few for a ${NAMES2[format]} file of that size (damaged or crafted)`
    );
  return { width: h.width, height: h.height, format };
}
function decodedSizeFits(header, width, height) {
  return header.format === "gif" || header.format === "ico" ? width <= header.width && height <= header.height : width === header.width && height === header.height;
}
function checkTextures(files, limits = {}) {
  const { maxSide, maxPixels, maxTotalPixels } = resolveTextureLimits(limits);
  let total = 0;
  return files.map(({ path, bytes }) => {
    const h = readTextureHeader(path, bytes);
    const side = Math.max(h.width, h.height);
    const pixels = h.width * h.height;
    if (side > maxSide) throw new TextureLimitError(path, "side", maxSide, side, h.width, h.height);
    if (pixels > maxPixels)
      throw new TextureLimitError(path, "pixels", maxPixels, pixels, h.width, h.height);
    total += pixels;
    if (total > maxTotalPixels)
      throw new TextureLimitError(path, "total", maxTotalPixels, total, h.width, h.height);
    return h;
  });
}

// src/core/image/alpha.ts
function premultiplyRgba8(data) {
  const out = new Uint8Array(data.length);
  for (let i2 = 0; i2 < data.length; i2 += 4) {
    const a = data[i2 + 3];
    out[i2] = Math.round(data[i2] * a / 255);
    out[i2 + 1] = Math.round(data[i2 + 1] * a / 255);
    out[i2 + 2] = Math.round(data[i2 + 2] * a / 255);
    out[i2 + 3] = a;
  }
  return out;
}
function unpremultiplyRgba8(data) {
  const out = new Uint8Array(data.length);
  for (let i2 = 0; i2 < data.length; i2 += 4) {
    const a = data[i2 + 3];
    if (a === 0) continue;
    out[i2] = Math.min(255, Math.round(data[i2] * 255 / a));
    out[i2 + 1] = Math.min(255, Math.round(data[i2 + 1] * 255 / a));
    out[i2 + 2] = Math.min(255, Math.round(data[i2 + 2] * 255 / a));
    out[i2 + 3] = a;
  }
  return out;
}
function convertAlpha(data, from, to) {
  if (from === to) return new Uint8Array(data);
  return to === "premultiplied" ? premultiplyRgba8(data) : unpremultiplyRgba8(data);
}

// src/render/gl/gpu-memory.ts
var GpuMemoryTracker = class {
  allocations = /* @__PURE__ */ new Map();
  _total = 0;
  _peak = 0;
  /** Records (or updates) the allocation owned by `owner`. */
  set(owner, category, label, bytes) {
    const prev = this.allocations.get(owner);
    if (prev) this._total -= prev.bytes;
    this.allocations.set(owner, { category, label, bytes });
    this._total += bytes;
    if (this._total > this._peak) this._peak = this._total;
  }
  /** Forgets the allocation owned by `owner` (no-op if unknown). */
  delete(owner) {
    const prev = this.allocations.get(owner);
    if (!prev) return;
    this._total -= prev.bytes;
    this.allocations.delete(owner);
  }
  get total() {
    return this._total;
  }
  /** Highest total seen since creation or the last {@link resetPeak}. */
  get peak() {
    return this._peak;
  }
  resetPeak() {
    this._peak = this._total;
  }
  /** Forgets every allocation (after a lost context, when all GPU objects are gone). */
  clear() {
    this.allocations.clear();
    this._total = 0;
  }
  byCategory() {
    const out = { texture: 0, "render-target": 0, buffer: 0 };
    for (const a of this.allocations.values()) out[a.category] += a.bytes;
    return out;
  }
  list() {
    return [...this.allocations.values()].sort((a, b) => b.bytes - a.bytes);
  }
};
function rgba8Bytes(width, height, mipmaps = false) {
  if (!mipmaps) return width * height * 4;
  let total = 0;
  let w = width;
  let h = height;
  for (; ; ) {
    total += w * h * 4;
    if (w === 1 && h === 1) break;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return total;
}

// src/render/gl/texture.ts
function isRawPixels(src) {
  return typeof src.data === "object" && !(typeof ImageData !== "undefined" && src instanceof ImageData);
}
function isImageBitmap(src) {
  return typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap;
}
function createTexture2D(gl, src, opts = {}) {
  const alpha = opts.alpha ?? (opts.premultiplyAlpha ? "premultiplied" : "straight");
  const sourceAlpha = opts.sourceAlpha ?? "straight";
  const max2 = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (src.width < 1 || src.height < 1 || src.width > max2 || src.height > max2) {
    throw new GlError(
      `Texture size ${src.width}x${src.height} outside [1, ${max2}]; downscale it first`
    );
  }
  if (isImageBitmap(src)) {
    if (sourceAlpha !== alpha) {
      throw new GlError(
        `ImageBitmap is ${sourceAlpha} but a ${alpha} texture was requested; choose the alpha convention when decoding`
      );
    }
    if (opts.flipY)
      throw new GlError("Cannot flip an ImageBitmap at upload; flip it when decoding");
  } else if (!isRawPixels(src) && sourceAlpha !== "straight") {
    throw new GlError("DOM image sources are always straight alpha");
  }
  const tex = gl.createTexture();
  if (!tex) throw new GlError("createTexture returned null (context lost?)");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ?? false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  try {
    if (isRawPixels(src)) {
      if (src.data.length !== src.width * src.height * 4) {
        throw new GlError(
          `Raw texture data has ${src.data.length} bytes, expected ${src.width}x${src.height}x4`
        );
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      const pixels = sourceAlpha === alpha ? new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.length) : convertAlpha(src.data, sourceAlpha, alpha);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        src.width,
        src.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
    } else {
      gl.pixelStorei(
        gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        !isImageBitmap(src) && alpha === "premultiplied"
      );
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }
  } catch (e) {
    gl.deleteTexture(tex);
    throw e;
  } finally {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  const lin = (opts.filter ?? "linear") === "linear";
  if (opts.mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      lin ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST
    );
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  const wrap = { clamp: gl.CLAMP_TO_EDGE, repeat: gl.REPEAT, mirror: gl.MIRRORED_REPEAT }[opts.wrap ?? "clamp"];
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const result = {
    texture: tex,
    width: src.width,
    height: src.height,
    alpha,
    premultiplied: alpha === "premultiplied",
    bytes: rgba8Bytes(src.width, src.height, opts.mipmaps ?? false)
  };
  opts.memory?.set(
    result,
    "texture",
    opts.label ?? `texture ${src.width}x${src.height}`,
    result.bytes
  );
  return result;
}
function deleteTexture2D(gl, t, memory) {
  gl.deleteTexture(t.texture);
  memory?.delete(t);
}
var maxTextureSize = (gl) => gl.getParameter(gl.MAX_TEXTURE_SIZE);
var yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));
async function createTexture2DIncremental(gl, src, opts) {
  const alpha = opts.alpha ?? (opts.premultiplyAlpha ? "premultiplied" : "straight");
  const sourceAlpha = opts.sourceAlpha ?? "straight";
  const max2 = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const { width, height } = src;
  if (width < 1 || height < 1 || width > max2 || height > max2) {
    throw new GlError(`Texture size ${width}x${height} outside [1, ${max2}]; downscale it first`);
  }
  const bitmap = isImageBitmap(src);
  if (bitmap && sourceAlpha !== alpha) {
    throw new GlError(
      `ImageBitmap is ${sourceAlpha} but a ${alpha} texture was requested; choose the alpha convention when decoding`
    );
  }
  if (opts.flipY) throw new GlError("Incremental upload does not support flipY");
  const rows = Math.max(1, Math.floor(opts.stripRows));
  const yieldBetween = opts.yieldBetween ?? yieldToEventLoop;
  const levels = opts.mipmaps ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;
  const tex = gl.createTexture();
  if (!tex) throw new GlError("createTexture returned null (context lost?)");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
  try {
    for (let y = 0; y < height; y += rows) {
      const h = Math.min(rows, height - y);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !bitmap && alpha === "premultiplied");
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        y,
        width,
        h,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        src
      );
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (y + rows < height) await yieldBetween();
    }
  } catch (e) {
    gl.deleteTexture(tex);
    throw e;
  } finally {
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const lin = (opts.filter ?? "linear") === "linear";
  if (opts.mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      lin ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST
    );
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  const wrap = { clamp: gl.CLAMP_TO_EDGE, repeat: gl.REPEAT, mirror: gl.MIRRORED_REPEAT }[opts.wrap ?? "clamp"];
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const result = {
    texture: tex,
    width,
    height,
    alpha,
    premultiplied: alpha === "premultiplied",
    bytes: rgba8Bytes(width, height, opts.mipmaps ?? false)
  };
  opts.memory?.set(result, "texture", opts.label ?? `texture ${width}x${height}`, result.bytes);
  return result;
}

// src/render/texture/budget.ts
function fitTextureSize(width, height, limits) {
  let scale2 = Math.min(1, limits.maxSize / width, limits.maxSize / height);
  if (limits.maxPixels !== void 0 && width * height * scale2 * scale2 > limits.maxPixels) {
    scale2 = Math.min(scale2, Math.sqrt(limits.maxPixels / (width * height)));
  }
  if (scale2 >= 1) return { width, height, scale: 1 };
  return {
    width: Math.max(1, Math.floor(width * scale2)),
    height: Math.max(1, Math.floor(height * scale2)),
    scale: scale2
  };
}
function planTextureSizes(sizes, opts) {
  const fitted = sizes.map((s) => fitTextureSize(s.width, s.height, opts));
  const bytes = (p) => rgba8Bytes(p.width, p.height, opts.mipmaps ?? false);
  const total = fitted.reduce((n, p) => n + bytes(p), 0);
  if (opts.budgetBytes === void 0 || total <= opts.budgetBytes) return fitted;
  let g = Math.sqrt(opts.budgetBytes / total);
  for (let iter = 0; iter < 20; iter++) {
    const planned = sizes.map((s, i2) => {
      const scale2 = fitted[i2].scale * g;
      return scale2 >= 1 ? { width: s.width, height: s.height, scale: 1 } : {
        width: Math.max(1, Math.floor(s.width * scale2)),
        height: Math.max(1, Math.floor(s.height * scale2)),
        scale: scale2
      };
    });
    if (planned.reduce((n, p) => n + bytes(p), 0) <= opts.budgetBytes) return planned;
    g *= 0.98;
  }
  return sizes.map(() => ({ width: 1, height: 1, scale: 0 }));
}

// src/render/texture/decode-protocol.ts
function bitmapOptions(req) {
  const o = {
    premultiplyAlpha: req.alpha === "premultiplied" ? "premultiply" : "none",
    colorSpaceConversion: "none",
    imageOrientation: "none"
  };
  if (req.resize) {
    o.resizeWidth = req.resize.width;
    o.resizeHeight = req.resize.height;
    o.resizeQuality = "high";
  }
  return o;
}
function createBitmap(blob, options) {
  return createImageBitmap(blob, options).catch((e) => {
    if (!(e instanceof TypeError)) throw e;
    return createImageBitmap(blob, minimalOptions(options));
  });
}
function minimalOptions(o) {
  const m = {};
  if (o.premultiplyAlpha) m.premultiplyAlpha = o.premultiplyAlpha;
  if (o.resizeWidth && o.resizeHeight) {
    m.resizeWidth = o.resizeWidth;
    m.resizeHeight = o.resizeHeight;
  }
  return m;
}
var DECODE_WORKER_SOURCE = `"use strict";
function minimalOptions(o) {
  var m = {};
  if (o.premultiplyAlpha) m.premultiplyAlpha = o.premultiplyAlpha;
  if (o.resizeWidth && o.resizeHeight) {
    m.resizeWidth = o.resizeWidth;
    m.resizeHeight = o.resizeHeight;
  }
  return m;
}
self.onmessage = function (ev) {
  var req = ev.data;
  var t0 = performance.now();
  var blob = new Blob([req.bytes], { type: req.mime });
  createImageBitmap(blob, req.options)
    .catch(function (e) {
      if (!(e instanceof TypeError)) throw e;
      return createImageBitmap(blob, minimalOptions(req.options));
    })
    .then(
      function (bitmap) {
        self.postMessage({ id: req.id, ok: true, bitmap: bitmap, ms: performance.now() - t0 }, [bitmap]);
      },
      function (e) {
        self.postMessage({ id: req.id, ok: false, error: e && e.message ? e.message : String(e) });
      }
    );
};
`;

// src/render/texture/decoder.ts
async function decodeImageHere(bytes, opts = {}) {
  const t0 = performance.now();
  const bitmap = await createBitmap(
    new Blob([bytes], { type: opts.mime ?? "image/png" }),
    bitmapOptions({
      alpha: opts.alpha ?? "straight",
      ...opts.resize ? { resize: opts.resize } : {}
    })
  );
  return { bitmap, ms: performance.now() - t0, on: "main" };
}
var workerUrl = null;
function decodeWorkerUrl() {
  workerUrl ??= URL.createObjectURL(new Blob([DECODE_WORKER_SOURCE], { type: "text/javascript" }));
  return workerUrl;
}
var ImageDecoder = class {
  slots = [];
  queue = [];
  pending = /* @__PURE__ */ new Map();
  nextId = 1;
  /** Why workers are not used, if they aren't. */
  fallbackReason;
  constructor(options = {}) {
    const want = Math.max(
      1,
      options.workers ?? Math.min(2, globalThis.navigator?.hardwareConcurrency ?? 2)
    );
    let reason;
    if (options.useWorkers === false) reason = "disabled";
    else if (typeof Worker === "undefined") reason = "Worker is not available";
    if (!reason) {
      try {
        for (let i2 = 0; i2 < want; i2++) {
          const worker = new Worker(decodeWorkerUrl());
          const slot = { worker, busy: false };
          worker.onmessage = (ev) => this.onMessage(slot, ev.data);
          worker.onerror = (ev) => this.onWorkerError(slot, ev.message || "worker error");
          this.slots.push(slot);
        }
      } catch (e) {
        reason = `cannot start workers: ${e.message}`;
        this.dispose();
      }
    }
    this.fallbackReason = reason;
  }
  get usesWorkers() {
    return this.slots.length > 0;
  }
  /** Decodes `bytes`. The buffer is copied before transfer, so the caller keeps it. */
  decode(bytes, opts = {}) {
    if (!this.usesWorkers) return decodeImageHere(bytes, opts);
    const copy = bytes.slice().buffer;
    const req = {
      id: this.nextId++,
      bytes: copy,
      mime: opts.mime ?? "image/png",
      options: bitmapOptions({
        alpha: opts.alpha ?? "straight",
        ...opts.resize ? { resize: opts.resize } : {}
      })
    };
    return new Promise((resolve, reject) => {
      this.queue.push({ req, pending: { resolve, reject, bytes, opts } });
      this.pump();
    });
  }
  pump() {
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const next = this.queue.shift();
      if (!next) return;
      slot.busy = true;
      this.pending.set(next.req.id, { pending: next.pending, slot });
      slot.worker.postMessage(next.req, [next.req.bytes]);
    }
  }
  onMessage(slot, res) {
    const p = this.pending.get(res.id);
    slot.busy = false;
    if (p) {
      this.pending.delete(res.id);
      if (res.ok) p.pending.resolve({ bitmap: res.bitmap, ms: res.ms, on: "worker" });
      else p.pending.reject(new Error(`Image decode failed: ${res.error}`));
    }
    this.pump();
  }
  /** A failed worker is retired; its requests (and, without workers left, the queue) decode here. */
  onWorkerError(slot, message) {
    slot.worker.terminate();
    this.slots.splice(this.slots.indexOf(slot) >>> 0, 1);
    const here = (p) => decodeImageHere(p.bytes, p.opts).then(p.resolve, p.reject);
    for (const [id, p] of this.pending) {
      if (p.slot === slot) {
        this.pending.delete(id);
        void here(p.pending);
      }
    }
    if (this.slots.length === 0) {
      this.lastWorkerError = message;
      for (const q2 of this.queue.splice(0)) void here(q2.pending);
    }
    this.pump();
  }
  /** Why the last worker failed, if every worker has. */
  lastWorkerError;
  dispose() {
    for (const s of this.slots) s.worker.terminate();
    this.slots.length = 0;
    for (const p of this.pending.values()) p.pending.reject(new Error("ImageDecoder disposed"));
    this.pending.clear();
    for (const q2 of this.queue) q2.pending.reject(new Error("ImageDecoder disposed"));
    this.queue.length = 0;
  }
};

// src/render/texture/prepare.ts
var FULLSCREEN_VS = `#version 300 es
void main() {
  // One triangle covering the viewport.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
var PREMULTIPLY_FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSrc;
uniform ivec2 uOffset; // where the source's first texel goes (a region update)
out vec4 outColor;
void main() {
  vec4 c = floor(texelFetch(uSrc, ivec2(gl_FragCoord.xy) - uOffset, 0) * 255.0 + 0.5);
  // c\xB7a \u2264 65025 is exact; c\xB7a/255 is never within 1/510 of a half.
  vec3 p = floor(c.rgb * c.a / 255.0 + 0.5);
  outColor = vec4(p, c.a) / 255.0;
}`;
var MIP_FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSrc; // the level above, as the only sampled level
uniform ivec2 uSrcSize;
out vec4 outColor;
ivec4 texel(ivec2 p) {
  return ivec4(floor(texelFetch(uSrc, min(p, uSrcSize - 1), 0) * 255.0 + 0.5));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec4 sum = texel(p) + texel(p + ivec2(1, 0)) + texel(p + ivec2(0, 1)) + texel(p + ivec2(1, 1));
  ivec4 q = sum >> 2;
  ivec4 r = sum & 3;
  // Round to nearest; a remainder of exactly 2 is a tie, which goes to the even neighbour.
  q += ivec4(greaterThan(r, ivec4(2))) + ivec4(equal(r, ivec4(2))) * (q & 1);
  outColor = vec4(q) / 255.0;
}`;
var mipLevels = (width, height) => Math.floor(Math.log2(Math.max(width, height))) + 1;
var TexturePreparer = class {
  constructor(gl) {
    this.gl = gl;
    this.premultiply = new ShaderProgram(gl, FULLSCREEN_VS, PREMULTIPLY_FS, "texture premultiply");
    this.mip = new ShaderProgram(gl, FULLSCREEN_VS, MIP_FS, "texture mip level");
    const fb = gl.createFramebuffer();
    const vao = gl.createVertexArray();
    if (!fb || !vao) throw new GlError("Failed to create framebuffer (context lost?)");
    this.framebuffer = fb;
    this.vao = vao;
  }
  gl;
  premultiply;
  mip;
  framebuffer;
  vao;
  /**
   * Creates the final texture from a straight-alpha RGBA8 source texture
   * (level 0 only): premultiplied, with a full mip chain if `mipmaps`, trilinear
   * minification, bilinear magnification and repeat wrapping (§2b.3).
   */
  prepare(straight, width, height, opts) {
    const gl = this.gl;
    const levels = opts.mipmaps ? mipLevels(width, height) : 1;
    const tex = gl.createTexture();
    if (!tex) throw new GlError("createTexture returned null (context lost?)");
    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    try {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.checkComplete("premultiply");
      gl.viewport(0, 0, width, height);
      this.premultiply.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, straight);
      gl.uniform1i(this.premultiply.uniform("uSrc"), 0);
      gl.uniform2i(this.premultiply.uniform("uOffset"), 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (levels > 1) this.exactMips(tex, width, height, levels);
    } finally {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
      gl.bindVertexArray(null);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = (opts.wrap ?? "repeat") === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  /**
   * Replaces the region (x, y, w, h) of a texture made by {@link prepare}
   * (width × height, `levels` levels) with a straight-alpha RGBA8 source
   * texture of w × h texels: level 0 premultiplied as {@link prepare} does,
   * then in each further level only the texels whose 2×2 block covers the
   * region, by the same exact rule, so the result equals a full preparation
   * of the new image.
   */
  updateRegion(tex, width, height, levels, straight, region) {
    const gl = this.gl;
    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.checkComplete("premultiply");
      gl.viewport(0, 0, width, height);
      gl.scissor(region.x, region.y, region.w, region.h);
      this.premultiply.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, straight);
      gl.uniform1i(this.premultiply.uniform("uSrc"), 0);
      gl.uniform2i(this.premultiply.uniform("uOffset"), region.x, region.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (levels > 1) this.exactMips(tex, width, height, levels, region);
    } finally {
      gl.disable(gl.SCISSOR_TEST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
      gl.bindVertexArray(null);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  /**
   * Levels 1… from the level above with the 2×2 ties-to-even rule, on clamped
   * blocks; with `region` (of level 0), only the texels whose block covers it
   * (the scissor test must be enabled).
   */
  exactMips(tex, width, height, levels, region) {
    const gl = this.gl;
    let x0 = region?.x ?? 0;
    let y0 = region?.y ?? 0;
    let x1 = region ? region.x + region.w : width;
    let y1 = region ? region.y + region.h : height;
    this.mip.use();
    gl.uniform1i(this.mip.uniform("uSrc"), 0);
    gl.activeTexture(gl.TEXTURE0);
    let w = width;
    let h = height;
    for (let level = 1; level < levels; level++) {
      const sw = w;
      const sh = h;
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      x0 = Math.min(x0 >> 1, w - 1);
      y0 = Math.min(y0 >> 1, h - 1);
      x1 = Math.min(x1 + 1 >> 1, w);
      y1 = Math.min(y1 + 1 >> 1, h);
      if (region) gl.scissor(x0, y0, x1 - x0, y1 - y0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, level - 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, level - 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, level);
      this.checkComplete(`mip level ${level}`);
      gl.viewport(0, 0, w, h);
      gl.uniform2i(this.mip.uniform("uSrcSize"), sw, sh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  checkComplete(what) {
    const gl = this.gl;
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE)
      throw new GlError(
        `Texture preparation (${what}): framebuffer incomplete (0x${status.toString(16)})`
      );
  }
  dispose() {
    this.premultiply.dispose();
    this.mip.dispose();
    this.gl.deleteFramebuffer(this.framebuffer);
    this.gl.deleteVertexArray(this.vao);
  }
};

// src/render/texture/loader.ts
var TextureTooLargeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TextureTooLarge";
  }
};
function checkTextureFiles(files, limits) {
  return checkTextures(
    files.map((f) => ({ path: f.label, bytes: f.bytes })),
    limits
  );
}
var TextureLoader = class {
  constructor(gl, options = {}) {
    this.gl = gl;
    this.options = options;
    const gpuMax = maxTextureSize(gl);
    this.maxSize = Math.min(gpuMax, options.maxSize ?? gpuMax);
    this.decoder = new ImageDecoder({
      ...options.workers !== void 0 ? { workers: options.workers } : {},
      ...options.useWorkers !== void 0 ? { useWorkers: options.useWorkers } : {}
    });
  }
  gl;
  options;
  decoder;
  maxSize;
  preparer = null;
  /**
   * Plans sizes for the files. Throws `TextureFormatError` or
   * `TextureLimitError` for a file the caps refuse (see {@link checkTextureFiles}).
   */
  plan(files) {
    const headers = checkTextureFiles(files, this.options.limits);
    const planned = planTextureSizes(headers, {
      maxSize: this.maxSize,
      ...this.options.budgetBytes !== void 0 ? { budgetBytes: this.options.budgetBytes } : {},
      // Exact preparation builds the mip chain unless told otherwise.
      mipmaps: this.options.mipmaps ?? this.options.exact ?? false
    });
    return headers.map((h, i2) => ({
      ...planned[i2],
      originalWidth: h.width,
      originalHeight: h.height,
      header: h
    }));
  }
  /**
   * Loads all files. Decoding runs in parallel (bounded by the worker count);
   * uploads happen in input order. On failure, textures already uploaded by
   * this call are deleted and the error is rethrown.
   */
  async loadSet(files) {
    const exact = this.options.exact ?? false;
    const alpha = exact ? "straight" : this.options.alpha ?? "premultiplied";
    const plans2 = this.plan(files);
    if (this.options.oversize === "fail") {
      plans2.forEach((p, i2) => {
        if (p.scale < 1)
          throw new TextureTooLargeError(
            `${files[i2].label} is ${p.originalWidth}\xD7${p.originalHeight}, larger than the maximum texture size ${this.maxSize}`
          );
      });
    }
    const decodes = files.map((f, i2) => {
      const p = plans2[i2];
      return this.decoder.decode(f.bytes, {
        alpha,
        ...f.mime ? { mime: f.mime } : {},
        ...p.scale < 1 ? { resize: { width: p.width, height: p.height } } : {}
      }).catch((e) => {
        throw new TextureFormatError(
          f.label,
          `the image could not be decoded (damaged or crafted): ${e instanceof Error ? e.message : String(e)}`
        );
      });
    });
    for (const d of decodes) d.catch(() => {
    });
    const out = [];
    try {
      for (let i2 = 0; i2 < files.length; i2++) {
        const f = files[i2];
        const decoded = await decodes[i2];
        const plan = plans2[i2];
        const { originalWidth, originalHeight, scale: scale2 } = plan;
        const { width: gotW, height: gotH } = decoded.bitmap;
        const fits = plan.scale < 1 ? gotW === plan.width && gotH === plan.height : decodedSizeFits(plan.header, gotW, gotH);
        if (!fits) {
          decoded.bitmap.close();
          throw new TextureFormatError(
            f.label,
            `declares ${originalWidth}\xD7${originalHeight} pixels but decoded to ${gotW}\xD7${gotH} (damaged or crafted)`
          );
        }
        const t0 = performance.now();
        const texOpts = {
          alpha,
          sourceAlpha: alpha,
          // With exact preparation, level 0 is uploaded as is and prepared below.
          mipmaps: exact ? false : this.options.mipmaps ?? false,
          filter: exact ? "nearest" : this.options.filter ?? "linear",
          ...this.options.memory && !exact ? { memory: this.options.memory } : {},
          label: f.label
        };
        const strip = this.options.uploadStripRows ?? 512;
        const threshold = this.options.stripThresholdPixels ?? 4096 * 4096;
        const texture = strip > 0 && decoded.bitmap.width * decoded.bitmap.height > threshold && decoded.bitmap.height > strip ? await createTexture2DIncremental(this.gl, decoded.bitmap, {
          ...texOpts,
          stripRows: strip
        }) : createTexture2D(this.gl, decoded.bitmap, texOpts);
        const final = exact ? this.prepareExact(texture, f.label) : texture;
        const uploadMs = performance.now() - t0;
        decoded.bitmap.close();
        out.push({
          label: f.label,
          texture: final,
          originalWidth,
          originalHeight,
          scale: scale2,
          decodeMs: decoded.ms,
          uploadMs,
          decodedOn: decoded.on
        });
      }
    } catch (e) {
      for (const t of out) deleteTexture2D(this.gl, t.texture, this.options.memory);
      for (let i2 = out.length + 1; i2 < decodes.length; i2++) {
        decodes[i2].then(
          (d) => d.bitmap.close(),
          () => {
          }
        );
      }
      throw e;
    }
    return out;
  }
  /** Premultiplied, mip-mapped texture from an uploaded straight one (which is deleted). */
  prepareExact(straight, label) {
    this.preparer ??= new TexturePreparer(this.gl);
    const mipmaps = this.options.mipmaps ?? true;
    try {
      const tex = this.preparer.prepare(straight.texture, straight.width, straight.height, {
        mipmaps,
        wrap: "repeat"
      });
      const result = {
        texture: tex,
        width: straight.width,
        height: straight.height,
        alpha: "premultiplied",
        premultiplied: true,
        bytes: rgba8Bytes(straight.width, straight.height, mipmaps)
      };
      this.options.memory?.set(result, "texture", label, result.bytes);
      return result;
    } finally {
      deleteTexture2D(this.gl, straight);
    }
  }
  /**
   * Replaces a texture this loader prepared exactly, or the region of it at
   * (x, y) (pixels from the top-left corner) the size of `source`, with
   * straight-alpha pixels, prepared as at load: premultiplied, and the mip
   * texels over the region recomputed by the same exact rule. The texture
   * object stays the same, so whatever draws with it shows the new pixels
   * from its next draw. `source` must fit inside the texture as stored (its
   * downscaled size, if it was downscaled).
   */
  updateTexture(texture, source, x2 = 0, y = 0) {
    if (!(this.options.exact ?? false))
      throw new Error("only textures prepared exactly can be updated in place");
    const t = texture.texture;
    const w = "naturalWidth" in source ? source.naturalWidth : source.width;
    const h = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!Number.isInteger(x2) || !Number.isInteger(y) || x2 < 0 || y < 0 || w < 1 || h < 1 || x2 + w > t.width || y + h > t.height)
      throw new RangeError(
        `a ${w}\xD7${h} image at (${x2}, ${y}) does not fit in the ${t.width}\xD7${t.height} texture ${texture.label}`
      );
    this.preparer ??= new TexturePreparer(this.gl);
    const straight = createTexture2D(this.gl, source, {
      alpha: "straight",
      sourceAlpha: "straight",
      mipmaps: false,
      filter: "nearest",
      label: `${texture.label} (update)`
    });
    try {
      const mipmaps = this.options.mipmaps ?? true;
      this.preparer.updateRegion(
        t.texture,
        t.width,
        t.height,
        mipmaps ? mipLevels(t.width, t.height) : 1,
        straight.texture,
        { x: x2, y, w, h }
      );
    } finally {
      deleteTexture2D(this.gl, straight);
    }
  }
  /** Deletes textures returned by {@link loadSet}. */
  release(textures) {
    for (const t of textures) deleteTexture2D(this.gl, t.texture, this.options.memory);
  }
  dispose() {
    this.decoder.dispose();
    this.preparer?.dispose();
    this.preparer = null;
  }
};

// src/render/model/load-textures.ts
async function loadModelTextures(gl, source, settingsPath, settings, options = {}) {
  const dir = dirnameOf(settingsPath);
  const files = await Promise.all(
    settings.textures.map(async (t) => ({ label: t, bytes: await source.read(joinPath(dir, t)) }))
  );
  const loader = new TextureLoader(gl, { alpha: "premultiplied", ...options });
  try {
    return { loader, textures: await loader.loadSet(files) };
  } catch (e) {
    loader.dispose();
    throw e;
  }
}

// src/core/tint.ts
var MAX_TINT = 2;

// src/core/eval/binding.ts
function locateKeyAt(keys, v, index, t, at4, eps = KEY_EPSILON) {
  const K = keys.length;
  const first = keys[0];
  const last = keys[K - 1];
  const outOfRange = v < fr(first - eps) || v >= fr(last + eps);
  for (let i3 = 0; i3 < K; i3++) {
    const k = keys[i3];
    if (fr(k - eps) < v && v < fr(k + eps)) {
      index[at4] = i3;
      t[at4] = 0;
      return outOfRange;
    }
  }
  if (v <= first) {
    index[at4] = 0;
    t[at4] = 0;
    return outOfRange;
  }
  if (v >= last) {
    index[at4] = K - 1;
    t[at4] = 0;
    return outOfRange;
  }
  let i2 = 0;
  while (i2 + 1 < K && !(v < keys[i2 + 1])) i2++;
  const ki = keys[i2];
  index[at4] = i2;
  t[at4] = fr(fr(v - ki) / fr(keys[i2 + 1] - ki));
  return outOfRange;
}
function locateBlendKeyAt(keys, v, index, t, at4) {
  const K = keys.length;
  if (v <= keys[0]) {
    index[at4] = 0;
    t[at4] = 0;
    return;
  }
  if (v >= keys[K - 1]) {
    index[at4] = K - 1;
    t[at4] = 0;
    return;
  }
  let i2 = 0;
  while (i2 + 1 < K && !(v < keys[i2 + 1])) i2++;
  const ki = keys[i2];
  index[at4] = i2;
  t[at4] = fr(fr(v - ki) / fr(keys[i2 + 1] - ki));
}
var oneIndex = new Int32Array(1);
var oneT = new Float32Array(1);
function evaluationValue(given, min, max2, repeat) {
  const v = fr(given);
  if (!repeat) return v < min ? min : v > max2 ? max2 : v;
  const range = fr(max2 - min);
  if (!(range > 0)) return min;
  const u = fr(fr(v - min) / range);
  const w = fr(u - Math.floor(u));
  return fr(fr(w * range) + min);
}
function appliedValue(given, min, max2, repeat) {
  const v = fr(given);
  if (repeat) return v;
  return v < min ? min : v > max2 ? max2 : v;
}

// src/core/math/libm32.ts
var fr2 = Math.fround;
var scratch = new DataView(new ArrayBuffer(4));
function bits(x2) {
  scratch.setFloat32(0, x2);
  return scratch.getUint32(0);
}
function fromBits(u) {
  scratch.setUint32(0, u >>> 0);
  return scratch.getFloat32(0);
}
var PI = fromBits(1078530011);
var PI_LO = fromBits(3015425326);
var ATANHI = [1055744824, 1061752794, 1065064542, 1070141402].map(fromBits);
var ATANLO = [833369961, 857874792, 856952756, 866263400].map(fromBits);
var AT = [
  0.33333328366,
  -0.19999158382,
  0.14253635705,
  -0.10648017377,
  0.061687607318
].map(fr2);
function atanf(x2) {
  let ix = bits(x2);
  const sign = ix >>> 31;
  ix &= 2147483647;
  let id;
  if (ix >= 1283457024) {
    if (Number.isNaN(x2)) return x2;
    const z2 = fr2(ATANHI[3] + 2 ** -120);
    return sign ? -z2 : z2;
  }
  if (ix < 1054867456) {
    if (ix < 964689920) return x2;
    id = -1;
  } else {
    x2 = Math.abs(x2);
    if (ix < 1066926080) {
      if (ix < 1060110336) {
        id = 0;
        x2 = fr2(fr2(fr2(2 * x2) - 1) / fr2(2 + x2));
      } else {
        id = 1;
        x2 = fr2(fr2(x2 - 1) / fr2(x2 + 1));
      }
    } else if (ix < 1075576832) {
      id = 2;
      x2 = fr2(fr2(x2 - 1.5) / fr2(1 + fr2(1.5 * x2)));
    } else {
      id = 3;
      x2 = fr2(-1 / x2);
    }
  }
  const z = fr2(x2 * x2);
  const w = fr2(z * z);
  const s1 = fr2(z * fr2(AT[0] + fr2(w * fr2(AT[2] + fr2(w * AT[4])))));
  const s2 = fr2(w * fr2(AT[1] + fr2(w * AT[3])));
  if (id < 0) return fr2(x2 - fr2(x2 * fr2(s1 + s2)));
  const r = fr2(ATANHI[id] - fr2(fr2(fr2(x2 * fr2(s1 + s2)) - ATANLO[id]) - x2));
  return sign ? -r : r;
}
function atan2f(y, x2) {
  if (Number.isNaN(x2) || Number.isNaN(y)) return fr2(x2 + y);
  let ix = bits(x2);
  let iy = bits(y);
  if (ix === 1065353216) return atanf(y);
  const m = iy >>> 31 & 1 | ix >>> 30 & 2;
  ix &= 2147483647;
  iy &= 2147483647;
  if (iy === 0) {
    if (m === 0 || m === 1) return y;
    return m === 2 ? PI : -PI;
  }
  if (ix === 0) return m & 1 ? -fr2(PI / 2) : fr2(PI / 2);
  if (ix === 2139095040) {
    if (iy === 2139095040) {
      const q2 = fr2(PI / 4);
      const q3 = fr2(fr2(3 * PI) / 4);
      return [q2, -q2, q3, -q3][m];
    }
    return [0, -0, PI, -PI][m];
  }
  if (ix + (26 << 23) < iy || iy === 2139095040) return m & 1 ? -fr2(PI / 2) : fr2(PI / 2);
  const z = m & 2 && iy + (26 << 23) < ix ? 0 : atanf(Math.abs(fr2(y / x2)));
  switch (m) {
    case 0:
      return z;
    // atan(+, +)
    case 1:
      return -z;
    // atan(−, +)
    case 2:
      return fr2(PI - fr2(z - PI_LO));
    // atan(+, −)
    default:
      return fr2(fr2(z - PI_LO) - PI);
  }
}
var S1 = -6004799494138999 * 2 ** -55;
var S2 = 4803837326982066 * 2 ** -59;
var S3 = -7319422646282100 * 2 ** -65;
var S4 = 6418431544608423 * 2 ** -71;
var C0 = -9007199205219969 * 2 ** -54;
var C1 = 6004793256786498 * 2 ** -57;
var C2 = -6404139434057255 * 2 ** -62;
var C3 = 7198789868605545 * 2 ** -68;
function sindf(x2) {
  const z = x2 * x2;
  const w = z * z;
  const r = S3 + z * S4;
  const s = z * x2;
  return fr2(x2 + s * (S1 + z * S2) + s * w * r);
}
function cosdf(x2) {
  const z = x2 * x2;
  const w = z * z;
  const r = C2 + z * C3;
  return fr2(1 + z * C0 + w * C1 + w * z * r);
}
var PIO2_1X = 1 * (Math.PI / 2);
var PIO2_2X = 2 * (Math.PI / 2);
var PIO2_3X = 3 * (Math.PI / 2);
var PIO2_4X = 4 * (Math.PI / 2);
function sinf(x2) {
  let ix = bits(x2);
  const sign = ix >>> 31;
  ix &= 2147483647;
  if (ix <= 1061752794) {
    if (ix < 964689920) return x2;
    return sindf(x2);
  }
  if (ix <= 1081824209) {
    if (ix <= 1075235811) return sign ? -cosdf(x2 + PIO2_1X) : cosdf(x2 - PIO2_1X);
    return sindf(sign ? -(x2 + PIO2_2X) : -(x2 - PIO2_2X));
  }
  if (ix <= 1088565717) {
    if (ix <= 1085271519) return sign ? cosdf(x2 + PIO2_3X) : -cosdf(x2 - PIO2_3X);
    return sindf(sign ? x2 + PIO2_4X : x2 - PIO2_4X);
  }
  if (ix >= 2139095040) return x2 - x2;
  const [n, y] = remPio2f(x2);
  switch (n & 3) {
    case 0:
      return sindf(y);
    case 1:
      return cosdf(y);
    case 2:
      return sindf(-y);
    default:
      return -cosdf(y);
  }
}
function cosf(x2) {
  let ix = bits(x2);
  const sign = ix >>> 31;
  ix &= 2147483647;
  if (ix <= 1061752794) {
    if (ix < 964689920) return 1;
    return cosdf(x2);
  }
  if (ix <= 1081824209) {
    if (ix > 1075235811) return -cosdf(sign ? x2 + PIO2_2X : x2 - PIO2_2X);
    return sign ? sindf(x2 + PIO2_1X) : sindf(PIO2_1X - x2);
  }
  if (ix <= 1088565717) {
    if (ix > 1085271519) return cosdf(sign ? x2 + PIO2_4X : x2 - PIO2_4X);
    return sign ? sindf(-x2 - PIO2_3X) : sindf(x2 - PIO2_3X);
  }
  if (ix >= 2139095040) return x2 - x2;
  const [n, y] = remPio2f(x2);
  switch (n & 3) {
    case 0:
      return cosdf(y);
    case 1:
      return sindf(-y);
    case 2:
      return -cosdf(y);
    default:
      return sindf(y);
  }
}
var TOINT = 1.5 / Number.EPSILON;
var PIO4 = 26353590 * 2 ** -25;
var INVPIO2 = 0.6366197723675814;
var PIO2_1 = 1.5707963109016418;
var PIO2_1T = 15893254773528196e-24;
function remPio2f(x2) {
  const u = bits(x2);
  const ix = u & 2147483647;
  if (ix < 1305022427) {
    let fn = x2 * INVPIO2 + TOINT - TOINT;
    let n2 = fn | 0;
    let y2 = x2 - fn * PIO2_1 - fn * PIO2_1T;
    if (y2 < -PIO4) {
      n2--;
      fn--;
      y2 = x2 - fn * PIO2_1 - fn * PIO2_1T;
    } else if (y2 > PIO4) {
      n2++;
      fn++;
      y2 = x2 - fn * PIO2_1 - fn * PIO2_1T;
    }
    return [n2, y2];
  }
  if (ix >= 2139095040) return [0, x2 - x2];
  const sign = u >>> 31;
  const e0 = (ix >>> 23) - (127 + 23);
  const tx = fromBits(ix - (e0 << 23));
  const [n, y] = remPio2Large(tx, e0);
  return sign ? [-n, -y] : [n, y];
}
var IPIO2 = [
  10680707,
  7228996,
  1387004,
  2578385,
  16069853,
  12639074,
  9804092,
  4427841,
  16666979,
  11263675,
  12935607,
  2387514,
  4345298,
  14681673,
  3074569,
  13734428,
  16653803,
  1880361,
  10960616,
  8533493,
  3062596,
  8710556,
  7349940,
  6258241,
  3772886,
  3769171,
  3798172,
  8675211,
  12450088,
  3874808,
  9961438,
  366607,
  15675153,
  9132554,
  7151469,
  3571407,
  2607881,
  12013382,
  4155038,
  6285869,
  7677882,
  13102053,
  15825725,
  473591,
  9065106,
  15363067,
  6271263,
  9264392,
  5636912,
  4652155,
  7056368,
  13614112,
  10155062,
  1944035,
  9527646,
  15080200,
  6658437,
  6231200,
  6832269,
  16767104,
  5075751,
  3212806,
  1398474,
  7579849,
  6349435,
  12618859
];
var PIO2 = [
  1.570796251296997,
  7549789415861596e-23,
  5390302529957765e-30,
  3282003415807913e-37,
  1270655753080676e-44,
  12293330898111133e-52,
  27337005381646456e-60,
  21674168387780482e-67
];
var scalbn = (x2, n) => x2 * 2 ** n;
var i32 = (x2) => x2 | 0;
function remPio2Large(x0, e0) {
  const jk = 3;
  const jp = jk;
  const jx = 0;
  let jv = i32((e0 - 3) / 24);
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  const f = new Float64Array(20);
  const q2 = new Float64Array(20);
  const fq = new Float64Array(20);
  const iq = new Int32Array(20);
  for (let i2 = 0, j = jv - jx, m = jx + jk; i2 <= m; i2++, j++) f[i2] = j < 0 ? 0 : IPIO2[j];
  for (let i2 = 0; i2 <= jk; i2++) q2[i2] = x0 * f[jx + i2];
  let jz = jk;
  let z;
  let n;
  let ih;
  let carry;
  for (; ; ) {
    z = q2[jz];
    for (let i2 = 0, j = jz; j > 0; i2++, j--) {
      const fw2 = i32(2 ** -24 * z);
      iq[i2] = i32(z - 2 ** 24 * fw2);
      z = q2[j - 1] + fw2;
    }
    z = scalbn(z, q0);
    z -= 8 * Math.floor(z * 0.125);
    n = i32(z);
    z -= n;
    ih = 0;
    if (q0 > 0) {
      const i2 = iq[jz - 1] >> 24 - q0;
      n += i2;
      iq[jz - 1] = iq[jz - 1] - (i2 << 24 - q0);
      ih = iq[jz - 1] >> 23 - q0;
    } else if (q0 === 0) ih = iq[jz - 1] >> 23;
    else if (z >= 0.5) ih = 2;
    carry = 0;
    if (ih > 0) {
      n += 1;
      for (let i2 = 0; i2 < jz; i2++) {
        const j = iq[i2];
        if (carry === 0) {
          if (j !== 0) {
            carry = 1;
            iq[i2] = 16777216 - j;
          }
        } else iq[i2] = 16777215 - j;
      }
      if (q0 > 0) {
        if (q0 === 1) iq[jz - 1] = iq[jz - 1] & 8388607;
        else if (q0 === 2) iq[jz - 1] = iq[jz - 1] & 4194303;
      }
      if (ih === 2) {
        z = 1 - z;
        if (carry !== 0) z -= scalbn(1, q0);
      }
    }
    if (z === 0) {
      let j = 0;
      for (let i2 = jz - 1; i2 >= jk; i2--) j |= iq[i2];
      if (j === 0) {
        let k = 1;
        while (iq[jk - k] === 0) k++;
        for (let i2 = jz + 1; i2 <= jz + k; i2++) {
          f[jx + i2] = IPIO2[jv + i2];
          q2[i2] = x0 * f[jx + i2];
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  if (z === 0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) {
      jz--;
      q0 -= 24;
    }
  } else {
    z = scalbn(z, -q0);
    if (z >= 2 ** 24) {
      const fw2 = i32(2 ** -24 * z);
      iq[jz] = i32(z - 2 ** 24 * fw2);
      jz += 1;
      q0 += 24;
      iq[jz] = fw2;
    } else iq[jz] = i32(z);
  }
  let fw = scalbn(1, q0);
  for (let i2 = jz; i2 >= 0; i2--) {
    q2[i2] = fw * iq[i2];
    fw *= 2 ** -24;
  }
  for (let i2 = jz; i2 >= 0; i2--) {
    let s2 = 0;
    for (let k = 0; k <= jp && k <= jz - i2; k++) s2 += PIO2[k] * q2[i2 + k];
    fq[jz - i2] = s2;
  }
  let s = 0;
  for (let i2 = jz; i2 >= 0; i2--) s += fq[i2];
  return [n & 7, ih === 0 ? s : -s];
}

// src/core/eval/rotation.ts
var PROBE_ROTATION = 10;
var PROBE_WARP = fr(0.1);
function probedAngle(a, base, ox, oy, qx, qy) {
  const dx = fr(qx - ox);
  const dy = fr(qy - oy);
  let q2 = fr(atan2f(dy, dx) + HALF_PI_32);
  while (q2 < -PI_32) q2 = fr(q2 + TWO_PI_32);
  while (q2 > PI_32) q2 = fr(q2 - TWO_PI_32);
  const parent = fr(fr(q2 * 180) / PI_32);
  return fr(fr(a + parent) + base);
}
function rotationCS(theta, scale2) {
  const r = radians32(theta);
  return [fr(scale2 * cosf(r)), fr(scale2 * sinf(r))];
}

// src/core/eval/render-order.ts
var EXACT_LIMIT = 2 ** 53;
var RenderOrderer = class {
  groups;
  position = 0;
  constructor(model) {
    const g = model.groups;
    this.groups = g.objects.map((objects, gi) => {
      const n = objects.length;
      let scale2 = 1;
      while (scale2 < n) scale2 *= 2;
      return {
        kind: Uint8Array.from(objects, (o) => o.kind),
        index: Int32Array.from(objects, (o) => o.index),
        nested: Int32Array.from(objects, (o) => o.nestedGroup),
        offscreen: Int32Array.from(
          objects,
          (o) => o.kind === 1 ? model.parts.offscreen[o.index] : -1
        ),
        min: g.minDrawOrder[gi],
        scale: scale2,
        raw: new Float64Array(n),
        keys: new Float64Array(n)
      };
    });
  }
  /** Assigns drawable and offscreen render orders from the current draw orders. */
  compute(s) {
    this.position = 0;
    if (this.groups.length > 0) this.emit(s, 0);
  }
  emit(s, gi) {
    const g = this.groups[gi];
    const n = g.keys.length;
    const { kind: kind2, index, min, scale: scale2, raw, keys } = g;
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 0; f < n; f++) {
      const o = index[f];
      let key;
      if (kind2[f] === 0) key = s.drawableActive[o] ? s.drawableDrawOrder[o] : min;
      else key = s.partActive[o] ? s.partDrawOrder[o] : min;
      raw[f] = key;
      if (key < lo) lo = key;
      if (key > hi) hi = key;
    }
    if ((hi - lo + 1) * scale2 > EXACT_LIMIT) {
      this.emitWide(s, g);
      return;
    }
    for (let f = 0; f < n; f++) keys[f] = (raw[f] - lo) * scale2 + f;
    keys.sort();
    for (let j = 0; j < n; j++) {
      const f = keys[j] % scale2;
      this.place(s, g, f);
    }
  }
  /** Fallback for key spreads too wide for composite keys (not seen in practice). */
  emitWide(s, g) {
    const order = Array.from({ length: g.keys.length }, (_, f) => f);
    order.sort((a, b) => g.raw[a] - g.raw[b] || a - b);
    for (const f of order) this.place(s, g, f);
  }
  place(s, g, f) {
    if (g.kind[f] === 0) {
      s.drawableRenderOrder[g.index[f]] = this.position++;
    } else {
      const off = g.offscreen[f];
      if (off >= 0) s.offscreenRenderOrder[off] = this.position++;
      this.emit(s, g.nested[f]);
    }
  }
};

// src/core/moc/model.ts
var WARP_KIND = 0;
var ROTATION_KIND = 1;
var Checker = class {
  check(cond, message) {
    if (!cond) throw new MocFormatError(message());
  }
  /** `i` must be an integer in [lo, hi). */
  index(i2, lo, hi, what) {
    if (!(Number.isInteger(i2) && i2 >= lo && i2 < hi)) {
      throw new MocFormatError(`${what()}: index ${i2} out of range [${lo}, ${hi})`);
    }
  }
  /** [first, first + count) must lie within [0, total). An empty range may start anywhere. */
  range(first, count, total, what) {
    if (count < 0) throw new MocFormatError(`${what()}: negative count ${count}`);
    if (count === 0) return;
    if (!(first >= 0 && first + count <= total)) {
      throw new MocFormatError(
        `${what()}: range [${first}, ${first + count}) out of bounds (0\u2026${total})`
      );
    }
  }
};
function loadMoc(data, options = {}) {
  return buildModel(readMocSections(data), options);
}
function buildModel(sections, options = {}) {
  const loadWarnings = [];
  const s = new SectionAccess(sections);
  const v = sections.version;
  const c = new Checker();
  const n = {
    parts: s.count(Count.Parts),
    deformers: s.count(Count.Deformers),
    warps: s.count(Count.Warps),
    rotations: s.count(Count.Rotations),
    meshes: s.count(Count.ArtMeshes),
    parameters: s.count(Count.Parameters),
    partKeyforms: s.count(Count.PartKeyforms),
    warpKeyforms: s.count(Count.WarpKeyforms),
    rotationKeyforms: s.count(Count.RotationKeyforms),
    meshKeyforms: s.count(Count.ArtMeshKeyforms),
    positions: s.count(Count.PositionFloats),
    bindingEntries: s.count(Count.BindingIndexEntries),
    bands: s.count(Count.Bands),
    bindings: s.count(Count.ParameterBindings),
    keys: s.count(Count.KeyValues),
    uvs: s.count(Count.UvFloats),
    triangleEntries: s.count(Count.TriangleIndexEntries),
    maskEntries: s.count(Count.MaskEntries),
    groups: s.count(Count.DrawOrderGroups),
    groupObjects: s.count(Count.DrawOrderGroupObjects),
    glues: s.count(Count.Glues),
    glueInfos: s.count(Count.GlueInfoEntries),
    glueKeyforms: s.count(Count.GlueKeyforms),
    multiplyColors: s.count(Count.MultiplyColors),
    screenColors: s.count(Count.ScreenColors),
    bsBindings: s.count(Count.BlendShapeParameterBindings),
    bsKeyformBindings: s.count(Count.BlendShapeKeyformBindings),
    constraintEntries: s.count(Count.BlendShapeConstraintIndexEntries),
    constraints: s.count(Count.BlendShapeConstraints),
    constraintValues: s.count(Count.BlendShapeConstraintValues),
    offscreens: s.count(Count.Offscreens),
    offscreenKeyforms: s.count(Count.OffscreenKeyforms)
  };
  const keys = s.f32("keys");
  const bindingFirstKey = s.i32("binding.firstKey");
  const bindingKeyCount = s.i32("binding.keyCount");
  const bindingKeys = [];
  const keysAt = (first, count, what) => {
    c.range(first, count, n.keys, what);
    c.check(count >= 1, () => `${what()}: has no keys`);
    const k = keys.subarray(first, first + count);
    for (let i2 = 1; i2 < k.length; i2++) {
      c.check(
        k[i2] > k[i2 - 1],
        () => `${what()}: keys are not strictly ascending (${k[i2 - 1]} then ${k[i2]})`
      );
    }
    return k;
  };
  for (let b = 0; b < n.bindings; b++) {
    bindingKeys.push(
      keysAt(bindingFirstKey[b], bindingKeyCount[b], () => `parameter binding ${b}`)
    );
  }
  for (const key of [
    "part.initiallyVisible",
    "part.enabled",
    "deformer.visible",
    "deformer.enabled",
    "mesh.visible",
    "mesh.enabled",
    "parameter.repeat"
  ]) {
    const values = s.i32(key);
    for (let i2 = 0; i2 < values.length; i2++)
      c.check(
        values[i2] === 0 || values[i2] === 1,
        () => `${key} ${i2}: ${values[i2]} is not a flag value (0 or 1)`
      );
  }
  const pIds = s.names("parameter.id");
  const pMin = s.f32("parameter.min");
  const pMax = s.f32("parameter.max");
  const pFirstBinding = s.i32("parameter.firstBinding");
  const pBindingCount = s.i32("parameter.bindingCount");
  const pDecimals = s.i32("parameter.decimals");
  const bindingParameter = new Int32Array(n.bindings).fill(-1);
  const pType = new Uint8Array(n.parameters);
  const pTypeRaw = s.i32("parameter.type");
  for (let p = 0; p < n.parameters; p++) {
    const what = () => `parameter ${p} (${pIds[p]})`;
    c.check(!(pMin[p] > pMax[p]), () => `${what()}: min ${pMin[p]} > max ${pMax[p]}`);
    c.check(pDecimals[p] >= 0, () => `${what()}: negative decimal places ${pDecimals[p]}`);
    c.range(pFirstBinding[p], pBindingCount[p], n.bindings, () => `${what()} bindings`);
    for (let b = pFirstBinding[p]; b < pFirstBinding[p] + pBindingCount[p]; b++) {
      c.check(bindingParameter[b] === -1, () => `parameter binding ${b} is owned twice`);
      bindingParameter[b] = p;
    }
    if (v >= 4) {
      const t = pTypeRaw[p];
      c.check(t === 0 || t === 1, () => `${what()}: unknown type ${t}`);
      pType[p] = t;
    }
  }
  for (let b = 0; b < n.bindings; b++) {
    c.check(
      bindingParameter[b] !== -1,
      () => `parameter binding ${b} is not owned by any parameter`
    );
  }
  const keyLists = [];
  if (v >= 4) {
    const firstKey = s.i32("parameter.firstKey");
    const keyCount = s.i32("parameter.keyCount");
    for (let p = 0; p < n.parameters; p++) {
      c.range(firstKey[p], keyCount[p], n.keys, () => `parameter ${p} (${pIds[p]}) key list`);
      keyLists.push(keys.slice(firstKey[p], firstKey[p] + keyCount[p]));
    }
  } else {
    for (let p = 0; p < n.parameters; p++) {
      const set = /* @__PURE__ */ new Set();
      for (let b = pFirstBinding[p]; b < pFirstBinding[p] + pBindingCount[p]; b++) {
        for (const k of bindingKeys[b]) set.add(k);
      }
      keyLists.push(Float32Array.from([...set].sort((a, b) => a - b)));
    }
  }
  const bandFirst = s.i32("band.firstEntry");
  const bandCount = s.i32("band.entryCount");
  const bindingIndex = s.i32("bindingIndex");
  for (let e = 0; e < n.bindingEntries; e++) {
    c.index(bindingIndex[e], 0, n.bindings, () => `binding-index entry ${e}`);
  }
  const bands = [];
  for (let b = 0; b < n.bands; b++) {
    c.range(bandFirst[b], bandCount[b], n.bindingEntries, () => `keyform binding ${b}`);
    const list = bindingIndex.slice(bandFirst[b], bandFirst[b] + bandCount[b]);
    const strides = new Int32Array(list.length);
    let size = 1;
    for (let j = 0; j < list.length; j++) {
      strides[j] = size;
      size *= bindingKeys[list[j]].length;
      c.check(size <= 2147483647, () => `keyform binding ${b}: keyform count overflows`);
    }
    bands.push({ bindings: list, strides, keyformCount: size });
  }
  const keyformRange = (band, first, count, total, what) => {
    c.index(band, 0, n.bands, () => `${what()} keyform binding`);
    c.range(first, count, total, () => `${what()} keyforms`);
    const expected = bands[band].keyformCount;
    c.check(
      count === expected,
      () => `${what()}: ${count} keyforms but its bindings need ${expected}`
    );
  };
  const multiplyColors = new Float32Array(n.multiplyColors * 3);
  const screenColors = new Float32Array(n.screenColors * 3);
  if (v >= 4) {
    const [mr, mg, mb] = [
      s.f32("multiplyColor.r"),
      s.f32("multiplyColor.g"),
      s.f32("multiplyColor.b")
    ];
    for (let i2 = 0; i2 < n.multiplyColors; i2++) multiplyColors.set([mr[i2], mg[i2], mb[i2]], i2 * 3);
    const [sr, sg, sb] = [s.f32("screenColor.r"), s.f32("screenColor.g"), s.f32("screenColor.b")];
    for (let i2 = 0; i2 < n.screenColors; i2++) screenColors.set([sr[i2], sg[i2], sb[i2]], i2 * 3);
  }
  const noColors = (count) => ({
    multiply: new Int32Array(count).fill(-1),
    screen: new Int32Array(count).fill(-1)
  });
  const v5Colors = (mKey, sKey) => ({
    multiply: Int32Array.from(s.i32(mKey)),
    screen: Int32Array.from(s.i32(sKey))
  });
  const checkOwnColors = (colors, what) => {
    for (let k = 0; k < colors.multiply.length; k++) {
      c.index(
        colors.multiply[k],
        0,
        n.multiplyColors,
        () => `${what} keyform ${k} multiply color`
      );
      c.index(colors.screen[k], 0, n.screenColors, () => `${what} keyform ${k} screen color`);
    }
  };
  const checkColors = (colors, what) => {
    for (let k = 0; k < colors.multiply.length; k++) {
      c.index(
        colors.multiply[k],
        0,
        n.multiplyColors,
        () => `${what} keyform ${k} multiply color`
      );
      c.index(colors.screen[k], 0, n.screenColors, () => `${what} keyform ${k} screen color`);
    }
  };
  const v4Colors = (target2, first, count, firstColor, what) => {
    c.range(
      firstColor,
      count,
      Math.min(n.multiplyColors, n.screenColors),
      () => `${what()} colors`
    );
    for (let k = 0; k < count; k++) {
      target2.multiply[first + k] = firstColor + k;
      target2.screen[first + k] = firstColor + k;
    }
  };
  const partIds = s.names("part.id");
  const partBand = s.i32("part.band");
  const partFirst = s.i32("part.firstKeyform");
  const partCount = s.i32("part.keyformCount");
  const partParent = s.i32("part.parent");
  const partOffscreen = v >= 6 ? s.i32("part.offscreen") : new Int32Array(n.parts).fill(-1);
  const partInitial = new Float32Array(n.parts);
  const partEnabled = new Uint8Array(n.parts);
  const rawInitial = s.i32("part.initiallyVisible");
  const rawPartEnabled = s.i32("part.enabled");
  for (let i2 = 0; i2 < n.parts; i2++) {
    const what = () => `part ${i2} (${partIds[i2]})`;
    c.check(
      partParent[i2] >= -1 && partParent[i2] < i2,
      () => `${what()}: parent ${partParent[i2]} must be -1 or an earlier part`
    );
    keyformRange(partBand[i2], partFirst[i2], partCount[i2], n.partKeyforms, what);
    c.index(partOffscreen[i2], -1, n.offscreens, () => `${what()} offscreen`);
    partInitial[i2] = rawInitial[i2] === 1 ? 1 : 0;
    partEnabled[i2] = rawPartEnabled[i2] !== 0 ? 1 : 0;
  }
  const dIds = s.names("deformer.id");
  const dKind = s.i32("deformer.kind");
  const dKindIndex = s.i32("deformer.kindIndex");
  const dPart = s.i32("deformer.part");
  const dParent = s.i32("deformer.parent");
  const dBandRaw = s.i32("deformer.band");
  const dEnabledRaw = s.i32("deformer.enabled");
  const dKindU8 = new Uint8Array(n.deformers);
  const dBand = new Int32Array(n.deformers);
  const dEnabled = new Uint8Array(n.deformers);
  const warpBand = s.i32("warp.band");
  const rotBand = s.i32("rotation.band");
  for (let d = 0; d < n.deformers; d++) {
    const what = () => `deformer ${d} (${dIds[d]})`;
    const kind2 = dKind[d];
    c.check(kind2 === WARP_KIND || kind2 === ROTATION_KIND, () => `${what()}: unknown kind ${kind2}`);
    c.index(
      dKindIndex[d],
      0,
      kind2 === WARP_KIND ? n.warps : n.rotations,
      () => `${what()} ${kind2 === WARP_KIND ? "warp" : "rotation"} record`
    );
    c.index(dPart[d], -1, n.parts, () => `${what()} owning part`);
    c.check(
      dParent[d] >= -1 && dParent[d] < d,
      () => `${what()}: parent ${dParent[d]} must be -1 or an earlier deformer`
    );
    c.index(dBandRaw[d], 0, n.bands, () => `${what()} keyform binding`);
    dKindU8[d] = kind2;
    dBand[d] = kind2 === WARP_KIND ? warpBand[dKindIndex[d]] : rotBand[dKindIndex[d]];
    dEnabled[d] = dEnabledRaw[d] !== 0 ? 1 : 0;
  }
  const warpFirst = s.i32("warp.firstKeyform");
  const warpCount = s.i32("warp.keyformCount");
  const warpRows = s.i32("warp.rows");
  const warpCols = s.i32("warp.columns");
  const warpPoints = s.i32("warp.pointCount");
  const warpBilinear = new Uint8Array(n.warps);
  const rawBilinear = v >= 2 ? s.i32("warp.bilinear") : new Int32Array(n.warps);
  const warpColors = v >= 5 ? v5Colors("warpKeyform.multiplyColor", "warpKeyform.screenColor") : noColors(n.warpKeyforms);
  if (v >= 5) checkOwnColors(warpColors, "warp");
  const warpFirstPosition = s.i32("warpKeyform.firstPosition");
  const warpFirstColor = s.i32("warp.firstColor");
  const checkPositions = (first, k, floats, what) => {
    c.range(first[k], floats, n.positions, () => `${what()} keyform ${k} positions`);
  };
  for (let w = 0; w < n.warps; w++) {
    const what = () => `warp ${w}`;
    const R = warpRows[w];
    const C = warpCols[w];
    c.check(R >= 1 && C >= 1, () => `${what()}: grid of ${R}\xD7${C} cells`);
    c.check(
      warpPoints[w] === (R + 1) * (C + 1),
      () => `${what()}: ${warpPoints[w]} grid points, expected (R+1)(C+1) = ${(R + 1) * (C + 1)}`
    );
    keyformRange(warpBand[w], warpFirst[w], warpCount[w], n.warpKeyforms, what);
    for (let k = warpFirst[w]; k < warpFirst[w] + warpCount[w]; k++)
      checkPositions(warpFirstPosition, k, 2 * warpPoints[w], what);
    if (v >= 4) v4Colors(warpColors, warpFirst[w], warpCount[w], warpFirstColor[w], what);
    warpBilinear[w] = rawBilinear[w] !== 0 ? 1 : 0;
  }
  if (v >= 5) checkColors(warpColors, "warp");
  const rotFirst = s.i32("rotation.firstKeyform");
  const rotCount = s.i32("rotation.keyformCount");
  const rotColors = v >= 5 ? v5Colors("rotationKeyform.multiplyColor", "rotationKeyform.screenColor") : noColors(n.rotationKeyforms);
  if (v >= 5) checkOwnColors(rotColors, "rotation");
  const rotFirstColor = s.i32("rotation.firstColor");
  for (let r = 0; r < n.rotations; r++) {
    const what = () => `rotation ${r}`;
    keyformRange(rotBand[r], rotFirst[r], rotCount[r], n.rotationKeyforms, what);
    if (v >= 4) v4Colors(rotColors, rotFirst[r], rotCount[r], rotFirstColor[r], what);
  }
  if (v >= 5) checkColors(rotColors, "rotation");
  const toU8 = (a) => Uint8Array.from(a, (x2) => x2 !== 0 ? 1 : 0);
  const mIds = s.names("mesh.id");
  const mBand = s.i32("mesh.band");
  const mFirst = s.i32("mesh.firstKeyform");
  const mCount = s.i32("mesh.keyformCount");
  const mPart = s.i32("mesh.part");
  const mDeformer = s.i32("mesh.deformer");
  const mTexture = s.i32("mesh.texture");
  const mFlags = s.u8("mesh.flags");
  const mVertexCount = s.i32("mesh.vertexCount");
  const mFirstUv = s.i32("mesh.firstUv");
  const mFirstTri = s.i32("mesh.firstTriangleIndex");
  const mTriCount = s.i32("mesh.triangleIndexCount");
  const mFirstMask = s.i32("mesh.firstMask");
  const mMaskCount = s.i32("mesh.maskCount");
  const mFirstColor = s.i32("mesh.firstColor");
  const uvsAll = s.f32("uvs");
  const trisAll = s.u16("triangleIndices");
  const masksAll = s.i32("maskEntries");
  for (let e = 0; e < masksAll.length; e++)
    c.index(masksAll[e], -1, n.meshes, () => `mask entry ${e}`);
  const meshFirstPosition = s.i32("meshKeyform.firstPosition");
  const meshColors = v >= 5 ? v5Colors("meshKeyform.multiplyColor", "meshKeyform.screenColor") : noColors(n.meshKeyforms);
  if (v >= 5) checkOwnColors(meshColors, "art-mesh");
  const uvs = [];
  const triangles = [];
  const masks = [];
  const blendMode = new Int32Array(n.meshes);
  const rawBlend = s.i32("mesh.blendMode");
  for (let m = 0; m < n.meshes; m++) {
    const what = () => `art mesh ${m} (${mIds[m]})`;
    const V = mVertexCount[m];
    c.check(V >= 0, () => `${what()}: negative vertex count`);
    keyformRange(mBand[m], mFirst[m], mCount[m], n.meshKeyforms, what);
    c.index(mPart[m], -1, n.parts, () => `${what()} parent part`);
    c.index(mDeformer[m], -1, n.deformers, () => `${what()} parent deformer`);
    c.check(mTexture[m] >= 0, () => `${what()}: negative texture index ${mTexture[m]}`);
    c.range(mFirstUv[m], 2 * V, n.uvs, () => `${what()} UVs`);
    uvs.push(uvsAll.subarray(mFirstUv[m], mFirstUv[m] + 2 * V));
    c.range(mFirstTri[m], mTriCount[m], n.triangleEntries, () => `${what()} triangles`);
    c.check(
      mTriCount[m] % 3 === 0,
      () => `${what()}: ${mTriCount[m]} triangle indices, not a multiple of 3`
    );
    const tri = trisAll.subarray(mFirstTri[m], mFirstTri[m] + mTriCount[m]);
    for (let i2 = 0; i2 < tri.length; i2++)
      c.check(tri[i2] < V, () => `${what()}: triangle index ${tri[i2]} \u2265 vertex count ${V}`);
    triangles.push(tri);
    c.range(mFirstMask[m], mMaskCount[m], n.maskEntries, () => `${what()} masks`);
    const mk = masksAll.subarray(mFirstMask[m], mFirstMask[m] + mMaskCount[m]);
    masks.push(Int32Array.from(mk).filter((e) => e !== -1));
    for (let k = mFirst[m]; k < mFirst[m] + mCount[m]; k++)
      checkPositions(meshFirstPosition, k, 2 * V, what);
    if (v >= 4) v4Colors(meshColors, mFirst[m], mCount[m], mFirstColor[m], what);
    const flags = mFlags[m];
    blendMode[m] = v >= 6 ? rawBlend[m] : flags & 1 ? 1 : flags & 2 ? 2 : 0;
  }
  if (v >= 5) checkColors(meshColors, "art-mesh");
  for (let i2 = 0; i2 < n.meshes && i2 < n.meshKeyforms; i2++) {
    const end = meshFirstPosition[i2] + 2 * mVertexCount[i2];
    c.check(
      end >= 0 && end <= n.positions,
      () => `art-mesh keyform ${i2}: start ${meshFirstPosition[i2]} + the ${2 * mVertexCount[i2]} position floats of art mesh ${i2} ends outside [0, ${n.positions}] (the official check rejects it)`
    );
  }
  for (let i2 = 0; i2 < n.warps && i2 < n.warpKeyforms; i2++) {
    const end = warpFirstPosition[i2] + 2 * warpPoints[i2];
    c.check(
      end >= 0 && end <= n.positions,
      () => `warp keyform ${i2}: start ${warpFirstPosition[i2]} + the ${2 * warpPoints[i2]} position floats of warp ${i2} ends outside [0, ${n.positions}] (the official check rejects it)`
    );
  }
  const gIds = s.names("glue.id");
  const gBand = s.i32("glue.band");
  const gFirst = s.i32("glue.firstKeyform");
  const gCount = s.i32("glue.keyformCount");
  const gA = s.i32("glue.meshA");
  const gB = s.i32("glue.meshB");
  const gFirstInfo = s.i32("glue.firstInfo");
  const gInfoCount = s.i32("glue.infoCount");
  const infoWeight = s.f32("glueInfo.weight");
  const infoVertex = s.u16("glueInfo.vertex");
  const vertexA = [];
  const weightA = [];
  const vertexB = [];
  const weightB = [];
  for (let g = 0; g < n.glues; g++) {
    const what = () => `glue ${g} (${gIds[g]})`;
    keyformRange(gBand[g], gFirst[g], gCount[g], n.glueKeyforms, what);
    c.index(gA[g], 0, n.meshes, () => `${what()} art mesh A`);
    c.index(gB[g], 0, n.meshes, () => `${what()} art mesh B`);
    c.range(gFirstInfo[g], gInfoCount[g], n.glueInfos, () => `${what()} glue info`);
    c.check(gInfoCount[g] % 2 === 0, () => `${what()}: odd glue-info count ${gInfoCount[g]}`);
    const pairs = gInfoCount[g] / 2;
    const va = new Uint16Array(pairs);
    const wa = new Float32Array(pairs);
    const vb = new Uint16Array(pairs);
    const wb = new Float32Array(pairs);
    for (let i2 = 0; i2 < pairs; i2++) {
      const e = gFirstInfo[g] + 2 * i2;
      va[i2] = infoVertex[e];
      wa[i2] = infoWeight[e];
      vb[i2] = infoVertex[e + 1];
      wb[i2] = infoWeight[e + 1];
      c.check(
        va[i2] < mVertexCount[gA[g]],
        () => `${what()}: vertex ${va[i2]} of mesh A out of range`
      );
      c.check(
        vb[i2] < mVertexCount[gB[g]],
        () => `${what()}: vertex ${vb[i2]} of mesh B out of range`
      );
    }
    vertexA.push(va);
    weightA.push(wa);
    vertexB.push(vb);
    weightB.push(wb);
  }
  const oPart = s.i32("offscreen.part");
  const oFirstMask = s.i32("offscreen.firstMask");
  const oMaskCount = s.i32("offscreen.maskCount");
  const oMasks = [];
  for (let o = 0; o < n.offscreens; o++) {
    const what = () => `offscreen ${o}`;
    c.index(oPart[o], 0, n.parts, () => `${what()} owner part`);
    c.check(
      partOffscreen[oPart[o]] === o,
      () => `${what()}: owner part ${oPart[o]} does not point back to it`
    );
    c.range(oFirstMask[o], oMaskCount[o], n.maskEntries, () => `${what()} masks`);
    const mk = masksAll.subarray(oFirstMask[o], oFirstMask[o] + oMaskCount[o]);
    oMasks.push(Int32Array.from(mk).filter((e) => e !== -1));
  }
  for (let p = 0; p < n.parts; p++) {
    const o = partOffscreen[p];
    if (o >= 0) c.check(oPart[o] === p, () => `part ${p}: offscreen ${o} names a different owner`);
  }
  const partOffscreenKeyform = v >= 6 ? Int32Array.from(s.i32("partKeyform.offscreenKeyform")) : new Int32Array(n.partKeyforms).fill(-1);
  const lenientOffscreenKeyforms = options.offscreenKeyformRange === "load";
  for (let k = 0; k < n.partKeyforms; k++) {
    const ok = partOffscreenKeyform[k];
    if (lenientOffscreenKeyforms && !(ok >= -1 && ok < n.offscreenKeyforms)) {
      loadWarnings.push(
        `part keyform ${k}: offscreen keyform ${ok} is not \u22121 or an offscreen keyform; read as \u22121`
      );
      partOffscreenKeyform[k] = -1;
      continue;
    }
    c.index(ok, -1, n.offscreenKeyforms, () => `part keyform ${k} offscreen keyform`);
  }
  const offscreenColors = v >= 6 ? v5Colors("offscreenKeyform.multiplyColor", "offscreenKeyform.screenColor") : noColors(0);
  if (v >= 6) {
    const raw = Int32Array.from(offscreenColors.multiply);
    for (let o = 0; o < n.offscreens; o++) {
      const p = oPart[o];
      const firstOk = partOffscreenKeyform[partFirst[p]];
      if (firstOk < 0) continue;
      for (let j = 0; j < partCount[p]; j++) {
        const ok = partOffscreenKeyform[partFirst[p] + j];
        if (ok < 0) continue;
        offscreenColors.multiply[ok] = raw[firstOk] + j;
        offscreenColors.screen[ok] = raw[firstOk] + j;
      }
    }
    checkColors(offscreenColors, "offscreen");
  }
  const blendShapeTargets = (objectKey, countKey, objects, since) => {
    const out = new Uint8Array(objects);
    if (v < since) return out;
    const obj2 = s.i32(objectKey);
    const cnt = s.i32(countKey);
    for (let t = 0; t < obj2.length; t++)
      if (cnt[t] > 0 && obj2[t] >= 0 && obj2[t] < objects) out[obj2[t]] = 1;
    return out;
  };
  const grpFirst = s.i32("group.firstObject");
  const grpCount = s.i32("group.objectCount");
  const objKind = s.i32("groupObject.kind");
  const objIndex = s.i32("groupObject.index");
  const objNested = s.i32("groupObject.nestedGroup");
  const groupObjects = [];
  c.check(n.groups >= 1 || n.meshes === 0, () => "no draw-order groups");
  for (let i2 = 0; i2 < n.groupObjects; i2++) {
    const kind2 = objKind[i2];
    c.check(kind2 === 0 || kind2 === 1, () => `draw-order object ${i2}: unknown kind ${kind2}`);
    c.index(objIndex[i2], 0, kind2 === 0 ? n.meshes : n.parts, () => `draw-order object ${i2} index`);
    c.index(objNested[i2], -1, n.groups, () => `draw-order object ${i2} child group`);
  }
  for (let g = 0; g < n.groups; g++) {
    c.range(grpFirst[g], grpCount[g], n.groupObjects, () => `draw-order group ${g} objects`);
    const list = [];
    for (let i2 = grpFirst[g]; i2 < grpFirst[g] + grpCount[g]; i2++) {
      const kind2 = objKind[i2];
      c.check(kind2 === 0 || kind2 === 1, () => `draw-order object ${i2}: unknown kind ${kind2}`);
      if (kind2 === 0) {
        c.index(objIndex[i2], 0, n.meshes, () => `draw-order object ${i2} art mesh`);
        list.push({ kind: 0, index: objIndex[i2], nestedGroup: -1 });
      } else {
        c.index(objIndex[i2], 0, n.parts, () => `draw-order object ${i2} part`);
        c.index(objNested[i2], 0, n.groups, () => `draw-order object ${i2} nested group`);
        list.push({ kind: 1, index: objIndex[i2], nestedGroup: objNested[i2] });
      }
    }
    groupObjects.push(list);
  }
  if (n.groups > 0) {
    const meshSeen = new Uint8Array(n.meshes);
    const offscreenSeen = new Uint8Array(n.offscreens);
    const groupState = new Uint8Array(n.groups);
    const visit = (g) => {
      c.check(groupState[g] === 0, () => `draw-order group ${g} is reached twice or forms a cycle`);
      groupState[g] = 1;
      for (const o of groupObjects[g]) {
        if (o.kind === 0) {
          c.check(
            meshSeen[o.index] === 0,
            () => `art mesh ${o.index} appears in more than one draw-order position`
          );
          meshSeen[o.index] = 1;
        } else {
          const off = partOffscreen[o.index];
          if (off >= 0) {
            c.check(offscreenSeen[off] === 0, () => `offscreen ${off} is reached twice`);
            offscreenSeen[off] = 1;
          }
          visit(o.nestedGroup);
        }
      }
      groupState[g] = 2;
    };
    visit(0);
    const totals = s.i32("group.entryCount");
    const total = (g) => {
      let t = 0;
      for (const o of groupObjects[g])
        t += o.kind === 0 ? 1 : (partOffscreen[o.index] >= 0 ? 1 : 0) + total(o.nestedGroup);
      c.check(
        totals[g] === t,
        () => `draw-order group ${g}: total ${totals[g]} in the file, but it holds ${t} entries`
      );
      return t;
    };
    total(0);
    const gMax = s.i32("group.maxDrawOrder");
    const gMin = s.i32("group.minDrawOrder");
    const meshOrder = s.f32("meshKeyform.drawOrder");
    const partOrder = s.f32("partKeyform.drawOrder");
    const meshFirst = s.i32("mesh.firstKeyform");
    const meshCount = s.i32("mesh.keyformCount");
    const partFirstKf = s.i32("part.firstKeyform");
    const partCountKf = s.i32("part.keyformCount");
    const strict = options.drawOrderRange === "reject";
    const meshTarget = blendShapeTargets("meshTarget.mesh", "meshTarget.bindingCount", n.meshes, 4);
    const partTarget = blendShapeTargets("partTarget.part", "partTarget.bindingCount", n.parts, 5);
    for (let g = 0; g < n.groups; g++)
      for (const o of groupObjects[g]) {
        const mesh = o.kind === 0;
        const first = (mesh ? meshFirst : partFirstKf)[o.index];
        const count = (mesh ? meshCount : partCountKf)[o.index];
        const orders = mesh ? meshOrder : partOrder;
        const target2 = (mesh ? meshTarget : partTarget)[o.index] === 1;
        const outside = [];
        for (let k = first; k < first + count; k++) {
          const v2 = orders[k];
          const order = keyformDrawOrder(v2, target2, sections.version);
          if (order >= gMin[g] && order <= gMax[g]) continue;
          const what = () => `${mesh ? `art mesh ${mIds[o.index]}` : `part ${partIds[o.index]}`}: keyform draw order ${v2} is outside the range [${gMin[g]}, ${gMax[g]}] of draw-order group ${g}`;
          if (strict) c.check(false, what);
          outside.push(v2);
        }
        if (outside.length)
          loadWarnings.push(
            `${mesh ? `art mesh ${mIds[o.index]}` : `part ${partIds[o.index]}`}: keyform draw order${outside.length > 1 ? "s" : ""} ${outside.join(", ")} outside the range [${gMin[g]}, ${gMax[g]}] of draw-order group ${g}; drawn by the evaluated value`
          );
      }
    for (let m = 0; m < n.meshes; m++)
      c.check(meshSeen[m] === 1, () => `art mesh ${m} (${mIds[m]}) is in no draw-order group`);
    for (let o = 0; o < n.offscreens; o++)
      c.check(offscreenSeen[o] === 1, () => `offscreen ${o} is in no draw-order group`);
  }
  const bs = {
    warp: [],
    mesh: [],
    part: [],
    rotation: [],
    glue: [],
    offscreen: []
  };
  for (let i2 = 0; i2 < n.warps; i2++) bs.warp.push([]);
  for (let i2 = 0; i2 < n.meshes; i2++) bs.mesh.push([]);
  for (let i2 = 0; i2 < n.parts; i2++) bs.part.push([]);
  for (let i2 = 0; i2 < n.rotations; i2++) bs.rotation.push([]);
  for (let i2 = 0; i2 < n.glues; i2++) bs.glue.push([]);
  for (let i2 = 0; i2 < n.offscreens; i2++) bs.offscreen.push([]);
  if (v >= 4) {
    const bsOwner = new Int32Array(n.bsBindings).fill(-1);
    const pFirstBs = s.i32("parameter.firstBlendShapeBinding");
    const pBsCount = s.i32("parameter.blendShapeBindingCount");
    for (let p = 0; p < n.parameters; p++) {
      c.range(
        pFirstBs[p],
        pBsCount[p],
        n.bsBindings,
        () => `parameter ${p} (${pIds[p]}) blend-shape bindings`
      );
      for (let b = pFirstBs[p]; b < pFirstBs[p] + pBsCount[p]; b++) {
        c.check(bsOwner[b] === -1, () => `blend-shape parameter binding ${b} is owned twice`);
        bsOwner[b] = p;
      }
    }
    const bsFirstKey = s.i32("bsBinding.firstKey");
    const bsKeyCount = s.i32("bsBinding.keyCount");
    const bsBase = s.i32("bsBinding.baseKey");
    const bsKeys = [];
    for (let b = 0; b < n.bsBindings; b++) {
      c.check(
        bsOwner[b] !== -1,
        () => `blend-shape parameter binding ${b} is not owned by any parameter`
      );
      bsKeys.push(
        keysAt(bsFirstKey[b], bsKeyCount[b], () => `blend-shape parameter binding ${b}`)
      );
      c.index(bsBase[b], 0, bsKeyCount[b], () => `blend-shape parameter binding ${b} base key`);
    }
    const conParam = s.i32("constraint.parameter");
    const conFirst = s.i32("constraint.firstValue");
    const conCount = s.i32("constraint.valueCount");
    const cvKey = s.f32("constraintValue.key");
    const cvWeight = s.f32("constraintValue.weight");
    const constraintList = [];
    for (let k = 0; k < n.constraints; k++) {
      const what = () => `blend-shape constraint ${k}`;
      c.index(conParam[k], 0, n.parameters, () => `${what()} parameter`);
      c.range(conFirst[k], conCount[k], n.constraintValues, () => `${what()} values`);
      c.check(conCount[k] >= 1, () => `${what()}: no values`);
      const ks = cvKey.slice(conFirst[k], conFirst[k] + conCount[k]);
      for (let i2 = 1; i2 < ks.length; i2++)
        c.check(ks[i2] > ks[i2 - 1], () => `${what()}: keys not ascending`);
      constraintList.push({
        parameter: conParam[k],
        keys: ks,
        weights: cvWeight.slice(conFirst[k], conFirst[k] + conCount[k])
      });
    }
    const conIndex = s.i32("constraintIndex");
    for (let e = 0; e < n.constraintEntries; e++)
      c.index(conIndex[e], 0, n.constraints, () => `constraint-index entry ${e}`);
    const kbBinding = s.i32("bsKeyformBinding.binding");
    const kbFirst = s.i32("bsKeyformBinding.firstKeyform");
    const kbCount = s.i32("bsKeyformBinding.keyformCount");
    const kbConFirst = s.i32("bsKeyformBinding.firstConstraintEntry");
    const kbConCount = s.i32("bsKeyformBinding.constraintEntryCount");
    const keyformBinding = (i2, keyformTotal, what) => {
      c.index(i2, 0, n.bsKeyformBindings, what);
      const b = kbBinding[i2];
      c.index(b, 0, n.bsBindings, () => `${what()} blend-shape parameter binding`);
      c.range(kbFirst[i2], kbCount[i2], keyformTotal, () => `${what()} keyforms`);
      c.check(
        kbCount[i2] === bsKeys[b].length,
        () => `${what()}: ${kbCount[i2]} keyforms for ${bsKeys[b].length} keys`
      );
      c.range(kbConFirst[i2], kbConCount[i2], n.constraintEntries, () => `${what()} constraints`);
      const constraints = [];
      for (let e = kbConFirst[i2]; e < kbConFirst[i2] + kbConCount[i2]; e++)
        constraints.push(constraintList[conIndex[e]]);
      return {
        parameter: bsOwner[b],
        keys: bsKeys[b],
        baseKey: bsBase[b],
        firstKeyform: kbFirst[i2],
        constraints
      };
    };
    const targets = (targetKey, objectField, count, objectCount, keyformTotal, out, after) => {
      const obj2 = s.i32(`${targetKey}.${objectField}`);
      const first = s.i32(`${targetKey}.firstBinding`);
      const cnt = s.i32(`${targetKey}.bindingCount`);
      for (let t = 0; t < count; t++) {
        const what = () => `${objectField} blend-shape target ${t}`;
        c.index(obj2[t], 0, objectCount, what);
        c.range(first[t], cnt[t], n.bsKeyformBindings, () => `${what()} bindings`);
        for (let i2 = first[t]; i2 < first[t] + cnt[t]; i2++) {
          const b = keyformBinding(i2, keyformTotal, () => `${what()} binding ${i2}`);
          after(obj2[t], b, what);
          out[obj2[t]].push(b);
        }
      }
    };
    targets(
      "warpTarget",
      "warp",
      s.count(Count.WarpBlendShapeTargets),
      n.warps,
      n.warpKeyforms,
      bs.warp,
      (w, b, what) => {
        for (let k = b.firstKeyform; k < b.firstKeyform + b.keys.length; k++)
          checkPositions(warpFirstPosition, k, 2 * warpPoints[w], what);
      }
    );
    targets(
      "meshTarget",
      "mesh",
      s.count(Count.ArtMeshBlendShapeTargets),
      n.meshes,
      n.meshKeyforms,
      bs.mesh,
      (m, b, what) => {
        for (let k = b.firstKeyform; k < b.firstKeyform + b.keys.length; k++)
          checkPositions(meshFirstPosition, k, 2 * mVertexCount[m], what);
      }
    );
    if (v >= 5) {
      targets(
        "partTarget",
        "part",
        s.count(Count.PartBlendShapeTargets),
        n.parts,
        n.partKeyforms,
        bs.part,
        () => {
        }
      );
      targets(
        "rotationTarget",
        "rotation",
        s.count(Count.RotationBlendShapeTargets),
        n.rotations,
        n.rotationKeyforms,
        bs.rotation,
        () => {
        }
      );
      targets(
        "glueTarget",
        "glue",
        s.count(Count.GlueBlendShapeTargets),
        n.glues,
        n.glueKeyforms,
        bs.glue,
        () => {
        }
      );
    }
    if (v >= 6)
      targets(
        "offscreenTarget",
        "offscreen",
        s.count(Count.OffscreenBlendShapeTargets),
        n.offscreens,
        n.offscreenKeyforms,
        bs.offscreen,
        () => {
        }
      );
  }
  const rotMirrorX = toU8(s.i32("rotationKeyform.mirrorX"));
  const rotMirrorY = toU8(s.i32("rotationKeyform.mirrorY"));
  if (options.nonFiniteOpacity !== "load")
    for (const [key, what] of [
      ["warpKeyform.opacity", "warp"],
      ["rotationKeyform.opacity", "rotation"],
      ["meshKeyform.opacity", "art-mesh"],
      ["offscreenKeyform.opacity", "offscreen"]
    ]) {
      const values = s.f32(key);
      for (let k = 0; k < values.length; k++)
        c.check(
          Number.isFinite(values[k]),
          () => `${what} keyform ${k} opacity is ${values[k]} (not finite)`
        );
    }
  return {
    loadWarnings,
    version: v,
    bigEndian: sections.bigEndian,
    canvas: sections.canvas,
    parameters: {
      ids: pIds,
      min: pMin,
      max: pMax,
      defaults: s.f32("parameter.default"),
      repeat: toU8(s.i32("parameter.repeat")),
      type: pType,
      keyLists,
      decimals: Int32Array.from(pDecimals)
    },
    bindings: {
      parameter: bindingParameter,
      keys: bindingKeys,
      epsilon: Float32Array.from(
        bindingParameter,
        (p) => p >= 0 ? keyTolerance(pDecimals[p]) : KEY_EPSILON
      )
    },
    bands,
    parts: {
      ids: partIds,
      band: partBand,
      firstKeyform: partFirst,
      initialOpacity: partInitial,
      enabled: partEnabled,
      parent: partParent,
      offscreen: partOffscreen
    },
    deformers: {
      ids: dIds,
      band: dBand,
      enabled: dEnabled,
      part: dPart,
      parent: dParent,
      kind: dKindU8,
      kindIndex: dKindIndex
    },
    warps: {
      band: warpBand,
      firstKeyform: warpFirst,
      rows: warpRows,
      columns: warpCols,
      bilinear: warpBilinear
    },
    rotations: { band: rotBand, firstKeyform: rotFirst, baseAngle: s.f32("rotation.baseAngle") },
    meshes: {
      ids: mIds,
      band: mBand,
      firstKeyform: mFirst,
      enabled: toU8(s.i32("mesh.enabled")),
      part: mPart,
      deformer: mDeformer,
      texture: mTexture,
      flags: mFlags,
      blendMode,
      vertexCount: mVertexCount,
      uvs,
      triangles,
      masks
    },
    glues: {
      ids: gIds,
      band: gBand,
      firstKeyform: gFirst,
      meshA: gA,
      meshB: gB,
      firstInfo: gFirstInfo,
      vertexA,
      weightA,
      vertexB,
      weightB
    },
    groups: {
      objects: groupObjects,
      minDrawOrder: s.i32("group.minDrawOrder"),
      maxDrawOrder: s.i32("group.maxDrawOrder"),
      entryCount: s.i32("group.entryCount")
    },
    offscreens: {
      part: oPart,
      flags: s.u8("offscreen.flags"),
      blendMode: s.i32("offscreen.blendMode"),
      masks: oMasks
    },
    keyforms: {
      partDrawOrder: s.f32("partKeyform.drawOrder"),
      partOffscreenKeyform,
      warpOpacity: s.f32("warpKeyform.opacity"),
      warpFirstPosition,
      warpColors,
      rotationOpacity: s.f32("rotationKeyform.opacity"),
      rotationAngle: s.f32("rotationKeyform.angle"),
      rotationOriginX: s.f32("rotationKeyform.originX"),
      rotationOriginY: s.f32("rotationKeyform.originY"),
      rotationScale: s.f32("rotationKeyform.scale"),
      rotationMirrorX: rotMirrorX,
      rotationMirrorY: rotMirrorY,
      rotationColors: rotColors,
      meshOpacity: s.f32("meshKeyform.opacity"),
      meshDrawOrder: s.f32("meshKeyform.drawOrder"),
      meshFirstPosition,
      meshColors,
      offscreenOpacity: s.f32("offscreenKeyform.opacity"),
      offscreenColors,
      glueIntensity: s.f32("glueKeyform.intensity")
    },
    positions: s.f32("positions"),
    multiplyColors,
    screenColors,
    blendShapes: bs
  };
}

// src/core/eval/plan.ts
var plans = /* @__PURE__ */ new WeakMap();
var plansWithoutBlendShapes = /* @__PURE__ */ new WeakMap();
function planFor(model, blendShapes = true) {
  const cache = blendShapes ? plans : plansWithoutBlendShapes;
  let p = cache.get(model);
  if (!p) {
    p = buildPlan(model, blendShapes);
    cache.set(model, p);
  }
  return p;
}
function blendShapeLists(m, blendShapes) {
  if (blendShapes) return m.blendShapes;
  const none2 = (lists) => lists.map(() => []);
  const b = m.blendShapes;
  return {
    warp: none2(b.warp),
    mesh: none2(b.mesh),
    part: none2(b.part),
    rotation: none2(b.rotation),
    glue: none2(b.glue),
    offscreen: none2(b.offscreen)
  };
}
function fold(values) {
  const c = values.length ? values[0] : NaN;
  for (let i2 = 1; i2 < values.length; i2++) if (!Object.is(values[i2], c)) return null;
  if (!Number.isFinite(c)) return null;
  if (c === 0) return { constant: 0, foldActive: Infinity };
  const e = Math.log2(Math.abs(c));
  return { constant: c, foldActive: Number.isInteger(e) && e >= 0 ? 1 : 0 };
}
function allZero(values) {
  for (let i2 = 0; i2 < values.length; i2++) if (values[i2] !== 0) return false;
  return true;
}
function sameArrays(a, b) {
  return a.length === b.length && a.every((x2, i2) => Object.is(x2, b[i2]));
}
function sameProp(a, b) {
  return Object.is(a.constant, b.constant) && a.foldActive === b.foldActive && sameArrays(a.values, b.values) && a.blendSlots.length === b.blendSlots.length && a.blendSlots.every((x2, i2) => x2 === b.blendSlots[i2]) && a.blendValues.every((x2, i2) => sameArrays(x2, b.blendValues[i2]));
}
function shareEqualNeighbours(props) {
  for (let ch = 1; ch < props.length; ch++)
    if (sameProp(props[ch], props[ch - 1])) props[ch] = props[ch - 1];
  return props;
}
function finiteWeights(b) {
  for (const c of b.constraints)
    for (let i2 = 0; i2 < c.weights.length; i2++) if (!Number.isFinite(c.weights[i2])) return false;
  return true;
}
var ValueBuilder = class {
  constructor(m, bs = m.blendShapes) {
    this.m = m;
    this.bs = bs;
    this.v = m.version;
  }
  m;
  bs;
  v;
  keyformCount(band) {
    return this.m.bands[band].keyformCount;
  }
  /**
   * Scalar property from a per-keyform accessor. `withBlends` = blend shapes
   * apply to it; `drawOrder` = its interpolated value is folded whatever its
   * blend shapes (see the module comment). `blendAt` reads the blend-shape
   * keyforms when they are not in the same array as the normal ones
   * (offscreens: normal keyforms through the owner part's, blend-shape
   * keyforms straight from the offscreen keyforms).
   */
  scalar(band, first, list, withBlends, at4, drawOrder = false, blendAt = at4) {
    const n = this.keyformCount(band);
    const values = Float32Array.from({ length: n }, (_, o) => at4(first + o));
    const blend = withBlends ? list.map(
      (b) => Float32Array.from(
        { length: b.keys.length },
        (_, k) => k === b.baseKey ? 0 : blendAt(b.firstKeyform + k)
      )
    ) : [];
    const keep = blend.map((_, j) => j).filter((j) => !(allZero(blend[j]) && finiteWeights(list[j])));
    const folded = keep.length === 0 || drawOrder ? fold(values) : null;
    return {
      values,
      blendSlots: Int32Array.from(keep),
      blendValues: keep.map((j) => blend[j]),
      constant: folded ? folded.constant : NaN,
      foldActive: folded ? folded.foldActive : -1
    };
  }
  colorProps(band, first, list, withBlends, idx) {
    if (this.v < 4) return [];
    const m = this.m;
    const out = [];
    for (let ch = 0; ch < 3; ch++)
      out.push(
        this.scalar(
          band,
          first,
          list,
          withBlends,
          (k) => m.multiplyColors[idx.multiply[k] * 3 + ch]
        )
      );
    for (let ch = 0; ch < 3; ch++)
      out.push(
        this.scalar(band, first, list, withBlends, (k) => m.screenColors[idx.screen[k] * 3 + ch])
      );
    return shareEqualNeighbours(out);
  }
  /** Per normal keyform: 1 if its run of `length` floats holds no −0. */
  plainRuns(offsets, length2) {
    const positions = this.m.positions;
    return Uint8Array.from(offsets, (o) => {
      for (let i2 = o; i2 < o + length2; i2++)
        if (positions[i2] === 0 && 1 / positions[i2] < 0) return 0;
      return 1;
    });
  }
  /** Deformer i's values: warps' −0 flags, opacity, colors, rotation values, and the props list. */
  deformer(i2, positionOffsets, gridLength) {
    const m = this.m;
    const kf = m.keyforms;
    const d = m.deformers;
    const band = d.band[i2];
    const k = d.kindIndex[i2];
    const blend = this.v >= 5;
    let values;
    if (d.kind[i2] === WARP_KIND) {
      const first = m.warps.firstKeyform[k];
      const list = this.bs.warp[k];
      values = {
        plainRun: this.plainRuns(positionOffsets, gridLength),
        opacity: this.scalar(band, first, list, blend, (x2) => kf.warpOpacity[x2]),
        colors: this.colorProps(band, first, list, blend, kf.warpColors),
        angle: none(),
        originX: none(),
        originY: none(),
        scale: none()
      };
    } else {
      const first = m.rotations.firstKeyform[k];
      const list = this.bs.rotation[k];
      values = {
        plainRun: new Uint8Array(0),
        opacity: this.scalar(band, first, list, blend, (x2) => kf.rotationOpacity[x2]),
        colors: this.colorProps(band, first, list, blend, kf.rotationColors),
        angle: this.scalar(band, first, list, blend, (x2) => kf.rotationAngle[x2]),
        originX: this.scalar(band, first, list, blend, (x2) => kf.rotationOriginX[x2]),
        originY: this.scalar(band, first, list, blend, (x2) => kf.rotationOriginY[x2]),
        scale: this.scalar(band, first, list, blend, (x2) => kf.rotationScale[x2])
      };
    }
    const rotation = d.kind[i2] === WARP_KIND ? [] : [values.angle, values.originX, values.originY, values.scale];
    return {
      ...values,
      props: shareEqualNeighbours([values.opacity, ...sixColors(values.colors), ...rotation])
    };
  }
  /** Mesh i's values: −0 flags, opacity, draw order, colors, and the props list. */
  mesh(i2, positionOffsets) {
    const m = this.m;
    const kf = m.keyforms;
    const me = m.meshes;
    const band = me.band[i2];
    const first = me.firstKeyform[i2];
    const list = this.bs.mesh[i2];
    const full = this.v >= 5;
    const opacity = this.scalar(band, first, list, full, (x2) => kf.meshOpacity[x2]);
    const drawOrder = this.scalar(band, first, list, full, (x2) => kf.meshDrawOrder[x2], true);
    const colors = this.colorProps(band, first, list, full, kf.meshColors);
    return {
      plainRun: this.plainRuns(positionOffsets, 2 * me.vertexCount[i2]),
      opacity,
      drawOrder,
      colors,
      props: shareEqualNeighbours([opacity, drawOrder, ...sixColors(colors)])
    };
  }
  /** Part p's draw order. */
  part(p) {
    const m = this.m;
    return this.scalar(
      m.parts.band[p],
      m.parts.firstKeyform[p],
      this.bs.part[p],
      this.v >= 5,
      (x2) => m.keyforms.partDrawOrder[x2],
      true
    );
  }
  /** Glue g's intensity. */
  glue(g) {
    const m = this.m;
    return this.scalar(
      m.glues.band[g],
      m.glues.firstKeyform[g],
      this.bs.glue[g],
      this.v >= 5,
      (x2) => m.keyforms.glueIntensity[x2]
    );
  }
  /**
   * Offscreen o's values. Its normal keyforms are its owner part's, through
   * the part→offscreen keyform map (−1: all zero); its blend shapes are its own, from the
   * offscreen targets (count 37), never the owner part's. Their
   * keyforms are offscreen keyforms, read directly. The colors of those
   * blend-shape keyforms use each keyform's own multiply and screen indices,
   * as for other targets' blend-shape keyforms. Whether the runtime reads
   * these or the first index + position is not settled: the files studied
   * do not tell them apart.
   */
  offscreen(o) {
    const m = this.m;
    const kf = m.keyforms;
    const owner = m.offscreens.part[o];
    const band = m.parts.band[owner];
    const first = m.parts.firstKeyform[owner];
    const list = this.bs.offscreen[o];
    const map = kf.partOffscreenKeyform;
    const idx = kf.offscreenColors;
    const prop = (read) => this.scalar(band, first, list, true, (k) => map[k] >= 0 ? read(map[k]) : 0, false, read);
    const colors = [];
    for (let ch = 0; ch < 3; ch++)
      colors.push(prop((ok) => m.multiplyColors[idx.multiply[ok] * 3 + ch]));
    for (let ch = 0; ch < 3; ch++)
      colors.push(prop((ok) => m.screenColors[idx.screen[ok] * 3 + ch]));
    const opacity = prop((ok) => kf.offscreenOpacity[ok]);
    return { opacity, colors, props: shareEqualNeighbours([opacity, ...colors]) };
  }
};
function fixed(value) {
  return {
    values: Float32Array.of(value),
    blendSlots: new Int32Array(0),
    blendValues: [],
    constant: value,
    foldActive: Infinity
  };
}
var none = () => fixed(0);
var sixColors = (colors) => colors.length ? colors : [fixed(1), fixed(1), fixed(1), fixed(0), fixed(0), fixed(0)];
function refreshPlan(model, kind2, index) {
  const on = plans.get(model);
  const off = plansWithoutBlendShapes.get(model);
  if (on) refreshObject(on, new ValueBuilder(model), kind2, index);
  if (off) refreshObject(off, new ValueBuilder(model, blendShapeLists(model, false)), kind2, index);
}
function refreshObject(plan, b, kind2, index) {
  switch (kind2) {
    case "deformer": {
      const d = plan.deformers[index];
      Object.assign(d, b.deformer(index, d.positionOffsets, d.gridLength));
      break;
    }
    case "mesh": {
      const me = plan.meshes[index];
      Object.assign(me, b.mesh(index, me.positionOffsets));
      break;
    }
    case "part": {
      const p = plan.parts[index];
      p.drawOrder = b.part(index);
      p.props = [p.drawOrder];
      break;
    }
    case "glue": {
      const g = plan.glues[index];
      g.intensity = b.glue(index);
      g.props = [g.intensity];
      break;
    }
    case "offscreen":
      Object.assign(plan.offscreens[index], b.offscreen(index));
      break;
  }
}
function buildPlan(m, blendShapes) {
  const kf = m.keyforms;
  const bs = blendShapeLists(m, blendShapes);
  const values = new ValueBuilder(m, bs);
  const blends = [];
  const blendIndex = /* @__PURE__ */ new Map();
  const register = (list, firstPosition) => Int32Array.from(list, (b) => {
    let i2 = blendIndex.get(b);
    if (i2 === void 0) {
      i2 = blends.length;
      const offsets = firstPosition ? Int32Array.from(
        { length: b.keys.length },
        (_, k) => k === b.baseKey ? -1 : firstPosition[b.firstKeyform + k]
      ) : new Int32Array(0);
      blends.push({ binding: b, positionOffsets: offsets });
      blendIndex.set(b, i2);
    }
    return i2;
  });
  const keyformCount = (band) => m.bands[band].keyformCount;
  const deformers = [];
  const d = m.deformers;
  for (let i2 = 0; i2 < d.ids.length; i2++) {
    const band = d.band[i2];
    const k = d.kindIndex[i2];
    if (d.kind[i2] === WARP_KIND) {
      const first = m.warps.firstKeyform[k];
      const R = m.warps.rows[k];
      const C = m.warps.columns[k];
      const positionOffsets = Int32Array.from(
        { length: keyformCount(band) },
        (_, o) => kf.warpFirstPosition[first + o]
      );
      const gridLength = 2 * (R + 1) * (C + 1);
      deformers.push({
        kind: 0,
        band,
        blends: register(bs.warp[k], kf.warpFirstPosition),
        positionOffsets,
        gridLength,
        rows: R,
        columns: C,
        bilinear: m.warps.bilinear[k] === 1,
        baseAngle: 0,
        firstKeyform: first,
        ...values.deformer(i2, positionOffsets, gridLength)
      });
    } else {
      const first = m.rotations.firstKeyform[k];
      const positionOffsets = new Int32Array(0);
      deformers.push({
        kind: 1,
        band,
        blends: register(bs.rotation[k], null),
        positionOffsets,
        gridLength: 0,
        rows: 0,
        columns: 0,
        bilinear: false,
        baseAngle: m.rotations.baseAngle[k],
        firstKeyform: first,
        ...values.deformer(i2, positionOffsets, 0)
      });
    }
  }
  const meshes = [];
  const me = m.meshes;
  for (let i2 = 0; i2 < me.ids.length; i2++) {
    const band = me.band[i2];
    const first = me.firstKeyform[i2];
    const positionOffsets = Int32Array.from(
      { length: keyformCount(band) },
      (_, o) => kf.meshFirstPosition[first + o]
    );
    meshes.push({
      band,
      blends: register(bs.mesh[i2], kf.meshFirstPosition),
      positionOffsets,
      ...values.mesh(i2, positionOffsets)
    });
  }
  const parts = m.parts.ids.map((_, p) => {
    const drawOrder = values.part(p);
    return {
      band: m.parts.band[p],
      blends: register(bs.part[p], null),
      drawOrder,
      props: [drawOrder]
    };
  });
  const glues = m.glues.ids.map((_, g) => {
    const intensity = values.glue(g);
    return {
      band: m.glues.band[g],
      blends: register(bs.glue[g], null),
      intensity,
      props: [intensity]
    };
  });
  const offscreens = Array.from(m.offscreens.part, (owner, o) => {
    const chain = [];
    for (let p = m.parts.parent[owner]; p >= 0; p = m.parts.parent[p]) {
      if (m.parts.offscreen[p] >= 0) break;
      chain.push(p);
    }
    return {
      owner,
      band: m.parts.band[owner],
      blends: register(bs.offscreen[o], null),
      partChain: Int32Array.from(chain),
      ...values.offscreen(o)
    };
  });
  const glueMeshes = /* @__PURE__ */ new Set();
  for (let g = 0; g < m.glues.ids.length; g++) {
    glueMeshes.add(m.glues.meshA[g]);
    glueMeshes.add(m.glues.meshB[g]);
  }
  return {
    blends,
    deformers,
    meshes,
    parts,
    glues,
    offscreens,
    maxBandBindings: m.bands.reduce((a, b) => Math.max(a, b.bindings.length), 0),
    glueMeshes: Int32Array.from([...glueMeshes].sort((a, b) => a - b))
  };
}

// src/core/eval/warp-map.ts
function warpAffineSetup(p, g, R, C, coef) {
  const ib = g + 2 * C;
  const ic = g + 2 * (R * (C + 1));
  const id = g + 2 * (R * (C + 1) + C);
  for (let k = 0; k < 2; k++) {
    const a = p[g + k];
    const b = p[ib + k];
    const c = p[ic + k];
    const d = p[id + k];
    const D1 = fr(d - a);
    const D2 = fr(b - c);
    coef[2 + k] = fr(fr(D1 + D2) * 0.5);
    coef[4 + k] = fr(fr(D1 - D2) * 0.5);
    const m = fr(fr(fr(fr(a + b) + c) + d) * 0.25);
    coef[k] = fr(m - fr(D1 * 0.5));
  }
}
function affineAt(coef, U, V, out, o) {
  out[o] = fr(fr(coef[0] + fr(U * coef[2])) + fr(V * coef[4]));
  out[o + 1] = fr(fr(coef[1] + fr(U * coef[3])) + fr(V * coef[5]));
}
var ownCoef = new Float32Array(6);
var corner = new Float32Array(8);
function setCorner(p, g, C, coef, slot, gc, gr, U, V) {
  if (gc >= 0 && gr >= 0) {
    const i2 = g + 2 * (gr * (C + 1) + gc);
    corner[slot] = p[i2];
    corner[slot + 1] = p[i2 + 1];
  } else {
    affineAt(coef, U, V, corner, slot);
  }
}
var axisOut = { t0: 0, t1: 0, g0: 0, g1: 0, x: 0 };
function bandAxis(t, n) {
  const a = axisOut;
  if (t <= 0) {
    a.t0 = -2;
    a.t1 = 0;
    a.g0 = -1;
    a.g1 = 0;
    a.x = fr(fr(t - a.t0) / fr(a.t1 - a.t0));
  } else if (t >= 1) {
    a.t0 = 1;
    a.t1 = 3;
    a.g0 = n;
    a.g1 = -1;
    a.x = fr(fr(t - a.t0) / fr(a.t1 - a.t0));
  } else {
    const T = fr(t * n);
    const k = Math.min(Math.floor(T), n - 1);
    a.t0 = fr(k / n);
    a.t1 = fr((k + 1) / n);
    a.g0 = k;
    a.g1 = k + 1;
    a.x = fr(T - k);
  }
}
function warpOutside(p, g, R, C, u, v, out, o, coef) {
  if (!coef) {
    warpAffineSetup(p, g, R, C, ownCoef);
    coef = ownCoef;
  }
  if (u <= -2 || u >= 3 || v <= -2 || v >= 3) {
    affineAt(coef, u, v, out, o);
    return;
  }
  bandAxis(u, C);
  const u0 = axisOut.t0;
  const u1 = axisOut.t1;
  const gc0 = axisOut.g0;
  const gc1 = axisOut.g1;
  const x2 = axisOut.x;
  bandAxis(v, R);
  const v0 = axisOut.t0;
  const v1 = axisOut.t1;
  const gr0 = axisOut.g0;
  const gr1 = axisOut.g1;
  const y = axisOut.x;
  setCorner(p, g, C, coef, 0, gc0, gr0, u0, v0);
  setCorner(p, g, C, coef, 2, gc1, gr0, u1, v0);
  setCorner(p, g, C, coef, 4, gc0, gr1, u0, v1);
  setCorner(p, g, C, coef, 6, gc1, gr1, u1, v1);
  if (fr(x2 + y) <= 1) {
    for (let k = 0; k < 2; k++) {
      const q00 = corner[k];
      out[o + k] = fr(
        fr(q00 + fr(x2 * fr(corner[2 + k] - q00))) + fr(y * fr(corner[4 + k] - q00))
      );
    }
  } else {
    const gx = fr(1 - x2);
    const gy = fr(1 - y);
    for (let k = 0; k < 2; k++) {
      const q11 = corner[6 + k];
      out[o + k] = fr(
        fr(q11 + fr(gx * fr(corner[4 + k] - q11))) + fr(gy * fr(corner[2 + k] - q11))
      );
    }
  }
}
var single = new Float32Array(2);

// src/core/wasm/assembler.ts
var i322 = 127;
var f322 = 125;
var v128 = 123;
function uleb(n) {
  const out = [];
  let v = n >>> 0;
  do {
    let b = v & 127;
    v >>>= 7;
    if (v) b |= 128;
    out.push(b);
  } while (v);
  return out;
}
function sleb(n) {
  const out = [];
  let v = n | 0;
  for (; ; ) {
    const b = v & 127;
    v >>= 7;
    if (v === 0 && (b & 64) === 0 || v === -1 && (b & 64) !== 0) {
      out.push(b);
      return out;
    }
    out.push(b | 128);
  }
}
function f32Bytes(x2) {
  return Array.from(new Uint8Array(new Float32Array([x2]).buffer));
}
var mem = (align, offset) => [...uleb(align), ...uleb(offset)];
var simd = (code, ...rest) => [253, ...uleb(code), ...rest];
var op = {
  block: [2, 64],
  loop: [3, 64],
  if: [4, 64],
  else: 5,
  end: 11,
  br: (depth) => [12, ...uleb(depth)],
  brIf: (depth) => [13, ...uleb(depth)],
  call: (fn) => [16, ...uleb(fn)],
  return: 15,
  select: 27,
  get: (local) => [32, ...uleb(local)],
  set: (local) => [33, ...uleb(local)],
  tee: (local) => [34, ...uleb(local)],
  i32Load: (offset = 0) => [40, ...mem(2, offset)],
  f32Load: (offset = 0) => [42, ...mem(2, offset)],
  i32Store: (offset = 0) => [54, ...mem(2, offset)],
  f32Store: (offset = 0) => [56, ...mem(2, offset)],
  i32Const: (v) => [65, ...sleb(v)],
  f32Const: (v) => [67, ...f32Bytes(v)],
  i32Eqz: 69,
  i32LtS: 72,
  i32GtS: 74,
  i32GeS: 78,
  f32Lt: 93,
  f32Gt: 94,
  f32Le: 95,
  f32Ge: 96,
  i32Add: 106,
  i32Sub: 107,
  i32Mul: 108,
  i32And: 113,
  i32Or: 114,
  i32Shl: 116,
  f32Neg: 140,
  f32Add: 146,
  f32Sub: 147,
  f32Mul: 148,
  f32Div: 149,
  i32TruncF32S: 168,
  f32ConvertI32S: 178,
  i32TruncSatF32S: [252, ...uleb(0)],
  memoryCopy: [252, ...uleb(10), 0, 0],
  v128Load: (offset = 0) => simd(0, ...mem(2, offset)),
  v128Store: (offset = 0) => simd(11, ...mem(2, offset)),
  v128Const: (bytes) => simd(12, ...bytes),
  v128Load64Zero: (offset = 0) => simd(93, ...mem(2, offset)),
  v128Load64Lane: (offset, lane) => simd(87, ...mem(2, offset), lane),
  i8x16Shuffle: (lanes2) => simd(13, ...lanes2),
  i32x4Splat: simd(17),
  i32x4ExtractLane: (lane) => simd(27, lane),
  f32x4Lt: simd(67),
  f32x4Le: simd(69),
  f32x4Ge: simd(70),
  v128And: simd(78),
  v128Xor: simd(81),
  v128Bitselect: simd(82),
  i32x4AllTrue: simd(163),
  i32x4Bitmask: simd(164),
  f32x4ExtractLane: (lane) => simd(31, lane),
  i32x4MaxS: simd(184),
  i32x4Shl: simd(171),
  i32x4Add: simd(174),
  i32x4Mul: simd(181),
  i32x4MinS: simd(182),
  i32x4TruncSatF32x4S: simd(248),
  f32x4ConvertI32x4S: simd(250),
  f32x4Splat: simd(19),
  f32x4Add: simd(228),
  f32x4Sub: simd(229),
  f32x4Mul: simd(230)
};
function flatten(code, out) {
  if (typeof code === "number") out.push(code);
  else for (const c of code) flatten(c, out);
  return out;
}
var vec = (items) => [...uleb(items.length), ...items.flat()];
var name = (s) => {
  const bytes = Array.from(s, (ch) => ch.charCodeAt(0) & 127);
  return [...uleb(bytes.length), ...bytes];
};
var section = (id, body) => [id, ...uleb(body.length), ...body];
function localGroups(locals) {
  const groups = [];
  let i2 = 0;
  while (i2 < locals.length) {
    let j = i2;
    while (j < locals.length && locals[j] === locals[i2]) j++;
    groups.push([...uleb(j - i2), locals[i2]]);
    i2 = j;
  }
  return groups;
}
function assembleModule(functions, minPages = 1) {
  const types = functions.map((f) => [
    96,
    ...vec(f.params.map((p) => [p])),
    ...vec(f.results.map((r) => [r]))
  ]);
  const memoryImport = [...name("env"), ...name("memory"), 2, 0, ...uleb(minPages)];
  const bodies = functions.map((f) => {
    const body = [...vec(localGroups(f.locals)), ...flatten(f.body, []), op.end];
    return [...uleb(body.length), ...body];
  });
  return new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    ...section(1, vec(types)),
    ...section(2, vec([memoryImport])),
    ...section(3, vec(functions.map((_, i2) => uleb(i2)))),
    ...section(7, vec(functions.map((f, i2) => [...name(f.name), 0, ...uleb(i2)]))),
    ...section(10, vec(bodies))
  ]);
}
function wasmFunction(fnName, params, results, locals, body) {
  const index = {};
  let n = 0;
  for (const k of Object.keys(params)) index[k] = n++;
  for (const k of Object.keys(locals)) index[k] = n++;
  return {
    name: fnName,
    params: Object.values(params),
    results,
    locals: Object.values(locals),
    body: body(index)
  };
}

// src/core/eval/kernels.ts
var affineCoef = new Float32Array(6);
function jsKernels(floats) {
  const h = new Float32Array(floats);
  return {
    kind: "js",
    heap: h,
    copy(dst, src, n) {
      h.copyWithin(dst, src, src + n);
    },
    sum1(dst, a, w, n) {
      for (let k = 0; k < n; k++) h[dst + k] = fr(0 + fr(w * h[a + k]));
    },
    sum2(dst, a, b, wa, wb, n) {
      for (let k = 0; k < n; k++) h[dst + k] = fr(fr(0 + fr(wa * h[a + k])) + fr(wb * h[b + k]));
    },
    sum4(dst, a, b, c, d, w0, w1, w2, w3, n, acc) {
      for (let k = 0; k < n; k++) {
        let r = acc ? h[dst + k] : 0;
        r = fr(r + fr(w0 * h[a + k]));
        r = fr(r + fr(w1 * h[b + k]));
        r = fr(r + fr(w2 * h[c + k]));
        h[dst + k] = fr(r + fr(w3 * h[d + k]));
      }
    },
    blend0(dst, a, w, n) {
      for (let k = 0; k < n; k++) h[dst + k] = fr(h[dst + k] + fr(w * h[a + k]));
    },
    blend1(dst, a, b, wa, wb, w, n) {
      for (let k = 0; k < n; k++) {
        const s = fr(fr(wa * h[a + k]) + fr(wb * h[b + k]));
        h[dst + k] = fr(h[dst + k] + fr(w * s));
      }
    },
    warp(grid, R, C, bilinear, src, dst, count) {
      const stride = 2 * (C + 1);
      let coefReady = false;
      for (let n = 0; n < count; n++) {
        const u = h[src + 2 * n];
        const v = h[src + 2 * n + 1];
        const o = dst + 2 * n;
        if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) {
          if (!coefReady) {
            warpAffineSetup(h, grid, R, C, affineCoef);
            coefReady = true;
          }
          warpOutside(h, grid, R, C, u, v, h, o, affineCoef);
          continue;
        }
        const X = fr(u * C);
        const Y = fr(v * R);
        let c = Math.floor(X);
        if (c > C - 1) c = C - 1;
        let r = Math.floor(Y);
        if (r > R - 1) r = R - 1;
        const x2 = fr(X - c);
        const y = fr(Y - r);
        const gx = fr(1 - x2);
        const gy = fr(1 - y);
        const i00 = grid + r * stride + 2 * c;
        const i10 = i00 + 2;
        const i01 = i00 + stride;
        const i11 = i01 + 2;
        if (bilinear) {
          h[o] = fr(
            fr(
              fr(fr(gy * fr(gx * h[i00])) + fr(gy * fr(x2 * h[i10]))) + fr(y * fr(gx * h[i01]))
            ) + fr(y * fr(x2 * h[i11]))
          );
          h[o + 1] = fr(
            fr(
              fr(fr(gy * fr(gx * h[i00 + 1])) + fr(gy * fr(x2 * h[i10 + 1]))) + fr(y * fr(gx * h[i01 + 1]))
            ) + fr(y * fr(x2 * h[i11 + 1]))
          );
        } else if (fr(x2 + y) <= 1) {
          const w = fr(gx - y);
          h[o] = fr(fr(fr(w * h[i00]) + fr(x2 * h[i10])) + fr(y * h[i01]));
          h[o + 1] = fr(fr(fr(w * h[i00 + 1]) + fr(x2 * h[i10 + 1])) + fr(y * h[i01 + 1]));
        } else {
          const e = fr(y - gx);
          h[o] = fr(fr(fr(e * h[i11]) + fr(gx * h[i01])) + fr(gy * h[i10]));
          h[o + 1] = fr(fr(fr(e * h[i11 + 1]) + fr(gx * h[i01 + 1])) + fr(gy * h[i10 + 1]));
        }
      }
    },
    rotate(src, dst, count, c, sn, s, ox, oy, mirrorX, mirrorY) {
      for (let n = 0; n < count; n++) {
        const x2 = mirrorX ? -h[src + 2 * n] : h[src + 2 * n];
        const y = mirrorY ? -h[src + 2 * n + 1] : h[src + 2 * n + 1];
        const rx = fr(fr(c * x2) - fr(sn * y));
        const ry = fr(fr(sn * x2) + fr(c * y));
        h[dst + 2 * n] = fr(ox + fr(s * rx));
        h[dst + 2 * n + 1] = fr(oy + fr(s * ry));
      }
    },
    flipY(dst, src, n) {
      for (let k = 0; k < n; k += 2) {
        h[dst + k] = h[src + k];
        h[dst + k + 1] = -h[src + k + 1];
      }
    }
  };
}
var FUNCTIONS = [
  "affineSetup",
  "affine",
  "corner",
  "outside",
  "warpOne",
  "copy",
  "sum1",
  "sum2",
  "sum4",
  "blend0",
  "blend1",
  "warp",
  "rotate",
  "flipY"
];
var call = (name2) => op.call(FUNCTIONS.indexOf(name2));
var toBytes = (...locals) => locals.map((l) => [op.get(l), op.i32Const(2), op.i32Shl, op.set(l)]);
var advance = (locals, bytes) => locals.map((l) => [op.get(l), op.i32Const(bytes), op.i32Add, op.set(l)]);
var countedLoop = (n, step, body) => [
  op.block,
  op.loop,
  [op.get(n), op.i32Const(step), op.i32LtS, op.brIf(1)],
  body,
  [op.get(n), op.i32Const(step), op.i32Sub, op.set(n)],
  op.br(0),
  op.end,
  op.end
];
var load = (simd2) => simd2 ? op.v128Load() : op.f32Load();
var store = (simd2) => simd2 ? op.v128Store() : op.f32Store();
var add = (simd2) => simd2 ? op.f32x4Add : op.f32Add;
var zero = (simd2, vzero) => simd2 ? op.get(vzero) : op.f32Const(0);
var term = (w, addr, simd2) => [
  op.get(w),
  op.get(addr),
  load(simd2),
  simd2 ? op.f32x4Mul : op.f32Mul
];
var pairLanes = (a, b) => [a, a, b, b].flatMap((l) => [4 * l, 4 * l + 1, 4 * l + 2, 4 * l + 3]);
var lanes = (...ls) => ls.flatMap((l) => [4 * l, 4 * l + 1, 4 * l + 2, 4 * l + 3]);
var insideTest = (u, v) => [
  [op.get(u), op.f32Const(0), op.f32Ge, op.get(u), op.f32Const(1), op.f32Lt, op.i32And],
  [op.get(v), op.f32Const(0), op.f32Ge, op.i32And, op.get(v), op.f32Const(1), op.f32Lt, op.i32And]
];
var gridPoint = (grid, C, column, row) => [
  op.get(grid),
  row,
  op.get(C),
  op.i32Const(1),
  op.i32Add,
  op.i32Mul,
  column,
  op.i32Add,
  op.i32Const(3),
  op.i32Shl,
  op.i32Add
];
var kernelFunctions = (wide) => [
  // affineSetup(grid, R, C, coef): the affine map's coefficients (§1c.8) from the
  // grid's outer corners a = p(0, 0), b = p(C, 0), c = p(0, R), d = p(C, R): with D1 = d − a and
  // D2 = b − c, A0 = (((a + b) + c) + d)·0.25 − D1·0.5, Bu = (D1 + D2)·0.5, Bv = (D1 − D2)·0.5,
  // for x and y at coef bytes 0/4, 8/12, 16/20.
  wasmFunction(
    "affineSetup",
    { grid: i322, R: i322, C: i322, coef: i322 },
    [],
    { ib: i322, ic: i322, id: i322, a: f322, b: f322, c: f322, d: f322, D1: f322, D2: f322 },
    (v) => {
      const coord = (k) => [
        [op.get(v.grid), op.f32Load(k), op.set(v.a), op.get(v.ib), op.f32Load(k), op.set(v.b)],
        [op.get(v.ic), op.f32Load(k), op.set(v.c), op.get(v.id), op.f32Load(k), op.set(v.d)],
        [op.get(v.d), op.get(v.a), op.f32Sub, op.set(v.D1)],
        [op.get(v.b), op.get(v.c), op.f32Sub, op.set(v.D2)],
        // A0 = (((a + b) + c) + d)·0.25 − D1·0.5
        [op.get(v.coef), op.get(v.a), op.get(v.b), op.f32Add, op.get(v.c), op.f32Add],
        [op.get(v.d), op.f32Add, op.f32Const(0.25), op.f32Mul],
        [op.get(v.D1), op.f32Const(0.5), op.f32Mul, op.f32Sub, op.f32Store(k)],
        // Bu = (D1 + D2)·0.5, Bv = (D1 − D2)·0.5
        [op.get(v.coef), op.get(v.D1), op.get(v.D2), op.f32Add, op.f32Const(0.5), op.f32Mul],
        op.f32Store(8 + k),
        [op.get(v.coef), op.get(v.D1), op.get(v.D2), op.f32Sub, op.f32Const(0.5), op.f32Mul],
        op.f32Store(16 + k)
      ];
      return [
        [gridPoint(v.grid, v.C, op.get(v.C), op.i32Const(0)), op.set(v.ib)],
        [gridPoint(v.grid, v.C, op.i32Const(0), op.get(v.R)), op.set(v.ic)],
        [gridPoint(v.grid, v.C, op.get(v.C), op.get(v.R)), op.set(v.id)],
        coord(0),
        coord(4)
      ];
    }
  ),
  // affine(u, v, coef, out): Aff(u, v) = (A0 + u·Bu) + v·Bv per coordinate.
  wasmFunction(
    "affine",
    { u: f322, v: f322, coef: i322, out: i322 },
    [],
    {},
    (v) => [0, 4].map((k) => [
      [op.get(v.out), op.get(v.coef), op.f32Load(k)],
      [op.get(v.u), op.get(v.coef), op.f32Load(8 + k), op.f32Mul],
      op.f32Add,
      [op.get(v.v), op.get(v.coef), op.f32Load(16 + k), op.f32Mul],
      op.f32Add,
      op.f32Store(k)
    ])
  ),
  // corner(grid, C, gc, gr, cu, cv, coef, out): grid point (gc, gr), or A(cu, cv) if either
  // index is −1.
  wasmFunction(
    "corner",
    { grid: i322, C: i322, gc: i322, gr: i322, cu: f322, cv: f322, coef: i322, out: i322 },
    [],
    { a: i322 },
    (v) => [
      [op.get(v.gc), op.i32Const(0), op.i32GeS, op.get(v.gr), op.i32Const(0), op.i32GeS, op.i32And],
      op.if,
      [gridPoint(v.grid, v.C, op.get(v.gc), op.get(v.gr)), op.set(v.a)],
      [op.get(v.out), op.get(v.a), op.f32Load(0), op.f32Store(0)],
      [op.get(v.out), op.get(v.a), op.f32Load(4), op.f32Store(4)],
      op.else,
      [op.get(v.cu), op.get(v.cv), op.get(v.coef), op.get(v.out), call("affine")],
      op.end
    ]
  ),
  // outside(grid, R, C, u, v, dst, scratch): a point outside [0, 1)², in the far region or the
  // near band. scratch: corners P00, P10, P01, P11 at bytes 0–31, affine coefficients at 32–55.
  wasmFunction(
    "outside",
    { grid: i322, R: i322, C: i322, u: f322, v: f322, dst: i322, scratch: i322 },
    [],
    {
      gc0: i322,
      gc1: i322,
      gr0: i322,
      gr1: i322,
      c: i322,
      coef: i322,
      u0: f322,
      u1: f322,
      v0: f322,
      v1: f322,
      fx: f322,
      fy: f322,
      gx: f322,
      gy: f322,
      p: f322,
      T: f322
    },
    (v) => {
      const axis2 = (x2, n, x0, x1, g0, g1, frac) => [
        [op.get(x2), op.f32Const(0), op.f32Le],
        op.if,
        [op.f32Const(-2), op.set(x0), op.f32Const(0), op.set(x1)],
        [op.i32Const(-1), op.set(g0), op.i32Const(0), op.set(g1)],
        [op.get(x2), op.get(x0), op.f32Sub, op.get(x1), op.get(x0), op.f32Sub, op.f32Div],
        op.set(frac),
        op.else,
        [op.get(x2), op.f32Const(1), op.f32Ge],
        op.if,
        [op.f32Const(1), op.set(x0), op.f32Const(3), op.set(x1)],
        [op.get(n), op.set(g0), op.i32Const(-1), op.set(g1)],
        [op.get(x2), op.get(x0), op.f32Sub, op.get(x1), op.get(x0), op.f32Sub, op.f32Div],
        op.set(frac),
        op.else,
        // T = x·n; c = min(floor(T), n − 1); x0 = c / n; x1 = (c + 1) / n; frac = T − c
        [op.get(n), op.i32Const(1), op.i32Sub],
        [op.get(x2), op.get(n), op.f32ConvertI32S, op.f32Mul, op.tee(v.T)],
        [op.i32TruncSatF32S, op.tee(v.c)],
        [op.get(v.c), op.get(n), op.i32Const(1), op.i32Sub, op.i32GtS, op.select, op.set(v.c)],
        [op.get(v.c), op.f32ConvertI32S, op.get(n), op.f32ConvertI32S, op.f32Div, op.set(x0)],
        [op.get(v.c), op.i32Const(1), op.i32Add, op.f32ConvertI32S],
        [op.get(n), op.f32ConvertI32S, op.f32Div, op.set(x1)],
        [op.get(v.c), op.set(g0), op.get(v.c), op.i32Const(1), op.i32Add, op.set(g1)],
        [op.get(v.T), op.get(v.c), op.f32ConvertI32S, op.f32Sub, op.set(frac)],
        op.end,
        op.end
      ];
      const corner2 = (gc, gr, cu, cv, slot) => [
        [
          op.get(v.grid),
          op.get(v.C),
          op.get(gc),
          op.get(gr),
          op.get(cu),
          op.get(cv),
          op.get(v.coef)
        ],
        [op.get(v.scratch), op.i32Const(slot), op.i32Add, call("corner")]
      ];
      const tri = (k, base, wa, pa, wb, pb) => [
        op.get(v.dst),
        [op.get(v.scratch), op.f32Load(base + k), op.tee(v.p)],
        [op.get(wa), op.get(v.scratch), op.f32Load(pa + k), op.get(v.p), op.f32Sub, op.f32Mul],
        op.f32Add,
        [op.get(wb), op.get(v.scratch), op.f32Load(pb + k), op.get(v.p), op.f32Sub, op.f32Mul],
        op.f32Add,
        op.f32Store(k)
      ];
      return [
        [op.get(v.scratch), op.i32Const(32), op.i32Add, op.set(v.coef)],
        // Far region (u ≤ −2, u ≥ 3, v ≤ −2 or v ≥ 3): the affine map itself.
        [op.get(v.u), op.f32Const(-2), op.f32Le, op.get(v.u), op.f32Const(3), op.f32Ge, op.i32Or],
        [op.get(v.v), op.f32Const(-2), op.f32Le, op.i32Or, op.get(v.v), op.f32Const(3), op.f32Ge],
        op.i32Or,
        op.if,
        [op.get(v.u), op.get(v.v), op.get(v.coef), op.get(v.dst), call("affine")],
        op.return,
        op.end,
        axis2(v.u, v.C, v.u0, v.u1, v.gc0, v.gc1, v.fx),
        axis2(v.v, v.R, v.v0, v.v1, v.gr0, v.gr1, v.fy),
        corner2(v.gc0, v.gr0, v.u0, v.v0, 0),
        corner2(v.gc1, v.gr0, v.u1, v.v0, 8),
        corner2(v.gc0, v.gr1, v.u0, v.v1, 16),
        corner2(v.gc1, v.gr1, v.u1, v.v1, 24),
        [op.get(v.fx), op.get(v.fy), op.f32Add, op.f32Const(1), op.f32Le],
        op.if,
        tri(0, 0, v.fx, 8, v.fy, 16),
        tri(4, 0, v.fx, 8, v.fy, 16),
        op.else,
        [op.f32Const(1), op.get(v.fx), op.f32Sub, op.set(v.gx)],
        [op.f32Const(1), op.get(v.fy), op.f32Sub, op.set(v.gy)],
        tri(0, 24, v.gx, 16, v.gy, 8),
        tri(4, 24, v.gx, 16, v.gy, 8),
        op.end
      ];
    }
  ),
  // warpOne(grid, R, C, bilinear, src, dst, scratch): one point, any region (byte addresses).
  wasmFunction(
    "warpOne",
    { grid: i322, R: i322, C: i322, bilinear: i322, src: i322, dst: i322, scratch: i322 },
    [],
    {
      c: i322,
      r: i322,
      i00: i322,
      i01: i322,
      tri: i322,
      base: i322,
      pa: i322,
      pb: i322,
      u: f322,
      v: f322,
      X: f322,
      Y: f322,
      fx: f322,
      fy: f322,
      gx: f322,
      gy: f322,
      w0: f322,
      wa: f322,
      wb: f322
    },
    (v) => {
      const cell = (value, cells, scaled, local) => [
        [op.get(value), op.get(cells), op.f32ConvertI32S, op.f32Mul, op.set(scaled)],
        [
          op.get(cells),
          op.i32Const(1),
          op.i32Sub,
          op.get(scaled),
          op.i32TruncSatF32S,
          op.tee(local)
        ],
        [
          op.get(local),
          op.get(cells),
          op.i32Const(1),
          op.i32Sub,
          op.i32GtS,
          op.select,
          op.set(local)
        ]
      ];
      const quadTerm = (row, column, at4, offset) => [
        op.get(row),
        [op.get(column), op.get(at4), op.f32Load(offset), op.f32Mul],
        op.f32Mul
      ];
      const bilinearCoord = (k) => [
        op.get(v.dst),
        quadTerm(v.gy, v.gx, v.i00, k),
        quadTerm(v.gy, v.fx, v.i00, 8 + k),
        op.f32Add,
        quadTerm(v.fy, v.gx, v.i01, k),
        op.f32Add,
        quadTerm(v.fy, v.fx, v.i01, 8 + k),
        op.f32Add,
        op.f32Store(k)
      ];
      const triangleCoord = (k) => [
        op.get(v.dst),
        [op.get(v.w0), op.get(v.base), op.f32Load(k), op.f32Mul],
        [op.get(v.wa), op.get(v.pa), op.f32Load(k), op.f32Mul, op.f32Add],
        [op.get(v.wb), op.get(v.pb), op.f32Load(k), op.f32Mul, op.f32Add],
        op.f32Store(k)
      ];
      const pick = (a, b, local) => [
        a,
        b,
        op.get(v.tri),
        op.select,
        op.set(local)
      ];
      return [
        [op.get(v.src), op.f32Load(0), op.set(v.u), op.get(v.src), op.f32Load(4), op.set(v.v)],
        insideTest(v.u, v.v),
        op.if,
        cell(v.u, v.C, v.X, v.c),
        cell(v.v, v.R, v.Y, v.r),
        [op.get(v.X), op.get(v.c), op.f32ConvertI32S, op.f32Sub, op.set(v.fx)],
        [op.get(v.Y), op.get(v.r), op.f32ConvertI32S, op.f32Sub, op.set(v.fy)],
        gridPoint(v.grid, v.C, op.get(v.c), op.get(v.r)),
        [
          op.tee(v.i00),
          op.get(v.C),
          op.i32Const(1),
          op.i32Add,
          op.i32Const(3),
          op.i32Shl,
          op.i32Add,
          op.set(v.i01)
        ],
        [
          op.f32Const(1),
          op.get(v.fx),
          op.f32Sub,
          op.set(v.gx),
          op.f32Const(1),
          op.get(v.fy),
          op.f32Sub,
          op.set(v.gy)
        ],
        op.get(v.bilinear),
        op.if,
        bilinearCoord(0),
        bilinearCoord(4),
        op.else,
        // Lower triangle (fx + fy ≤ 1): ((gx − fy)·P00 + fx·P10) + fy·P01;
        // upper: ((fy − gx)·P11 + gx·P01) + gy·P10. Same operations, chosen operands.
        [op.get(v.fx), op.get(v.fy), op.f32Add, op.f32Const(1), op.f32Le, op.set(v.tri)],
        pick(op.get(v.i00), [op.get(v.i01), op.i32Const(8), op.i32Add], v.base),
        pick([op.get(v.i00), op.i32Const(8), op.i32Add], op.get(v.i01), v.pa),
        pick(op.get(v.i01), [op.get(v.i00), op.i32Const(8), op.i32Add], v.pb),
        pick(
          [op.get(v.gx), op.get(v.fy), op.f32Sub],
          [op.get(v.fy), op.get(v.gx), op.f32Sub],
          v.w0
        ),
        pick(op.get(v.fx), op.get(v.gx), v.wa),
        pick(op.get(v.fy), op.get(v.gy), v.wb),
        triangleCoord(0),
        triangleCoord(4),
        op.end,
        op.else,
        [
          op.get(v.grid),
          op.get(v.R),
          op.get(v.C),
          op.get(v.u),
          op.get(v.v),
          op.get(v.dst),
          op.get(v.scratch)
        ],
        call("outside"),
        op.end
      ];
    }
  ),
  wasmFunction("copy", { dst: i322, src: i322, n: i322 }, [], {}, (v) => [
    [op.get(v.dst), op.i32Const(2), op.i32Shl],
    [op.get(v.src), op.i32Const(2), op.i32Shl],
    [op.get(v.n), op.i32Const(2), op.i32Shl],
    op.memoryCopy
  ]),
  // Corner sums (S2): r ← f32(r + f32(w·Q)) per corner, starting from +0.
  // A v128 local starts as zeros, so `vzero` is +0 in every lane.
  wasmFunction("sum1", { dst: i322, a: i322, w: f322, n: i322 }, [], { vw: v128, vzero: v128 }, (v) => {
    const body = (simd2) => [
      [op.get(v.dst), zero(simd2, v.vzero)],
      [term(simd2 ? v.vw : v.w, v.a, simd2), add(simd2), store(simd2)],
      advance([v.dst, v.a], simd2 ? 16 : 4)
    ];
    return [
      toBytes(v.dst, v.a),
      [op.get(v.w), op.f32x4Splat, op.set(v.vw)],
      countedLoop(v.n, wide ? 4 : 1073741824, body(true)),
      countedLoop(v.n, 1, body(false))
    ];
  }),
  wasmFunction(
    "sum2",
    { dst: i322, a: i322, b: i322, wa: f322, wb: f322, n: i322 },
    [],
    { vwa: v128, vwb: v128, vzero: v128 },
    (v) => {
      const body = (simd2) => [
        [op.get(v.dst), zero(simd2, v.vzero)],
        [term(simd2 ? v.vwa : v.wa, v.a, simd2), add(simd2)],
        [term(simd2 ? v.vwb : v.wb, v.b, simd2), add(simd2), store(simd2)],
        advance([v.dst, v.a, v.b], simd2 ? 16 : 4)
      ];
      return [
        toBytes(v.dst, v.a, v.b),
        [op.get(v.wa), op.f32x4Splat, op.set(v.vwa), op.get(v.wb), op.f32x4Splat, op.set(v.vwb)],
        countedLoop(v.n, wide ? 4 : 1073741824, body(true)),
        countedLoop(v.n, 1, body(false))
      ];
    }
  ),
  wasmFunction(
    "sum4",
    {
      dst: i322,
      a: i322,
      b: i322,
      c: i322,
      d: i322,
      w0: f322,
      w1: f322,
      w2: f322,
      w3: f322,
      n: i322,
      acc: i322
    },
    [],
    { v0: v128, v1: v128, v2: v128, v3: v128, vzero: v128 },
    (v) => {
      const body = (simd2, acc) => [
        op.get(v.dst),
        acc ? [op.get(v.dst), load(simd2)] : zero(simd2, v.vzero),
        [term(simd2 ? v.v0 : v.w0, v.a, simd2), add(simd2)],
        [term(simd2 ? v.v1 : v.w1, v.b, simd2), add(simd2)],
        [term(simd2 ? v.v2 : v.w2, v.c, simd2), add(simd2)],
        [term(simd2 ? v.v3 : v.w3, v.d, simd2), add(simd2), store(simd2)],
        advance([v.dst, v.a, v.b, v.c, v.d], simd2 ? 16 : 4)
      ];
      const loops = (acc) => [
        countedLoop(v.n, wide ? 4 : 1073741824, body(true, acc)),
        countedLoop(v.n, 1, body(false, acc))
      ];
      return [
        toBytes(v.dst, v.a, v.b, v.c, v.d),
        [op.get(v.w0), op.f32x4Splat, op.set(v.v0), op.get(v.w1), op.f32x4Splat, op.set(v.v1)],
        [op.get(v.w2), op.f32x4Splat, op.set(v.v2), op.get(v.w3), op.f32x4Splat, op.set(v.v3)],
        [op.get(v.acc), op.if, loops(true), op.else, loops(false), op.end]
      ];
    }
  ),
  // Blend shapes (§1c.4 with S4): the base keyform reads as zeros, so the step is dst + w·s.
  wasmFunction("blend0", { dst: i322, a: i322, w: f322, n: i322 }, [], { vw: v128 }, (v) => {
    const body = (simd2) => [
      [op.get(v.dst), op.get(v.dst), load(simd2)],
      [term(simd2 ? v.vw : v.w, v.a, simd2), add(simd2), store(simd2)],
      advance([v.dst, v.a], simd2 ? 16 : 4)
    ];
    return [
      toBytes(v.dst, v.a),
      [op.get(v.w), op.f32x4Splat, op.set(v.vw)],
      countedLoop(v.n, wide ? 4 : 1073741824, body(true)),
      countedLoop(v.n, 1, body(false))
    ];
  }),
  // s = f32(f32(wa·a) + f32(wb·b)), then dst + f32(w·s).
  wasmFunction(
    "blend1",
    { dst: i322, a: i322, b: i322, wa: f322, wb: f322, w: f322, n: i322 },
    [],
    { vwa: v128, vwb: v128, vw: v128, vs: v128, fs: f322 },
    (v) => {
      const body = (simd2) => {
        const [wa, wb, w, s] = simd2 ? [v.vwa, v.vwb, v.vw, v.vs] : [v.wa, v.wb, v.w, v.fs];
        return [
          [term(wa, v.a, simd2), term(wb, v.b, simd2), add(simd2), op.set(s)],
          [op.get(v.dst), op.get(v.dst), load(simd2)],
          [op.get(w), op.get(s), simd2 ? op.f32x4Mul : op.f32Mul, add(simd2), store(simd2)],
          advance([v.dst, v.a, v.b], simd2 ? 16 : 4)
        ];
      };
      return [
        toBytes(v.dst, v.a, v.b),
        [op.get(v.wa), op.f32x4Splat, op.set(v.vwa), op.get(v.wb), op.f32x4Splat, op.set(v.vwb)],
        [op.get(v.w), op.f32x4Splat, op.set(v.vw)],
        countedLoop(v.n, wide ? 4 : 1073741824, body(true)),
        countedLoop(v.n, 1, body(false))
      ];
    }
  ),
  // warp: groups of 4 points run 4 lanes wide (cell indices clamped into the grid, so every
  // load stays inside it); lanes whose point is outside [0, 1)² are then redone by `outside`.
  // The last count % 4 points go through warpOne.
  wasmFunction(
    "warp",
    { grid: i322, R: i322, C: i322, bilinear: i322, src: i322, dst: i322, count: i322, scratch: i322 },
    [],
    {
      rowBytes: i322,
      a0: i322,
      a1: i322,
      mask: i322,
      INS: v128,
      vCf: v128,
      vRf: v128,
      vCm1: v128,
      vRm1: v128,
      vRow: v128,
      vGrid: v128,
      vOne: v128,
      vZero: v128,
      A: v128,
      U: v128,
      V: v128,
      X: v128,
      Y: v128,
      CI: v128,
      RI: v128,
      FX: v128,
      FY: v128,
      GX: v128,
      GY: v128,
      ADDR: v128,
      W00: v128,
      W10: v128,
      W01: v128,
      TRI: v128,
      P00: v128,
      P10: v128,
      P01: v128,
      P11: v128,
      M: v128,
      B: v128
    },
    (v) => {
      const pair = (rowOffset, offset) => {
        const at4 = (a) => rowOffset ? [op.get(a), op.get(v.rowBytes), op.i32Add] : op.get(a);
        return [at4(v.a1), at4(v.a0), op.v128Load64Zero(offset), op.v128Load64Lane(offset, 1)];
      };
      const spread = (vec2, h) => [
        op.get(vec2),
        op.get(vec2),
        op.i8x16Shuffle(pairLanes(2 * h, 2 * h + 1))
      ];
      const half = (h, bilinear) => [
        [op.get(v.ADDR), op.i32x4ExtractLane(2 * h), op.set(v.a0)],
        [op.get(v.ADDR), op.i32x4ExtractLane(2 * h + 1), op.set(v.a1)],
        [pair(false, 0), op.set(v.P00), pair(false, 8), op.set(v.P10)],
        [pair(true, 0), op.set(v.P01), pair(true, 8), op.set(v.P11)],
        op.get(v.dst),
        bilinear ? [
          // (((gy·(gx·P00) + gy·(fx·P10)) + fy·(gx·P01)) + fy·(fx·P11))
          [spread(v.GY, h), spread(v.GX, h), op.get(v.P00), op.f32x4Mul, op.f32x4Mul],
          [spread(v.GY, h), spread(v.FX, h), op.get(v.P10), op.f32x4Mul, op.f32x4Mul],
          op.f32x4Add,
          [spread(v.FY, h), spread(v.GX, h), op.get(v.P01), op.f32x4Mul, op.f32x4Mul],
          op.f32x4Add,
          [spread(v.FY, h), spread(v.FX, h), op.get(v.P11), op.f32x4Mul, op.f32x4Mul],
          op.f32x4Add
        ] : [
          // Lower triangle: ((gx − fy)·P00 + fx·P10) + fy·P01;
          // upper: ((fy − gx)·P11 + gx·P01) + gy·P10. W00, W10, W01 hold the chosen weights.
          [spread(v.TRI, h), op.set(v.M)],
          [spread(v.W00, h), op.get(v.P00), op.get(v.P11), op.get(v.M), op.v128Bitselect],
          op.f32x4Mul,
          [spread(v.W10, h), op.get(v.P10), op.get(v.P01), op.get(v.M), op.v128Bitselect],
          [op.f32x4Mul, op.f32x4Add],
          [spread(v.W01, h), op.get(v.P01), op.get(v.P10), op.get(v.M), op.v128Bitselect],
          [op.f32x4Mul, op.f32x4Add]
        ],
        op.v128Store(16 * h)
      ];
      const group = (bilinear) => [
        // X = U·C, Y = V·R; cell (c, r) = min(trunc, n − 1), and ≥ 0 so that lanes of
        // outside points (redone later) still read inside the grid. Fractions, complements.
        [op.get(v.U), op.get(v.vCf), op.f32x4Mul, op.tee(v.X), op.i32x4TruncSatF32x4S],
        [op.get(v.vCm1), op.i32x4MinS, op.get(v.vZero), op.i32x4MaxS, op.set(v.CI)],
        [op.get(v.V), op.get(v.vRf), op.f32x4Mul, op.tee(v.Y), op.i32x4TruncSatF32x4S],
        [op.get(v.vRm1), op.i32x4MinS, op.get(v.vZero), op.i32x4MaxS, op.set(v.RI)],
        [op.get(v.X), op.get(v.CI), op.f32x4ConvertI32x4S, op.f32x4Sub, op.set(v.FX)],
        [op.get(v.Y), op.get(v.RI), op.f32x4ConvertI32x4S, op.f32x4Sub, op.set(v.FY)],
        [op.get(v.vOne), op.get(v.FX), op.f32x4Sub, op.set(v.GX)],
        [op.get(v.vOne), op.get(v.FY), op.f32x4Sub, op.set(v.GY)],
        // Byte address of P00: grid + r·rowBytes + 8c.
        [op.get(v.vGrid), op.get(v.RI), op.get(v.vRow), op.i32x4Mul, op.i32x4Add],
        [op.get(v.CI), op.i32Const(3), op.i32x4Shl, op.i32x4Add, op.set(v.ADDR)],
        bilinear ? [] : [
          // TRI: lower triangle (fx + fy ≤ 1). Weights of the base corner (W00), the
          // second (W10) and the third (W01).
          [op.get(v.FX), op.get(v.FY), op.f32x4Add, op.get(v.vOne), op.f32x4Le, op.set(v.TRI)],
          [op.get(v.GX), op.get(v.FY), op.f32x4Sub, op.get(v.FY), op.get(v.GX), op.f32x4Sub],
          [op.get(v.TRI), op.v128Bitselect, op.set(v.W00)],
          [op.get(v.FX), op.get(v.GX), op.get(v.TRI), op.v128Bitselect, op.set(v.W10)],
          [op.get(v.FY), op.get(v.GY), op.get(v.TRI), op.v128Bitselect, op.set(v.W01)]
        ],
        half(0, bilinear),
        half(1, bilinear)
      ];
      const loop = (bilinear) => countedLoop(v.count, wide ? 4 : 1073741824, [
        [op.get(v.src), op.v128Load(0), op.set(v.A), op.get(v.src), op.v128Load(16), op.set(v.B)],
        [op.get(v.A), op.get(v.B), op.i8x16Shuffle(lanes(0, 2, 4, 6)), op.set(v.U)],
        [op.get(v.A), op.get(v.B), op.i8x16Shuffle(lanes(1, 3, 5, 7)), op.set(v.V)],
        [
          op.get(v.U),
          op.get(v.vZero),
          op.f32x4Ge,
          op.get(v.U),
          op.get(v.vOne),
          op.f32x4Lt,
          op.v128And
        ],
        [
          op.get(v.V),
          op.get(v.vZero),
          op.f32x4Ge,
          op.v128And,
          op.get(v.V),
          op.get(v.vOne),
          op.f32x4Lt,
          op.v128And
        ],
        op.set(v.INS),
        group(bilinear),
        // Redo the lanes whose point is outside the grid (inputs taken from U, V: the
        // stores above may have overwritten src when mapping in place).
        [op.get(v.INS), op.i32x4Bitmask, op.tee(v.mask), op.i32Const(15), op.i32LtS],
        op.if,
        [0, 1, 2, 3].map((j) => [
          [op.get(v.mask), op.i32Const(1 << j), op.i32And, op.i32Eqz],
          op.if,
          [op.get(v.grid), op.get(v.R), op.get(v.C)],
          [op.get(v.U), op.f32x4ExtractLane(j), op.get(v.V), op.f32x4ExtractLane(j)],
          [op.get(v.dst), op.i32Const(8 * j), op.i32Add, op.get(v.scratch), call("outside")],
          op.end
        ]),
        op.end,
        advance([v.src, v.dst], 32)
      ]);
      return [
        toBytes(v.grid, v.src, v.dst, v.scratch),
        [op.get(v.C), op.i32Const(1), op.i32Add, op.i32Const(3), op.i32Shl, op.set(v.rowBytes)],
        [op.get(v.C), op.f32ConvertI32S, op.f32x4Splat, op.set(v.vCf)],
        [op.get(v.R), op.f32ConvertI32S, op.f32x4Splat, op.set(v.vRf)],
        [op.get(v.C), op.i32Const(1), op.i32Sub, op.i32x4Splat, op.set(v.vCm1)],
        [op.get(v.R), op.i32Const(1), op.i32Sub, op.i32x4Splat, op.set(v.vRm1)],
        [op.get(v.rowBytes), op.i32x4Splat, op.set(v.vRow)],
        [op.get(v.grid), op.i32x4Splat, op.set(v.vGrid)],
        [op.f32Const(1), op.f32x4Splat, op.set(v.vOne)],
        [op.get(v.grid), op.get(v.R), op.get(v.C), op.get(v.scratch), op.i32Const(32), op.i32Add],
        call("affineSetup"),
        op.get(v.bilinear),
        op.if,
        loop(true),
        op.else,
        loop(false),
        op.end,
        countedLoop(v.count, 1, [
          [
            op.get(v.grid),
            op.get(v.R),
            op.get(v.C),
            op.get(v.bilinear),
            op.get(v.src),
            op.get(v.dst)
          ],
          [op.get(v.scratch), call("warpOne")],
          advance([v.src, v.dst], 8)
        ])
      ];
    }
  ),
  wasmFunction(
    "rotate",
    {
      src: i322,
      dst: i322,
      count: i322,
      c: f322,
      s: f322,
      scale: f322,
      ox: f322,
      oy: f322,
      mirrorX: i322,
      mirrorY: i322
    },
    [],
    { x: f322, y: f322, rx: f322, ry: f322 },
    (v) => [
      toBytes(v.src, v.dst),
      countedLoop(v.count, 1, [
        [op.get(v.src), op.f32Load(0), op.set(v.x), op.get(v.src), op.f32Load(4), op.set(v.y)],
        [op.get(v.x), op.f32Neg, op.get(v.x), op.get(v.mirrorX), op.select, op.set(v.x)],
        [op.get(v.y), op.f32Neg, op.get(v.y), op.get(v.mirrorY), op.select, op.set(v.y)],
        [
          op.get(v.c),
          op.get(v.x),
          op.f32Mul,
          op.get(v.s),
          op.get(v.y),
          op.f32Mul,
          op.f32Sub,
          op.set(v.rx)
        ],
        [
          op.get(v.s),
          op.get(v.x),
          op.f32Mul,
          op.get(v.c),
          op.get(v.y),
          op.f32Mul,
          op.f32Add,
          op.set(v.ry)
        ],
        [
          op.get(v.dst),
          op.get(v.ox),
          op.get(v.scale),
          op.get(v.rx),
          op.f32Mul,
          op.f32Add,
          op.f32Store(0)
        ],
        [
          op.get(v.dst),
          op.get(v.oy),
          op.get(v.scale),
          op.get(v.ry),
          op.f32Mul,
          op.f32Add,
          op.f32Store(4)
        ],
        advance([v.src, v.dst], 8)
      ])
    ]
  ),
  wasmFunction("flipY", { dst: i322, src: i322, n: i322 }, [], { mask: v128 }, (v) => [
    toBytes(v.dst, v.src),
    // Sign bit of lanes 1 and 3 (the y of each pair).
    [op.v128Const([0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 128]), op.set(v.mask)],
    countedLoop(v.n, wide ? 4 : 1073741824, [
      [op.get(v.dst), op.get(v.src), op.v128Load(), op.get(v.mask), op.v128Xor, op.v128Store()],
      advance([v.dst, v.src], 16)
    ]),
    countedLoop(v.n, 2, [
      [op.get(v.dst), op.get(v.src), op.f32Load(0), op.f32Store(0)],
      [op.get(v.dst), op.get(v.src), op.f32Load(4), op.f32Neg, op.f32Store(4)],
      advance([v.dst, v.src], 8)
    ])
  ])
];
var KERNELS = kernelFunctions(true);
if (KERNELS.some((f, i2) => f.name !== FUNCTIONS[i2])) throw new Error("kernel order mismatch");
var KERNEL_MODULE_BYTES = assembleModule(KERNELS);
var KERNEL_SCALAR_MODULE_BYTES = assembleModule(kernelFunctions(false));
var compiled = {};
function kernelModule(scalar = false) {
  const key = scalar ? "scalar" : "wide";
  if (compiled[key] === void 0) {
    compiled[key] = null;
    const bytes = scalar ? KERNEL_SCALAR_MODULE_BYTES : KERNEL_MODULE_BYTES;
    try {
      const api = globalThis.WebAssembly;
      if (api && api.validate(bytes)) compiled[key] = new api.Module(bytes);
    } catch {
      compiled[key] = null;
    }
  }
  return compiled[key];
}
function wasmKernels(module, floats, scalar = false) {
  const api = globalThis.WebAssembly;
  const memory = new api.Memory({ initial: Math.max(1, Math.ceil(floats * 4 / 65536)) });
  const ex = new api.Instance(module, { env: { memory } }).exports;
  return {
    kind: scalar ? "wasm-scalar" : "wasm",
    heap: new Float32Array(memory.buffer, 0, floats),
    copy: ex.copy,
    sum1: ex.sum1,
    sum2: ex.sum2,
    sum4: ex.sum4,
    blend0: ex.blend0,
    blend1: ex.blend1,
    warp: ex.warp,
    rotate: ex.rotate,
    flipY: ex.flipY
  };
}
function createKernels(floats, choice = "auto") {
  if (choice !== "js") {
    const scalar = choice === "wasm-scalar";
    const module = kernelModule(scalar);
    if (module) return wasmKernels(module, floats, scalar);
    if (choice !== "auto") throw new Error("WebAssembly kernels are not available here");
  }
  return jsKernels(floats);
}

// src/core/eval/jacobian.ts
var at3 = (g, C, c, r) => g + 2 * (r * (C + 1) + c);
function affineAxes(p, g, R, C, out) {
  const i00 = g;
  const i10 = at3(g, C, C, 0);
  const i01 = at3(g, C, 0, R);
  const i11 = at3(g, C, C, R);
  for (let k = 0; k < 2; k++) {
    out[k] = (p[i10 + k] + p[i11 + k] - (p[i00 + k] + p[i01 + k])) / 2;
    out[2 + k] = (p[i01 + k] + p[i11 + k] - (p[i00 + k] + p[i10 + k])) / 2;
  }
}
function affinePoint(p, g, R, C, u, v, out, o) {
  const i00 = g;
  const i10 = at3(g, C, C, 0);
  const i01 = at3(g, C, 0, R);
  const i11 = at3(g, C, C, R);
  for (let k = 0; k < 2; k++) {
    const z = (p[i00 + k] + p[i10 + k] + p[i01 + k] + p[i11 + k]) / 4;
    const du = (p[i10 + k] + p[i11 + k] - (p[i00 + k] + p[i01 + k])) / 2;
    const dv = (p[i01 + k] + p[i11 + k] - (p[i00 + k] + p[i10 + k])) / 2;
    out[o + k] = z + (u - 0.5) * du + (v - 0.5) * dv;
  }
}
var axes = new Float64Array(4);
var q = new Float64Array(8);
function warpJacobian(p, g, R, C, bilinear, u, v, out, o) {
  u = fr(u);
  v = fr(v);
  if (u >= 0 && u < 1 && v >= 0 && v < 1) {
    const X = fr(u * C);
    const Y = fr(v * R);
    const c = Math.min(Math.floor(X), C - 1);
    const r = Math.min(Math.floor(Y), R - 1);
    const fx2 = fr(X - c);
    const fy2 = fr(Y - r);
    const i00 = at3(g, C, c, r);
    const i10 = at3(g, C, c + 1, r);
    const i01 = at3(g, C, c, r + 1);
    const i11 = at3(g, C, c + 1, r + 1);
    for (let k = 0; k < 2; k++) {
      const p00 = p[i00 + k];
      const p10 = p[i10 + k];
      const p01 = p[i01 + k];
      const p11 = p[i11 + k];
      let du, dv;
      if (bilinear) {
        du = (1 - fy2) * (p10 - p00) + fy2 * (p11 - p01);
        dv = (1 - fx2) * (p01 - p00) + fx2 * (p11 - p10);
      } else if (fr(fx2 + fy2) <= 1) {
        du = p10 - p00;
        dv = p01 - p00;
      } else {
        du = p11 - p01;
        dv = p11 - p10;
      }
      out[o + 2 * k] = du * C;
      out[o + 2 * k + 1] = dv * R;
    }
    return;
  }
  if (u < -2 || u > 3 || v < -2 || v > 3) {
    affineAxes(p, g, R, C, axes);
    out[o] = axes[0];
    out[o + 1] = axes[2];
    out[o + 2] = axes[1];
    out[o + 3] = axes[3];
    return;
  }
  let u0, u1, gc0, gc1;
  if (u < 0) [u0, u1, gc0, gc1] = [-2, 0, -1, 0];
  else if (u > 1) [u0, u1, gc0, gc1] = [1, 3, C, -1];
  else {
    const c = Math.min(Math.floor(fr(u * C)), C - 1);
    [u0, u1, gc0, gc1] = [fr(c / C), fr((c + 1) / C), c, c + 1];
  }
  let v0, v1, gr0, gr1;
  if (v < 0) [v0, v1, gr0, gr1] = [-2, 0, -1, 0];
  else if (v > 1) [v0, v1, gr0, gr1] = [1, 3, R, -1];
  else {
    const r = Math.min(Math.floor(fr(v * R)), R - 1);
    [v0, v1, gr0, gr1] = [fr(r / R), fr((r + 1) / R), r, r + 1];
  }
  const corner2 = (slot, gc, gr, cu, cv) => {
    if (gc >= 0 && gr >= 0) {
      const i2 = at3(g, C, gc, gr);
      q[slot] = p[i2];
      q[slot + 1] = p[i2 + 1];
    } else affinePoint(p, g, R, C, cu, cv, q, slot);
  };
  corner2(0, gc0, gr0, u0, v0);
  corner2(2, gc1, gr0, u1, v0);
  corner2(4, gc0, gr1, u0, v1);
  corner2(6, gc1, gr1, u1, v1);
  const fx = fr(fr(u - u0) / fr(u1 - u0));
  const fy = fr(fr(v - v0) / fr(v1 - v0));
  const lower = fr(fx + fy) <= 1;
  for (let k = 0; k < 2; k++) {
    const q00 = q[k];
    const q10 = q[2 + k];
    const q01 = q[4 + k];
    const q11 = q[6 + k];
    const du = lower ? q10 - q00 : q11 - q01;
    const dv = lower ? q01 - q00 : q11 - q10;
    out[o + 2 * k] = du / (u1 - u0);
    out[o + 2 * k + 1] = dv / (v1 - v0);
  }
}
function rotationJacobian(cos, sin, scale2, mirrorX, mirrorY, out, o) {
  const mx = mirrorX ? -1 : 1;
  const my = mirrorY ? -1 : 1;
  out[o] = scale2 * cos * mx;
  out[o + 1] = -scale2 * sin * my;
  out[o + 2] = scale2 * sin * mx;
  out[o + 3] = scale2 * cos * my;
}

// src/core/eval/patch.ts
var PATCHABLE_FIELDS = {
  keyformPositions: [],
  artMeshKeyforms: ["opacity", "drawOrder"],
  warpKeyforms: ["opacity"],
  rotationKeyforms: ["opacity", "angle", "originX", "originY", "scale"],
  partKeyforms: ["drawOrder"],
  offscreenKeyforms: ["opacity"],
  glueKeyforms: ["intensity"],
  glueInfo: ["weight"],
  multiplyColors: ["r", "g", "b"],
  screenColors: ["r", "g", "b"]
};
var revisions = /* @__PURE__ */ new WeakMap();
function dataRevision(model) {
  return revisions.get(model) ?? 0;
}
var MESH = 0;
var DEFORMER = 1;
var PART = 2;
var GLUE = 3;
var OFFSCREEN = 4;
var KINDS = ["mesh", "deformer", "part", "glue", "offscreen"];
var pack = (kind2, index) => kind2 * 2 ** 24 + index;
var kindOf = (packed) => Math.floor(packed / 2 ** 24);
var indexOf = (packed) => packed % 2 ** 24;
var Owners = class {
  first;
  more = /* @__PURE__ */ new Map();
  constructor(size) {
    this.first = new Int32Array(size).fill(-1);
  }
  add(at4, owner) {
    if (at4 < 0 || at4 >= this.first.length) return;
    const f = this.first[at4];
    if (f === -1) this.first[at4] = owner;
    else if (f !== owner) {
      const list = this.more.get(at4) ?? [];
      if (!list.includes(owner)) list.push(owner);
      this.more.set(at4, list);
    }
  }
  forEach(at4, fn) {
    const f = this.first[at4];
    if (f === void 0 || f < 0) return;
    fn(f);
    for (const o of this.more.get(at4) ?? []) fn(o);
  }
};
var indexes = /* @__PURE__ */ new WeakMap();
function patchIndex(m) {
  let ix = indexes.get(m);
  if (ix) return ix;
  const kf = m.keyforms;
  const count = (band) => m.bands[band].keyformCount;
  const meshKeyforms = new Owners(kf.meshOpacity.length);
  const warpKeyforms = new Owners(kf.warpOpacity.length);
  const rotationKeyforms = new Owners(kf.rotationAngle.length);
  const partKeyforms = new Owners(kf.partDrawOrder.length);
  const offscreenKeyforms = new Owners(kf.offscreenOpacity.length);
  const glueKeyforms = new Owners(kf.glueIntensity.length);
  const glueInfo = new Owners(
    m.glues.firstInfo.reduce(
      (n, first, g) => Math.max(n, first + 2 * m.glues.weightA[g].length),
      0
    )
  );
  const multiply = new Owners(m.multiplyColors.length / 3);
  const screen = new Owners(m.screenColors.length / 3);
  const runs = [];
  const keyforms = (first, band, list, fn) => {
    for (let o = 0; o < count(band); o++) fn(first + o);
    for (const b of list) for (let k = 0; k < b.keys.length; k++) fn(b.firstKeyform + k);
  };
  const colors = (idx, k, owner) => {
    multiply.add(idx.multiply[k], owner);
    screen.add(idx.screen[k], owner);
  };
  const me = m.meshes;
  for (let i2 = 0; i2 < me.ids.length; i2++) {
    const owner = pack(MESH, i2);
    keyforms(me.firstKeyform[i2], me.band[i2], m.blendShapes.mesh[i2], (k) => {
      meshKeyforms.add(k, owner);
      colors(kf.meshColors, k, owner);
      runs.push([kf.meshFirstPosition[k], 2 * me.vertexCount[i2], owner]);
    });
  }
  const d = m.deformers;
  for (let i2 = 0; i2 < d.ids.length; i2++) {
    const owner = pack(DEFORMER, i2);
    const k = d.kindIndex[i2];
    if (d.kind[i2] === WARP_KIND) {
      const length2 = 2 * (m.warps.rows[k] + 1) * (m.warps.columns[k] + 1);
      keyforms(m.warps.firstKeyform[k], d.band[i2], m.blendShapes.warp[k], (x2) => {
        warpKeyforms.add(x2, owner);
        colors(kf.warpColors, x2, owner);
        runs.push([kf.warpFirstPosition[x2], length2, owner]);
      });
    } else {
      keyforms(m.rotations.firstKeyform[k], d.band[i2], m.blendShapes.rotation[k], (x2) => {
        rotationKeyforms.add(x2, owner);
        colors(kf.rotationColors, x2, owner);
      });
    }
  }
  for (let p = 0; p < m.parts.ids.length; p++)
    keyforms(
      m.parts.firstKeyform[p],
      m.parts.band[p],
      m.blendShapes.part[p],
      (k) => partKeyforms.add(k, pack(PART, p))
    );
  for (let o = 0; o < m.offscreens.part.length; o++) {
    const owner = pack(OFFSCREEN, o);
    const p = m.offscreens.part[o];
    const first = m.parts.firstKeyform[p];
    for (let j = 0; j < count(m.parts.band[p]); j++) {
      const ok = kf.partOffscreenKeyform[first + j];
      offscreenKeyforms.add(ok, owner);
      if (ok >= 0) colors(kf.offscreenColors, ok, owner);
    }
    for (const b of m.blendShapes.offscreen[o])
      for (let k = 0; k < b.keys.length; k++) {
        offscreenKeyforms.add(b.firstKeyform + k, owner);
        colors(kf.offscreenColors, b.firstKeyform + k, owner);
      }
  }
  for (let g = 0; g < m.glues.ids.length; g++) {
    keyforms(
      m.glues.firstKeyform[g],
      m.glues.band[g],
      m.blendShapes.glue[g],
      (k) => glueKeyforms.add(k, pack(GLUE, g))
    );
    const first = m.glues.firstInfo[g];
    for (let j = 0; j < 2 * m.glues.weightA[g].length; j++) glueInfo.add(first + j, pack(GLUE, g));
  }
  runs.sort((a, b) => a[0] - b[0]);
  ix = {
    meshKeyforms,
    warpKeyforms,
    rotationKeyforms,
    partKeyforms,
    offscreenKeyforms,
    glueKeyforms,
    glueInfo,
    multiply,
    screen,
    runStart: Int32Array.from(runs, (r) => r[0]),
    runLength: Int32Array.from(runs, (r) => r[1]),
    runOwner: Int32Array.from(runs, (r) => r[2]),
    maxRun: runs.reduce((n, r) => Math.max(n, r[1]), 0)
  };
  indexes.set(m, ix);
  return ix;
}
function runsOverlapping(ix, a, b, fn) {
  const starts = ix.runStart;
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (starts[mid] <= a - ix.maxRun) lo = mid + 1;
    else hi = mid;
  }
  for (let r = lo; r < starts.length && starts[r] < b; r++)
    if (starts[r] + ix.runLength[r] > a) fn(ix.runOwner[r]);
}
function target(m, p) {
  const kf = m.keyforms;
  const f = p.field;
  switch (p.group) {
    case "keyformPositions":
      return { array: m.positions, stride: 1, channel: 0 };
    case "artMeshKeyforms":
      return { array: f === "opacity" ? kf.meshOpacity : kf.meshDrawOrder, stride: 1, channel: 0 };
    case "warpKeyforms":
      return { array: kf.warpOpacity, stride: 1, channel: 0 };
    case "rotationKeyforms": {
      const array = {
        opacity: kf.rotationOpacity,
        angle: kf.rotationAngle,
        originX: kf.rotationOriginX,
        originY: kf.rotationOriginY,
        scale: kf.rotationScale
      }[f];
      return { array, stride: 1, channel: 0 };
    }
    case "partKeyforms":
      return { array: kf.partDrawOrder, stride: 1, channel: 0 };
    case "offscreenKeyforms":
      return { array: kf.offscreenOpacity, stride: 1, channel: 0 };
    case "glueKeyforms":
      return { array: kf.glueIntensity, stride: 1, channel: 0 };
    case "multiplyColors":
    case "screenColors":
      return {
        array: p.group === "multiplyColors" ? m.multiplyColors : m.screenColors,
        stride: 3,
        channel: "rgb".indexOf(f)
      };
    case "glueInfo":
      return null;
  }
}
function length(m, p) {
  if (p.group === "glueInfo") return patchIndex(m).glueInfo.first.length;
  const t = target(m, p);
  return t.array.length / t.stride;
}
function check(m, p) {
  const where = `${p.group}${p.field ? `.${p.field}` : ""}`;
  const fields = PATCHABLE_FIELDS[p.group];
  if (!fields)
    throw new TypeError(
      `${p.group} cannot be patched (patchable: ${Object.keys(PATCHABLE_FIELDS).join(", ")})`
    );
  if (fields.length === 0 ? p.field !== void 0 : !fields.includes(p.field ?? ""))
    throw new TypeError(
      fields.length === 0 ? `${p.group} has no fields` : `${where} cannot be patched (fields of ${p.group}: ${fields.join(", ")})`
    );
  const n = length(m, p);
  if (!(Number.isInteger(p.start) && p.start >= 0 && p.start + p.values.length <= n))
    throw new RangeError(
      `${where}: [${p.start}, ${p.start + p.values.length}) is outside its ${n} elements`
    );
  const opacity = p.field === "opacity";
  for (let i2 = 0; i2 < p.values.length; i2++) {
    const v = p.values[i2];
    if (typeof v !== "number") throw new TypeError(`${where}: value ${i2} is not a number`);
    if (opacity && !Number.isFinite(v))
      throw new RangeError(`${where}: value ${i2} is ${v}; keyform opacities must be finite`);
  }
}
function applyPatches(m, patches) {
  for (const p of patches) check(m, p);
  const ix = patchIndex(m);
  const effect = {
    positions: [],
    deformers: /* @__PURE__ */ new Set(),
    meshVertices: /* @__PURE__ */ new Set(),
    glue: false
  };
  const refresh = /* @__PURE__ */ new Set();
  const touch = (owner) => {
    refresh.add(owner);
    if (kindOf(owner) === DEFORMER) effect.deformers.add(indexOf(owner));
    if (kindOf(owner) === GLUE) effect.glue = true;
  };
  for (const p of patches) {
    const n = p.values.length;
    if (n === 0) continue;
    if (p.group === "glueInfo") {
      for (let i2 = 0; i2 < n; i2++) {
        const j = p.start + i2;
        ix.glueInfo.forEach(j, (owner) => {
          const g = indexOf(owner);
          const e = j - m.glues.firstInfo[g];
          (e % 2 === 0 ? m.glues.weightA : m.glues.weightB)[g][e >> 1] = p.values[i2];
        });
      }
      effect.glue = true;
      continue;
    }
    const t = target(m, p);
    for (let i2 = 0; i2 < n; i2++) t.array[t.stride * (p.start + i2) + t.channel] = p.values[i2];
    const owners = {
      artMeshKeyforms: ix.meshKeyforms,
      warpKeyforms: ix.warpKeyforms,
      rotationKeyforms: ix.rotationKeyforms,
      partKeyforms: ix.partKeyforms,
      offscreenKeyforms: ix.offscreenKeyforms,
      glueKeyforms: ix.glueKeyforms,
      multiplyColors: ix.multiply,
      screenColors: ix.screen,
      keyformPositions: null
    }[p.group];
    if (owners) {
      for (let i2 = 0; i2 < n; i2++) owners.forEach(p.start + i2, touch);
      continue;
    }
    effect.positions.push([p.start, p.start + n]);
    runsOverlapping(ix, p.start, p.start + n, (owner) => {
      touch(owner);
      if (kindOf(owner) === MESH) effect.meshVertices.add(indexOf(owner));
    });
  }
  for (const owner of refresh) refreshPlan(m, KINDS[kindOf(owner)], indexOf(owner));
  revisions.set(m, dataRevision(m) + 1);
  return effect;
}

// src/core/eval/instance.ts
var MAP_CHUNK = 512;
var ModelInstance = class {
  constructor(model, options = {}) {
    this.model = model;
    const m = model;
    const plan = this.plan = planFor(m, options.evaluation?.blendShapes ?? true);
    this.glueOn = options.evaluation?.glue ?? true;
    const P = m.parameters.ids.length;
    this.parameterValues = Float32Array.from(m.parameters.defaults);
    this.evalValues = new Float32Array(P);
    this.partOpacities = Float32Array.from(m.parts.initialOpacity);
    m.parameters.ids.forEach(
      (id, i2) => this.paramIndexById.has(id) || this.paramIndexById.set(id, i2)
    );
    m.parts.ids.forEach((id, i2) => this.partIndexById.has(id) || this.partIndexById.set(id, i2));
    const nb = m.bindings.keys.length;
    this.segIndex = new Int32Array(nb);
    this.segT = new Float32Array(nb);
    this.segOutOfRange = new Uint8Array(nb);
    this.segChanged = new Uint8Array(nb);
    const NB = m.bands.length;
    const K = this.K = Math.max(1, plan.maxBandBindings);
    this.bandBase = new Int32Array(NB);
    this.bandActive = new Int32Array(NB);
    this.bandStride = new Int32Array(NB * K);
    this.bandT = new Float32Array(NB * K);
    this.bandW = new Float32Array(NB * 16);
    this.bandO = new Int32Array(NB * 16);
    this.bandOutOfRange = new Uint8Array(NB);
    this.bandChanged = new Uint8Array(NB);
    const NBL = plan.blends.length;
    this.blendIndex = new Int32Array(NBL);
    this.blendT = new Float32Array(NBL);
    this.blendWa = new Float32Array(NBL);
    this.blendWb = new Float32Array(NBL);
    this.blendWeight = new Float32Array(NBL);
    this.blendChanged = new Uint8Array(NBL);
    const D = m.deformers.ids.length;
    this.deformerActive = new Uint8Array(D);
    this.deformerDirty = new Uint8Array(D);
    this.deformerOpacity = new Float32Array(D);
    this.deformerColors = new Float32Array(D * 6);
    this.sigma = new Float32Array(D);
    this.rotOx = new Float32Array(D);
    this.rotOy = new Float32Array(D);
    this.rotAngle = new Float32Array(D);
    this.rotScale = new Float32Array(D);
    this.rotC = new Float32Array(D);
    this.rotS = new Float32Array(D);
    this.rotMirrorX = new Uint8Array(D);
    this.rotMirrorY = new Uint8Array(D);
    const N = m.meshes.ids.length;
    this.drawableActive = new Uint8Array(N);
    this.drawableVisible = new Uint8Array(N);
    this.drawableOpacity = new Float32Array(N);
    this.drawableDrawOrder = new Int32Array(N);
    this.drawableRenderOrder = new Int32Array(N);
    this.drawableMultiply = new Float32Array(N * 3);
    this.drawableScreen = new Float32Array(N * 3);
    this.meshEvaluated = new Uint8Array(N);
    this.meshStale = new Uint8Array(N).fill(1);
    this.wasActive = new Uint8Array(N);
    this.meshPartChain = Array.from(m.meshes.part, (part) => {
      const chain = [];
      for (let p = part; p >= 0; p = m.parts.parent[p]) {
        if (m.parts.offscreen[p] >= 0) break;
        chain.push(p);
      }
      return Int32Array.from(chain);
    });
    const O = m.offscreens.part.length;
    this.offscreenOpacity = new Float32Array(O);
    this.offscreenRenderOrder = new Int32Array(O);
    this.offscreenMultiply = new Float32Array(O * 3);
    this.offscreenScreen = new Float32Array(O * 3);
    this.partActive = new Uint8Array(m.parts.ids.length);
    this.partDrawOrder = new Int32Array(m.parts.ids.length);
    this.hasColors = m.version >= 4;
    this.clampTargets = m.version >= 5;
    if (!this.hasColors) this.drawableMultiply.fill(1);
    this.flipOutput = (m.canvas.flags & 1) === 0;
    this.orderer = new RenderOrderer(m);
    const align = (n) => n + 3 & ~3;
    let top = align(m.positions.length);
    const alloc = (n) => {
      const at4 = top;
      top += align(n);
      return at4;
    };
    const vertexCount = Array.from(m.meshes.vertexCount);
    this.gridOffset = Int32Array.from(
      plan.deformers,
      (d) => d.kind === 0 ? alloc(d.gridLength) : -1
    );
    this.localOffset = Int32Array.from(vertexCount, (V) => alloc(2 * V));
    this.isGlued = new Uint8Array(N);
    if (this.glueOn) for (const d of plan.glueMeshes) this.isGlued[d] = 1;
    this.outOffset = Int32Array.from(vertexCount, (V) => alloc(2 * V));
    let maxRun = 4;
    for (const d of plan.deformers) maxRun = Math.max(maxRun, d.gridLength);
    for (const V of vertexCount) maxRun = Math.max(maxRun, 2 * V);
    this.maxRun = maxRun;
    this.zeroOffset = alloc(maxRun);
    this.scratchOffset = alloc(16);
    this.mapOffset = alloc(2 * MAP_CHUNK);
    this.probeOffset = alloc(8);
    this.k = createKernels(top, options.kernels);
    this.backend = this.k.kind;
    const heap = this.heap = this.k.heap;
    heap.set(m.positions, 0);
    this.drawableVertices = vertexCount.map(
      (V, i2) => heap.subarray(this.outOffset[i2], this.outOffset[i2] + 2 * V)
    );
    this.drawableVertexVersion = new Uint32Array(vertexCount.length);
    this.meshPatched = new Uint8Array(N);
    this.deformerPatched = new Uint8Array(D);
    this.revision = dataRevision(m);
    this.incremental = options.incremental ?? true;
    this.evaluate();
  }
  model;
  // ---- inputs (as applied) ----
  /** Parameter values as applied/reported (§1c.1). */
  parameterValues;
  /** Part opacities as applied (clamped to [0, 1]). */
  partOpacities;
  // ---- outputs ----
  drawableActive;
  drawableVisible;
  drawableOpacity;
  drawableDrawOrder;
  drawableRenderOrder;
  /**
   * RGB per drawable: clamped to [0, 1] when combined with a parent
   * deformer's colors or when the mesh is a blend-shape target (version 5
   * and later), otherwise as interpolated.
   */
  drawableMultiply;
  drawableScreen;
  /** Output-space vertices per drawable (y up unless canvas flag bit 0). */
  drawableVertices;
  /**
   * Per drawable, a counter that changes whenever an evaluation may have
   * written its vertex array. Equal counters mean equal vertices, so renderers
   * can skip re-uploading them.
   */
  drawableVertexVersion;
  /** How many times {@link evaluate} ran (the creation-time evaluation included). */
  evaluations = 0;
  offscreenOpacity;
  offscreenRenderOrder;
  /** RGB per offscreen: clamped to [0, 1] only for offscreen targets. */
  offscreenMultiply;
  offscreenScreen;
  partActive;
  partDrawOrder;
  deformerActive;
  /** The kernel implementation in use. */
  backend;
  // ---- static ----
  plan;
  hasColors;
  /** Whether the glue pass runs (`evaluation.glue`). */
  glueOn;
  /** Blend-shape targets' own values are clamped (version 5 and later). */
  clampTargets;
  flipOutput;
  paramIndexById = /* @__PURE__ */ new Map();
  partIndexById = /* @__PURE__ */ new Map();
  /** Parts whose opacity multiplies into each mesh (parent chain, stopping at offscreen owners). */
  meshPartChain;
  // ---- per-frame binding state ----
  evalValues;
  segIndex;
  segT;
  segOutOfRange;
  segChanged;
  bandBase;
  bandActive;
  /** Active (t ≠ 0) strides and t values, K per band, innermost first. */
  bandStride;
  bandT;
  /** Corner weights and keyform offsets (from the band base), 16 per band, for up to 4 active bindings. */
  bandW;
  bandO;
  /** Corner tables of one band with more than 4 active bindings, computed on demand. */
  bigW = new Float32Array(0);
  bigO = new Int32Array(0);
  bigBand = -1;
  bigFrame = -1;
  frame = 0;
  bandOutOfRange;
  bandChanged;
  blendIndex;
  blendT;
  /** The weights of a blend shape's two keyforms in its segment (see blendStep). */
  blendWa;
  blendWb;
  blendWeight;
  blendChanged;
  /** Result slot of locateKeyAt. */
  locIndex = new Int32Array(1);
  locT = new Float32Array(1);
  /** Slots per band in bandStride / bandT. */
  K;
  firstEvaluation = true;
  incremental;
  // ---- heap (float indices) ----
  k;
  heap;
  /** Warp grid per deformer (-1 for rotations). Keyform positions sit at the start of the heap. */
  gridOffset;
  /** Model-space vertices per mesh before glue. */
  localOffset;
  /**
   * Each drawable's persistent vertex array, viewed by drawableVertices (C4):
   * refreshed only while the drawable is active, zeros until it
   * first is, and modified in place by glue on every evaluation.
   */
  outOffset;
  /** Whether each mesh takes part in a glue. */
  isGlued;
  /** Activity of each mesh in the previous evaluation. */
  wasActive;
  /** Longest float run of any warp grid or mesh. */
  maxRun;
  /** maxRun zeros, never written: what a blend shape's base keyform reads (S4). */
  zeroOffset;
  /** Working space for the warp kernel (16 floats). */
  scratchOffset;
  /** Heap scratch for {@link mapPoints}: MAP_CHUNK points. */
  mapOffset;
  /** Objects a patch touched, recomputed at the next evaluation (see {@link patch}). */
  meshPatched;
  deformerPatched;
  gluePatched = false;
  patched = false;
  /** The model's data revision this instance's heap and state hold; a newer one forces a full pass. */
  revision;
  fullPass = false;
  /** Two input and two output points for a rotation origin inside a warp. */
  probeOffset;
  // ---- deformer world forms ----
  deformerDirty;
  deformerOpacity;
  /** Accumulated multiply (3) and screen (3) per deformer. */
  deformerColors;
  sigma;
  rotOx;
  rotOy;
  rotAngle;
  rotScale;
  /** C = f32(s_w·cos r) and S = f32(s_w·sin r): the rotation with its world scale. */
  rotC;
  rotS;
  rotMirrorX;
  rotMirrorY;
  // ---- meshes ----
  /** Local vertices recomputed in this evaluation. */
  meshEvaluated;
  /** Inputs changed while the mesh was inactive: recompute when it is active again. */
  meshStale;
  /** Property values of the object being evaluated (see ObjectPlan.props). */
  pv = new Float32Array(16);
  /** Single-value result slot. */
  gv = new Float64Array(1);
  colors = new Float32Array(6);
  orderer;
  // ---------------------------------------------------------------- inputs
  /** Index of the first parameter with this ID, or -1. */
  parameterIndex(id) {
    return this.paramIndexById.get(id) ?? -1;
  }
  /** Index of the first part with this ID, or -1. */
  partIndex(id) {
    return this.partIndexById.get(id) ?? -1;
  }
  /** Sets a parameter; the stored value is clamped unless the parameter repeats (§1c.1). */
  setParameter(index, value) {
    const p = this.model.parameters;
    this.parameterValues[index] = appliedValue(
      value,
      p.min[index],
      p.max[index],
      p.repeat[index] === 1
    );
  }
  /** Sets a part opacity, clamped to [0, 1]. */
  setPartOpacity(index, value) {
    const v = fr(value);
    this.partOpacities[index] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  // ------------------------------------------------------------ mapping
  /**
   * The forward mapping: maps points from deformer `deformer`'s input space
   * through its world form at the latest evaluation (§1c.7, §1c.8, the
   * outside regions of warps included), with the evaluator's own float32
   * operations, so a mesh vertex maps exactly as the evaluator maps it.
   * `points` holds x, y pairs; −1 stands for no deformer (the identity).
   * Space "model" (default) is that of `drawableVertices`: y is negated
   * unless canvas flag bit 0 is set (§1c.11). "keyform" is the space of
   * keyform positions, y down. Writes to `out` when given.
   */
  mapPoints(deformer, points, space = "model", out) {
    const n = this.mapCount(deformer, points);
    const result = out ?? new Float32Array(2 * n);
    if (result.length < 2 * n)
      throw new RangeError(`out holds ${result.length} floats, not ${2 * n}`);
    const h = this.heap;
    const at4 = this.mapOffset;
    const flip = space === "model" && this.flipOutput;
    for (let start = 0; start < n; start += MAP_CHUNK) {
      const count = Math.min(MAP_CHUNK, n - start);
      for (let i2 = 0; i2 < 2 * count; i2++) h[at4 + i2] = points[2 * start + i2];
      if (deformer >= 0) this.mapThrough(deformer, at4, at4, count);
      for (let i2 = 0; i2 < count; i2++) {
        result[2 * (start + i2)] = h[at4 + 2 * i2];
        const y = h[at4 + 2 * i2 + 1];
        result[2 * (start + i2) + 1] = flip ? -y : y;
      }
    }
    return result;
  }
  /**
   * The 2×2 Jacobian of {@link mapPoints} at each point, analytic per region
   * (see `jacobian.ts`): ∂x/∂px, ∂x/∂py, ∂y/∂px, ∂y/∂py per point, in the
   * same space (in "model", the y row is negated with y).
   */
  mapJacobians(deformer, points, space = "model", out) {
    const n = this.mapCount(deformer, points);
    const result = out ?? new Float64Array(4 * n);
    if (result.length < 4 * n)
      throw new RangeError(`out holds ${result.length} values, not ${4 * n}`);
    const plan = deformer >= 0 ? this.plan.deformers[deformer] : null;
    const flip = space === "model" && this.flipOutput;
    for (let i2 = 0; i2 < n; i2++) {
      const o = 4 * i2;
      if (!plan) {
        result[o] = 1;
        result[o + 1] = 0;
        result[o + 2] = 0;
        result[o + 3] = 1;
      } else if (plan.kind === 1)
        rotationJacobian(
          this.rotC[deformer],
          this.rotS[deformer],
          1,
          this.rotMirrorX[deformer] === 1,
          this.rotMirrorY[deformer] === 1,
          result,
          o
        );
      else
        warpJacobian(
          this.heap,
          this.gridOffset[deformer],
          plan.rows,
          plan.columns,
          plan.bilinear,
          points[2 * i2],
          points[2 * i2 + 1],
          result,
          o
        );
      if (flip) {
        result[o + 2] = -result[o + 2];
        result[o + 3] = -result[o + 3];
      }
    }
    return result;
  }
  /** Checks a mapping's arguments; returns the number of points. */
  mapCount(deformer, points) {
    if (!(Number.isInteger(deformer) && deformer >= -1 && deformer < this.plan.deformers.length))
      throw new RangeError(`no deformer ${deformer}`);
    if (points.length % 2 !== 0) throw new RangeError("points must hold x, y pairs");
    return points.length / 2;
  }
  // ------------------------------------------------------------ patches
  /**
   * In-place value patches: new values for elements of the model's keyform
   * positions, opacities, draw orders, colors, rotation values, and glue
   * intensities and weights (blend-shape keyforms included), named by their
   * {@link MocData} array and index (see {@link ValuePatch}). The model's
   * arrays change, so every instance of it sees them at its next evaluation;
   * this one recomputes only the objects they touch, as if it had been built
   * from the patched data. Inactive meshes keep their last vertices until
   * they are active again (C4), as for any change. Throws, and applies
   * nothing, if a patch names an array that cannot be patched or elements
   * outside it.
   */
  patch(patches) {
    const list = "group" in patches ? [patches] : patches;
    const current = this.revision === dataRevision(this.model);
    const e = applyPatches(this.model, list);
    const positions = this.model.positions;
    for (const [a, b] of e.positions) this.heap.set(positions.subarray(a, b), a);
    for (const d of e.deformers) this.deformerPatched[d] = 1;
    for (const i2 of e.meshVertices) this.meshPatched[i2] = 1;
    if (e.glue) this.gluePatched = true;
    this.patched = true;
    if (current) this.revision = dataRevision(this.model);
  }
  // ------------------------------------------------------------ evaluation
  /** Runs the whole pipeline for the current inputs. */
  evaluate() {
    const revision = dataRevision(this.model);
    if (revision !== this.revision) {
      this.heap.set(this.model.positions, 0);
      this.revision = revision;
      this.fullPass = true;
    }
    this.locateBindings();
    this.evaluateParts();
    this.evaluateDeformers();
    this.evaluateMeshes();
    this.applyGlue();
    this.convertOutput();
    this.evaluateOffscreens();
    this.computeRenderOrder();
    this.firstEvaluation = false;
    this.fullPass = false;
    this.evaluations++;
    if (this.patched) {
      this.meshPatched.fill(0);
      this.deformerPatched.fill(0);
      this.gluePatched = false;
      this.patched = false;
    }
  }
  /** §1c.13. */
  computeRenderOrder() {
    this.orderer.compute(this);
  }
  /** §1c.1 + §1c.2 for every parameter binding, then per-band corners and blend-shape locations. */
  locateBindings() {
    const m = this.model;
    const p = m.parameters;
    const ev = this.evalValues;
    for (let i2 = 0; i2 < ev.length; i2++) {
      ev[i2] = evaluationValue(this.parameterValues[i2], p.min[i2], p.max[i2], p.repeat[i2] === 1);
    }
    const li = this.locIndex;
    const lt = this.locT;
    const keys = m.bindings.keys;
    const owner = m.bindings.parameter;
    const eps = m.bindings.epsilon;
    for (let b = 0; b < keys.length; b++) {
      const oor = locateKeyAt(keys[b], ev[owner[b]], li, lt, 0, eps[b]);
      const index = li[0];
      const t = lt[0];
      this.segChanged[b] = index !== this.segIndex[b] || t !== this.segT[b] ? 1 : 0;
      this.segIndex[b] = index;
      this.segT[b] = t;
      this.segOutOfRange[b] = oor ? 1 : 0;
    }
    const K = this.K;
    for (let bi = 0; bi < m.bands.length; bi++) {
      const band = m.bands[bi];
      let base = 0;
      let active = 0;
      let oor = 0;
      let changed = 0;
      for (let j = 0; j < band.bindings.length; j++) {
        const b = band.bindings[j];
        const s = band.strides[j];
        base += this.segIndex[b] * s;
        const t = this.segT[b];
        if (t !== 0) {
          this.bandStride[bi * K + active] = s;
          this.bandT[bi * K + active] = t;
          active++;
        }
        oor |= this.segOutOfRange[b];
        changed |= this.segChanged[b];
      }
      this.bandBase[bi] = base;
      this.bandActive[bi] = active;
      this.bandOutOfRange[bi] = oor;
      this.bandChanged[bi] = changed;
      if (active <= 4 && (changed || this.firstEvaluation || !this.incremental))
        this.cornerTables(bi, active, this.bandW, this.bandO, bi * 16);
    }
    this.frame++;
    const blends = this.plan.blends;
    for (let g = 0; g < blends.length; g++) {
      const bs = blends[g].binding;
      locateBlendKeyAt(bs.keys, ev[bs.parameter], li, lt, 0);
      const index = li[0];
      const t = lt[0];
      this.blendShapeWeight(g);
      const w = this.gv[0];
      const old = this.blendWeight[g];
      const sameWeight = w === old && (w !== 0 || 1 / w === 1 / old);
      this.blendChanged[g] = index !== this.blendIndex[g] || t !== this.blendT[g] || !sameWeight ? 1 : 0;
      this.blendIndex[g] = index;
      this.blendT[g] = t;
      this.blendWeight[g] = w;
      const u = fr(1 - t);
      this.blendWa[g] = u;
      this.blendWb[g] = index === bs.baseKey ? fr(1 - u) : t;
    }
  }
  /**
   * S2's corner weights and keyform offsets of a band into W[at…], O[at…]:
   * for corner c (bit L = the L-th active binding at its upper key), the
   * float32 running product over the active bindings in band order of t or
   * f32(1 − t), starting from 1, and the sum of the strides of the bits set.
   */
  cornerTables(band, active, W, O, at4) {
    const row = band * this.K;
    const n = 1 << active;
    for (let c = 0; c < n; c++) {
      let w = 1;
      let o = 0;
      for (let L = 0; L < active; L++) {
        const t = this.bandT[row + L];
        if (c & 1 << L) {
          w = fr(w * t);
          o += this.bandStride[row + L];
        } else w = fr(w * fr(1 - t));
      }
      W[at4 + c] = w;
      O[at4 + c] = o;
    }
  }
  /** The corner tables of a band with more than 4 active bindings (bigW, bigO), cached per frame. */
  bigTables(band) {
    if (this.bigBand === band && this.bigFrame === this.frame) return;
    const n = 1 << this.bandActive[band];
    if (this.bigW.length < n) {
      this.bigW = new Float32Array(n);
      this.bigO = new Int32Array(n);
    }
    this.cornerTables(band, this.bandActive[band], this.bigW, this.bigO, 0);
    this.bigBand = band;
    this.bigFrame = this.frame;
  }
  /**
   * Weight of a blend-shape binding into gv[0]: min(1, c₁, …, c_m) over its
   * constraints' values, so 1 without constraints; a weight above 1 does not
   * amplify, and a negative one is used as stored (§1c.4 step 3). (Results
   * go to slots rather than return values, which V8 would box
   * when the call is not inlined.)
   */
  blendShapeWeight(g) {
    const constraints = this.plan.blends[g].binding.constraints;
    if (constraints.length === 0) {
      this.gv[0] = 1;
      return;
    }
    let w = 1;
    for (let c = 0; c < constraints.length; c++) {
      const con = constraints[c];
      const u = this.evalValues[con.parameter];
      const ks = con.keys;
      const ws = con.weights;
      let cv;
      if (u <= ks[0]) cv = ws[0];
      else if (u >= ks[ks.length - 1]) cv = ws[ws.length - 1];
      else {
        let i2 = 0;
        while (i2 + 1 < ks.length && !(u < ks[i2 + 1])) i2++;
        const t = fr(fr(u - ks[i2]) / fr(ks[i2 + 1] - ks[i2]));
        cv = fr(fr(fr(1 - t) * ws[i2]) + fr(t * ws[i2 + 1]));
      }
      if (cv < w) w = cv;
    }
    this.gv[0] = w;
  }
  blendsChanged(list) {
    for (let j = 0; j < list.length; j++) if (this.blendChanged[list[j]]) return true;
    return false;
  }
  /**
   * Evaluates the first `count` scalar properties of an object into pv[0…]
   * (§1c.3 interpolation as S2's weighted sum, then §1c.4 blend shapes with
   * S4). Folded properties are copied while exact; a property shared with its
   * predecessor is evaluated once. Property `drawOrderAt` is the object's draw
   * order, which gets the formula of {@link drawOrder}; `target` = the object
   * is the target of at least one blend-shape keyform binding.
   */
  evalProps(props, count, band, blends, drawOrderAt = -1, target2 = false) {
    const pv = this.pv;
    const active = this.bandActive[band];
    for (let p = 0; p < count; p++) {
      const prop = props[p];
      if (p === drawOrderAt) {
        pv[p] = this.drawOrder(prop, band, blends, target2);
        continue;
      }
      if (p > 0 && prop === props[p - 1] && p - 1 !== drawOrderAt) {
        pv[p] = pv[p - 1];
        continue;
      }
      if (prop.constant === prop.constant && active <= prop.foldActive) {
        pv[p] = prop.constant;
        continue;
      }
      this.sumInterp(prop.values, band);
      let r = this.gv[0];
      const slots = prop.blendSlots;
      for (let j = 0; j < slots.length; j++) {
        this.blendStep(blends[slots[j]], prop.blendValues[j]);
        r = fr(r + this.gv[0]);
      }
      pv[p] = r;
    }
  }
  /**
   * One blend-shape contribution f32(w·s) of binding g into gv[0] (§1c.4,
   * S4): s = Q(i) on a key, otherwise f32(f32(wa·Q(i)) + f32(wb·Q(i+1)))
   * (wa = 1 − t and wb = t, but wb = f32(1 − f32(1 − t)) in the segment that
   * starts at the base key, whose value is 0).
   */
  blendStep(g, vals) {
    const i2 = this.blendIndex[g];
    const s = this.blendT[g] === 0 ? vals[i2] : fr(fr(this.blendWa[g] * vals[i2]) + fr(this.blendWb[g] * vals[i2 + 1]));
    this.gv[0] = fr(this.blendWeight[g] * s);
  }
  /**
   * The draw order of an art mesh (§1c.9) or a part (§1c.6):
   * n = trunc(f32(D + 0.001)), D being the weighted sum of its normal
   * keyforms (S2) and trunc toward zero; any object that is not a version-5
   * blend-shape target gets n, which can be negative (version-4 targets are
   * not clamped). A version-5 target adds its blend-shape
   * contributions w·s to n one at a time in binding order,
   * r ← f32(r + f32(w·s)), and gets min(1000, max(0, trunc(f32(r + 0.001)))),
   * even when they are all zero. Assumed, as not settled: the one-at-a-time
   * order for draw orders, and the interpolation rule at the bit level. This value is also the object's key
   * in its draw-order group (§1c.13).
   */
  drawOrder(prop, band, blends, target2) {
    let D;
    if (prop.constant === prop.constant && this.bandActive[band] <= prop.foldActive)
      D = prop.constant;
    else {
      this.sumInterp(prop.values, band);
      D = this.gv[0];
    }
    const n = Math.trunc(fr(D + DRAW_ORDER_TOLERANCE));
    if (!target2 || !this.clampTargets) return n;
    let r = n;
    const slots = prop.blendSlots;
    for (let j = 0; j < slots.length; j++) {
      this.blendStep(blends[slots[j]], prop.blendValues[j]);
      r = fr(r + this.gv[0]);
    }
    return Math.min(TARGET_DRAW_ORDER_MAX, Math.max(0, Math.trunc(fr(r + DRAW_ORDER_TOLERANCE))));
  }
  /**
   * A version-5 blend-shape target's own opacity and colors, pv[at…at+6]
   * (opacity, then multiply and screen r g b when there are colors), clamped
   * to [0, 1] once, after its blend shapes and before anything from a parent
   * NaN stays NaN.
   */
  clampTargetColors(at4, colors) {
    const pv = this.pv;
    pv[at4] = clampTarget(pv[at4], 0, 1);
    if (colors) for (let ch = 1; ch <= 6; ch++) pv[at4 + ch] = clampTarget(pv[at4 + ch], 0, 1);
  }
  /** S2's weighted sum of a scalar property into gv[0]. */
  sumInterp(values, band) {
    const active = this.bandActive[band];
    const base = this.bandBase[band];
    if (active === 0) {
      this.gv[0] = 0 + values[base];
      return;
    }
    let W = this.bandW;
    let O = this.bandO;
    let at4 = band * 16;
    if (active > 4) {
      this.bigTables(band);
      W = this.bigW;
      O = this.bigO;
      at4 = 0;
    }
    if (active === 1) {
      const r2 = fr(0 + fr(W[at4] * values[base]));
      this.gv[0] = fr(r2 + fr(W[at4 + 1] * values[base + O[at4 + 1]]));
      return;
    }
    const n = 1 << active;
    let r = 0;
    for (let c = 0; c < n; c++) r = fr(r + fr(W[at4 + c] * values[base + O[at4 + c]]));
    this.gv[0] = r;
  }
  /**
   * §1c.3 with S2 for a run of `length` floats of keyform positions into
   * heap[dst…]: the weighted sum over the band's corners, four per kernel
   * pass. With every binding on a key it is 0 + Q, a plain copy unless the
   * run holds −0.
   */
  interpPositions(offsets, plain, band, dst, length2) {
    const k = this.k;
    const active = this.bandActive[band];
    const base = this.bandBase[band];
    if (active === 0) {
      if (plain[base]) k.copy(dst, offsets[base], length2);
      else k.sum1(dst, offsets[base], 1, length2);
      return;
    }
    let W = this.bandW;
    let O = this.bandO;
    let at4 = band * 16;
    if (active > 4) {
      this.bigTables(band);
      W = this.bigW;
      O = this.bigO;
      at4 = 0;
    }
    if (active === 1) {
      k.sum2(dst, offsets[base], offsets[base + O[at4 + 1]], W[at4], W[at4 + 1], length2);
      return;
    }
    const n = 1 << active;
    for (let c = 0; c < n; c += 4) {
      const i2 = at4 + c;
      k.sum4(
        dst,
        offsets[base + O[i2]],
        offsets[base + O[i2 + 1]],
        offsets[base + O[i2 + 2]],
        offsets[base + O[i2 + 3]],
        W[i2],
        W[i2 + 1],
        W[i2 + 2],
        W[i2 + 3],
        length2,
        c > 0 ? 1 : 0
      );
    }
  }
  /** Adds positional blend shapes to heap[dst…] (§1c.4, S4: the base keyform reads as zeros). */
  blendPositions(dst, length2, blends) {
    const zero2 = this.zeroOffset;
    for (let j = 0; j < blends.length; j++) {
      const g = blends[j];
      const offsets = this.plan.blends[g].positionOffsets;
      const i2 = this.blendIndex[g];
      const t = this.blendT[g];
      const w = this.blendWeight[g];
      const a = offsets[i2] < 0 ? zero2 : offsets[i2];
      if (t === 0) this.k.blend0(dst, a, w, length2);
      else {
        const b = offsets[i2 + 1] < 0 ? zero2 : offsets[i2 + 1];
        this.k.blend1(dst, a, b, this.blendWa[g], this.blendWb[g], w, length2);
      }
    }
  }
  // ---------------------------------------------------------------- parts
  /** §1c.5 (parts) and §1c.6. */
  evaluateParts() {
    const parts = this.model.parts;
    const plans2 = this.plan.parts;
    for (let p = 0; p < plans2.length; p++) {
      const plan = plans2[p];
      const parent = parts.parent[p];
      this.partActive[p] = parts.enabled[p] && !this.bandOutOfRange[plan.band] && (parent < 0 || this.partActive[parent]) ? 1 : 0;
      this.evalProps(plan.props, 1, plan.band, plan.blends, 0, plan.blends.length > 0);
      this.partDrawOrder[p] = this.pv[0];
    }
  }
  // ------------------------------------------------------------ deformers
  /** §1c.5 (deformers) and §1c.7, skipping deformers whose inputs did not change. */
  evaluateDeformers() {
    const d = this.model.deformers;
    const plans2 = this.plan.deformers;
    const first = this.firstEvaluation || !this.incremental || this.fullPass;
    for (let i2 = 0; i2 < plans2.length; i2++) {
      const plan = plans2[i2];
      const parent = d.parent[i2];
      const part = d.part[i2];
      const band = plan.band;
      this.deformerActive[i2] = d.enabled[i2] && !this.bandOutOfRange[band] && (part < 0 || this.partActive[part]) && (parent < 0 || this.deformerActive[parent]) ? 1 : 0;
      const dirty = first || this.deformerPatched[i2] === 1 || this.bandChanged[band] === 1 || this.blendsChanged(plan.blends) || parent >= 0 && this.deformerDirty[parent] === 1;
      this.deformerDirty[i2] = dirty ? 1 : 0;
      if (!dirty) continue;
      const pv = this.pv;
      this.evalProps(plan.props, plan.kind === 1 ? 11 : 7, band, plan.blends);
      if (this.clampTargets && plan.blends.length > 0) {
        this.clampTargetColors(0, this.hasColors);
        if (plan.kind === 1) {
          pv[7] = clampTarget(pv[7], -TARGET_ANGLE_LIMIT, TARGET_ANGLE_LIMIT);
          pv[10] = clampTarget(pv[10], TARGET_SCALE_MIN, TARGET_SCALE_MAX);
        }
      }
      if (plan.kind === 0) this.evaluateWarp(i2, parent);
      else this.evaluateRotation(i2, parent);
      const opacity = pv[0];
      this.deformerOpacity[i2] = parent >= 0 ? fr(opacity * this.deformerOpacity[parent]) : opacity;
      const base = i2 * 6;
      const acc = this.deformerColors;
      if (this.hasColors) {
        for (let ch = 0; ch < 6; ch++) acc[base + ch] = pv[1 + ch];
        if (parent >= 0) combineColors(acc, base, acc, parent * 6);
      } else {
        acc[base] = 1;
        acc[base + 1] = 1;
        acc[base + 2] = 1;
        acc[base + 3] = 0;
        acc[base + 4] = 0;
        acc[base + 5] = 0;
      }
    }
  }
  evaluateWarp(i2, parent) {
    const plan = this.plan.deformers[i2];
    const band = plan.band;
    const grid = this.gridOffset[i2];
    const length2 = plan.gridLength;
    const base = this.bandBase[band];
    if (parent >= 0 && this.bandActive[band] === 0 && plan.blends.length === 0 && plan.plainRun[base]) {
      this.mapThrough(parent, plan.positionOffsets[base], grid, length2 / 2);
    } else {
      this.interpPositions(plan.positionOffsets, plan.plainRun, band, grid, length2);
      if (plan.blends.length) this.blendPositions(grid, length2, plan.blends);
      if (parent >= 0) this.mapThrough(parent, grid, grid, length2 / 2);
    }
    this.sigma[i2] = parent < 0 ? 1 : this.plan.deformers[parent].kind === 1 ? this.rotScale[parent] : this.sigma[parent];
  }
  evaluateRotation(i2, parent) {
    const plan = this.plan.deformers[i2];
    const band = plan.band;
    const kf = this.model.keyforms;
    const a = this.pv[7];
    const x2 = this.pv[8];
    const y = this.pv[9];
    const s = this.pv[10];
    const cornerKeyform = plan.firstKeyform + this.bandBase[band];
    this.rotMirrorX[i2] = kf.rotationMirrorX[cornerKeyform] === 1 ? 1 : 0;
    this.rotMirrorY[i2] = kf.rotationMirrorY[cornerKeyform] === 1 ? 1 : 0;
    const base = plan.baseAngle;
    let ox, oy, angle, scale2;
    if (parent < 0) {
      ox = x2;
      oy = y;
      angle = fr(a + base);
      scale2 = s;
    } else {
      const rotationParent = this.plan.deformers[parent].kind === 1;
      const h = this.heap;
      const pr = this.probeOffset;
      h[pr] = x2;
      h[pr + 1] = y;
      h[pr + 2] = x2;
      h[pr + 3] = fr(y - (rotationParent ? PROBE_ROTATION : PROBE_WARP));
      this.mapThrough(parent, pr, pr + 4, 2);
      ox = h[pr + 4];
      oy = h[pr + 5];
      angle = probedAngle(a, base, ox, oy, h[pr + 6], h[pr + 7]);
      scale2 = fr(s * (rotationParent ? this.rotScale[parent] : this.sigma[parent]));
    }
    const [c, sn] = rotationCS(angle, scale2);
    this.rotOx[i2] = ox;
    this.rotOy[i2] = oy;
    this.rotAngle[i2] = angle;
    this.rotScale[i2] = scale2;
    this.rotC[i2] = c;
    this.rotS[i2] = sn;
  }
  /** Maps `count` points heap[src…] → heap[dst…] (src = dst allowed) through deformer `def`'s world form. */
  mapThrough(def, src, dst, count) {
    const plan = this.plan.deformers[def];
    if (plan.kind === 1) {
      this.k.rotate(
        src,
        dst,
        count,
        this.rotC[def],
        this.rotS[def],
        1,
        this.rotOx[def],
        this.rotOy[def],
        this.rotMirrorX[def],
        this.rotMirrorY[def]
      );
      return;
    }
    this.k.warp(
      this.gridOffset[def],
      plan.rows,
      plan.columns,
      plan.bilinear ? 1 : 0,
      src,
      dst,
      count,
      this.scratchOffset
    );
  }
  // --------------------------------------------------------------- meshes
  /**
   * §1c.5 (art meshes) and §1c.9. Vertices only for active meshes whose inputs
   * changed (or changed while they were inactive); inactive meshes keep their
   * arrays (C4).
   */
  evaluateMeshes() {
    const me = this.model.meshes;
    const plans2 = this.plan.meshes;
    const first = this.firstEvaluation || !this.incremental || this.fullPass;
    const colors = this.colors;
    for (let i2 = 0; i2 < plans2.length; i2++) {
      const plan = plans2[i2];
      const band = plan.band;
      const part = me.part[i2];
      const def = me.deformer[i2];
      this.drawableActive[i2] = me.enabled[i2] && !this.bandOutOfRange[band] && (part < 0 || this.partActive[part]) && (def < 0 || this.deformerActive[def]) ? 1 : 0;
      const dirty = first || this.meshPatched[i2] === 1 || this.bandChanged[band] === 1 || this.blendsChanged(plan.blends) || def >= 0 && this.deformerDirty[def] === 1;
      const evaluate = this.drawableActive[i2] === 1 && (dirty || this.meshStale[i2] === 1);
      if (!this.drawableActive[i2] && dirty) this.meshStale[i2] = 1;
      this.meshEvaluated[i2] = evaluate ? 1 : 0;
      if (evaluate) {
        this.meshStale[i2] = 0;
        const V = me.vertexCount[i2];
        const local = this.localOffset[i2];
        const base2 = this.bandBase[band];
        if (def >= 0 && this.bandActive[band] === 0 && plan.blends.length === 0 && plan.plainRun[base2]) {
          this.mapThrough(def, plan.positionOffsets[base2], local, V);
        } else {
          this.interpPositions(plan.positionOffsets, plan.plainRun, band, local, 2 * V);
          if (plan.blends.length) this.blendPositions(local, 2 * V, plan.blends);
          if (def >= 0) this.mapThrough(def, local, local, V);
        }
      }
      if (this.drawableActive[i2] === 0) {
        if (plan.blends.length) {
          this.blendPositions(this.outOffset[i2], 2 * me.vertexCount[i2], plan.blends);
          this.drawableVertexVersion[i2]++;
          this.meshStale[i2] = 1;
        }
        this.drawableVisible[i2] = 0;
        continue;
      }
      const pv = this.pv;
      this.evalProps(plan.props, 8, band, plan.blends, 1, plan.blends.length > 0);
      if (this.clampTargets && plan.blends.length > 0) {
        pv[0] = clampTarget(pv[0], 0, 1);
        if (this.hasColors) for (let ch = 2; ch < 8; ch++) pv[ch] = clampTarget(pv[ch], 0, 1);
      }
      let op2 = pv[0];
      if (def >= 0) op2 = fr(op2 * this.deformerOpacity[def]);
      const chain = this.meshPartChain[i2];
      if (chain.length) {
        let acc = this.partOpacities[chain[chain.length - 1]];
        for (let c = chain.length - 2; c >= 0; c--) acc = fr(acc * this.partOpacities[chain[c]]);
        op2 = fr(op2 * acc);
      }
      this.drawableOpacity[i2] = op2;
      this.drawableDrawOrder[i2] = pv[1];
      const base = i2 * 3;
      if (this.hasColors) {
        if (def >= 0) {
          for (let ch = 0; ch < 6; ch++) colors[ch] = pv[2 + ch];
          combineColors(colors, 0, this.deformerColors, def * 6);
          for (let ch = 0; ch < 3; ch++) {
            this.drawableMultiply[base + ch] = clamp01(colors[ch]);
            this.drawableScreen[base + ch] = clamp01(colors[3 + ch]);
          }
        } else
          for (let ch = 0; ch < 3; ch++) {
            this.drawableMultiply[base + ch] = pv[2 + ch];
            this.drawableScreen[base + ch] = pv[5 + ch];
          }
      } else {
        this.drawableMultiply[base] = 1;
        this.drawableMultiply[base + 1] = 1;
        this.drawableMultiply[base + 2] = 1;
        this.drawableScreen[base] = 0;
        this.drawableScreen[base + 1] = 0;
        this.drawableScreen[base + 2] = 0;
      }
      this.drawableVisible[i2] = op2 !== 0 ? 1 : 0;
    }
  }
  /**
   * §1c.10 with C4: glues in file order, pairs applied
   * sequentially, in place on the persistent arrays of all glued meshes,
   * active or not. Active glued meshes start from their fresh positions and
   * are converted to output space afterwards; inactive ones keep their array
   * as it stands (so their glue changes accumulate from call to call).
   */
  applyGlue() {
    const g = this.model.glues;
    const plans2 = this.plan.glues;
    const meshes = this.plan.glueMeshes;
    if (plans2.length === 0 || !this.glueOn) return;
    let run = this.firstEvaluation || !this.incremental || this.fullPass || this.gluePatched;
    for (let k = 0; !run && k < meshes.length; k++) {
      const d = meshes[k];
      if (!this.drawableActive[d] || !this.wasActive[d] || this.meshEvaluated[d]) run = true;
    }
    for (let k = 0; !run && k < plans2.length; k++) {
      if (this.bandChanged[plans2[k].band] || this.blendsChanged(plans2[k].blends)) run = true;
    }
    if (!run) return;
    const vertexCount = this.model.meshes.vertexCount;
    for (let k = 0; k < meshes.length; k++) {
      const d = meshes[k];
      this.drawableVertexVersion[d]++;
      if (this.drawableActive[d])
        this.k.copy(this.outOffset[d], this.localOffset[d], 2 * vertexCount[d]);
    }
    const h = this.heap;
    for (let i2 = 0; i2 < plans2.length; i2++) {
      const plan = plans2[i2];
      this.evalProps(plan.props, 1, plan.band, plan.blends);
      const intensity = this.clampTargets && plan.blends.length > 0 ? clampTarget(this.pv[0], 0, 1) : this.pv[0];
      const A = this.outOffset[g.meshA[i2]];
      const B = this.outOffset[g.meshB[i2]];
      const va = g.vertexA[i2];
      const vb = g.vertexB[i2];
      const wa = g.weightA[i2];
      const wb = g.weightB[i2];
      for (let p = 0; p < va.length; p++) {
        const ia = A + 2 * va[p];
        const ib = B + 2 * vb[p];
        const fa = wa[p];
        const fb = wb[p];
        const ax = h[ia];
        const ay = h[ia + 1];
        const bx = h[ib];
        const by = h[ib + 1];
        h[ia] = fr(ax + fr(fr(fr(bx - ax) * fa) * intensity));
        h[ia + 1] = fr(ay + fr(fr(fr(by - ay) * fa) * intensity));
        h[ib] = fr(bx + fr(fr(fr(ax - bx) * fb) * intensity));
        h[ib + 1] = fr(by + fr(fr(fr(ay - by) * fb) * intensity));
      }
    }
    if (!this.flipOutput) return;
    for (let k = 0; k < meshes.length; k++) {
      const d = meshes[k];
      if (this.drawableActive[d])
        this.k.flipY(this.outOffset[d], this.outOffset[d], 2 * vertexCount[d]);
    }
  }
  /**
   * §1c.11 for the meshes without glue that were evaluated in this call:
   * negate y unless canvas flag bit 0 is set. Arrays of meshes that were not
   * evaluated keep their contents (C4).
   */
  convertOutput() {
    const vertexCount = this.model.meshes.vertexCount;
    for (let i2 = 0; i2 < vertexCount.length; i2++) {
      if (this.isGlued[i2] || !this.meshEvaluated[i2]) continue;
      this.drawableVertexVersion[i2]++;
      const n = 2 * vertexCount[i2];
      if (this.flipOutput) this.k.flipY(this.outOffset[i2], this.localOffset[i2], n);
      else this.k.copy(this.outOffset[i2], this.localOffset[i2], n);
    }
    this.wasActive.set(this.drawableActive);
  }
  /** §1c.14 (opacity and colors; render order is assigned with drawables). */
  evaluateOffscreens() {
    const plans2 = this.plan.offscreens;
    for (let o = 0; o < plans2.length; o++) {
      const plan = plans2[o];
      const pv = this.pv;
      this.evalProps(plan.props, 7, plan.band, plan.blends);
      if (this.clampTargets && plan.blends.length > 0) this.clampTargetColors(0, true);
      let op2 = fr(pv[0] * this.partOpacities[plan.owner]);
      const chain = plan.partChain;
      for (let c = 0; c < chain.length; c++) op2 = fr(op2 * this.partOpacities[chain[c]]);
      this.offscreenOpacity[o] = op2;
      for (let ch = 0; ch < 3; ch++) {
        this.offscreenMultiply[o * 3 + ch] = pv[1 + ch];
        this.offscreenScreen[o * 3 + ch] = pv[4 + ch];
      }
    }
  }
};
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function combineColors(colors, cBase, acc, pBase) {
  for (let ch = 0; ch < 3; ch++) {
    colors[cBase + ch] = fr(colors[cBase + ch] * acc[pBase + ch]);
    const s = colors[cBase + 3 + ch];
    const ps = acc[pBase + 3 + ch];
    colors[cBase + 3 + ch] = fr(fr(s + ps) - fr(s * ps));
  }
}

// src/core/moc/from-data.ts
var f323 = Math.fround;
function sectionsFromData(data, version) {
  const { diagnostics, encodable } = checkMocDataShape(data, version);
  if (!encodable) throw new MocWriteError(diagnostics);
  const fields = /* @__PURE__ */ new Map();
  const copy = (v) => v === void 0 ? null : v.slice();
  for (const f of FIELDS) {
    if (f.since > version) continue;
    if (f.type === "placeholder") fields.set(f.key, null);
    else fields.set(f.key, copy(encodable.values.get(f.key)));
  }
  const c = data.canvas;
  return {
    version,
    bigEndian: false,
    byteLength: 0,
    counts: encodable.counts ?? new Int32Array(countTableLength(version)),
    canvas: {
      pixelsPerUnit: f323(c.pixelsPerUnit),
      originX: f323(c.originX),
      originY: f323(c.originY),
      width: f323(c.width),
      height: f323(c.height),
      flags: c.flags
    },
    fields,
    issues: []
  };
}
function mocModelFromData(data, version, options = {}) {
  const sections = sectionsFromData(data, version);
  const report = new Report(false);
  checkStructure(data, version, report);
  if (report.errors) throw new MocWriteError(report.list);
  return buildModel(sections, options);
}

// src/anim/values.ts
function wrapValue(x2, lo, hi) {
  const L = hi - lo;
  const m = (d) => d - Math.floor(d / L) * L;
  if (x2 > hi) {
    const d = x2 - hi;
    return !Number.isFinite(d) || L === 0 ? hi : lo + m(d);
  }
  if (x2 < lo) {
    const d = lo - x2;
    return !Number.isFinite(d) || L === 0 ? lo : hi - m(d);
  }
  return x2;
}
var AnimationValues = class {
  ids;
  /** Current parameter values (float32). */
  values;
  /** Saved parameter values (3j steps 1 and 3). */
  saved;
  min;
  max;
  repeat;
  /** Free values (3g.3). */
  free = /* @__PURE__ */ new Map();
  /** Wrap mode (3g.2), off by default. */
  wrap = false;
  partIds;
  partOpacities;
  /** Opacities of part IDs that are not in the model (used only by poses). */
  freePartOpacities = /* @__PURE__ */ new Map();
  /** Model opacity (3g.5). */
  modelOpacity = 1;
  indexById = /* @__PURE__ */ new Map();
  partIndexById = /* @__PURE__ */ new Map();
  constructor(model) {
    const p = model.parameters;
    this.ids = p.ids;
    this.values = Float32Array.from(p.defaults);
    this.saved = Float32Array.from(p.defaults);
    this.min = Float32Array.from(p.min);
    this.max = Float32Array.from(p.max);
    this.repeat = Uint8Array.from(p.repeat);
    p.ids.forEach((id, i2) => this.indexById.has(id) || this.indexById.set(id, i2));
    this.partIds = model.parts.ids;
    this.partOpacities = Float32Array.from(model.parts.initialOpacity);
    model.parts.ids.forEach((id, i2) => this.partIndexById.has(id) || this.partIndexById.set(id, i2));
  }
  /** Index of the parameter with this ID, or −1. */
  index(id) {
    return this.indexById.get(id) ?? -1;
  }
  partIndex(id) {
    return this.partIndexById.get(id) ?? -1;
  }
  /** The value of an ID: its parameter value, or its free value (0 if never written). */
  get(id) {
    const i2 = this.indexById.get(id);
    return i2 === void 0 ? this.free.get(id) ?? 0 : this.values[i2];
  }
  /** Limits (or, in wrap mode for repeating parameters, wraps) x to parameter i's range. */
  limit(i2, x2) {
    const lo = this.min[i2];
    const hi = this.max[i2];
    if (this.wrap && this.repeat[i2]) return wrapValue(x2, lo, hi);
    return Math.min(Math.max(x2, lo), hi);
  }
  /** 3g.1: set parameter i to x with weight w. */
  setAt(i2, x2, w = 1) {
    const lim = this.limit(i2, x2);
    this.values[i2] = w === 1 ? lim : this.values[i2] * (1 - w) + lim * w;
  }
  /** Sets an ID: a parameter by 3g.1, otherwise its free value (no limit, double). */
  set(id, x2, w = 1) {
    const i2 = this.indexById.get(id);
    if (i2 !== void 0) {
      this.setAt(i2, x2, w);
      return;
    }
    const c = this.free.get(id) ?? 0;
    this.free.set(id, w === 1 ? x2 : c * (1 - w) + x2 * w);
  }
  /** Adds x with weight w: sets v + x·w. */
  add(id, x2, w = 1) {
    this.set(id, this.get(id) + x2 * w);
  }
  addAt(i2, x2, w = 1) {
    this.setAt(i2, this.values[i2] + x2 * w);
  }
  /** Multiplies by x with weight w: sets v·(1 + (x − 1)·w). */
  multiply(id, x2, w = 1) {
    this.set(id, this.get(id) * (1 + (x2 - 1) * w));
  }
  /** 3j step 1: every model parameter takes its saved value. */
  restore() {
    this.values.set(this.saved);
  }
  /** 3j step 3: the saved values become the current ones. */
  save() {
    this.saved.set(this.values);
  }
  /** The opacity of a part, or of a free part entry (1 if never written). */
  partOpacity(id) {
    const i2 = this.partIndexById.get(id);
    return i2 === void 0 ? this.freePartOpacities.get(id) ?? 1 : this.partOpacities[i2];
  }
  setPartOpacity(id, v) {
    const i2 = this.partIndexById.get(id);
    if (i2 === void 0) this.freePartOpacities.set(id, Math.fround(v));
    else this.partOpacities[i2] = v;
  }
};

// src/anim/json.ts
var AnimationFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AnimationFormatError";
  }
};
function parseJson(input, label) {
  let text = typeof input === "string" ? input : decodeUtf8(input);
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new AnimationFormatError(`${label}: invalid JSON (${e.message})`);
  }
}
var isObject2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var obj = (v) => isObject2(v) ? v : {};
var arr = (v) => Array.isArray(v) ? v : [];
var num2 = (v, fallback) => typeof v === "number" ? v : fallback;
var optNum = (v) => typeof v === "number" ? v : void 0;
var str2 = (v, fallback = "") => typeof v === "string" ? v : fallback;
var bool = (v, fallback = false) => typeof v === "boolean" ? v : fallback;

// src/anim/motion.ts
var LINEAR = 0;
var BEZIER = 1;
var STEPPED = 2;
var INVERSE_STEPPED = 3;
var RANK = { Model: 0, Parameter: 1, PartOpacity: 2 };
function parseMotion(input, label = "motion") {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  const meta = obj(json.Meta);
  const fade = (v) => {
    const x2 = optNum(v);
    return x2 === void 0 || x2 < 0 ? 1 : x2;
  };
  const rawCurves = arr(json.Curves);
  const writtenCurves = rawCurves.map((c) => {
    const cc = obj(c);
    return {
      ..."FadeInTime" in cc ? { fadeIn: cc.FadeInTime } : {},
      ..."FadeOutTime" in cc ? { fadeOut: cc.FadeOutTime } : {}
    };
  });
  let segments = 0;
  let pointCount = 0;
  const parsed = [];
  rawCurves.forEach((c, k) => {
    const cc = obj(c);
    const s = arr(cc.Segments);
    const values = [];
    const kinds = [];
    const starts = [];
    for (const v of s) {
      if (typeof v !== "number")
        throw new AnimationFormatError(`${label}: curve ${k}: non-numeric segment data`);
    }
    const n = s;
    if (n.length < 2) throw new AnimationFormatError(`${label}: curve ${k}: no first point`);
    values.push(n[0], n[1]);
    let i2 = 2;
    while (i2 < n.length) {
      const code = n[i2];
      const first = values.length / 2 - 1;
      const need = code === BEZIER ? 6 : 2;
      if (code !== LINEAR && code !== BEZIER && code !== STEPPED && code !== INVERSE_STEPPED)
        throw new AnimationFormatError(`${label}: curve ${k}: unknown segment code ${code}`);
      if (i2 + need > n.length - 1)
        throw new AnimationFormatError(`${label}: curve ${k}: truncated segment`);
      for (let j = 1; j <= need; j++) values.push(n[i2 + j]);
      kinds.push(code);
      starts.push(first);
      i2 += need + 1;
    }
    segments += kinds.length;
    pointCount += values.length / 2;
    const fadeIn = optNum(cc.FadeInTime);
    const fadeOut = optNum(cc.FadeOutTime);
    parsed.push({
      target: str2(cc.Target),
      id: str2(cc.Id),
      fadeIn,
      fadeOut,
      points: Float64Array.from(values),
      kinds: Uint8Array.from(kinds),
      starts: Uint32Array.from(starts)
    });
  });
  const check2 = (key, actual) => {
    const declared = num2(meta[key], 0);
    if (declared !== actual)
      throw new AnimationFormatError(
        `${label}: Meta.${key} is ${declared}, but the file has ${actual}`
      );
  };
  check2("CurveCount", rawCurves.length);
  check2("TotalSegmentCount", segments);
  check2("TotalPointCount", pointCount);
  const curves = [];
  let rank = 0;
  for (const c of parsed) {
    const r = RANK[c.target];
    if (r === void 0 || r < rank) break;
    rank = r;
    curves.push(c);
  }
  const events = arr(json.UserData).map((e) => {
    const ee = obj(e);
    return { time: num2(ee.Time, 0), value: str2(ee.Value) };
  });
  return {
    label,
    duration: num2(meta.Duration, 0),
    fps: num2(meta.Fps, 0),
    restricted: bool(meta.AreBeziersRestricted),
    loop: bool(meta.Loop),
    fadeIn: fade(meta.FadeInTime),
    fadeOut: fade(meta.FadeOutTime),
    written: {
      meta: JSON.parse(JSON.stringify(meta)),
      curves: writtenCurves
    },
    curves,
    ignoredCurves: parsed.length - curves.length,
    events
  };
}
var EPS = 1e-5;
function solveBezierParameter(t0, t1, t2, t3, tau) {
  const a3 = t3 - 3 * t2 + 3 * t1 - t0;
  const a2 = 3 * t2 - 6 * t1 + 3 * t0;
  const a1 = 3 * t1 - 3 * t0;
  const a0 = t0 - tau;
  let s;
  if (Math.abs(a3) < EPS) {
    if (Math.abs(a2) < EPS) s = Math.abs(a1) < EPS ? -a0 : -a0 / a1;
    else s = -(a1 + Math.sqrt(a1 * a1 - 4 * a2 * a0)) / (2 * a2);
  } else {
    const b = a2 / a3;
    const c = a1 / a3;
    const d = a0 / a3;
    const p = (3 * c - b * b) / 3;
    const q2 = (2 * b * b * b - 9 * b * c + 27 * d) / 27;
    const D = q2 / 2 * (q2 / 2) + p / 3 * (p / 3) * (p / 3);
    const near = (x2) => Math.abs(x2 - 0.5) < 0.51;
    if (D < 0) {
      const m = -p / 3;
      const r = Math.sqrt(m * m * m);
      const phi = Math.acos(Math.min(Math.max(-q2 / (2 * r), -1), 1));
      const k = 2 * Math.cbrt(r);
      const cand = (j) => k * Math.cos((phi + 2 * Math.PI * j) / 3) - b / 3;
      const s0 = cand(0);
      if (near(s0)) s = s0;
      else {
        const s1 = cand(1);
        s = near(s1) ? s1 : cand(2);
      }
    } else if (D === 0) {
      const u = Math.cbrt(-q2 / 2);
      const first = 2 * u - b / 3;
      s = near(first) ? first : -u - b / 3;
    } else {
      const root = Math.sqrt(D);
      s = Math.cbrt(root - q2 / 2) - Math.cbrt(root + q2 / 2) - b / 3;
    }
  }
  return Math.min(Math.max(s, 0), 1);
}
function evaluateCurve(curve, tau, restricted, loopLength) {
  const p = curve.points;
  const kinds = curve.kinds;
  const starts = curve.starts;
  for (let k = 0; k < kinds.length; k++) {
    const kind2 = kinds[k];
    const i2 = starts[k];
    const end = kind2 === BEZIER ? i2 + 3 : i2 + 1;
    if (!(p[2 * end] > tau)) continue;
    const t0 = p[2 * i2];
    const v0 = p[2 * i2 + 1];
    switch (kind2) {
      case LINEAR: {
        const t1 = p[2 * end];
        const v1 = p[2 * end + 1];
        const s = Math.max(0, (tau - t0) / (t1 - t0));
        return v0 + (v1 - v0) * s;
      }
      case STEPPED:
        return v0;
      case INVERSE_STEPPED:
        return p[2 * end + 1];
      default: {
        const t1 = p[2 * i2 + 2];
        const v1 = p[2 * i2 + 3];
        const t2 = p[2 * i2 + 4];
        const v2 = p[2 * i2 + 5];
        const t3 = p[2 * i2 + 6];
        const v3 = p[2 * i2 + 7];
        const s = restricted ? Math.max(0, (tau - t0) / (t3 - t0)) : solveBezierParameter(t0, t1, t2, t3, tau);
        const lerp = (a, b) => a + (b - a) * s;
        const q1 = lerp(v0, v1);
        const q2 = lerp(v1, v2);
        const q3 = lerp(v2, v3);
        const r1 = lerp(q1, q2);
        const r2 = lerp(q2, q3);
        return lerp(r1, r2);
      }
    }
  }
  const last = p.length / 2 - 1;
  const tLast = p[2 * last];
  const vLast = p[2 * last + 1];
  if (loopLength !== void 0 && kinds.length > 0 && tau < loopLength) {
    const vFirst = p[1];
    const kind2 = kinds[kinds.length - 1];
    if (kind2 === STEPPED) return vLast;
    if (kind2 === INVERSE_STEPPED) return vFirst;
    const s = Math.max(0, (tau - tLast) / (loopLength - tLast));
    return vLast + (vFirst - vLast) * s;
  }
  return vLast;
}

// src/anim/motion-queue.ts
function ease(x2) {
  if (x2 < 0) return 0;
  if (x2 > 1) return 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * x2);
}
var MotionQueue = class {
  /** The queue clock T. */
  time = 0;
  /** The current priority p_c (3l.4). */
  currentPriority = 0;
  /** The number of the latest accepted start (1, 2, …; 0 before any). */
  lastTicket = 0;
  /**
   * Idle weights (not reference behavior): for a parameter ID, how far
   * motions started at the idle priority (1) move it, in [0, 1]. A motion
   * that would move it by w of the way to its curve value moves it by w·k.
   * At 0 they leave it untouched. IDs not listed weigh 1, as without
   * weights. Other motions are not affected.
   */
  idleWeights = /* @__PURE__ */ new Map();
  entries = [];
  ended = [];
  blink;
  lip;
  blinkSet;
  lipSet;
  constructor(groups) {
    this.blink = groups.eyeBlink.slice(0, 64);
    this.lip = groups.lipSync.slice(0, 64);
    this.blinkSet = new Set(this.blink);
    this.lipSet = new Set(this.lip);
  }
  get empty() {
    return this.entries.length === 0;
  }
  /**
   * Whether eye blink may run in a frame that advanced the queue: the queue
   * still holds motions, every one of them is held at its end, and none was
   * started with `blinkWhileHeld` false. False when the queue is empty: the
   * frame in which the last motion ended keeps eye blink off (3j).
   */
  get blinkAllowed() {
    return this.entries.length > 0 && this.entries.every((e) => e.holding && e.blinkWhileHeld);
  }
  get size() {
    return this.entries.length;
  }
  /** Motions in the queue, oldest first. */
  get motions() {
    return this.entries.map((e) => e.motion);
  }
  /** Whether a start with this priority would be accepted (3l.4). */
  accepts(priority = 2) {
    return priority === 3 || priority > this.currentPriority;
  }
  /**
   * Starts a motion (3l.4): accepted when the priority is 3 or above the
   * current one. `motion` null stands for a file that failed validation: the
   * start is then dropped. Returns whether the motion was enqueued.
   */
  start(motion, opts = {}) {
    const priority = opts.priority ?? 2;
    if (!this.accepts(priority) || !motion) return false;
    this.currentPriority = priority;
    for (const e of this.entries) e.fadeOutRequested = true;
    const pick = (o, file) => o !== void 0 && o >= 0 ? o : file;
    const curves = (t) => motion.curves.filter((c) => c.target === t);
    const parameters = curves("Parameter");
    this.entries.push({
      ticket: ++this.lastTicket,
      motion,
      idle: priority === 1,
      hold: (opts.hold ?? false) && !(opts.loop ?? false),
      holding: false,
      blinkWhileHeld: opts.blinkWhileHeld ?? true,
      ended: false,
      fadeIn: pick(opts.fadeIn, motion.fadeIn),
      fadeOut: pick(opts.fadeOut, motion.fadeOut),
      weight: opts.weight ?? 1,
      offset: opts.offset ?? 0,
      loop: opts.loop ?? false,
      loopFadeIn: opts.loopFadeIn ?? true,
      legacy: opts.legacyLoop ?? false,
      started: false,
      s: 0,
      f: 0,
      e: null,
      fadeOutRequested: false,
      tPrev: 0,
      model: curves("Model"),
      parameters,
      partOpacities: curves("PartOpacity"),
      parameterIds: new Set(parameters.map((c) => c.id))
    });
    return true;
  }
  /**
   * The fade-out time of the motion started as `ticket`, once another start
   * has asked it to fade out; null while it plays on, or when it is gone.
   */
  fadeOutOf(ticket) {
    const en = this.entries.find((e) => e.ticket === ticket);
    return en && en.fadeOutRequested && !en.ended ? en.fadeOut : null;
  }
  /** Empties the queue. */
  stopAll() {
    for (const en of this.entries) this.end(en, "stopped");
    this.entries = [];
  }
  /** The ends recorded since the last call, oldest first. */
  takeEnds() {
    if (this.ended.length === 0) return [];
    const r = this.ended;
    this.ended = [];
    return r;
  }
  end(en, reason) {
    if (en.ended) return;
    en.ended = true;
    this.ended.push({ ticket: en.ticket, motion: en.motion, reason });
  }
  /** 3l.3: advances the queue by Δ, writing into `values`; returns the events fired. */
  advance(dt, values) {
    this.time += dt;
    const T = this.time;
    const events = [];
    const kept = [];
    for (const en of this.entries) {
      const m = en.motion;
      if (!en.started) {
        en.started = true;
        en.s = T - en.offset;
        en.f = T;
        en.e = en.loop || en.hold || m.duration <= 0 ? null : en.s + m.duration;
      }
      const aIn = en.fadeIn === 0 ? 1 : ease((T - en.f) / en.fadeIn);
      const aOut = en.fadeOut === 0 || en.e === null ? 1 : ease((en.e - T) / en.fadeOut);
      const w = en.weight * aIn * aOut;
      let tau = Math.max(0, T - en.s);
      let L;
      if (en.loop) {
        L = en.legacy ? m.duration : m.duration + 1 / m.fps;
        if (L > 0) while (tau > L) tau -= L;
      } else {
        L = m.duration;
        if (en.hold && tau > L) tau = Math.max(0, L);
      }
      const endInterval = en.loop && !en.legacy ? L : void 0;
      const value = (c) => evaluateCurve(c, tau, m.restricted, endInterval);
      let b;
      let l;
      for (const c of en.model) {
        if (c.id === "EyeBlink") b = value(c);
        else if (c.id === "LipSync") l = value(c);
        else if (c.id === "Opacity") values.modelOpacity = value(c);
      }
      const weights = en.idle && this.idleWeights.size > 0 ? this.idleWeights : null;
      for (const c of en.parameters) {
        const k = weights?.get(c.id);
        if (k === 0) continue;
        const cur = values.get(c.id);
        let x2 = value(c);
        if (b !== void 0 && this.blinkSet.has(c.id)) x2 = x2 * b;
        if (l !== void 0 && this.lipSet.has(c.id)) x2 = x2 + l;
        if (values.wrap) {
          const i2 = values.index(c.id);
          if (i2 >= 0 && values.repeat[i2]) x2 = wrapValue(x2, values.min[i2], values.max[i2]);
        }
        let w2 = w;
        if (c.fadeIn !== void 0 || c.fadeOut !== void 0) {
          const bIn = c.fadeIn === void 0 ? aIn : c.fadeIn === 0 ? 1 : ease((T - en.f) / c.fadeIn);
          const bOut = c.fadeOut === void 0 ? aOut : c.fadeOut === 0 || en.e === null ? 1 : ease((en.e - T) / c.fadeOut);
          w2 = en.weight * bIn * bOut;
        }
        values.set(c.id, cur + (x2 - cur) * (k === void 0 ? w2 : w2 * k));
      }
      if (b !== void 0) {
        for (const id of this.blink)
          if (!en.parameterIds.has(id)) {
            const k = weights?.get(id);
            if (k === 0) continue;
            const cur = values.get(id);
            values.set(id, cur + (b - cur) * (k === void 0 ? w : w * k));
          }
      }
      if (l !== void 0) {
        for (const id of this.lip)
          if (!en.parameterIds.has(id)) {
            const k = weights?.get(id);
            if (k === 0) continue;
            const cur = values.get(id);
            values.set(id, cur + (l - cur) * (k === void 0 ? w : w * k));
          }
      }
      for (const c of en.partOpacities) values.set(c.id, value(c));
      let finished = false;
      if (T - en.s >= L) {
        if (en.loop) {
          const start = en.legacy ? T : T - tau;
          en.s = start;
          if (en.loopFadeIn) en.f = start;
        } else if (en.hold && !en.fadeOutRequested) {
          en.holding = true;
          this.end(en, "finished");
        } else {
          finished = true;
        }
      }
      if (en.e !== null && en.e < T) finished = true;
      for (const ev of m.events)
        if (en.tPrev - en.s < ev.time && ev.time <= T - en.s) events.push(ev.value);
      en.tPrev = T;
      if (finished) {
        this.end(en, en.fadeOutRequested ? "replaced" : "finished");
        continue;
      }
      if (en.fadeOutRequested) {
        const end = T + en.fadeOut;
        if (!(en.e !== null && en.e <= end)) en.e = end;
      }
      kept.push(en);
    }
    this.entries = kept;
    if (kept.every((en) => en.holding)) this.currentPriority = 0;
    return events;
  }
};

// src/anim/expression.ts
function parseExpression(input, label = "expression") {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  return {
    label,
    // Any number is accepted, a negative fade-in included (3d).
    fadeIn: optNum(json.FadeInTime) ?? 1,
    fadeOut: optNum(json.FadeOutTime) ?? 1,
    parameters: arr(json.Parameters).map((p) => {
      const pp = obj(p);
      const blend = str2(pp.Blend);
      return {
        id: str2(pp.Id),
        value: num2(pp.Value, 0),
        blend: blend === "Multiply" || blend === "Overwrite" ? blend : "Add"
      };
    })
  };
}
var ExpressionQueue = class {
  /** The queue clock T_x. */
  time = 0;
  entries = [];
  tracked = [];
  trackedIds = /* @__PURE__ */ new Set();
  get empty() {
    return this.entries.length === 0;
  }
  /** Expressions in the queue, oldest first. */
  get expressions() {
    return this.entries.map((e) => e.expression);
  }
  /** 3m.1: older entries are asked to fade out; the new one is appended. */
  start(expression) {
    for (const e of this.entries) e.fadeOutRequested = true;
    const byId = /* @__PURE__ */ new Map();
    for (const p of expression.parameters)
      if (!byId.has(p.id)) byId.set(p.id, { value: p.value, blend: p.blend });
    this.entries.push({ expression, byId, started: false, f: 0, e: null, fadeOutRequested: false });
  }
  /** 3m.3: advances the queue by Δ and writes the tracked values. */
  advance(dt, values) {
    this.time += dt;
    const T = this.time;
    let S = 0;
    let newestWeight = 0;
    this.entries.forEach((en, k) => {
      for (const id of en.byId.keys())
        if (!this.trackedIds.has(id)) {
          this.trackedIds.add(id);
          this.tracked.push({ id, A: 0, M: 1, O: 0 });
        }
      if (!en.started) {
        en.started = true;
        en.f = T;
        en.e = null;
      }
      const ex = en.expression;
      const aIn = ex.fadeIn === 0 ? 1 : ease((T - en.f) / ex.fadeIn);
      const aOut = en.e === null || ex.fadeOut === 0 ? 1 : ease((en.e - T) / ex.fadeOut);
      const w = aIn * aOut;
      newestWeight = w;
      for (const t of this.tracked) {
        const c = values.get(t.id);
        t.O = c;
        const p = en.byId.get(t.id);
        let a = 0;
        let m = 1;
        let o = c;
        if (p?.blend === "Add") a = p.value;
        else if (p?.blend === "Multiply") m = p.value;
        else if (p?.blend === "Overwrite") o = p.value;
        if (k === 0) {
          t.A = a;
          t.M = m;
          t.O = o;
        } else {
          t.A = t.A * (1 - w) + a * w;
          t.M = t.M * (1 - w) + m * w;
          t.O = t.O * (1 - w) + o * w;
        }
      }
      S += aIn;
      if (en.fadeOutRequested) {
        const end = T + ex.fadeOut;
        if (!(en.e !== null && en.e <= end)) en.e = end;
      }
    });
    if (this.entries.length >= 2 && newestWeight >= 1)
      this.entries = this.entries.slice(this.entries.length - 1);
    S = Math.min(S, 1);
    for (const t of this.tracked) {
      values.set(t.id, (t.O + t.A) * t.M, S);
      t.A = 0;
      t.M = 1;
    }
  }
};
var ExpressionLayers = class {
  /** The layer clock. */
  time = 0;
  layers = [];
  get empty() {
    return this.layers.length === 0;
  }
  /** The layers that are not fading out, oldest first. */
  get active() {
    return this.layers.filter((l) => l.e === null).map((l) => l.expression);
  }
  /** Every layer, fading out ones included, oldest first. */
  get all() {
    return this.layers.map((l) => l.expression);
  }
  /**
   * Adds an expression (its label identifies it). Returns false, changing
   * nothing, when an active layer has the same label; one that is fading out
   * keeps fading out, and the new layer fades in.
   */
  add(expression) {
    if (this.layers.some((l) => l.e === null && l.expression.label === expression.label))
      return false;
    const byId = /* @__PURE__ */ new Map();
    for (const p of expression.parameters)
      if (!byId.has(p.id)) byId.set(p.id, { value: p.value, blend: p.blend });
    this.layers.push({ expression, byId, f: null, e: null, out: expression.fadeOut });
    return true;
  }
  /**
   * Fades out the active layers with this label (all of them for null), over
   * `fadeOut` seconds or each expression's own; returns how many.
   */
  remove(label, fadeOut) {
    let n = 0;
    for (const l of this.layers)
      if (l.e === null && (label === null || l.expression.label === label)) {
        l.out = fadeOut ?? l.expression.fadeOut;
        l.e = l.f === null ? -Infinity : this.time + l.out;
        n++;
      }
    return n;
  }
  /** Removes every layer at once. */
  clear() {
    this.layers = [];
  }
  /** Advances the layer clock by Δ and applies the layers. */
  advance(dt, values) {
    if (this.layers.length === 0) return;
    this.time += dt;
    const T = this.time;
    const kept = [];
    for (const l of this.layers) {
      const ex = l.expression;
      if (l.f === null) l.f = T;
      if (l.e !== null && l.e <= T) continue;
      const aIn = ex.fadeIn === 0 ? 1 : ease((T - l.f) / ex.fadeIn);
      const aOut = l.e === null || l.out === 0 ? 1 : ease((l.e - T) / l.out);
      const w = aIn * aOut;
      for (const [id, p] of l.byId) {
        const v = values.get(id);
        if (p.blend === "Add") values.set(id, v + w * p.value);
        else if (p.blend === "Multiply") values.set(id, v * (1 + w * (p.value - 1)));
        else values.set(id, v + w * (p.value - v));
      }
      kept.push(l);
    }
    this.layers = kept;
  }
};

// src/anim/physics.ts
var kind = (v) => v === "X" || v === "Y" ? v : v === "Angle" ? "Angle" : "X";
function parsePhysics(input, label = "physics") {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  const meta = obj(json.Meta);
  const norm = (v) => {
    const o = obj(v);
    return { minimum: num2(o.Minimum, 0), default: num2(o.Default, 0), maximum: num2(o.Maximum, 0) };
  };
  const settings = arr(json.PhysicsSettings).map((s) => {
    const ss = obj(s);
    const n = obj(ss.Normalization);
    return {
      id: str2(ss.Id),
      inputs: arr(ss.Input).map((i2) => {
        const ii = obj(i2);
        return {
          source: str2(obj(ii.Source).Id),
          weight: num2(ii.Weight, 0),
          type: kind(ii.Type),
          reflect: bool(ii.Reflect)
        };
      }),
      outputs: arr(ss.Output).map((o) => {
        const oo = obj(o);
        return {
          destination: str2(obj(oo.Destination).Id),
          vertexIndex: num2(oo.VertexIndex, 0),
          scale: num2(oo.Scale, 0),
          weight: num2(oo.Weight, 0),
          type: kind(oo.Type),
          reflect: bool(oo.Reflect)
        };
      }),
      particles: arr(ss.Vertices).map((v) => {
        const vv = obj(v);
        const p = obj(vv.Position);
        return {
          x: num2(p.X, 0),
          y: num2(p.Y, 0),
          mobility: num2(vv.Mobility, 0),
          delay: num2(vv.Delay, 0),
          acceleration: num2(vv.Acceleration, 0),
          radius: num2(vv.Radius, 0)
        };
      }),
      position: norm(n.Position),
      angle: norm(n.Angle)
    };
  });
  const totals = [
    ["PhysicsSettingCount", settings.length],
    ["TotalInputCount", settings.reduce((a, s) => a + s.inputs.length, 0)],
    ["TotalOutputCount", settings.reduce((a, s) => a + s.outputs.length, 0)],
    ["VertexCount", settings.reduce((a, s) => a + s.particles.length, 0)]
  ];
  for (const [key, actual] of totals) {
    const declared = num2(meta[key], NaN);
    if (declared !== actual)
      throw new AnimationFormatError(
        `${label}: Meta.${key} is ${meta[key]}, but the file has ${actual}`
      );
  }
  const forces = isObject2(meta.EffectiveForces) ? meta.EffectiveForces : null;
  const vec2 = (v) => {
    const o = obj(v);
    return { x: num2(o.X, 0), y: num2(o.Y, 0) };
  };
  return {
    label,
    fps: num2(meta.Fps, 0),
    settings,
    names: arr(meta.PhysicsDictionary).map((d) => ({ id: str2(obj(d).Id), name: str2(obj(d).Name) })),
    effectiveForces: forces ? { gravity: vec2(forces.Gravity), wind: vec2(forces.Wind) } : null
  };
}
function writePhysics(file, options = {}) {
  const n = (v, where) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new RangeError(`writePhysics: ${where} is ${v}, not a finite number`);
    return v;
  };
  const t = (v, where) => {
    if (v !== "X" && v !== "Y" && v !== "Angle")
      throw new RangeError(`writePhysics: ${where} is ${JSON.stringify(v)}, not X, Y or Angle`);
    return v;
  };
  const xy = (v, where) => ({
    X: n(v.x, `${where}.x`),
    Y: n(v.y, `${where}.y`)
  });
  const range = (v, where) => ({
    Minimum: n(v.minimum, `${where}.minimum`),
    Default: n(v.default, `${where}.default`),
    Maximum: n(v.maximum, `${where}.maximum`)
  });
  const forces = file.effectiveForces ?? { gravity: { x: 0, y: -1 }, wind: { x: 0, y: 0 } };
  const json = {
    Version: 3,
    Meta: {
      PhysicsSettingCount: file.settings.length,
      TotalInputCount: file.settings.reduce((a, s) => a + s.inputs.length, 0),
      TotalOutputCount: file.settings.reduce((a, s) => a + s.outputs.length, 0),
      VertexCount: file.settings.reduce((a, s) => a + s.particles.length, 0),
      Fps: n(file.fps, "fps"),
      EffectiveForces: {
        Gravity: xy(forces.gravity, "effectiveForces.gravity"),
        Wind: xy(forces.wind, "effectiveForces.wind")
      },
      PhysicsDictionary: file.names.map((d) => ({ Id: d.id, Name: d.name }))
    },
    PhysicsSettings: file.settings.map((s, i2) => {
      const at4 = `settings[${i2}]`;
      return {
        Id: s.id,
        Input: s.inputs.map((x2, k) => ({
          Source: { Target: "Parameter", Id: x2.source },
          Weight: n(x2.weight, `${at4}.inputs[${k}].weight`),
          Type: t(x2.type, `${at4}.inputs[${k}].type`),
          Reflect: x2.reflect === true
        })),
        Output: s.outputs.map((o, k) => ({
          Destination: { Target: "Parameter", Id: o.destination },
          VertexIndex: n(o.vertexIndex, `${at4}.outputs[${k}].vertexIndex`),
          Scale: n(o.scale, `${at4}.outputs[${k}].scale`),
          Weight: n(o.weight, `${at4}.outputs[${k}].weight`),
          Type: t(o.type, `${at4}.outputs[${k}].type`),
          Reflect: o.reflect === true
        })),
        Vertices: s.particles.map((p, k) => ({
          Position: xy(p, `${at4}.particles[${k}]`),
          Mobility: n(p.mobility, `${at4}.particles[${k}].mobility`),
          Delay: n(p.delay, `${at4}.particles[${k}].delay`),
          Acceleration: n(p.acceleration, `${at4}.particles[${k}].acceleration`),
          Radius: n(p.radius, `${at4}.particles[${k}].radius`)
        })),
        Normalization: {
          Position: range(s.position, `${at4}.position`),
          Angle: range(s.angle, `${at4}.angle`)
        }
      };
    })
  };
  return JSON.stringify(json, null, options.indent ?? "	");
}
function angleBetween(ux, uy, wx, wy) {
  let r = Math.atan2(wy, wx) - Math.atan2(uy, ux);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}
function normalize(v, pmin, pmax, n, reflect) {
  const lo = Math.min(pmin, pmax);
  const hi = Math.max(pmin, pmax);
  const x2 = Math.min(Math.max(v, lo), hi);
  const mid = lo + Math.abs(hi - lo) / 2;
  const nLo = Math.min(n.minimum, n.maximum);
  const nHi = Math.max(n.minimum, n.maximum);
  const nDef = n.default;
  const d = x2 - mid;
  let r;
  if (d > 0) r = hi === mid ? 0 : d * ((nHi - nDef) / (hi - mid)) + nDef;
  else if (d < 0) r = lo === mid ? 0 : d * ((nLo - nDef) / (lo - mid)) + nDef;
  else r = nDef;
  return reflect ? r : -r;
}
var STATE_FORMAT = "mochi2d-physics-state/1";
var MAX_STEPS_PER_FRAME = 1e4;
var PhysicsRig = class {
  constructor(file, values) {
    this.file = file;
    this.values = values;
    this.work = new Float32Array(values.values.length);
    this.settingStrengths = new Float64Array(file.settings.length).fill(1);
    this.settingWinds = new Float64Array(file.settings.length).fill(1);
    this.states = file.settings.map((s) => {
      let sum = 0;
      return {
        setting: s,
        // 3n.1: the root at its file position; particle i at (0, R₁ + … + Rᵢ).
        particles: s.particles.map((p, i2) => {
          if (i2 > 0) sum += p.radius;
          return { x: i2 === 0 ? p.x : 0, y: i2 === 0 ? p.y : sum, vx: 0, vy: 0, gx: 0, gy: 1 };
        }),
        outputs: s.outputs.map((o) => ({ cur: 0, prev: 0, target: values.index(o.destination) })),
        sources: s.inputs.map((i2) => values.index(i2.source))
      };
    });
  }
  file;
  values;
  /** Gravity G and wind V (3n.2): application options, read at every step. */
  gravity = [0, -1];
  wind = [0, 0];
  /**
   * Strength (not reference behavior): how far the physics moves its
   * parameters, for the whole rig, times each setting's own (file order). The
   * product k applies to every output of the setting (see `written`); 1, the
   * default, is the reference.
   */
  strength = 1;
  settingStrengths;
  /**
   * Wind multipliers per setting (not reference behavior, file order): a
   * setting's pendulums feel the wind V times its multiplier. 1, the
   * default, is the reference, bit for bit; 0 shields the setting from the
   * wind.
   */
  settingWinds;
  /**
   * In a frame with Δ ≤ 0, write the last outputs again (not reference
   * behavior: the reference writes none, 3n.3). Views turn it on, so a paused
   * view keeps its physics pose.
   */
  holdOnZeroSteps = false;
  /**
   * The internal step rate, steps per second (not reference behavior),
   * instead of the file's `Fps`: 0 steps once per frame (3n.3). Null, the
   * default: the file's.
   */
  rate = null;
  states;
  /** The interpolation factor of the last outputs written. */
  lambda = 0;
  rho = 0;
  input = null;
  work;
  stepped = false;
  /**
   * Destination parameter IDs written with weight ≥ 100 %, with the inputs
   * of the setting that writes them (for viewers). Settings write in file
   * order, so when several settings overwrite one parameter, the last one's
   * value shows: its inputs are given.
   */
  overwrittenParameters() {
    const out = /* @__PURE__ */ new Map();
    for (const s of this.file.settings)
      for (const o of s.outputs)
        if (o.weight >= 100 && this.values.index(o.destination) >= 0)
          out.set(o.destination, s.inputs);
    return out;
  }
  /** The step rate in use: {@link rate}, or the file's `Fps` (0: one step per frame). */
  get stepRate() {
    return this.rate ?? this.file.fps;
  }
  /** The rig's shape, which a saved state must match. */
  shape() {
    const out = [this.states.length];
    for (const s of this.states) out.push(s.particles.length, s.outputs.length);
    out.push(this.work.length);
    return out;
  }
  /** A copy of the simulation's state now (see {@link PhysicsState}). */
  saveState() {
    const shape = this.shape();
    let n = 4 + this.work.length;
    for (const s of this.states) n += 6 * s.particles.length + 2 * s.outputs.length;
    const d = new Float64Array(n);
    d[0] = this.rho;
    d[1] = this.lambda;
    d[2] = this.stepped ? 1 : 0;
    d[3] = this.input ? 1 : 0;
    let k = 4;
    for (const s of this.states) {
      for (const p of s.particles) {
        d[k++] = p.x;
        d[k++] = p.y;
        d[k++] = p.vx;
        d[k++] = p.vy;
        d[k++] = p.gx;
        d[k++] = p.gy;
      }
      for (const o of s.outputs) {
        d[k++] = o.cur;
        d[k++] = o.prev;
      }
    }
    if (this.input) d.set(this.input, k);
    return { format: STATE_FORMAT, shape, data: d };
  }
  /**
   * Puts the simulation back in a saved state: the next frame continues
   * exactly as it did after the save, given the same parameter values, step
   * lengths and options. RangeError when the state comes from another
   * physics file (its shape differs).
   */
  restoreState(state) {
    const shape = this.shape();
    const same = state?.format === STATE_FORMAT && state.shape.length === shape.length && state.shape.every((v, i2) => v === shape[i2]) && state.data instanceof Float64Array;
    let n = 4 + this.work.length;
    for (const s of this.states) n += 6 * s.particles.length + 2 * s.outputs.length;
    if (!same || state.data.length !== n)
      throw new RangeError("this physics state was saved from other physics settings");
    const d = state.data;
    this.rho = d[0];
    this.lambda = d[1];
    this.stepped = d[2] === 1;
    let k = 4;
    for (const s of this.states) {
      for (const p of s.particles) {
        p.x = d[k++];
        p.y = d[k++];
        p.vx = d[k++];
        p.vy = d[k++];
        p.gx = d[k++];
        p.gy = d[k++];
      }
      for (const o of s.outputs) {
        o.cur = d[k++];
        o.prev = d[k++];
      }
    }
    this.input = d[3] === 1 ? Float32Array.from(d.subarray(k, k + this.work.length)) : null;
  }
  /** 3n.3: one frame of length Δ. Writes the interpolated outputs into the parameters. */
  frame(dt) {
    if (dt <= 0) {
      if (this.holdOnZeroSteps && this.stepped) this.writeOutputs(this.lambda);
      return;
    }
    this.rho += dt;
    if (this.rho > 5) this.rho = 0;
    const values = this.values;
    if (!this.input) this.input = Float32Array.from(values.values);
    const fps = this.stepRate;
    const h = fps > 0 && fps < Infinity ? 1 / fps : dt;
    let steps = 0;
    while (this.rho >= h) {
      if (steps++ === MAX_STEPS_PER_FRAME) {
        this.rho %= h;
        break;
      }
      this.step(h);
      this.rho -= h;
    }
    if (!this.stepped) return;
    this.lambda = this.rho / h;
    this.writeOutputs(this.lambda);
  }
  /** The outputs at interpolation factor λ between the last two steps, into the parameters. */
  writeOutputs(lambda) {
    const values = this.values;
    this.states.forEach((s, i2) => {
      const strength = this.strengthOf(i2);
      s.setting.outputs.forEach((o, k) => {
        const st = s.outputs[k];
        if (st.target < 0) return;
        const v = st.prev * (1 - lambda) + st.cur * lambda;
        values.values[st.target] = this.written(
          o,
          st.target,
          v,
          values.values[st.target],
          strength
        );
      });
    });
  }
  /** The strength k of setting i: the rig's times the setting's. */
  strengthOf(i2) {
    return this.strength * this.settingStrengths[i2];
  }
  /**
   * The write rule of 3n.7: scale, limit to the destination's range, blend by
   * the weight, giving r from the current value c. With a strength k ≠ 1 (not
   * reference behavior) the parameter becomes c + (r − c)·k instead: k = 0
   * leaves it at c exactly, and above 1 the result is limited to the
   * destination's range again. k = 1 is the reference rule, bit for bit.
   */
  written(o, target2, value, current, strength = 1) {
    const sigma = o.type === "Angle" ? o.scale : 0;
    const lo = this.values.min[target2];
    const hi = this.values.max[target2];
    const z = Math.min(Math.max(value * sigma, lo), hi);
    const w = o.weight / 100;
    const r = w >= 1 ? z : current * (1 - w) + z * w;
    if (strength === 1) return r;
    if (strength === 0) return current;
    const e = current + (r - current) * strength;
    return strength > 1 ? Math.min(Math.max(e, lo), hi) : e;
  }
  /** 3n.4: one internal step of length h. */
  step(h) {
    const values = this.values;
    for (const s of this.states) for (const o of s.outputs) o.prev = o.cur;
    const u = h / this.rho;
    const I = this.input;
    const C = this.work;
    const v = values.values;
    for (let j = 0; j < C.length; j++) {
      C[j] = I[j] * (1 - u) + v[j] * u;
      I[j] = C[j];
    }
    for (let i2 = 0; i2 < this.states.length; i2++) {
      const s = this.states[i2];
      const strength = this.strengthOf(i2);
      const set = s.setting;
      let x2 = 0;
      let y = 0;
      let a = 0;
      set.inputs.forEach((inp, k) => {
        const w = inp.weight / 100;
        const src = s.sources[k];
        const n = inp.type === "Angle" ? set.angle : set.position;
        const value = src >= 0 ? normalize(C[src], values.min[src], values.max[src], n, inp.reflect) : inp.reflect ? n.default : -n.default;
        if (inp.type === "X") x2 += value * w;
        else if (inp.type === "Y") y += value * w;
        else a += value * w;
      });
      const theta = -a / 180 * Math.PI;
      const xr = x2 * Math.cos(theta) - y * Math.sin(theta);
      const yr = xr * Math.sin(theta) + y * Math.cos(theta);
      this.pendulum(s, xr, yr, a, h, this.settingWinds[i2]);
      set.outputs.forEach((o, k) => {
        const st = s.outputs[k];
        const value = this.outputValue(s, o);
        if (value === null) return;
        st.cur = value;
        if (st.target >= 0)
          C[st.target] = this.written(o, st.target, value, C[st.target], strength);
      });
    }
    this.stepped = true;
  }
  /** 3n.6. */
  pendulum(s, rx, ry, a, h, windScale) {
    const p = s.particles;
    const set = s.setting;
    p[0].x = rx;
    p[0].y = ry;
    let gx = Math.sin(a / 180 * Math.PI);
    let gy = Math.cos(a / 180 * Math.PI);
    const gl = Math.sqrt(gx * gx + gy * gy);
    gx /= gl;
    gy /= gl;
    const Vx = this.wind[0] * windScale;
    const Vy = this.wind[1] * windScale;
    const M = set.position.maximum;
    for (let i2 = 1; i2 < p.length; i2++) {
      const cfg = set.particles[i2];
      const q2 = p[i2];
      const prev = p[i2 - 1];
      const Fx = gx * cfg.acceleration + Vx;
      const Fy = gy * cfg.acceleration + Vy;
      const lastX = q2.x;
      const lastY = q2.y;
      const k = cfg.delay * h * 30;
      const rX = q2.x - prev.x;
      const rY = q2.y - prev.y;
      const psi = angleBetween(q2.gx, q2.gy, gx, gy) / 5;
      const rpx = Math.cos(psi) * rX - rY * Math.sin(psi);
      const rpy = Math.sin(psi) * rpx + rY * Math.cos(psi);
      q2.x = prev.x + rpx;
      q2.y = prev.y + rpy;
      q2.x = q2.x + q2.vx * k + Fx * k * k;
      q2.y = q2.y + q2.vy * k + Fy * k * k;
      const dx = q2.x - prev.x;
      const dy = q2.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      q2.x = prev.x + dx / len * cfg.radius;
      q2.y = prev.y + dy / len * cfg.radius;
      if (Math.abs(q2.x) < 1e-3 * M) q2.x = 0;
      if (k !== 0) {
        q2.vx = (q2.x - lastX) / k * cfg.mobility;
        q2.vy = (q2.y - lastY) / k * cfg.mobility;
      }
      q2.gx = gx;
      q2.gy = gy;
    }
  }
  /** 3n.7: an output's value, or null for an invalid vertex index. */
  outputValue(s, o) {
    const p = s.particles;
    const j = o.vertexIndex;
    if (j < 1 || j >= p.length) return null;
    const dx = p[j].x - p[j - 1].x;
    const dy = p[j].y - p[j - 1].y;
    let value;
    if (o.type === "X") value = dx;
    else if (o.type === "Y") value = dy;
    else {
      const gx = j >= 2 ? p[j - 1].x - p[j - 2].x : -this.gravity[0];
      const gy = j >= 2 ? p[j - 1].y - p[j - 2].y : -this.gravity[1];
      value = angleBetween(gx, gy, dx, dy);
    }
    return o.reflect ? -value : value;
  }
  /** 3n.8: the optional settle procedure, run once after load. */
  settle() {
    const values = this.values;
    const v = values.values;
    this.work.set(v);
    this.input = Float32Array.from(v);
    const C = this.work;
    for (let i2 = 0; i2 < this.states.length; i2++) {
      const s = this.states[i2];
      const strength = this.strengthOf(i2);
      const Vx = this.wind[0] * this.settingWinds[i2];
      const Vy = this.wind[1] * this.settingWinds[i2];
      const set = s.setting;
      let x2 = 0;
      let y = 0;
      let a = 0;
      set.inputs.forEach((inp, k) => {
        const w = inp.weight / 100;
        const src = s.sources[k];
        const n = inp.type === "Angle" ? set.angle : set.position;
        const value = src >= 0 ? normalize(v[src], values.min[src], values.max[src], n, inp.reflect) : inp.reflect ? n.default : -n.default;
        if (inp.type === "X") x2 += value * w;
        else if (inp.type === "Y") y += value * w;
        else a += value * w;
      });
      const theta = -a / 180 * Math.PI;
      const xr = x2 * Math.cos(theta) - y * Math.sin(theta);
      const yr = xr * Math.sin(theta) + y * Math.cos(theta);
      const p = s.particles;
      p[0].x = xr;
      p[0].y = yr;
      let gx = Math.sin(a / 180 * Math.PI);
      let gy = Math.cos(a / 180 * Math.PI);
      const gl = Math.sqrt(gx * gx + gy * gy);
      gx /= gl;
      gy /= gl;
      const M = set.position.maximum;
      for (let i3 = 1; i3 < p.length; i3++) {
        const cfg = set.particles[i3];
        const q2 = p[i3];
        const prev = p[i3 - 1];
        const Fx = gx * cfg.acceleration + Vx;
        const Fy = gy * cfg.acceleration + Vy;
        const fl2 = Math.sqrt(Fx * Fx + Fy * Fy);
        q2.vx = 0;
        q2.vy = 0;
        q2.x = prev.x + Fx / fl2 * cfg.radius;
        q2.y = prev.y + Fy / fl2 * cfg.radius;
        if (Math.abs(q2.x) < 1e-3 * M) q2.x = 0;
        q2.gx = gx;
        q2.gy = gy;
      }
      set.outputs.forEach((o, k) => {
        const st = s.outputs[k];
        const value = this.outputValue(s, o);
        if (value === null) return;
        st.cur = value;
        st.prev = value;
        if (st.target >= 0) {
          v[st.target] = this.written(o, st.target, value, v[st.target], strength);
          C[st.target] = this.written(o, st.target, value, C[st.target], strength);
        }
      });
    }
    this.lambda = 0;
    this.stepped = true;
  }
};

// src/anim/pose.ts
function parsePose(input, label = "pose") {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  const f = optNum(json.FadeInTime);
  return {
    label,
    fade: f === void 0 || f < 0 ? 0.5 : f,
    groups: arr(json.Groups).map(
      (g) => arr(g).map((e) => {
        const ee = obj(e);
        return {
          id: str2(ee.Id),
          links: arr(ee.Link).filter((x2) => typeof x2 === "string")
        };
      })
    )
  };
}
var PoseRig = class {
  constructor(file, values) {
    this.file = file;
    this.values = values;
  }
  file;
  values;
  initialized = false;
  /** 3o.1 on the first frame, then 3o.2. */
  frame(dt) {
    const v = this.values;
    if (!this.initialized) {
      this.initialized = true;
      for (const group of this.file.groups)
        group.forEach((e, j) => {
          v.set(e.id, 1);
          v.setPartOpacity(e.id, j === 0 ? 1 : 0);
          v.set(e.id, j === 0 ? 1 : 0);
          for (const link of e.links) v.set(link, 1);
        });
    }
    const step = dt < 0 ? 0 : dt;
    const F = this.file.fade;
    for (const group of this.file.groups) {
      if (group.length === 0) continue;
      let visible = group.findIndex((e) => v.get(e.id) > 1e-3);
      let o;
      if (visible < 0) {
        visible = 0;
        o = 1;
      } else {
        o = F === 0 ? 1 : Math.min(1, v.partOpacity(group[visible].id) + step / F);
      }
      group.forEach((e, j) => {
        if (j === visible) return;
        let a = 1 - o;
        if ((1 - a) * (1 - o) > 0.15) a = 1 - 0.15 / (1 - o);
        v.setPartOpacity(e.id, Math.min(v.partOpacity(e.id), a));
      });
      v.setPartOpacity(group[visible].id, o);
    }
    for (const group of this.file.groups)
      for (const e of group) {
        const op2 = v.partOpacity(e.id);
        for (const link of e.links) v.setPartOpacity(link, op2);
      }
  }
};

// src/anim/effects.ts
var REFERENCE_EYE_BLINK = {
  interval: 4,
  closing: 0.1,
  closed: 0.05,
  opening: 0.15
};
var EyeBlink = class {
  constructor(ids, random, timing = REFERENCE_EYE_BLINK) {
    this.ids = ids;
    this.random = random;
    this.timing = timing;
  }
  ids;
  random;
  timing;
  time = 0;
  state = "initial";
  next = 0;
  start = 0;
  frame(dt, values) {
    this.time += dt;
    const t = this.time;
    const tm = this.timing;
    let value = 1;
    switch (this.state) {
      case "initial":
        this.next = t + this.random() * (2 * tm.interval - 1);
        this.state = "waiting";
        value = 1;
        break;
      case "waiting":
        if (this.next < t) {
          this.start = t;
          this.state = "closing";
        }
        value = 1;
        break;
      case "closing": {
        let x2 = (t - this.start) / tm.closing;
        if (x2 >= 1) {
          x2 = 1;
          this.start = t;
          this.state = "closed";
        }
        value = 1 - x2;
        break;
      }
      case "closed": {
        const x2 = (t - this.start) / tm.closed;
        if (x2 >= 1) {
          this.start = t;
          this.state = "opening";
        }
        value = 0;
        break;
      }
      case "opening": {
        let x2 = (t - this.start) / tm.opening;
        if (x2 >= 1) {
          x2 = 1;
          this.next = t + this.random() * (2 * tm.interval - 1);
          this.state = "waiting";
        }
        value = x2;
        break;
      }
    }
    for (const id of this.ids) values.set(id, value);
  }
};
var REFERENCE_BREATH = [
  { id: "ParamAngleX", offset: 0, peak: 15, cycle: 6.5345, weight: 0.5 },
  { id: "ParamAngleY", offset: 0, peak: 8, cycle: 3.5345, weight: 0.5 },
  { id: "ParamAngleZ", offset: 0, peak: 10, cycle: 5.5345, weight: 0.5 },
  { id: "ParamBodyAngleX", offset: 0, peak: 4, cycle: 15.5345, weight: 0.5 },
  { id: "ParamBreath", offset: 0.5, peak: 0.5, cycle: 3.2345, weight: 1 }
];
var Breath = class {
  constructor(entries = REFERENCE_BREATH) {
    this.entries = entries;
  }
  entries;
  time = 0;
  frame(dt, values) {
    this.time += dt;
    const phi = this.time * 2 * Math.PI;
    for (const e of this.entries)
      values.add(e.id, e.offset + e.peak * Math.sin(phi / e.cycle), e.weight);
  }
};
var REFERENCE_LOOK = [
  { id: "ParamAngleX", fx: 30, fy: 0, fxy: 0 },
  { id: "ParamAngleY", fx: 0, fy: 30, fxy: 0 },
  { id: "ParamAngleZ", fx: 0, fy: 0, fxy: -30 },
  { id: "ParamBodyAngleX", fx: 10, fy: 0, fxy: 0 },
  { id: "ParamEyeBallX", fx: 1, fy: 0, fxy: 0 },
  { id: "ParamEyeBallY", fx: 0, fy: 1, fxy: 0 }
];
var Look = class {
  constructor(entries = REFERENCE_LOOK) {
    this.entries = entries;
  }
  entries;
  targetX = 0;
  targetY = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  time = 0;
  last = 0;
  setTarget(x2, y) {
    this.targetX = x2;
    this.targetY = y;
  }
  frame(dt, values) {
    this.move(dt);
    for (const e of this.entries)
      values.add(e.id, e.fx * this.x + e.fy * this.y + e.fxy * this.x * this.y);
  }
  move(dt) {
    this.time += dt;
    if (this.last === 0) {
      this.last = this.time;
      return;
    }
    const kappa = (this.time - this.last) * 30;
    this.last = this.time;
    const V = 4 / 30;
    const A = kappa * V / 4.5;
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    if (Math.abs(dx) <= 0.01 && Math.abs(dy) <= 0.01) return;
    const D = Math.sqrt(dx * dx + dy * dy);
    let ax = V * dx / D - this.vx;
    let ay = V * dy / D - this.vy;
    const al = Math.sqrt(ax * ax + ay * ay);
    if (al > A) {
      ax *= A / al;
      ay *= A / al;
    }
    this.vx += ax;
    this.vy += ay;
    const B = 0.5 * (Math.sqrt(A * A + 16 * A * D - 8 * A * D) - A);
    const vl = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (vl > B) {
      this.vx *= B / vl;
      this.vy *= B / vl;
    }
    this.x += this.vx;
    this.y += this.vy;
  }
};

// src/anim/lip-sync.ts
var WavFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WavFormatError";
  }
};
var tag2 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
function decodeWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || tag2(bytes, 0) !== "RIFF" || tag2(bytes, 8) !== "WAVE")
    throw new WavFormatError("not a RIFF/WAVE file");
  if (bytes.length < 20 || tag2(bytes, 12) !== "fmt ")
    throw new WavFormatError("the fmt chunk does not follow WAVE");
  const fmtSize = dv.getUint32(16, true);
  if (bytes.length < 20 + 16) throw new WavFormatError("truncated fmt chunk");
  const format = dv.getUint16(20, true);
  const channels = dv.getUint16(22, true);
  const sampleRate = dv.getUint32(24, true);
  const bits3 = dv.getUint16(34, true);
  if (format !== 1) throw new WavFormatError(`format code ${format} is not linear PCM`);
  if (channels === 0) throw new WavFormatError("no channels");
  if (bits3 === 0) throw new WavFormatError("0 bits per sample");
  let o = 20 + fmtSize;
  while (o + 8 <= bytes.length && tag2(bytes, o) !== "data") o += 8 + dv.getUint32(o + 4, true);
  if (o + 8 > bytes.length) throw new WavFormatError("no data chunk");
  const size = Math.min(dv.getUint32(o + 4, true), bytes.length - o - 8);
  const start = o + 8;
  const bytesPerSample = Math.ceil(bits3 / 8);
  const frames = Math.floor(size / (bytesPerSample * channels));
  const samples = Array.from({ length: channels }, () => new Float64Array(frames));
  const scale2 = 2147483647;
  if (bits3 === 8 || bits3 === 16 || bits3 === 24)
    for (let c = 0; c < channels; c++) {
      const s = samples[c];
      for (let i2 = 0; i2 < frames; i2++) {
        const p = start + (i2 * channels + c) * bytesPerSample;
        let v;
        if (bits3 === 8) v = (bytes[p] - 128) * 16777216;
        else if (bits3 === 16) v = dv.getInt16(p, true) * 65536;
        else v = ((bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16) << 8 >> 8) * 256;
        s[i2] = Math.fround(v / scale2);
      }
    }
  return { channels, sampleRate, bitsPerSample: bits3, frames, samples };
}
var LipSync = class {
  constructor(ids) {
    this.ids = ids;
  }
  ids;
  sound = null;
  live = null;
  /** How the live input's value combines with the lip-sync parameters. */
  liveMix = "add";
  time = 0;
  position = 0;
  /**
   * The value of the latest frame: the sound's, plus the live input's (with
   * mix "replace" or a function, the live input's; with "max", the larger).
   * 0 with neither; NaN when a frame covered no sample of the sound and
   * there is no live input.
   */
  value = 0;
  /** The sound's part of {@link value} (3s.2): 0 with no sound, NaN for an empty window. */
  soundValue = 0;
  /** The live input's part of {@link value}. */
  liveValue = 0;
  /** The live input, or null. */
  get liveSource() {
    return this.live;
  }
  /** Adds a live input alongside sounds (null removes it), combined by `mix`. */
  setLive(source, mix = "add") {
    this.live = source;
    this.liveMix = mix;
    this.liveValue = 0;
  }
  /** Starts a sound (null stops lip sync). */
  start(sound) {
    this.sound = sound;
    this.time = 0;
    this.position = 0;
    this.value = this.liveValue;
    this.soundValue = 0;
  }
  /** A sound is loaded and not finished. */
  get playing() {
    return this.sound !== null && this.position < this.sound.frames;
  }
  /**
   * One frame. Parameters in `skip` are left alone (motion sync drives them
   * in this frame; not reference behavior).
   */
  frame(dt, values, skip) {
    const ids = skip?.size ? this.ids.filter((id) => !skip.has(id)) : this.ids;
    this.soundFrame(dt, values, ids);
    this.value = this.soundValue;
    const live = this.live;
    if (!live) return;
    const v = live.next(dt);
    const l = Number.isFinite(v) && v > 0 ? v : 0;
    this.liveValue = l;
    const mix = this.liveMix;
    if (mix === "add") {
      if (l > 0) for (const id of ids) values.add(id, l, 1);
      this.value = Number.isNaN(this.value) ? l : this.value + l;
      return;
    }
    for (const id of ids) {
      const current = values.get(id);
      const x2 = mix === "replace" ? l : mix === "max" ? Math.max(current, l) : mix(l, current, id);
      if (Number.isFinite(x2)) values.set(id, x2, 1);
    }
    const sound = Number.isNaN(this.value) ? 0 : this.value;
    this.value = mix === "max" ? Math.max(sound, l) : l;
  }
  /** Step 4f for the sound (3s.2). */
  soundFrame(dt, values, ids) {
    const snd = this.sound;
    if (!snd || this.position >= snd.frames) {
      this.soundValue = 0;
      return;
    }
    this.time += dt;
    const g = Math.min(Math.floor(this.time * snd.sampleRate), snd.frames);
    const from = this.position;
    if (g === from) {
      this.soundValue = NaN;
      return;
    }
    let sum = 0;
    for (const ch of snd.samples) for (let i2 = from; i2 < g; i2++) sum += ch[i2] * ch[i2];
    const rms = Math.sqrt(sum / (snd.channels * (g - from)));
    this.position = g;
    this.soundValue = rms;
    for (const id of ids) values.add(id, rms, 1);
  }
};

// src/anim/motion-sync/file.ts
var MOTION_SYNC_ELEMENTS = ["Silence", "A", "I", "U", "E", "O"];
var MOTION_SYNC_ANALYSIS_TYPE = "CRI";
var KEYS = {
  root: ["Version", "Meta", "Settings"],
  meta: ["SettingCount", "Dictionary"],
  dictionary: ["Id", "Name"],
  setting: [
    "Id",
    "AnalysisType",
    "UseCase",
    "CubismParameters",
    "AudioParameters",
    "Mappings",
    "PostProcessing"
  ],
  parameter: ["Name", "Id", "Min", "Max", "Damper", "Smooth"],
  element: ["Name", "Id", "Min", "Max", "Scale", "Enabled"],
  mapping: ["Type", "Id", "Targets"],
  target: ["Id", "Value"],
  post: ["BlendRatio", "Smoothing", "SampleRate"]
};
function parseMotionSync(input, label = "motion sync", options = {}) {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  const warnings = [];
  const warn = (path, what) => warnings.push(`${label}: ${path} ${what}`);
  const lint = (o, path, keys) => {
    if (!options.lint) return;
    for (const k of Object.keys(o))
      if (!keys.includes(k)) warn(path ? `${path}.${k}` : k, "is not part of the format; ignored");
  };
  const object = (v, path) => {
    if (isObject2(v)) return v;
    warn(path, v === void 0 ? "is missing" : "is not an object");
    return {};
  };
  const list = (v, path) => {
    if (Array.isArray(v)) return v;
    warn(path, v === void 0 ? "is missing; empty is used" : "is not a list; empty is used");
    return [];
  };
  const number = (v, path, fallback = 0) => {
    if (typeof v === "number") return v;
    warn(path, `${v === void 0 ? "is missing" : "is not a number"}; ${fallback} is used`);
    return fallback;
  };
  const integer = (v, path) => {
    const n2 = number(v, path);
    const i2 = Number.parseInt(String(n2), 10);
    return Number.isFinite(i2) ? i2 + 0 : 0;
  };
  const text = (v, path) => {
    if (typeof v === "string") return v;
    warn(path, v === void 0 ? "is missing" : "is not a string");
    return "";
  };
  const flag = (v, path) => {
    if (typeof v === "boolean") return v;
    warn(path, `${v === void 0 ? "is missing" : "is not true or false"}; read as false`);
    return false;
  };
  const limited = (x2, lo, hi, path) => {
    if (x2 >= lo && x2 <= hi) return x2;
    const y = Math.min(hi, Math.max(lo, x2));
    warn(path, `${x2} is outside [${lo}, ${hi}]; ${y} is used`);
    return y;
  };
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  lint(json, "", KEYS.root);
  const version = integer(json.Version, "Version");
  if (version !== 1) warn("Version", `is ${version}, not 1; read as version 1`);
  const meta = object(json.Meta, "Meta");
  lint(meta, "Meta", KEYS.meta);
  const count = integer(meta.SettingCount, "Meta.SettingCount");
  const dictionary = list(meta.Dictionary, "Meta.Dictionary");
  const settingList = list(json.Settings, "Settings");
  if (count !== settingList.length)
    warn(
      "Meta.SettingCount",
      `is ${count}, but Settings has ${settingList.length}; ${Math.max(0, Math.min(count, settingList.length))} read`
    );
  const n = Math.max(0, Math.min(count, settingList.length));
  const settings = [];
  for (let i2 = 0; i2 < n; i2++) {
    const at4 = `Settings[${i2}]`;
    const s = object(settingList[i2], at4);
    lint(s, at4, KEYS.setting);
    const entry = object(dictionary[i2], `Meta.Dictionary[${i2}]`);
    lint(entry, `Meta.Dictionary[${i2}]`, KEYS.dictionary);
    const id = text(s.Id, `${at4}.Id`);
    const name2 = text(entry.Name, `Meta.Dictionary[${i2}].Name`);
    const dictId = text(entry.Id, `Meta.Dictionary[${i2}].Id`);
    if (dictId !== id) warn(`Meta.Dictionary[${i2}].Id`, `is "${dictId}", not "${id}"`);
    const analysisType = text(s.AnalysisType, `${at4}.AnalysisType`);
    const usable = analysisType === MOTION_SYNC_ANALYSIS_TYPE;
    if (!usable)
      warn(`${at4}.AnalysisType`, `"${analysisType}" is not supported; the setting is ignored`);
    const useCase = text(s.UseCase, `${at4}.UseCase`);
    if (useCase !== "Mouth") warn(`${at4}.UseCase`, `is "${useCase}", not "Mouth"; used anyway`);
    const parameters = list(s.CubismParameters, `${at4}.CubismParameters`).map((p, k) => {
      const pa = `${at4}.CubismParameters[${k}]`;
      const o = object(p, pa);
      lint(o, pa, KEYS.parameter);
      const damper = number(o.Damper, `${pa}.Damper`);
      return {
        id: text(o.Id, `${pa}.Id`),
        name: typeof o.Name === "string" ? o.Name : "",
        min: number(o.Min, `${pa}.Min`),
        max: number(o.Max, `${pa}.Max`),
        // A negative dead band acts as none.
        damper: damper > 0 ? damper : 0,
        smooth: limited(number(o.Smooth, `${pa}.Smooth`), 0, 100, `${pa}.Smooth`)
      };
    });
    const elements = list(s.AudioParameters, `${at4}.AudioParameters`).map((e, k) => {
      const pa = `${at4}.AudioParameters[${k}]`;
      const o = object(e, pa);
      lint(o, pa, KEYS.element);
      const eid = text(o.Id, `${pa}.Id`);
      const known = MOTION_SYNC_ELEMENTS.includes(eid);
      if (!known)
        warn(
          `${pa}.Id`,
          `"${eid}" is not one of ${MOTION_SYNC_ELEMENTS.join(", ")}; its weight is 0`
        );
      return {
        id: eid,
        name: typeof o.Name === "string" ? o.Name : "",
        min: number(o.Min, `${pa}.Min`),
        max: number(o.Max, `${pa}.Max`),
        scale: limited(number(o.Scale, `${pa}.Scale`), 0.1, 10, `${pa}.Scale`),
        enabled: flag(o.Enabled, `${pa}.Enabled`),
        known
      };
    });
    const mappings = list(s.Mappings, `${at4}.Mappings`).slice(0, elements.length).map((m, k) => {
      const pa = `${at4}.Mappings[${k}]`;
      const o = object(m, pa);
      lint(o, pa, KEYS.mapping);
      const type = text(o.Type, `${pa}.Type`);
      if (type !== "Shape") warn(`${pa}.Type`, `is "${type}", not "Shape"; used anyway`);
      const targets = list(o.Targets, `${pa}.Targets`).map((t, j) => {
        const ta = `${pa}.Targets[${j}]`;
        const to = object(t, ta);
        lint(to, ta, KEYS.target);
        return { id: text(to.Id, `${ta}.Id`), value: number(to.Value, `${ta}.Value`) };
      });
      return { id: text(o.Id, `${pa}.Id`), targets };
    });
    const shapes = elements.map((e) => {
      const m = mappings.find((x2) => x2.id === e.id);
      if (!m) {
        warn(`${at4}.Mappings`, `have no shape for element "${e.id}"; 0 is used`);
        return parameters.map(() => 0);
      }
      return parameters.map((p) => {
        const t = m.targets.find((x2) => x2.id === p.id);
        if (t) return t.value;
        warn(`${at4}.Mappings`, `"${e.id}" has no target for "${p.id}"; 0 is used`);
        return 0;
      });
    });
    const pp = `${at4}.PostProcessing`;
    const post = object(s.PostProcessing, pp);
    lint(post, pp, KEYS.post);
    const blendRatio = limited(
      number(post.BlendRatio, `${pp}.BlendRatio`),
      0,
      1,
      `${pp}.BlendRatio`
    );
    const smoothing = limited(
      integer(post.Smoothing, `${pp}.Smoothing`),
      1,
      100,
      `${pp}.Smoothing`
    );
    let sampleRate = number(post.SampleRate, `${pp}.SampleRate`);
    if (!(sampleRate > 0)) {
      warn(`${pp}.SampleRate`, `is ${sampleRate}; 60 is used`);
      sampleRate = 60;
    } else sampleRate = limited(sampleRate, 1, 120, `${pp}.SampleRate`);
    settings.push({
      index: i2,
      id,
      name: name2,
      analysisType,
      useCase,
      usable,
      parameters,
      elements,
      shapes,
      blendRatio,
      smoothing,
      sampleRate
    });
  }
  return { label, version, settings, warnings };
}
function findMotionSyncSetting(file, ref) {
  return file.settings.find((s) => s.name === ref) ?? file.settings.find((s) => s.id === ref) ?? null;
}
function writeMotionSync(file, options = {}) {
  const n = (v, where) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new RangeError(`writeMotionSync: ${where} is ${v}, not a finite number`);
    return v;
  };
  const unique = (ids, where) => {
    const seen = /* @__PURE__ */ new Set();
    for (const id of ids) {
      if (seen.has(id))
        throw new RangeError(`writeMotionSync: ${where} has "${id}" twice; it would not read back`);
      seen.add(id);
    }
  };
  const json = {
    Version: n(file.version ?? 1, "version"),
    Meta: {
      SettingCount: file.settings.length,
      Dictionary: file.settings.map((s) => ({ Id: s.id, Name: s.name }))
    },
    Settings: file.settings.map((s, i2) => {
      const at4 = `settings[${i2}]`;
      unique(
        s.parameters.map((p) => p.id),
        `${at4}.parameters`
      );
      unique(
        s.elements.map((e) => e.id),
        `${at4}.elements`
      );
      if (s.shapes.length !== s.elements.length)
        throw new RangeError(
          `writeMotionSync: ${at4}.shapes has ${s.shapes.length} shapes for ${s.elements.length} elements`
        );
      return {
        Id: s.id,
        AnalysisType: s.analysisType,
        UseCase: s.useCase,
        CubismParameters: s.parameters.map((p, k) => ({
          Name: p.name,
          Id: p.id,
          Min: n(p.min, `${at4}.parameters[${k}].min`),
          Max: n(p.max, `${at4}.parameters[${k}].max`),
          Damper: n(p.damper, `${at4}.parameters[${k}].damper`),
          Smooth: n(p.smooth, `${at4}.parameters[${k}].smooth`)
        })),
        AudioParameters: s.elements.map((e, k) => ({
          Name: e.name,
          Id: e.id,
          Min: n(e.min, `${at4}.elements[${k}].min`),
          Max: n(e.max, `${at4}.elements[${k}].max`),
          Scale: n(e.scale, `${at4}.elements[${k}].scale`),
          Enabled: e.enabled === true
        })),
        Mappings: s.elements.map((e, k) => {
          const shape = s.shapes[k];
          if (shape.length !== s.parameters.length)
            throw new RangeError(
              `writeMotionSync: ${at4}.shapes[${k}] has ${shape.length} values for ${s.parameters.length} driven parameters`
            );
          return {
            Type: "Shape",
            Id: e.id,
            Targets: s.parameters.map((p, j) => ({
              Id: p.id,
              Value: n(shape[j], `${at4}.shapes[${k}][${j}]`)
            }))
          };
        }),
        PostProcessing: {
          BlendRatio: n(s.blendRatio, `${at4}.blendRatio`),
          Smoothing: n(s.smoothing, `${at4}.smoothing`),
          SampleRate: n(s.sampleRate, `${at4}.sampleRate`)
        }
      };
    })
  };
  return JSON.stringify(json, null, options.indent ?? "	");
}

// src/anim/motion-sync/voice-synth.ts
var VOWEL_FORMANTS = {
  A: [750, 1200, 2600],
  I: [300, 2300, 3e3],
  U: [350, 1350, 2400],
  E: [480, 1900, 2600],
  O: [480, 850, 2600]
};
var BANDWIDTHS = [60, 90, 120];
function synthesizeVoice(formantsAt, seconds, rate, options = {}) {
  const n = Math.max(0, Math.round(seconds * rate));
  const f0 = options.f0 ?? 120;
  const depth = options.vibrato ?? 0.03;
  const vrate = options.vibratoRate ?? 0.8;
  const scale2 = options.formantScale ?? 1;
  const leak = Math.exp(-2 * Math.PI * 77 / rate);
  const y = new Float64Array(n);
  let phase = 0;
  for (let i2 = 0; i2 < n; i2++) {
    phase += f0 * (1 + depth * Math.sin(2 * Math.PI * vrate * i2 / rate)) / rate;
    if (phase >= 1) {
      phase -= 1;
      y[i2] = 1;
    }
  }
  let s1 = 0;
  let s2 = 0;
  let mean = 0;
  for (let i2 = 0; i2 < n; i2++) {
    s1 = leak * s1 + y[i2];
    s2 = leak * s2 + s1;
    y[i2] = s2;
    mean += s2;
  }
  mean /= Math.max(1, n);
  for (let i2 = 0; i2 < n; i2++) y[i2] = y[i2] - mean;
  const state = [0, 0, 0, 0, 0, 0];
  for (let i2 = 0; i2 < n; i2++) {
    const formants = formantsAt(i2 / rate);
    let x2 = y[i2];
    for (let k = 0; k < formants.length; k++) {
      const f = formants[k] * scale2;
      if (!(f < rate / 2)) continue;
      const bw = BANDWIDTHS[k] ?? 120;
      const c = -Math.exp(-2 * Math.PI * bw / rate);
      const b = 2 * Math.exp(-Math.PI * bw / rate) * Math.cos(2 * Math.PI * f / rate);
      const v = (1 - b - c) * x2 + b * state[2 * k] + c * state[2 * k + 1];
      state[2 * k + 1] = state[2 * k];
      state[2 * k] = v;
      x2 = v;
    }
    y[i2] = x2;
  }
  const fade = Math.min(Math.round((options.fade ?? 0.02) * rate), Math.floor(n / 2));
  for (let i2 = 0; i2 < fade; i2++) {
    const g2 = i2 / fade;
    y[i2] = y[i2] * g2;
    y[n - 1 - i2] = y[n - 1 - i2] * g2;
  }
  let sum = 0;
  for (let i2 = 0; i2 < n; i2++) sum += y[i2] * y[i2];
  const rms = Math.sqrt(sum / Math.max(1, n));
  const target2 = 10 ** ((options.level ?? -18) / 20);
  const g = rms > 0 ? target2 / rms : 0;
  return Float32Array.from(y, (v) => v * g);
}
function synthesizeVowel(formants, seconds, rate, options = {}) {
  return synthesizeVoice(() => formants, seconds, rate, options);
}

// src/anim/motion-sync/analysis.ts
var ANALYSIS_RATE = 16e3;
var ANALYSIS_WINDOW = 512;
var MFCC_SIZE = 12;
var VOWELS = ["A", "I", "U", "E", "O"];
var KERNEL_STEPS = 1024;
var Resampler = class {
  constructor(inRate, outRate) {
    this.inRate = inRate;
    this.outRate = outRate;
    this.ratio = inRate / outRate;
    const c = Math.min(1, outRate / inRate);
    const half = Math.ceil(8 / c);
    this.half = half;
    this.kernel = Float64Array.from({ length: half * KERNEL_STEPS + 2 }, (_, i2) => {
      const x2 = i2 / KERNEL_STEPS;
      if (x2 >= half + 1) return 0;
      const arg = Math.PI * x2 * c;
      const sinc = x2 === 0 ? 1 : Math.sin(arg) / arg;
      return c * sinc * (0.5 + 0.5 * Math.cos(Math.PI * x2 / (half + 1)));
    });
  }
  inRate;
  outRate;
  ratio;
  half;
  buffer = new Float64Array(0);
  /** Input index (into the whole stream) of buffer[0]. */
  bufferStart = 0;
  /** The next output sample's position in input samples. */
  next = 0;
  /** The kernel at offsets i / KERNEL_STEPS input samples, i = 0 … half·KERNEL_STEPS + 1. */
  kernel;
  push(input) {
    if (this.inRate === this.outRate) return Float32Array.from(input);
    const merged = new Float64Array(this.buffer.length + input.length);
    merged.set(this.buffer);
    for (let i2 = 0; i2 < input.length; i2++) merged[this.buffer.length + i2] = input[i2];
    this.buffer = merged;
    const out = [];
    const end = this.bufferStart + merged.length;
    while (this.next + this.half < end) {
      out.push(this.sample(this.next));
      this.next += this.ratio;
    }
    this.trim();
    return Float32Array.from(out);
  }
  /** The rest of the stream, with zeros after its end. */
  flush() {
    const out = [];
    const end = this.bufferStart + this.buffer.length;
    while (this.next < end) {
      out.push(this.sample(this.next));
      this.next += this.ratio;
    }
    this.buffer = new Float64Array(0);
    this.bufferStart = Math.floor(this.next);
    return Float32Array.from(out);
  }
  sample(t) {
    const b = this.buffer;
    const kernel = this.kernel;
    const lo = Math.ceil(t - this.half);
    const hi = Math.floor(t + this.half);
    let s = 0;
    for (let n = lo; n <= hi; n++) {
      const i2 = n - this.bufferStart;
      if (i2 < 0 || i2 >= b.length) continue;
      const p = Math.abs(t - n) * KERNEL_STEPS;
      const j = Math.floor(p);
      const f = p - j;
      s += b[i2] * (kernel[j] + (kernel[j + 1] - kernel[j]) * f);
    }
    return s;
  }
  trim() {
    const keep = Math.floor(this.next - this.half) - this.bufferStart;
    if (keep > 0) {
      this.buffer = this.buffer.slice(keep);
      this.bufferStart += keep;
    }
  }
};
function toAnalysisRate(channels, rate) {
  const frames = channels[0]?.length ?? 0;
  const mono = new Float64Array(frames);
  for (const ch of channels) for (let i2 = 0; i2 < frames; i2++) mono[i2] = mono[i2] + ch[i2];
  if (channels.length > 1) for (let i2 = 0; i2 < frames; i2++) mono[i2] = mono[i2] / channels.length;
  if (rate === ANALYSIS_RATE) return Float32Array.from(mono);
  const r = new Resampler(rate, ANALYSIS_RATE);
  const a = r.push(mono);
  const b = r.flush();
  const out = new Float32Array(Math.round(frames * ANALYSIS_RATE / rate));
  out.set(a.subarray(0, out.length));
  out.set(b.subarray(0, Math.max(0, out.length - a.length)), a.length);
  return out;
}
function fft(re, im) {
  const n = re.length;
  for (let i2 = 1, j = 0; i2 < n; i2++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i2 < j) {
      [re[i2], re[j]] = [re[j], re[i2]];
      [im[i2], im[j]] = [im[j], im[i2]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i2 = 0; i2 < n; i2 += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i2 + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] = re[a] + xr;
        im[a] = im[a] + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
var HANN = Float64Array.from(
  { length: ANALYSIS_WINDOW },
  (_, i2) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i2 / ANALYSIS_WINDOW)
);
var BIN_HZ = ANALYSIS_RATE / ANALYSIS_WINDOW;
var mel = (f) => 2595 * Math.log10(1 + f / 700);
var melInverse = (m) => 700 * (10 ** (m / 2595) - 1);
var MEL_BANDS = 20;
var MEL_FILTERS = (() => {
  const lo = mel(100);
  const hi = mel(4e3);
  const edges = Array.from(
    { length: MEL_BANDS + 2 },
    (_, i2) => melInverse(lo + (hi - lo) * i2 / (MEL_BANDS + 1))
  );
  return Array.from({ length: MEL_BANDS }, (_, m) => {
    const w = new Float64Array(ANALYSIS_WINDOW / 2 + 1);
    const [a, b, c] = [edges[m], edges[m + 1], edges[m + 2]];
    for (let k = 0; k < w.length; k++) {
      const f = k * BIN_HZ;
      if (f > a && f < c) w[k] = f <= b ? (f - a) / (b - a) : (c - f) / (c - b);
    }
    return w;
  });
})();
var DCT = Array.from(
  { length: MFCC_SIZE },
  (_, i2) => Float64Array.from(
    { length: MEL_BANDS },
    (_2, m) => Math.cos(Math.PI * (i2 + 1) * (m + 0.5) / MEL_BANDS) * Math.sqrt(2 / MEL_BANDS)
  )
);
var LAG_MIN = Math.round(3e-3 * ANALYSIS_RATE);
var LAG_MAX = Math.floor(ANALYSIS_RATE / 60);
function windowAt(signal, start) {
  const N = ANALYSIS_WINDOW;
  const x2 = new Float64Array(N);
  for (let i2 = 0; i2 < N; i2++) {
    const j = start + i2;
    x2[i2] = j >= 0 && j < signal.length ? signal[j] : 0;
  }
  let mean = 0;
  for (let i2 = 0; i2 < N; i2++) mean += x2[i2];
  mean /= N;
  let sum = 0;
  for (let i2 = 0; i2 < N; i2++) {
    x2[i2] = x2[i2] - mean;
    sum += x2[i2] * x2[i2];
  }
  const rms = Math.sqrt(sum / N);
  return { x: x2, level: rms > 0 ? 20 * Math.log10(rms) : -Infinity };
}
function periodicityOf(x2) {
  const N = x2.length;
  const y = new Float64Array(N);
  for (let i2 = 0; i2 < N; i2++) y[i2] = x2[i2] - 0.5 * (i2 > 0 ? x2[i2 - 1] : 0);
  const re = new Float64Array(2 * N);
  const im = new Float64Array(2 * N);
  re.set(y);
  fft(re, im);
  for (let k = 0; k < 2 * N; k++) {
    re[k] = re[k] * re[k] + im[k] * im[k];
    im[k] = 0;
  }
  fft(re, im);
  const energy = new Float64Array(N + 1);
  for (let i2 = 0; i2 < N; i2++) energy[i2 + 1] = energy[i2] + y[i2] * y[i2];
  let best = 0;
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
    const head = energy[N - lag];
    const tail = energy[N] - energy[lag];
    if (!(head > 0 && tail > 0)) continue;
    const c = re[lag] / (2 * N) / Math.sqrt(head * tail);
    if (c > best) best = c;
  }
  return Math.min(1, best);
}
function windowFeatures(signal, start) {
  const N = ANALYSIS_WINDOW;
  const { x: x2, level } = windowAt(signal, start);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i2 = 0; i2 < N; i2++) re[i2] = (x2[i2] - 0.97 * (i2 > 0 ? x2[i2 - 1] : 0)) * HANN[i2];
  fft(re, im);
  const power = new Float64Array(N / 2 + 1);
  for (let k = 0; k < power.length; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  const band = (lo, hi) => {
    let e = 0;
    for (let k = Math.ceil(lo / BIN_HZ); k <= Math.floor(hi / BIN_HZ); k++) e += power[k];
    return e;
  };
  const total = band(80, 3500);
  const share = (lo, hi) => total > 0 ? band(lo, hi) / total : 0;
  const spectrum = Float64Array.from(MEL_FILTERS, (w) => {
    let e = 0;
    for (let k = 0; k < w.length; k++) e += w[k] * power[k];
    return e;
  });
  return {
    level,
    bands: [share(250, 1e3), share(1e3, 2e3), share(2e3, 3500)],
    spectrum,
    periodicity: Number.isFinite(level) ? periodicityOf(x2) : 0
  };
}
var NOISE_PERIODICITY = 0.3;
var VOICED_PERIODICITY = 0.6;
function voicingOf(p) {
  return Math.min(
    1,
    Math.max(0, (p - NOISE_PERIODICITY) / (VOICED_PERIODICITY - NOISE_PERIODICITY))
  );
}
function percentile(values, q2) {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q2 * sorted.length))];
}
var SPECTRUM_RANGE = 40;
var NOISE_MARGIN = 2;
function relativeSpectrum(spectrum, noise) {
  const clean = Float64Array.from(
    { length: MEL_BANDS },
    (_, m) => Math.max(0, spectrum[m] - (noise ? noise[m] : 0))
  );
  let top = 0;
  for (let m = 0; m < MEL_BANDS; m++) top = Math.max(top, clean[m]);
  const db = new Float64Array(MEL_BANDS).fill(-SPECTRUM_RANGE);
  const mask = new Float64Array(MEL_BANDS).fill(-SPECTRUM_RANGE);
  if (!(top > 0)) return { db, mask };
  for (let m = 0; m < MEL_BANDS; m++) {
    if (noise && noise[m] > 0)
      mask[m] = Math.max(-SPECTRUM_RANGE, 10 * Math.log10(NOISE_MARGIN * noise[m] / top));
    db[m] = clean[m] > 0 ? Math.max(mask[m], 10 * Math.log10(clean[m] / top)) : mask[m];
  }
  return { db, mask };
}
function maskedDistance(db, mask, template) {
  const diff = new Float64Array(MEL_BANDS);
  for (let m = 0; m < MEL_BANDS; m++) diff[m] = db[m] - Math.max(template[m], mask[m]);
  let s = 0;
  for (const row of DCT) {
    let c = 0;
    for (let m = 0; m < MEL_BANDS; m++) c += row[m] * diff[m];
    s += c * c;
  }
  return Math.sqrt(s);
}
function soundStatistics(signal, gate = -50) {
  const levels = [];
  const unvoiced = [];
  const hop = Math.round(0.02 * ANALYSIS_RATE);
  for (let s = 0; s + ANALYSIS_WINDOW <= signal.length; s += hop) {
    const f = windowFeatures(signal, s);
    const v = voicingOf(f.periodicity);
    if (f.level >= gate && v >= 0.5) levels.push(f.level);
    if (v < 0.5) unvoiced.push(f.spectrum);
  }
  return {
    reference: levels.length >= 5 ? percentile(levels, 0.7) : null,
    noise: unvoiced.length >= 10 ? bandPercentile(unvoiced, 0.1) : null
  };
}
function bandPercentile(spectra, q2) {
  return Float64Array.from(
    { length: MEL_BANDS },
    (_, m) => percentile(
      spectra.map((s) => s[m]),
      q2
    )
  );
}
var NOISE_HISTORY = 300;
var NoiseTracker = class {
  history = [];
  value = null;
  pending = 0;
  push(spectrum) {
    this.history.push(spectrum);
    if (this.history.length > NOISE_HISTORY) this.history.shift();
    if (this.history.length >= 10 && (this.value === null || ++this.pending >= 5)) {
      this.value = bandPercentile(this.history, 0.1);
      this.pending = 0;
    }
  }
  get noise() {
    return this.value;
  }
  reset() {
    this.history = [];
    this.value = null;
    this.pending = 0;
  }
};
var NEUTRAL_VOICES = [
  [105, 0.97],
  [150, 1.06],
  [205, 1.16],
  [270, 1.26]
];
var neutralProfile = null;
function neutralVoiceProfile() {
  if (neutralProfile) return neutralProfile;
  const templates = {};
  for (const [f0, formantScale] of NEUTRAL_VOICES) {
    const cal = new VoiceCalibration();
    for (const v of VOWELS)
      cal.add(
        v,
        [synthesizeVowel(VOWEL_FORMANTS[v], 0.6, ANALYSIS_RATE, { f0, formantScale })],
        ANALYSIS_RATE
      );
    for (const [v, list] of Object.entries(cal.profile().templates))
      (templates[v] ??= []).push(...list);
  }
  neutralProfile = {
    format: "mochi2d-voice-profile",
    version: 1,
    name: "neutral synthetic voice",
    templates,
    voicedLevel: -26,
    floorLevel: null
  };
  return neutralProfile;
}
var VoiceCalibration = class {
  constructor(name2 = "voice") {
    this.name = name2;
  }
  name;
  frames = /* @__PURE__ */ new Map();
  levels = [];
  floor = null;
  /**
   * Adds a recording of `element` (a vowel, or "Silence" for the room's
   * noise): its channels at `rate` Hz, analyzed every 10 ms. For a vowel,
   * only voiced windows louder than −45 dBFS count. Returns how many
   * windows were used.
   */
  add(element, channels, rate) {
    const signal = toAnalysisRate(channels, rate);
    const hop = ANALYSIS_RATE / 100;
    const quiet = [];
    const levels = [];
    let used = 0;
    for (let s = 0; s + ANALYSIS_WINDOW <= signal.length; s += hop) {
      const f = windowFeatures(signal, s);
      if (element === "Silence") {
        if (Number.isFinite(f.level)) levels.push(f.level);
        quiet.push(f.spectrum);
        used++;
        continue;
      }
      if (!(f.level > -45) || voicingOf(f.periodicity) < 0.5) continue;
      const list = this.frames.get(element) ?? [];
      list.push(f.spectrum);
      this.frames.set(element, list);
      this.levels.push(f.level);
      used++;
    }
    if (element === "Silence" && quiet.length)
      this.floor = {
        level: levels.length ? percentile(levels, 0.5) : -Infinity,
        spectrum: bandPercentile(quiet, 0.5)
      };
    return used;
  }
  /** The vowels recorded so far. */
  get recorded() {
    return VOWELS.filter((v) => (this.frames.get(v)?.length ?? 0) > 0);
  }
  /**
   * The profile: each vowel's mean spectrum (relative dB, the room's noise
   * subtracted when Silence was recorded), the voiced level and the floor.
   */
  profile() {
    const templates = {};
    const noise = this.floor?.spectrum ?? null;
    for (const [v, list] of this.frames) {
      const mean = new Array(MEL_BANDS).fill(0);
      for (const f of list) {
        const { db } = relativeSpectrum(f, noise);
        for (let m = 0; m < MEL_BANDS; m++) mean[m] += db[m] / list.length;
      }
      templates[v] = [mean];
    }
    const floor = this.floor?.level ?? null;
    return {
      format: "mochi2d-voice-profile",
      version: 1,
      name: this.name,
      templates,
      voicedLevel: this.levels.length ? percentile(this.levels, 0.7) : -26,
      floorLevel: floor !== null && Number.isFinite(floor) ? floor : null
    };
  }
};
function voiceProfileFromJson(json) {
  const o = json;
  if (!o || o.format !== "mochi2d-voice-profile" || o.version !== 1)
    throw new TypeError("not a Mochi2D voice profile (format mochi2d-voice-profile, version 1)");
  const templates = {};
  for (const v of VOWELS) {
    const list = o.templates?.[v];
    if (list === void 0) continue;
    if (!Array.isArray(list) || !list.every(
      (t) => Array.isArray(t) && t.length === MEL_BANDS && t.every((x2) => Number.isFinite(x2))
    ))
      throw new TypeError(
        `voice profile: templates.${v} must hold spectra of ${MEL_BANDS} numbers`
      );
    templates[v] = list.map((t) => [...t]);
  }
  if (!Number.isFinite(o.voicedLevel))
    throw new TypeError("voice profile: voicedLevel must be a number");
  const floor = o.floorLevel ?? null;
  if (floor !== null && !Number.isFinite(floor))
    throw new TypeError("voice profile: floorLevel must be a number or null");
  return {
    format: "mochi2d-voice-profile",
    version: 1,
    name: typeof o.name === "string" ? o.name : "voice",
    templates,
    voicedLevel: o.voicedLevel,
    floorLevel: floor
  };
}
var RECENT = 300;
var VowelAnalyzer = class {
  /** The gate given, or null for the default. */
  gateOption;
  hangover;
  /** A fixed reference level, dBFS, or null to follow the input. */
  reference = null;
  /** A fixed noise per band, or null to follow the input. */
  noise = null;
  profileValue;
  templates = [];
  sigma = 1;
  /** Seconds since the level was last above the gate. */
  sinceVoiced = Infinity;
  lastVowels = new Float64Array(VOWELS.length);
  lastOpen = 0;
  recent = [];
  tracker = new NoiseTracker();
  constructor(options = {}) {
    this.gateOption = options.gate ?? null;
    this.hangover = options.hangover ?? 0.04;
    this.profile = options.profile ?? null;
  }
  /** The gate in use, dBFS. */
  get gate() {
    if (this.gateOption !== null) return this.gateOption;
    const floor = this.profileValue.floorLevel;
    return floor === null ? -50 : Math.max(-50, floor + 6);
  }
  /** The reference level in use, dBFS. */
  get referenceLevel() {
    if (this.reference !== null) return this.reference;
    return this.recent.length >= 30 ? percentile(this.recent, 0.7) : this.profileValue.voicedLevel;
  }
  /** The voice profile in use (null: the neutral synthetic voice). */
  get profile() {
    return this.profileValue;
  }
  set profile(p) {
    this.profileValue = p ?? neutralVoiceProfile();
    this.templates = [];
    VOWELS.forEach((v, i2) => {
      for (const t of this.profileValue.templates[v] ?? []) this.templates.push({ vowel: i2, t });
    });
    const open = new Float64Array(MEL_BANDS).fill(-SPECTRUM_RANGE);
    const d = [];
    for (let i2 = 0; i2 < this.templates.length; i2++)
      for (let j = i2 + 1; j < this.templates.length; j++)
        if (this.templates[i2].vowel !== this.templates[j].vowel)
          d.push(
            maskedDistance(Float64Array.from(this.templates[i2].t), open, this.templates[j].t)
          );
    this.sigma = d.length ? Math.max(1e-6, 0.4 * percentile(d, 0.5)) : 1;
  }
  /** Forgets the hangover and what was followed of the input. */
  reset() {
    this.sinceVoiced = Infinity;
    this.lastVowels.fill(0);
    this.lastOpen = 0;
    this.recent = [];
    this.tracker.reset();
  }
  /** Analyzes the window of `signal` at `start`, `dt` seconds after the previous analysis. */
  analyze(signal, start, dt) {
    const features = windowFeatures(signal, start);
    const raw = new Float64Array(MOTION_SYNC_ELEMENTS.length);
    const level = features.level;
    const gate = this.gate;
    const loud = level >= gate;
    this.sinceVoiced = loud ? 0 : this.sinceVoiced + Math.max(0, dt);
    const voicing = loud ? voicingOf(features.periodicity) : 0;
    if (this.noise === null && voicing < 0.5) this.tracker.push(features.spectrum);
    if (!loud && this.sinceVoiced > this.hangover || this.templates.length === 0) {
      raw[0] = 1;
      return { raw, level, silent: true, voicing, open: 0, features };
    }
    let vowels = this.lastVowels;
    let open = this.lastOpen;
    if (loud) {
      vowels = new Float64Array(VOWELS.length);
      const { db, mask } = relativeSpectrum(features.spectrum, this.noise ?? this.tracker.noise);
      const s2 = 2 * this.sigma * this.sigma;
      for (const { vowel, t } of this.templates) {
        const d = maskedDistance(db, mask, t);
        vowels[vowel] = Math.max(vowels[vowel], Math.exp(-(d * d) / s2));
      }
      const sum = vowels.reduce((a, b) => a + b, 0);
      if (sum > 0) for (let i2 = 0; i2 < vowels.length; i2++) vowels[i2] = vowels[i2] / sum;
      else {
        let best = 0;
        let bestD = Infinity;
        for (const { vowel, t } of this.templates) {
          const d = maskedDistance(db, mask, t);
          if (d < bestD) [best, bestD] = [vowel, d];
        }
        vowels[best] = 1;
      }
      if (voicing >= 0.5) {
        this.recent.push(level);
        if (this.recent.length > RECENT) this.recent.shift();
      }
      const full = Math.max(gate + 6, this.referenceLevel - 6);
      open = Math.min(1, Math.max(0, (level - gate) / (full - gate))) * voicing;
      this.lastVowels = vowels;
      this.lastOpen = open;
    }
    raw[0] = 1 - open;
    for (let i2 = 0; i2 < VOWELS.length; i2++) raw[i2 + 1] = open * vowels[i2];
    return { raw, level, silent: false, voicing, open, features };
  }
};

// src/anim/motion-sync/parameter-filter.ts
var ParameterFilter = class {
  constructor(smooth, damper, smoothing = true) {
    this.smooth = smooth;
    this.damper = damper;
    this.smoothing = smoothing;
    this.smoothed = new Float64Array(smooth.length);
    this.output = new Float64Array(smooth.length);
  }
  smooth;
  damper;
  smoothing;
  /** Smoothed values S_k. */
  smoothed;
  /** Output values D_k. */
  output;
  /** S_k = D_k = values[k]. */
  reset(values) {
    for (let k = 0; k < this.smoothed.length; k++) {
      this.smoothed[k] = values[k];
      this.output[k] = values[k];
    }
  }
  /** One analysis result. */
  step(y) {
    const S = this.smoothed;
    const D = this.output;
    for (let k = 0; k < S.length; k++) {
      const v = y[k];
      if (Number.isNaN(v)) continue;
      const w = this.smooth[k];
      S[k] = this.smoothing ? ((100 - w) * v + w * S[k]) / 100 : v;
      if (!(Math.abs(S[k] - D[k]) < this.damper[k])) D[k] = S[k];
    }
  }
};
var TickClock = class {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
  }
  sampleRate;
  /** The accumulated time T, seconds. */
  time = 0;
  /** Advances by one frame; true when this frame analyzes. */
  advance(dt) {
    this.time += dt > 0 ? dt : 0;
    const h = 1 / this.sampleRate;
    if (this.time < h) return false;
    this.time %= h;
    return true;
  }
};

// src/anim/motion-sync/driver.ts
var SILENCE = 0;
var SettingEngine = class {
  constructor(setting) {
    this.setting = setting;
    const P = setting.parameters.length;
    this.weights = new Float64Array(setting.elements.length);
    this.values = new Float64Array(P);
    this.slot = Int32Array.from(
      setting.elements,
      (e) => e.known ? MOTION_SYNC_ELEMENTS.indexOf(e.id) : -1
    );
    this.span = Float64Array.from({ length: P }, (_, k) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of setting.shapes) {
        lo = Math.min(lo, s[k]);
        hi = Math.max(hi, s[k]);
      }
      return hi > lo ? hi - lo : 0;
    });
    const silence = setting.elements.findIndex((e) => e.id === "Silence");
    this.rest = Float64Array.from(
      { length: P },
      (_, k) => silence >= 0 ? setting.shapes[silence][k] : 0
    );
  }
  setting;
  /** Element weights p_e (after normalization), in the setting's element order. */
  weights;
  /** Engine outputs y_k. */
  values;
  started = false;
  span;
  rest;
  slot;
  /** Forgets the smoothing state: the next step starts from its own shape. */
  reset() {
    this.started = false;
  }
  /** One tick of `dt` seconds with the analysis `a`. */
  step(a, dt) {
    const s = this.setting;
    const E = s.elements.length;
    const p = this.weights;
    let sum = 0;
    for (let e = 0; e < E; e++) {
      const el = s.elements[e];
      const slot = this.slot[e];
      let r = slot < 0 || !el.enabled ? 0 : a.silent ? slot === SILENCE ? 1 : 0 : a.raw[slot];
      r *= el.scale;
      p[e] = r;
      sum += r;
    }
    if (sum > 0) for (let e = 0; e < E; e++) p[e] = p[e] / sum;
    else for (let e = 0; e < E; e++) p[e] = s.elements[e].id === "Silence" ? 1 : 0;
    let best = -1;
    for (let e = 0; e < E; e++) if (best < 0 || p[e] > p[best]) best = e;
    const br = s.blendRatio;
    for (let k = 0; k < s.parameters.length; k++) {
      let v = 0;
      for (let e = 0; e < E; e++) {
        const q2 = br * p[e] + (e === best ? 1 - br : 0);
        v += q2 * s.shapes[e][k];
      }
      if (!this.started) {
        this.values[k] = v;
        continue;
      }
      const u = this.values[k];
      const x2 = (s.smoothing - 1) / 99;
      const attack = 0.02 * 25 ** x2;
      const release = 1.5 * attack;
      const rest = this.rest[k];
      const opening = Math.abs(v - rest) > Math.abs(u - rest);
      const limit = this.span[k] * (Math.max(0, dt) / (opening ? attack : release));
      this.values[k] = u + Math.min(limit, Math.max(-limit, v - u));
    }
    this.started = true;
  }
};
var signals = /* @__PURE__ */ new WeakMap();
var MotionSyncDriver = class {
  constructor(file, values, options = {}) {
    this.file = file;
    this.values = values;
    this.options = options;
    this.profile = options.profile ?? null;
  }
  file;
  values;
  options;
  states = /* @__PURE__ */ new Map();
  bound = null;
  binding = null;
  /** Seconds of silence fed since the sound ended, or −1 while it plays. */
  settling = -1;
  latest = null;
  listeners = /* @__PURE__ */ new Set();
  /** Warnings from resolving settings against the model. */
  warnings = [];
  /** Source samples of the bound sound consumed so far (sample accounting). */
  consumed = 0;
  profile;
  /** The setting that writes, or null. */
  get setting() {
    return this.bound?.setting ?? null;
  }
  /** The bound setting's driven parameter IDs (for lip sync to leave alone). */
  get drivenIds() {
    return this.bound?.setting.parameters.map((p) => p.id) ?? [];
  }
  /** The latest tick of the bound setting, or null before its first. */
  get tick() {
    return this.latest;
  }
  /** Calls `listener` after every tick; returns a function that removes it. */
  onTick(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Sets the voice profile of every setting's analysis (null: the neutral voice). */
  setProfile(profile) {
    this.profile = profile;
    for (const s of this.states.values()) s.analyzer.profile = profile;
  }
  state(setting) {
    let st = this.states.get(setting.index);
    if (st) return st;
    const v = this.values;
    const targets = Int32Array.from(setting.parameters, (p) => {
      const i2 = v.index(p.id);
      if (i2 < 0)
        this.warnings.push(
          `${this.file.label}: "${setting.name || setting.id}" drives ${p.id}, which the model lacks; it is not written`
        );
      else if (p.min !== v.min[i2] || p.max !== v.max[i2])
        this.warnings.push(
          `${this.file.label}: "${setting.name || setting.id}" gives ${p.id} the range [${p.min}, ${p.max}], the model [${v.min[i2]}, ${v.max[i2]}]; driven anyway`
        );
      return i2;
    });
    const analyzerOptions = { profile: this.profile };
    if (this.options.gate !== void 0) analyzerOptions.gate = this.options.gate;
    if (this.options.hangover !== void 0) analyzerOptions.hangover = this.options.hangover;
    st = {
      setting,
      targets,
      clock: new TickClock(setting.sampleRate),
      engine: new SettingEngine(setting),
      filter: new ParameterFilter(
        Float64Array.from(setting.parameters, (p) => p.smooth),
        Float64Array.from(setting.parameters, (p) => p.damper),
        this.options.fileSmoothing ?? false
      ),
      analyzer: new VowelAnalyzer(analyzerOptions),
      hasResult: false,
      fresh: true,
      sinceTick: 0
    };
    this.states.set(setting.index, st);
    return st;
  }
  bind(setting) {
    if (!setting.usable) return null;
    const st = this.state(setting);
    if (this.bound !== st) {
      st.fresh = true;
      st.hasResult = false;
      st.clock.time = 0;
      st.sinceTick = 0;
      st.engine.reset();
      st.analyzer.reset();
    }
    this.bound = st;
    this.settling = -1;
    this.latest = null;
    return st;
  }
  /**
   * Binds a decoded sound to `setting`, from its start. `clock` gives the
   * playback position (an audio clock); without one, the position is the
   * sum of the frames' steps. Returns false for an unusable setting.
   */
  playSound(setting, sound, clock = null) {
    const st = this.bind(setting);
    if (!st) return false;
    let cached = signals.get(sound);
    if (!cached) {
      cached = { signal: toAnalysisRate(sound.channels, sound.sampleRate), statistics: /* @__PURE__ */ new Map() };
      signals.set(sound, cached);
    }
    const { signal } = cached;
    const gate = st.analyzer.gate;
    let stats = cached.statistics.get(gate);
    if (!stats) {
      stats = soundStatistics(signal, gate);
      cached.statistics.set(gate, stats);
    }
    st.analyzer.reference = stats.reference;
    st.analyzer.noise = stats.noise;
    this.binding = {
      kind: "sound",
      sound,
      signal,
      sourceRate: sound.sampleRate,
      sourceFrames: sound.channels[0]?.length ?? 0,
      clock,
      time: 0,
      consumed: 0,
      fade: null
    };
    this.consumed = 0;
    return true;
  }
  /** Binds a live input to `setting`. Returns false for an unusable setting. */
  setInput(setting, input) {
    const st = this.bind(setting);
    if (!st) return false;
    st.analyzer.reference = null;
    st.analyzer.noise = null;
    this.binding = {
      kind: "live",
      input,
      resampler: input.sampleRate === ANALYSIS_RATE ? null : new Resampler(input.sampleRate, ANALYSIS_RATE),
      recent: new Float32Array(ANALYSIS_WINDOW),
      time: 0
    };
    return true;
  }
  /** The sound or live input bound, or null. */
  get source() {
    const b = this.binding;
    return b ? b.kind === "sound" ? b.sound : b.input : null;
  }
  /** A sound is bound and playing (not yet settling). */
  get playing() {
    return this.binding !== null && this.settling < 0;
  }
  /**
   * Ends the sound or input: the setting is fed silence until it settles, and
   * then stops writing. With `fade` > 0, a sound fades out over that many
   * seconds first.
   */
  stop(fade = 0) {
    const b = this.binding;
    if (!b) return;
    if (b.kind === "sound" && fade > 0 && this.settling < 0) {
      b.fade = { from: b.time, seconds: fade };
      return;
    }
    if (this.settling < 0) this.settling = 0;
  }
  /** Stops writing at once. */
  clear() {
    this.binding = null;
    this.bound = null;
    this.settling = -1;
    this.latest = null;
  }
  /** One frame of step `dt`: audio, tick, analysis, engine, filter, write. */
  frame(dt) {
    const st = this.bound;
    const b = this.binding;
    if (!st || !b) return;
    const v = this.values;
    if (st.fresh) {
      st.filter.reset(Array.from(st.targets, (i2) => i2 >= 0 ? v.values[i2] : 0));
      st.fresh = false;
    }
    const step = dt > 0 ? dt : 0;
    let signal = b.kind === "sound" ? b.signal : b.recent;
    let start = 0;
    let gain = 1;
    if (b.kind === "sound") {
      const before = b.time;
      const position = b.clock?.() ?? null;
      b.time = position === null ? b.time + step : Math.max(b.time, position);
      const was = Math.min(b.sourceFrames, Math.round(before * b.sourceRate));
      const now = Math.min(b.sourceFrames, Math.round(b.time * b.sourceRate));
      b.consumed += now - was;
      this.consumed = b.consumed;
      if (b.fade) gain = Math.max(0, 1 - (b.time - b.fade.from) / b.fade.seconds);
      if (this.settling < 0 && (now >= b.sourceFrames || gain <= 0)) this.settling = 0;
      start = Math.round(b.time * ANALYSIS_RATE) - ANALYSIS_WINDOW / 2;
    } else {
      const fresh = b.input.read();
      const add2 = b.resampler ? b.resampler.push(fresh) : Float32Array.from(fresh);
      b.time += fresh.length / b.input.sampleRate;
      if (add2.length >= ANALYSIS_WINDOW) b.recent = add2.slice(add2.length - ANALYSIS_WINDOW);
      else if (add2.length > 0) {
        const r = new Float32Array(ANALYSIS_WINDOW);
        r.set(b.recent.subarray(add2.length));
        r.set(add2, ANALYSIS_WINDOW - add2.length);
        b.recent = r;
      }
      signal = b.recent;
    }
    if (this.settling >= 0) {
      this.settling += step;
      signal = SILENT;
      start = 0;
      gain = 1;
    }
    st.sinceTick += step;
    if (st.clock.advance(dt)) {
      const h = st.sinceTick;
      st.sinceTick = 0;
      const a = st.analyzer.analyze(signal, start, h);
      if (gain < 1) {
        a.level += 20 * Math.log10(gain);
        if (!(a.level >= st.analyzer.gate)) {
          a.silent = true;
          a.raw.fill(0);
          a.raw[SILENCE] = 1;
        }
      }
      st.engine.step(a, h);
      st.filter.step(st.engine.values);
      st.hasResult = true;
      this.report(st, a, b);
    }
    if (st.hasResult)
      st.targets.forEach((i2, k) => {
        const d = st.filter.output[k];
        if (i2 >= 0 && !Number.isNaN(d)) v.setAt(i2, d);
      });
    if (this.settling >= 0 && this.settled(st)) this.clear();
  }
  /** Every parameter within its Damper of the Silence shape, or the settle time is up. */
  settled(st) {
    if (this.settling >= (this.options.settleTime ?? 0.5)) return true;
    const s = st.setting;
    const silence = s.elements.findIndex((e) => e.id === "Silence");
    return s.parameters.every((p, k) => {
      const rest = silence >= 0 ? s.shapes[silence][k] : 0;
      return Math.abs(st.filter.output[k] - rest) <= p.damper;
    });
  }
  report(st, a, b) {
    const weights = Object.fromEntries(
      MOTION_SYNC_ELEMENTS.map((e) => [e, 0])
    );
    st.setting.elements.forEach((e, i2) => {
      if (e.known) weights[e.id] += st.engine.weights[i2];
    });
    const values = {};
    st.setting.parameters.forEach((p, k) => values[p.id] = st.filter.output[k]);
    this.latest = {
      setting: { name: st.setting.name, id: st.setting.id },
      source: b.kind,
      level: a.level,
      silent: a.silent,
      weights,
      values,
      time: b.time
    };
    for (const l of this.listeners) l(this.latest);
  }
};
var SILENT = new Float32Array(ANALYSIS_WINDOW);

// src/anim/animator.ts
var Animator = class {
  constructor(model, settings, assets = {}, options = {}) {
    this.model = model;
    this.settings = settings;
    const v = this.values = new AnimationValues(model);
    v.wrap = options.wrap ?? false;
    this.random = options.random ?? Math.random;
    const groupMotion = options.groupMotion;
    this.idleMotion = options.idleList?.motion ?? ((index) => groupMotion?.("Idle", index) ?? null);
    this.onIdleStart = options.onIdleStart;
    const blink = parameterGroupIds(settings, "EyeBlink");
    const lip = parameterGroupIds(settings, "LipSync");
    this.motions = new MotionQueue({ eyeBlink: blink, lipSync: lip });
    this.eyeBlink = blink.length > 0 ? new EyeBlink(blink, () => this.draw(), { ...REFERENCE_EYE_BLINK, ...options.eyeBlink }) : null;
    this.breath = new Breath(options.breath ?? REFERENCE_BREATH);
    this.look = new Look(options.look ?? REFERENCE_LOOK);
    this.lipSync = lip.length > 0 ? new LipSync(lip) : null;
    this.physics = assets.physics ? new PhysicsRig(assets.physics, v) : null;
    if (this.physics) {
      if (options.gravity) this.physics.gravity = options.gravity;
      if (options.wind) this.physics.wind = options.wind;
      if (options.settle) this.physics.settle();
    }
    this.poseRig = assets.pose ? new PoseRig(assets.pose, v) : null;
    const { beforePhysics, ...syncOptions } = options.motionSync ?? {};
    this.motionSync = assets.motionSync ? new MotionSyncDriver(assets.motionSync, v, syncOptions) : null;
    this.motionSyncBeforePhysics = beforePhysics === true;
    this.idleListCount = options.idleList?.count;
    this.enabled = {
      idle: this.idleCount > 0,
      eyeBlink: this.eyeBlink !== null,
      expressions: true,
      look: true,
      breath: true,
      physics: this.physics !== null,
      lipSync: this.lipSync !== null,
      pose: this.poseRig !== null,
      motionSync: this.motionSync !== null
    };
  }
  model;
  settings;
  values;
  motions;
  expressions = new ExpressionQueue();
  /** Expressions added on top of the queue, several at once (not reference behavior). */
  expressionLayers = new ExpressionLayers();
  eyeBlink;
  breath;
  look;
  physics;
  lipSync;
  poseRig;
  /** Motion sync, when the model has a motion-sync file. */
  motionSync;
  motionSyncBeforePhysics;
  enabled;
  /** The `idleList` option's count, if given. */
  idleListCount;
  random;
  idleMotion;
  onIdleStart;
  /** The pose, when the model has a pose file (or one was set, {@link setPose}). */
  get pose() {
    return this.poseRig;
  }
  /**
   * Replaces the pose with `file`'s (null: no pose), for an editor that
   * changes it. The new pose sets the parts up on its first frame, as at
   * load; turning the pose effect on stays the caller's choice.
   */
  setPose(file) {
    this.poseRig = file ? new PoseRig(file, this.values) : null;
  }
  /**
   * Number of motions idle playback picks from: the settings' `Idle` group
   * as it is now (an editor may change the settings' motions), or the
   * `idleList` option's count.
   */
  get idleCount() {
    return this.idleListCount ?? this.settings.motions.find((g) => g.group === "Idle")?.entries.length ?? 0;
  }
  draw() {
    const r = this.random();
    if (!(r >= 0 && r < 1)) throw new RangeError(`random draw ${r} is not in [0, 1)`);
    return r;
  }
  // ------------------------------------------------------------- commands
  /** Starts a motion (3l.4); its sound starts too when the start is accepted. */
  startMotion(resolved, opts = {}) {
    const start = { ...opts };
    if (start.fadeIn === void 0 && resolved.fadeIn !== void 0) start.fadeIn = resolved.fadeIn;
    if (start.fadeOut === void 0 && resolved.fadeOut !== void 0)
      start.fadeOut = resolved.fadeOut;
    const accepted = this.motions.start(resolved.motion, start);
    if (accepted && resolved.sound !== void 0) this.startSound(resolved.sound);
    return accepted;
  }
  startExpression(expression) {
    this.expressions.start(expression);
  }
  setLookTarget(x2, y) {
    this.look.setTarget(x2, y);
  }
  /** Starts lip sync on a sound; null (a file that could not be loaded) stops it. */
  startSound(sound) {
    this.lipSync?.start(sound);
  }
  /**
   * Adds a live lip-sync input (a microphone; not reference behavior), or
   * removes it with null. Returns false when there is no lip sync.
   */
  setLiveLipSync(source, mix = "add") {
    if (!this.lipSync) return false;
    this.lipSync.setLive(source, mix);
    return true;
  }
  setPartOpacity(id, value) {
    this.values.setPartOpacity(id, value);
  }
  stopMotions() {
    this.motions.stopAll();
  }
  /**
   * An application edit of a parameter's base value (a viewer slider): it is
   * saved, so it persists like a motion's result, and effects apply on top.
   */
  setBaseParameter(index, value) {
    const v = this.values;
    v.setAt(index, value);
    v.saved[index] = v.values[index];
  }
  // ---------------------------------------------------------------- frame
  /** One frame of the procedure of 3j (steps 1–4), with step Δ. */
  frame(dt) {
    const v = this.values;
    const on = this.enabled;
    v.restore();
    let motionUpdated = false;
    let events = [];
    if (this.motions.empty) {
      if (on.idle && this.idleCount > 0) {
        const index = Math.floor(this.draw() * this.idleCount);
        const resolved = this.idleMotion(index);
        const started = resolved ? this.startMotion(resolved, { priority: 1 }) : false;
        this.onIdleStart?.(index, started);
      }
    } else {
      events = this.motions.advance(dt, v);
      motionUpdated = true;
    }
    v.save();
    if (this.eyeBlink && on.eyeBlink && (!motionUpdated || this.motions.blinkAllowed))
      this.eyeBlink.frame(dt, v);
    if (on.expressions) {
      this.expressions.advance(dt, v);
      this.expressionLayers.advance(dt, v);
    }
    if (on.look) this.look.frame(dt, v);
    if (on.breath) this.breath.frame(dt, v);
    const sync = this.motionSync && on.motionSync ? this.motionSync : null;
    if (sync && this.motionSyncBeforePhysics) sync.frame(dt);
    if (this.physics && on.physics) this.physics.frame(dt);
    let lipSync = null;
    if (this.lipSync && on.lipSync) {
      const driven = sync?.setting ? new Set(sync.drivenIds) : void 0;
      this.lipSync.frame(dt, v, driven);
      lipSync = this.lipSync.value;
    }
    if (sync && !this.motionSyncBeforePhysics) sync.frame(dt);
    if (this.poseRig && on.pose) this.poseRig.frame(dt);
    return {
      motionUpdated,
      queueEmpty: this.motions.empty,
      events,
      lipSync,
      ends: this.motions.takeEnds()
    };
  }
  /** Step 5's input: hands parameter values and part opacities to an evaluation instance. */
  applyTo(inst) {
    const v = this.values;
    for (let i2 = 0; i2 < v.values.length; i2++) inst.setParameter(i2, v.values[i2]);
    for (let i2 = 0; i2 < v.partOpacities.length; i2++) inst.setPartOpacity(i2, v.partOpacities[i2]);
  }
};

// src/anim/model-data.ts
function vertexBounds(vertices) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i2 = 0; i2 + 1 < vertices.length; i2 += 2) {
    const x2 = vertices[i2];
    const y = vertices[i2 + 1];
    if (x2 < minX) minX = x2;
    if (x2 > maxX) maxX = x2;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
function parseUserData(input, label = "user data") {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  const list = arr(json.UserData);
  const count = num2(obj(json.Meta).UserDataCount, list.length);
  if (count > list.length)
    throw new AnimationFormatError(
      `${label}: UserDataCount ${count} exceeds the ${list.length} entries`
    );
  const all = list.slice(0, Math.max(0, count)).map((e) => {
    const ee = obj(e);
    return { target: str2(ee.Target), id: str2(ee.Id), value: str2(ee.Value) };
  });
  return { all, artMeshes: all.filter((e) => e.target === "ArtMesh") };
}
function parseDisplayInfo(input, label = "display info") {
  const json = typeof input === "string" || input instanceof Uint8Array ? parseJson(input, label) : input;
  if (!isObject2(json)) throw new AnimationFormatError(`${label}: not a JSON object`);
  const entries = (v) => arr(v).map((e) => {
    const ee = obj(e);
    return { id: str2(ee.Id), groupId: str2(ee.GroupId), name: str2(ee.Name) };
  });
  return {
    parameters: entries(json.Parameters),
    parameterGroups: entries(json.ParameterGroups),
    parts: arr(json.Parts).map((e) => ({ id: str2(obj(e).Id), name: str2(obj(e).Name) })),
    combinedParameters: arr(json.CombinedParameters).map((p) => arr(p)).filter((p) => p.length === 2 && p.every((x2) => typeof x2 === "string")).map((p) => [p[0], p[1]])
  };
}
function displayLabels(modelIds, info, kind2) {
  if (!info) return modelIds.map((id) => ({ id, label: id, group: void 0 }));
  const names = /* @__PURE__ */ new Map();
  const list = kind2 === "parameters" ? info.parameters : info.parts.map((p) => ({ ...p, groupId: "" }));
  for (const e of list) if (!names.has(e.id)) names.set(e.id, { name: e.name, groupId: e.groupId });
  const groups = /* @__PURE__ */ new Map();
  for (const g of info.parameterGroups) if (!groups.has(g.id)) groups.set(g.id, g.name || g.id);
  const labels = modelIds.map((id) => {
    const n = names.get(id);
    const group = n && n.groupId && groups.has(n.groupId) ? groups.get(n.groupId) : void 0;
    return { id, label: n?.name || id, group };
  });
  if (kind2 === "parts") return labels;
  const order = /* @__PURE__ */ new Map([[void 0, -1]]);
  [...groups.values()].forEach((name2, i2) => order.has(name2) || order.set(name2, i2));
  return labels.map((l, i2) => ({ l, i: i2 })).sort((a, b) => order.get(a.l.group) - order.get(b.l.group) || a.i - b.i).map((x2) => x2.l);
}

// src/core/io/model-files.ts
var SUFFIXES = [
  [".model3.json", "settings"],
  [".moc3", "moc"],
  [".motion3.json", "motion"],
  [".exp3.json", "expression"],
  [".physics3.json", "physics"],
  [".pose3.json", "pose"],
  [".userdata3.json", "userdata"],
  [".cdi3.json", "displayinfo"],
  [".png", "texture"],
  [".wav", "sound"],
  [".mp3", "sound"],
  [".ogg", "sound"]
];
function classifyModelFile(path) {
  const lower = path.toLowerCase();
  for (const [suffix, kind2] of SUFFIXES) if (lower.endsWith(suffix)) return kind2;
  return "other";
}

// node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i323 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i323(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits2 = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits2(dat, pos, 1);
      var type = bits2(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits2(dat, pos, 31) + 257, hcLen = bits2(dat, pos + 10, 15) + 4;
        var tl = hLit + bits2(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits2(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits2(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits2(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits2(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits2(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add2 = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add2 = bits2(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add2;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i2 = 0; i2 < d.length; ++i2) {
    if (d[i2])
      t.push({ s: i2, f: d[i2] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i22].f ? i0++ : i22++];
    r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i2 = 1; i2 < s; ++i2) {
    if (t2[i2].s > maxSym)
      maxSym = t2[i2].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i2 = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i2 < s; ++i2) {
      var i2_1 = t2[i2].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i2].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i2;
    }
    for (; i2 >= 0 && dt; --i2) {
      var i2_3 = t2[i2].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i2 = 1; i2 <= s; ++i2) {
    if (c[i2] == cln && i2 != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i2];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i2 = 0; i2 < cl.length; ++i2)
    l += cf[i2] * cl[i2];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i2 = 0; i2 < s; ++i2)
    out[o + i2 + 4] = dat[i2];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i2 = 0; i2 < lclt.length; ++i2)
    ++lcfreq[lclt[i2] & 31];
  for (var i2 = 0; i2 < lcdt.length; ++i2)
    ++lcfreq[lcdt[i2] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i2 = 0; i2 < nlcc; ++i2)
      wbits(out, p + 3 * i2, lct[clim[i2]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i2 = 0; i2 < clct.length; ++i2) {
        var len = clct[i2] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i2 = 0; i2 < li; ++i2) {
    var sym = syms[i2];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i323([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i3) {
      return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
    };
    var syms = new i323(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i2 + 2 < s; ++i2) {
      var hv = hsh(i2);
      var imod = i2 & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i2) {
        var rem = s - i2;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
          li = lc_1 = eb = 0, bs = i2;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i2 - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i2);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i2 + l] == dat[i2 + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i2 - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i2 + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i2];
          ++lf[dat[i2]];
        }
      }
    }
    for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
      syms[li++] = dat[i2];
      ++lf[dat[i2]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i2, st.w = wi;
    }
  } else {
    for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
      var e = i2 + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i2, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var adler = function() {
  var a = 1, b = 0;
  return {
    p: function(d) {
      var n = a, m = b;
      var l = d.length | 0;
      for (var i2 = 0; i2 != l; ) {
        var e = Math.min(i2 + 2655, l);
        for (; i2 < e; ++i2)
          m += n += d[i2];
        n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
      }
      a = n, b = m;
    },
    d: function() {
      a %= 65521, b %= 65521;
      return (a & 255) << 24 | (a & 65280) << 8 | (b & 255) << 8 | b >> 8;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
var zlh = function(c, o) {
  var lv = o.level, fl2 = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
  c[0] = 120, c[1] = fl2 << 6 | (o.dictionary && 32);
  c[1] |= 31 - (c[0] << 8 | c[1]) % 31;
  if (o.dictionary) {
    var h = adler();
    h.p(o.dictionary);
    wbytes(c, 2, h.d());
  }
};
var Inflate = /* @__PURE__ */ (function() {
  function Inflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
    this.s = { i: 0, b: dict ? dict.length : 0 };
    this.o = new u8(32768);
    this.p = new u8(0);
    if (dict)
      this.o.set(dict);
  }
  Inflate2.prototype.e = function(c) {
    if (!this.ondata)
      err(5);
    if (this.d)
      err(4);
    if (!this.p.length)
      this.p = c;
    else if (c.length) {
      var n = new u8(this.p.length + c.length);
      n.set(this.p), n.set(c, this.p.length), this.p = n;
    }
  };
  Inflate2.prototype.c = function(final) {
    this.s.i = +(this.d = final || false);
    var bts = this.s.b;
    var dt = inflt(this.p, this.s, this.o);
    this.ondata(slc(dt, bts, this.s.b), this.d);
    this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
    this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  };
  Inflate2.prototype.push = function(chunk, final) {
    this.e(chunk), this.c(final);
  };
  return Inflate2;
})();
function zlibSync(data, opts) {
  if (!opts)
    opts = {};
  var a = adler();
  a.p(data);
  var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
  return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// src/runtime/zip-archive.ts
var ZipFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipFormatError";
  }
};
var DEFAULT_ARCHIVE_LIMITS = Object.freeze({
  maxEntryBytes: 256 * 2 ** 20,
  maxTotalBytes: 2 ** 30,
  maxEntries: 1e4
});
var ArchiveLimitError = class extends Error {
  constructor(path, kind2, limit, size) {
    super(
      kind2 === "entries" ? `${path}: the archive lists ${size} entries, more than the ${limit} allowed` : kind2 === "entry" ? `"${path}" inflates to ${size} bytes or more, more than the ${limit} allowed for one entry` : `"${path}": reading it takes the archive past the ${limit} bytes allowed in total (${size})`
    );
    this.path = path;
    this.kind = kind2;
    this.limit = limit;
    this.size = size;
    this.name = "ArchiveLimitError";
  }
  path;
  kind;
  limit;
  size;
};
var ZIP_FLAG_UTF8 = 2048;
var SIG_LOCAL = 67324752;
var SIG_CENTRAL = 33639248;
var SIG_END = 101010256;
var SIG_END64 = 101075792;
var SIG_END64_LOCATOR = 117853008;
var u162 = (b, o) => b[o] | b[o + 1] << 8;
var u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
var u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;
function looksLikeZip(bytes) {
  if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75) return false;
  const sig = u32(bytes, 0);
  return sig === SIG_LOCAL || sig === SIG_END || sig === 134695760;
}
function findExtraField(extra, id) {
  for (let o = 0; o + 4 <= extra.length; ) {
    const tag4 = u162(extra, o);
    const size = u162(extra, o + 2);
    if (o + 4 + size > extra.length) return void 0;
    if (tag4 === id) return extra.subarray(o + 4, o + 4 + size);
    o += 4 + size;
  }
  return void 0;
}
function findEnd(bytes) {
  const last = bytes.length - 22;
  const first = Math.max(0, last - 65535);
  for (let o = last; o >= first; o--) {
    if (bytes[o] === 80 && bytes[o + 1] === 75 && u32(bytes, o) === SIG_END) {
      if (o + 22 + u162(bytes, o + 20) <= bytes.length) return o;
    }
  }
  return -1;
}
function readZipDirectory(bytes, maxEntries = Infinity, label = "archive") {
  const end = findEnd(bytes);
  if (end < 0) throw new ZipFormatError("not a zip archive (no end of central directory record)");
  let count = u162(bytes, end + 10);
  let size = u32(bytes, end + 12);
  let offset = u32(bytes, end + 16);
  if (count === 65535 || size === 4294967295 || offset === 4294967295) {
    const loc = end - 20;
    if (loc >= 0 && u32(bytes, loc) === SIG_END64_LOCATOR) {
      const e64 = u64(bytes, loc + 8);
      if (e64 + 56 <= bytes.length && u32(bytes, e64) === SIG_END64) {
        count = u64(bytes, e64 + 32);
        size = u64(bytes, e64 + 40);
        offset = u64(bytes, e64 + 48);
      }
    }
  }
  if (count > maxEntries) throw new ArchiveLimitError(label, "entries", maxEntries, count);
  let shift = 0;
  if (offset + 4 > bytes.length || u32(bytes, offset) !== SIG_CENTRAL) {
    const start = end - size;
    if (count > 0 && start >= 0 && u32(bytes, start) === SIG_CENTRAL) shift = start - offset;
    else if (count > 0)
      throw new ZipFormatError("the central directory is not where the archive says");
  }
  const records = [];
  let o = offset + shift;
  for (let i2 = 0; i2 < count; i2++) {
    if (o + 46 > bytes.length || u32(bytes, o) !== SIG_CENTRAL)
      throw new ZipFormatError(`central directory entry ${i2} is damaged`);
    const nameLen = u162(bytes, o + 28);
    const extraLen = u162(bytes, o + 30);
    const commentLen = u162(bytes, o + 32);
    const rawName = bytes.subarray(o + 46, o + 46 + nameLen);
    const extra = bytes.subarray(o + 46 + nameLen, o + 46 + nameLen + extraLen);
    let compressedSize = u32(bytes, o + 20);
    let fileSize = u32(bytes, o + 24);
    let localOffset = u32(bytes, o + 42);
    if (compressedSize === 4294967295 || fileSize === 4294967295 || localOffset === 4294967295) {
      const z = findExtraField(extra, 1);
      let p = 0;
      const next = () => {
        if (!z || p + 8 > z.length) throw new ZipFormatError(`entry ${i2}: damaged ZIP64 field`);
        const v = u64(z, p);
        p += 8;
        return v;
      };
      if (fileSize === 4294967295) fileSize = next();
      if (compressedSize === 4294967295) compressedSize = next();
      if (localOffset === 4294967295) localOffset = next();
    }
    records.push({
      rawName,
      flags: u162(bytes, o + 8),
      method: u162(bytes, o + 10),
      crc32: u32(bytes, o + 16),
      compressedSize,
      size: fileSize,
      localOffset: localOffset + shift,
      extra
    });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return records;
}
function localExtraField(bytes, rec) {
  const o = rec.localOffset;
  if (o + 30 > bytes.length || u32(bytes, o) !== SIG_LOCAL) return new Uint8Array(0);
  const nameLen = u162(bytes, o + 26);
  const extraLen = u162(bytes, o + 28);
  return bytes.subarray(o + 30 + nameLen, o + 30 + nameLen + extraLen);
}
function declaredSize(rec) {
  return rec.method === 0 ? rec.compressedSize : rec.size;
}
var STEP_SLACK = 16 * 2 ** 20;
var MAX_STEP = 64 * 1024;
function zipEntryData(bytes, rec, name2, maxBytes = Infinity) {
  const o = rec.localOffset;
  if (o + 30 > bytes.length || u32(bytes, o) !== SIG_LOCAL)
    throw new ZipFormatError(`"${name2}": the local header is missing`);
  if (rec.flags & 1) throw new ZipFormatError(`"${name2}" is encrypted, which is not supported`);
  if (rec.method !== 0 && rec.method !== 8)
    throw new ZipFormatError(
      `"${name2}" uses compression method ${rec.method}; only stored and deflated entries are supported`
    );
  const size = declaredSize(rec);
  if (size > maxBytes) throw new ArchiveLimitError(name2, "entry", maxBytes, size);
  const start = o + 30 + u162(bytes, o + 26) + u162(bytes, o + 28);
  const end = start + rec.compressedSize;
  if (end > bytes.length) throw new ZipFormatError(`"${name2}" is cut off`);
  const data = bytes.subarray(start, end);
  let out;
  if (rec.method === 0) out = data.slice();
  else {
    if (rec.size > 1032 * rec.compressedSize + 64)
      throw new ZipFormatError(
        `"${name2}" claims ${rec.size} bytes from ${rec.compressedSize} compressed bytes, more than deflate produces`
      );
    out = inflateCounted(data, rec.size, name2);
  }
  if (crc32(out) !== rec.crc32)
    throw new ZipFormatError(`"${name2}" is damaged: its CRC-32 does not match the archive's`);
  return out;
}
function inflateCounted(data, size, name2) {
  const out = new Uint8Array(size);
  let n = 0;
  let over = false;
  const inflater = new Inflate((chunk) => {
    if (over) return;
    if (n + chunk.length > size) {
      over = true;
      return;
    }
    out.set(chunk, n);
    n += chunk.length;
  });
  try {
    if (data.length === 0) inflater.push(data, true);
    for (let at4 = 0; at4 < data.length && !over; ) {
      const step = Math.min(MAX_STEP, Math.floor(Math.max((size - n) / 4, STEP_SLACK) / 1032));
      const stop = Math.min(at4 + step, data.length);
      inflater.push(data.subarray(at4, stop), stop === data.length);
      at4 = stop;
    }
  } catch (e) {
    throw new ZipFormatError(
      `"${name2}": the compressed data is damaged (${e instanceof Error ? e.message : String(e)})`
    );
  }
  if (over)
    throw new ZipFormatError(
      `"${name2}" inflates past the ${size} bytes its directory record declares (damaged or crafted)`
    );
  if (n !== size) throw new ZipFormatError(`"${name2}": expected ${size} bytes, got ${n}`);
  return out;
}
var crcTables;
function crcTablesFor() {
  if (crcTables) return crcTables;
  const t0 = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t0[n] = c >>> 0;
  }
  const tables = [t0];
  for (let k = 1; k < 8; k++) {
    const prev = tables[k - 1];
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) t[n] = prev[n] >>> 8 ^ t0[prev[n] & 255];
    tables.push(t);
  }
  return crcTables = tables;
}
function crc32(bytes) {
  const [t0, t1, t2, t3, t4, t5, t6, t7] = crcTablesFor();
  let c = 4294967295;
  let i2 = 0;
  const n8 = bytes.length - bytes.length % 8;
  for (; i2 < n8; i2 += 8) {
    c ^= bytes[i2] | bytes[i2 + 1] << 8 | bytes[i2 + 2] << 16 | bytes[i2 + 3] << 24;
    c = t7[c & 255] ^ t6[c >>> 8 & 255] ^ t5[c >>> 16 & 255] ^ t4[c >>> 24] ^ t3[bytes[i2 + 4]] ^ t2[bytes[i2 + 5]] ^ t1[bytes[i2 + 6]] ^ t0[bytes[i2 + 7]];
  }
  for (; i2 < bytes.length; i2++) c = t0[(c ^ bytes[i2]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}

// src/runtime/zip-names.ts
var LEGACY_ZIP_ENCODINGS = ["gb18030", "shift_jis", "euc-kr", "big5"];
var hostDecoders = /* @__PURE__ */ new Map();
function hostDecoder(label) {
  let d = hostDecoders.get(label);
  if (d === void 0) {
    const Ctor = globalThis.TextDecoder;
    try {
      d = Ctor ? new Ctor(label, { fatal: true }) : null;
    } catch {
      d = null;
    }
    hostDecoders.set(label, d);
  }
  return d;
}
var isAscii = (b) => b.every((x2) => x2 < 128);
function decodeUtf8Strict(bytes) {
  for (let i2 = 0; i2 < bytes.length; ) {
    const b0 = bytes[i2];
    if (b0 < 128) {
      i2++;
      continue;
    }
    const len = b0 >= 194 && b0 < 224 ? 2 : b0 >= 224 && b0 < 240 ? 3 : b0 >= 240 && b0 < 245 ? 4 : 0;
    if (len === 0 || i2 + len > bytes.length) return void 0;
    let v = b0 & 255 >> len + 1;
    for (let k = 1; k < len; k++) {
      const b = bytes[i2 + k];
      if ((b & 192) !== 128) return void 0;
      v = v << 6 | b & 63;
    }
    const min = len === 2 ? 128 : len === 3 ? 2048 : 65536;
    if (v < min || v > 1114111 || v >= 55296 && v <= 57343) return void 0;
    i2 += len;
  }
  return decodeUtf8(bytes);
}
var CP437_HIGH = "\xC7\xFC\xE9\xE2\xE4\xE0\xE5\xE7\xEA\xEB\xE8\xEF\xEE\xEC\xC4\xC5\xC9\xE6\xC6\xF4\xF6\xF2\xFB\xF9\xFF\xD6\xDC\xA2\xA3\xA5\u20A7\u0192\xE1\xED\xF3\xFA\xF1\xD1\xAA\xBA\xBF\u2310\xAC\xBD\xBC\xA1\xAB\xBB\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255D\u255C\u255B\u2510\u2514\u2534\u252C\u251C\u2500\u253C\u255E\u255F\u255A\u2554\u2569\u2566\u2560\u2550\u256C\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256B\u256A\u2518\u250C\u2588\u2584\u258C\u2590\u2580\u03B1\xDF\u0393\u03C0\u03A3\u03C3\xB5\u03C4\u03A6\u0398\u03A9\u03B4\u221E\u03C6\u03B5\u2229\u2261\xB1\u2265\u2264\u2320\u2321\xF7\u2248\xB0\u2219\xB7\u221A\u207F\xB2\u25A0\xA0";
function decodeCp437(bytes) {
  let s = "";
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : CP437_HIGH[b - 128];
  return s;
}
var inRange = (b, lo, hi) => b !== void 0 && b >= lo && b <= hi;
function legacyCharShape(bytes, encoding) {
  const shape = [];
  for (let i2 = 0; i2 < bytes.length; ) {
    const b = bytes[i2];
    const t = bytes[i2 + 1];
    if (b < 128) {
      shape.push(b);
      i2++;
      continue;
    }
    shape.push(-1);
    switch (encoding) {
      case "gb18030":
        if (b === 128) i2++;
        else if (b === 255) return void 0;
        else if (inRange(t, 48, 57)) {
          if (!inRange(bytes[i2 + 2], 129, 254) || !inRange(bytes[i2 + 3], 48, 57))
            return void 0;
          i2 += 4;
        } else if (inRange(t, 64, 126) || inRange(t, 128, 254)) i2 += 2;
        else return void 0;
        break;
      case "shift_jis":
        if (b === 128 || inRange(b, 161, 223)) i2++;
        else if ((inRange(b, 129, 159) || inRange(b, 224, 252)) && (inRange(t, 64, 126) || inRange(t, 128, 252)))
          i2 += 2;
        else return void 0;
        break;
      case "euc-kr":
        if (inRange(b, 129, 254) && inRange(t, 65, 254)) i2 += 2;
        else return void 0;
        break;
      case "big5":
        if (inRange(b, 129, 254) && (inRange(t, 64, 126) || inRange(t, 161, 254))) i2 += 2;
        else return void 0;
        break;
    }
  }
  return shape;
}
function matchesShape(s, shape, encoding) {
  const cps = [...s].map((c) => c.codePointAt(0));
  let k = 0;
  for (const want of shape) {
    const cp = cps[k++];
    if (cp === void 0 || cp === 65533) return false;
    if (want >= 0 ? cp !== want : cp < 128) return false;
    if (want < 0 && encoding === "big5" && (cps[k] === 772 || cps[k] === 780)) k++;
  }
  return k === cps.length;
}
function decodeLegacy(bytes, encoding) {
  if (encoding === "utf-8") return decodeUtf8Strict(bytes);
  if (encoding === "cp437") return decodeCp437(bytes);
  const shape = legacyCharShape(bytes, encoding);
  const d = hostDecoder(encoding);
  if (!shape || !d) return void 0;
  let s;
  try {
    s = d.decode(bytes);
  } catch {
    return void 0;
  }
  return matchesShape(s, shape, encoding) ? s : void 0;
}
function unicodePathName(rawName, extra) {
  const f = findExtraField(extra, 28789);
  if (!f || f.length < 5 || f[0] !== 1) return void 0;
  const crc = (f[1] | f[2] << 8 | f[3] << 16 | f[4] << 24) >>> 0;
  if (crc !== crc32(rawName)) return void 0;
  return decodeUtf8Strict(f.subarray(5));
}
function decodeZipNames(records, options = {}) {
  const names = [];
  const sources = [];
  const pending = [];
  records.forEach((r, i2) => {
    const unicode = unicodePathName(r.rawName, r.extra) ?? (options.localExtra ? unicodePathName(r.rawName, options.localExtra(i2)) : void 0);
    if (unicode !== void 0) {
      names.push(unicode);
      sources.push("unicode-path");
    } else if (r.flags & ZIP_FLAG_UTF8) {
      names.push(decodeUtf8(r.rawName));
      sources.push("utf-8-flag");
    } else {
      names.push(void 0);
      sources.push("archive-encoding");
      pending.push(i2);
    }
  });
  const decodeAll = (encoding2) => {
    const out = names.slice();
    for (const i2 of pending) {
      const raw = records[i2].rawName;
      const s = isAscii(raw) ? decodeUtf8(raw) : decodeLegacy(raw, encoding2);
      if (s === void 0) return void 0;
      out[i2] = s;
    }
    return out;
  };
  let encoding = "utf-8";
  let decoded = decodeAll("utf-8");
  if (!decoded) {
    const candidates = [];
    for (const e of LEGACY_ZIP_ENCODINGS) {
      const n = decodeAll(e);
      if (n) candidates.push({ encoding: e, names: n });
    }
    let best = candidates[0];
    if (best && candidates.length > 1 && options.score) {
      let bestScore = options.score(best.names);
      for (const c of candidates.slice(1)) {
        const s = options.score(c.names);
        if (s > bestScore) [best, bestScore] = [c, s];
      }
    }
    if (best) {
      encoding = best.encoding;
      decoded = best.names;
    } else {
      encoding = "cp437";
      decoded = decodeAll("cp437");
    }
  }
  return { names: decoded, sources, encoding };
}

// src/runtime/zip-source.ts
function resolveArchiveLimits(limits = {}) {
  const out = { ...DEFAULT_ARCHIVE_LIMITS };
  for (const key of ["maxEntryBytes", "maxTotalBytes", "maxEntries"]) {
    const v = limits[key];
    if (v === void 0) continue;
    if (typeof v !== "number" || Number.isNaN(v) || v < 0)
      throw new RangeError(`${key} must be a number \u2265 0 (Infinity for no cap)`);
    out[key] = v;
  }
  return out;
}
var RAR_SIG = [82, 97, 114, 33, 26, 7];
var SEVEN_ZIP_SIG = [55, 122, 188, 175, 39, 28];
var startsWith = (b, sig) => b.length >= sig.length && sig.every((x2, i2) => b[i2] === x2);
function archiveKind(name2, head) {
  if (head && head.length >= 6) {
    if (startsWith(head, RAR_SIG)) return "rar";
    if (startsWith(head, SEVEN_ZIP_SIG)) return "7z";
    if (looksLikeZip(head)) return "zip";
  }
  const lower = name2.toLowerCase().split(/[?#]/)[0];
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".rar")) return "rar";
  if (lower.endsWith(".7z")) return "7z";
  return void 0;
}
var UnsupportedArchiveError = class extends Error {
  constructor(fileName, kind2) {
    super(
      `"${fileName}" is a ${kind2 === "rar" ? "RAR" : "7z"} archive. Mochi2D opens only zip archives and folders: extract the archive first, then open the extracted folder (or a zip of it).`
    );
    this.fileName = fileName;
    this.kind = kind2;
    this.name = "UnsupportedArchiveError";
  }
  fileName;
  kind;
};
function rejectUnsupportedArchive(name2, head) {
  const kind2 = archiveKind(name2, head);
  if (kind2 === "rar" || kind2 === "7z") throw new UnsupportedArchiveError(name2, kind2);
}
var pathKey = (path) => normalizePath(path).normalize("NFC");
function settingsReferences(s) {
  const refs = [s.moc, ...s.textures];
  for (const f of [s.physics, s.pose, s.userData, s.displayInfo]) if (f) refs.push(f);
  for (const e of s.expressions) refs.push(e.file);
  for (const g of s.motions)
    for (const m of g.entries) {
      refs.push(m.file);
      if (m.sound) refs.push(m.sound);
    }
  return refs;
}
var ZipFileSource = class {
  constructor(label, bytes, limits = {}) {
    this.label = label;
    this.bytes = bytes;
    this.limits = Object.freeze(resolveArchiveLimits(limits));
    if (!looksLikeZip(bytes)) rejectUnsupportedArchive(label, bytes);
    let records;
    try {
      records = readZipDirectory(bytes, this.limits.maxEntries, label);
    } catch (e) {
      if (e instanceof ZipFormatError) throw new ZipFormatError(`${label}: ${e.message}`);
      throw e;
    }
    const settings = /* @__PURE__ */ new Map();
    const settingsRefs = (i2) => {
      let refs = settings.get(i2);
      if (!refs) {
        try {
          refs = settingsReferences(parseModelSettings(this.readRecord(records[i2], "settings")));
        } catch {
          refs = [];
        }
        settings.set(i2, refs);
      }
      return refs;
    };
    const decoded = decodeZipNames(records, {
      localExtra: (i2) => localExtraField(bytes, records[i2]),
      score: (names) => {
        const keys = new Set(names.map((n) => n.normalize("NFC")));
        let resolved = 0;
        names.forEach((n, i2) => {
          if (classifyModelFile(n) !== "settings") return;
          const dir = dirnameOf(n);
          for (const ref of settingsRefs(i2)) {
            try {
              if (keys.has(joinPath(dir, ref).normalize("NFC"))) resolved++;
            } catch {
            }
          }
        });
        return resolved;
      }
    });
    this.nameEncoding = decoded.encoding;
    decoded.names.forEach((name2, i2) => {
      if (name2.endsWith("/") || name2.startsWith("__MACOSX/")) return;
      let key;
      try {
        key = pathKey(name2);
      } catch {
        return;
      }
      if (key) this.entries.set(key, { record: records[i2], name: key });
    });
  }
  label;
  bytes;
  /** The encoding chosen for names that carry no UTF-8 information. */
  nameEncoding;
  /** The caps this source reads with. */
  limits;
  entries = /* @__PURE__ */ new Map();
  /** Entries already counted toward `maxTotalBytes`, and their total. */
  counted = /* @__PURE__ */ new Set();
  total = 0;
  list() {
    return [...this.entries.keys()].sort();
  }
  async read(path) {
    let entry;
    try {
      entry = this.entries.get(pathKey(path));
    } catch {
      entry = void 0;
    }
    if (!entry) throw new FileNotFoundError(path, this.label);
    return this.readRecord(entry.record, entry.name);
  }
  /** Bytes inflated so far, each entry counted once (for `maxTotalBytes`). */
  get inflatedBytes() {
    return this.total;
  }
  /** An entry's data within the caps (module comment). */
  readRecord(record, name2) {
    const first = !this.counted.has(record);
    const { maxEntryBytes, maxTotalBytes } = this.limits;
    if (first && this.total + declaredSize(record) > maxTotalBytes)
      throw new ArchiveLimitError(name2, "total", maxTotalBytes, this.total + declaredSize(record));
    const data = zipEntryData(this.bytes, record, name2, maxEntryBytes);
    if (first) {
      this.counted.add(record);
      this.total += data.length;
    }
    return data;
  }
};
function sourceFromZip(label, bytes, limits = {}) {
  return new ZipFileSource(label, bytes, limits);
}

// src/runtime/bundle.ts
function findSettingsFiles(source) {
  const files = source.list() ?? [];
  return files.filter((p) => classifyModelFile(p) === "settings").sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}
function resolveSettingsPath(source, settingsPath) {
  if (settingsPath) return settingsPath;
  const found = findSettingsFiles(source);
  if (found.length === 0) {
    const listed = source.list();
    if (!listed)
      throw new Error(
        `${source.label}: name the *.model3.json file to load (this source cannot list its files)`
      );
    const archive = listed.find((p) => archiveKind(p) !== void 0);
    const kind2 = archive && archiveKind(archive);
    throw new Error(
      kind2 === "zip" ? `${source.label}: no *.model3.json file found; open the zip archive "${archive}" itself` : kind2 ? `${source.label}: no *.model3.json file found; "${archive}" is a ${kind2 === "rar" ? "RAR" : "7z"} archive: extract it first, then open the extracted folder` : `${source.label}: no *.model3.json file found`
    );
  }
  return found[0];
}
async function loadAnimationAssets(source, settingsPath, settings) {
  const dir = dirnameOf(settingsPath);
  const load2 = async (path, parse) => {
    if (!path) return { value: null };
    try {
      return { value: parse(await source.read(joinPath(dir, path)), path) };
    } catch (e) {
      return { value: null, warning: `${path}: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
  const [physics, pose, displayInfo, userData, motionSync] = await Promise.all([
    load2(settings.physics, parsePhysics),
    load2(settings.pose, parsePose),
    load2(settings.displayInfo, parseDisplayInfo),
    load2(settings.userData, parseUserData),
    load2(settings.motionSync, (b, label) => parseMotionSync(b, label))
  ]);
  const warnings = [physics, pose, displayInfo, userData, motionSync].flatMap(
    (r) => r.warning ? [r.warning] : []
  );
  if (motionSync.value) warnings.push(...motionSync.value.warnings);
  return {
    physics: physics.value,
    pose: pose.value,
    displayInfo: displayInfo.value,
    userData: userData.value,
    motionSync: motionSync.value,
    warnings
  };
}
async function loadModelBundle(source, settingsPath, options = {}) {
  const path = resolveSettingsPath(source, settingsPath);
  const settings = parseModelSettings(await source.read(path), path);
  const model = loadMoc(await source.read(joinPath(dirnameOf(path), settings.moc)), options);
  const assets = await loadAnimationAssets(source, path, settings);
  const warnings = [...model.loadWarnings.map((w) => `${settings.moc}: ${w}`), ...assets.warnings];
  return { source, settingsPath: path, settings, model, ...assets, warnings };
}

// src/anim/motion-sync/wav.ts
var MotionSyncAudioError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MotionSyncAudioError";
  }
};
var tag3 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
var MIN_RATE = 1e3;
var MAX_RATE = 768e3;
function decodeMotionSyncWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || tag3(bytes, 0) !== "RIFF" || tag3(bytes, 8) !== "WAVE")
    throw new MotionSyncAudioError("not a RIFF/WAVE file");
  let o = 12;
  let format = -1;
  let channels = 0;
  let rate = 0;
  let bits3 = 0;
  let data = null;
  while (o + 8 <= bytes.length) {
    const id = tag3(bytes, o);
    const size = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      format = dv.getUint16(body, true);
      channels = dv.getUint16(body + 2, true);
      rate = dv.getUint32(body + 4, true);
      bits3 = dv.getUint16(body + 14, true);
      if (format === 65534 && size >= 40 && body + 26 <= bytes.length)
        format = dv.getUint16(body + 24, true);
    } else if (id === "data") {
      data = { start: body, size: Math.min(size, bytes.length - body) };
      break;
    }
    o = body + size + (size & 1);
  }
  if (format < 0) throw new MotionSyncAudioError("no fmt chunk");
  if (!data) throw new MotionSyncAudioError("no data chunk");
  if (channels < 1 || !(rate > 0)) throw new MotionSyncAudioError("no channels, or no sample rate");
  if (rate < MIN_RATE || rate > MAX_RATE)
    throw new MotionSyncAudioError(
      `a sample rate of ${rate} Hz is outside ${MIN_RATE}\u2013${MAX_RATE} Hz`
    );
  const pcm = format === 1 && [8, 16, 24, 32].includes(bits3);
  const float = format === 3 && (bits3 === 32 || bits3 === 64);
  if (!pcm && !float)
    throw new MotionSyncAudioError(`format ${format} with ${bits3}-bit samples is not supported`);
  const bytesPer = bits3 / 8;
  const frames = Math.floor(data.size / (bytesPer * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i2 = 0; i2 < frames; i2++)
    for (let c = 0; c < channels; c++) {
      const p = data.start + (i2 * channels + c) * bytesPer;
      let v;
      if (float) v = bits3 === 32 ? dv.getFloat32(p, true) : dv.getFloat64(p, true);
      else if (bits3 === 8) v = (bytes[p] - 128) / 128;
      else if (bits3 === 16) v = dv.getInt16(p, true) / 32768;
      else if (bits3 === 24)
        v = ((bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16) << 8 >> 8) / 8388608;
      else v = dv.getInt32(p, true) / 2147483648;
      out[c][i2] = v;
    }
  return { sampleRate: rate, channels: out };
}

// src/runtime/model-runtime.ts
function checkFades(f) {
  for (const key of ["fadeIn", "fadeOut"]) {
    const v = f?.[key];
    if (v !== void 0 && !(Number.isFinite(v) && v >= 0))
      throw new RangeError(`the expression ${key} ${v} is not a finite time \u2265 0`);
  }
}
function withFades(e, f) {
  if (f?.fadeIn === void 0 && f?.fadeOut === void 0) return e;
  return { ...e, fadeIn: f.fadeIn ?? e.fadeIn, fadeOut: f.fadeOut ?? e.fadeOut };
}
var DEFAULT_LIP_SYNC = "ParamMouthOpenY";
var ModelRuntime = class _ModelRuntime {
  source;
  settingsPath;
  settings;
  model;
  instance;
  /**
   * Application tints of the art meshes (see {@link setTint}): RGBA per
   * drawable, 4 floats each, 1 where none is set. For renderers.
   */
  drawableTints;
  /** Changes whenever a tint changes, so a view knows to draw again. */
  tintVersion = 0;
  /** Art meshes with a tint, by index. */
  tinted = /* @__PURE__ */ new Set();
  animator;
  parameters;
  parts;
  /** The deformers in file order (warps and rotations), with their parents. */
  deformers;
  /** Parameters physics overwrites (weight 100 %), with their largest-weight model-parameter input. */
  physicsDriven;
  /**
   * Parameters physics overwrites (weight 100 %) while it runs, each with the
   * model parameters that drive it, largest weight first. While physics runs,
   * writing such a parameter (setParameter, a motion, head tracking) has no
   * visible effect: write a driving input instead, as look does with
   * `lookThroughPhysics`. Empty without physics.
   */
  physicsInputs;
  /** The parameter lip sync drives because the settings list none, or null. */
  lipSyncFallback;
  /** Problems with optional files and motions, one line each. */
  warnings;
  bundle;
  /** Events of recent frames, newest last (at most 20). */
  recentEvents = [];
  /** The latest frame's result, or null before the first frame. */
  lastFrame = null;
  lookThroughPhysics;
  onSound;
  dir;
  lastParams;
  lastParts;
  dirty = true;
  needsEvaluation = true;
  motions = /* @__PURE__ */ new Map();
  /** Motions that finished loading, for idle playback (which is synchronous). */
  readyMotions = /* @__PURE__ */ new Map();
  readySounds = /* @__PURE__ */ new Map();
  expressions = /* @__PURE__ */ new Map();
  pendingSound = null;
  /**
   * The start (by queue ticket) whose sound motion sync plays, and whether
   * that sound is already fading out.
   */
  motionSyncMotion = null;
  /** Motion-sync decodings of sounds, by path (null: not readable). */
  motionSyncSounds = /* @__PURE__ */ new Map();
  /** Accepted starts by queue ticket: where they came from, and their `ended` resolver. */
  starts = /* @__PURE__ */ new Map();
  endListeners = /* @__PURE__ */ new Set();
  /** Loads a model's files from a source and prepares it (see {@link ModelRuntime}). */
  static async load(source, settingsPath, options = {}) {
    const { moc, ...runtimeOptions } = options;
    let from = source;
    if (moc !== void 0) {
      settingsPath = resolveSettingsPath(source, settingsPath);
      from = await sourceWithMoc(source, settingsPath, mocInputBytes(moc));
    }
    const runtime = new _ModelRuntime(
      await loadModelBundle(from, settingsPath, loadOptionsOf(runtimeOptions)),
      runtimeOptions
    );
    runtime.baseSource = source;
    runtime.modelOrigin = moc === void 0 ? "file" : "data";
    await runtime.preloadGroup("Idle");
    return runtime;
  }
  /** The source without the model data given in place of its `.moc3` (for {@link withData}). */
  baseSource;
  modelOrigin = "file";
  /**
   * Where this runtime's model data comes from (experimental): "file" or
   * "data" when {@link source} serves it as the settings' `.moc3` (so
   * `NodeRenderer` can draw this runtime), "model" after {@link withModel}.
   */
  get modelSource() {
    return this.modelOrigin;
  }
  /** The options this runtime was made with (for {@link withModel}). */
  options;
  /** Physics strength and wind (see {@link setPhysicsStrength}, {@link setPhysicsWind}). */
  physicsStrengthValue = 1;
  /** The physics rate set, or null: the file's (see {@link setPhysicsRate}). */
  physicsRateValue = null;
  settingStrengths = /* @__PURE__ */ new Map();
  settingWinds = /* @__PURE__ */ new Map();
  windValue;
  /** The `loadMoc` options this runtime loads files with (from its {@link RuntimeOptions}). */
  get loadOptions() {
    return loadOptionsOf(this.options);
  }
  constructor(bundle, options = {}) {
    this.options = options;
    this.bundle = bundle;
    this.source = bundle.source;
    this.baseSource = bundle.source;
    this.settingsPath = bundle.settingsPath;
    this.model = bundle.model;
    this.dir = dirnameOf(bundle.settingsPath);
    this.warnings = [...bundle.warnings];
    this.lookThroughPhysics = options.lookThroughPhysics ?? true;
    this.stopClearsPriority = options.stopClearsPriority ?? true;
    this.onSound = options.onSound;
    const m = bundle.model;
    this.instance = new ModelInstance(m, { evaluation: options.evaluation });
    this.drawableTints = new Float32Array(4 * m.meshes.ids.length).fill(1);
    const paramIndex = new Map(m.parameters.ids.map((id, i2) => [id, i2]));
    this.parameters = displayLabels(m.parameters.ids, bundle.displayInfo, "parameters").map((l) => {
      const i2 = paramIndex.get(l.id);
      return {
        id: l.id,
        name: l.label,
        ...l.group !== void 0 ? { group: l.group } : {},
        min: m.parameters.min[i2],
        max: m.parameters.max[i2],
        default: m.parameters.defaults[i2],
        blendShape: m.parameters.type[i2] === 1
      };
    });
    const partIndex = new Map(m.parts.ids.map((id, i2) => [id, i2]));
    this.deformers = m.deformers.ids.map((id, i2) => ({
      id,
      kind: m.deformers.kind[i2] === 1 ? "rotation" : "warp",
      parent: m.deformers.parent[i2] >= 0 ? m.deformers.ids[m.deformers.parent[i2]] : null
    }));
    this.parts = displayLabels(m.parts.ids, bundle.displayInfo, "parts").map((l) => ({
      id: l.id,
      name: l.label,
      defaultOpacity: m.parts.initialOpacity[partIndex.get(l.id)]
    }));
    let settings = bundle.settings;
    const fallback = options.lipSyncFallback ?? DEFAULT_LIP_SYNC;
    this.lipSyncFallback = null;
    if (fallback !== false && parameterGroupIds(settings, "LipSync").length === 0 && m.parameters.ids.includes(fallback)) {
      this.lipSyncFallback = fallback;
      settings = {
        ...settings,
        groups: [
          ...settings.groups.filter((g) => g.name !== "LipSync"),
          { target: "Parameter", name: "LipSync", ids: [fallback] }
        ]
      };
    }
    this.settings = bundle.settings;
    const animation = options.animation;
    this.animator = new Animator(
      m,
      settings,
      { physics: bundle.physics, pose: bundle.pose, motionSync: bundle.motionSync },
      {
        ...animation,
        groupMotion: (group, index) => this.readyGroupMotion(group, index),
        onIdleStart: (index, started) => {
          if (started) {
            this.starts.set(this.animator.motions.lastTicket, {
              group: animation?.idleList ? null : "Idle",
              index
            });
            if (this.pendingSound) this.pendingSound.ticket = this.animator.motions.lastTicket;
          }
          animation?.onIdleStart?.(index, started);
        }
      }
    );
    if (this.animator.physics && options.holdPhysicsInZeroSteps)
      this.animator.physics.holdOnZeroSteps = true;
    if (options.physicsRate !== void 0) this.setPhysicsRate(options.physicsRate);
    const rigWind = this.animator.physics?.wind ?? animation?.wind ?? [0, 0];
    this.windValue = [rigWind[0], rigWind[1]];
    const driven = /* @__PURE__ */ new Map();
    const drivers = /* @__PURE__ */ new Map();
    if (this.animator.physics)
      for (const [dest, inputs] of this.animator.physics.overwrittenParameters()) {
        const list = inputs.filter((i2) => m.parameters.ids.includes(i2.source)).map((i2) => ({ id: i2.source, weight: i2.weight, type: i2.type, reflect: i2.reflect })).sort((a, b) => b.weight - a.weight);
        drivers.set(dest, list);
        if (list[0]) driven.set(dest, list[0].id);
      }
    this.physicsDriven = driven;
    this.physicsInputs = drivers;
    this.updateLookTargets();
    this.lastParams = new Float32Array(m.parameters.ids.length).fill(NaN);
    this.lastParts = new Float32Array(m.parts.ids.length).fill(NaN);
  }
  // ------------------------------------------------------------ files
  /** Resolves a path relative to the settings file's directory to a source path. */
  resolve(path) {
    return joinPath(this.dir, path);
  }
  /**
   * Files of the source below the settings file's directory, relative to it,
   * or undefined if the source cannot list its files (HTTP).
   */
  get files() {
    const all = this.source.list();
    if (!all) return void 0;
    if (!this.dir) return [...all];
    const prefix = this.dir + "/";
    return all.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
  }
  /** Motion groups of the settings, with their number of entries. */
  get motionGroups() {
    return this.settings.motions.map((g) => ({ name: g.group, count: g.entries.length }));
  }
  /** Names of the settings' expressions, in file order. */
  get expressionNames() {
    return this.settings.expressions.map((e) => e.name);
  }
  /** Hit areas of the settings: art-mesh ID and name (3t). */
  get hitAreas() {
    return this.settings.hitAreas.map((h) => ({ ...h }));
  }
  /** Reads and validates a motion file (path relative to the settings file). Cached. */
  loadMotion(path) {
    const p = this.resolve(path);
    let pending = this.motions.get(p);
    if (!pending) {
      pending = this.source.read(p).then((bytes) => parseMotion(bytes, p));
      this.motions.set(p, pending);
      pending.then(
        (motion) => this.readyMotions.set(p, motion),
        () => {
          this.readyMotions.set(p, null);
          this.motions.delete(p);
        }
      );
    }
    return pending;
  }
  /** Reads an expression file (path relative to the settings file). Cached. */
  loadExpression(path) {
    const p = this.resolve(path);
    let pending = this.expressions.get(p);
    if (!pending) {
      pending = this.source.read(p).then((bytes) => parseExpression(bytes, p));
      this.expressions.set(p, pending);
      pending.catch(() => this.expressions.delete(p));
    }
    return pending;
  }
  /**
   * Loads every motion of a settings group (and the entries' sounds), so the
   * group can play without waiting. Invalid files become warnings.
   */
  async preloadGroup(group) {
    const entries = this.settings.motions.find((g) => g.group === group)?.entries ?? [];
    await Promise.all(
      entries.map(async (entry) => {
        try {
          await this.loadMotion(entry.file);
        } catch (e) {
          this.warnings.push(`${entry.file}: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (entry.sound) await this.loadSound(entry.sound);
      })
    );
  }
  async loadSound(path) {
    const p = this.resolve(path);
    const ready = this.readySounds.get(p);
    if (ready) return ready;
    let bytes;
    try {
      bytes = await this.source.read(p);
    } catch (e) {
      bytes = new Uint8Array(0);
      const err2 = e instanceof Error ? e : new Error(String(e));
      this.warnings.push(
        skippedSoundWarning(
          path,
          err2.name === "Error" ? err2.message : `${err2.name}: ${err2.message}`
        )
      );
    }
    let sound = null;
    try {
      sound = decodeWav(bytes);
    } catch {
      sound = null;
    }
    const r = { bytes, sound };
    this.readySounds.set(p, r);
    return r;
  }
  /** The idle path of the frame procedure: only motions that are already loaded can start. */
  readyGroupMotion(group, index) {
    const entry = this.settings.motions.find((g) => g.group === group)?.entries[index];
    if (!entry) return null;
    const p = this.resolve(entry.file);
    if (!this.readyMotions.has(p)) {
      void this.loadMotion(entry.file).catch(() => {
      });
      return null;
    }
    const r = { motion: this.readyMotions.get(p) };
    if (entry.fadeInTime !== void 0) r.fadeIn = entry.fadeInTime;
    if (entry.fadeOutTime !== void 0) r.fadeOut = entry.fadeOutTime;
    if (entry.sound) {
      const path = this.resolve(entry.sound);
      const s = this.readySounds.get(path);
      if (s) {
        r.sound = s.sound;
        if (s.bytes.length && r.motion)
          this.pendingSound = {
            motion: r.motion,
            path,
            bytes: s.bytes,
            ...entry.motionSync ? { motionSync: entry.motionSync } : {}
          };
      }
    }
    return r;
  }
  // ------------------------------------------------------------ values
  /**
   * A parameter's value in the latest frame: its base value with motions,
   * expressions and effects applied. An ID the model lacks reads its free
   * value (0 unless a motion wrote it).
   */
  getParameter(id) {
    return this.animator.values.get(id);
  }
  /**
   * A parameter's base value: what {@link setParameter} set, or what motions
   * left in it (the frame procedure keeps a motion's result, so it persists
   * after the motion ends). Expressions and effects (eye blink, breath,
   * look, physics, lip sync) apply on top of it; {@link getParameter} reads
   * the result. An ID the model lacks reads as in `getParameter`.
   */
  getParameterBase(id) {
    const v = this.animator.values;
    const i2 = v.index(id);
    return i2 < 0 ? v.get(id) : v.saved[i2];
  }
  /**
   * Sets a parameter's base value. It persists like a motion's result (it is
   * restored every frame), and effects apply on top. It shows at the next
   * {@link update}; `update(0)` applies it at once. Returns false for an
   * unknown ID.
   */
  setParameter(id, value) {
    const i2 = this.animator.values.index(id);
    if (i2 < 0) return false;
    this.animator.setBaseParameter(i2, value);
    this.dirty = true;
    return true;
  }
  /**
   * How far the idle animation moves a parameter, in [0, 1] (not reference
   * behavior): at 0 it leaves the parameter at its base value, so tracking
   * written with {@link setParameter} shows through; at 1 (the default) it
   * applies as usual. The idle animation is every motion started at the
   * idle priority (1): the settings' `Idle` group and motions started with
   * `priority: 1`. A curve that would move the parameter by w of the way to
   * its value moves it by w·weight. Other motions, expressions and effects
   * are not affected, nor are part-opacity curves. Change the weight over
   * frames to fade a handover. Values are limited to [0, 1]; returns false
   * for an unknown ID. NaN throws a RangeError.
   */
  setIdleWeight(id, weight) {
    if (Number.isNaN(weight)) throw new RangeError(`the idle weight of ${id} is NaN`);
    if (this.animator.values.index(id) < 0) return false;
    const w = Math.min(1, Math.max(0, weight));
    const weights = this.animator.motions.idleWeights;
    if (w === 1) weights.delete(id);
    else weights.set(id, w);
    this.dirty = true;
    return true;
  }
  /** A parameter's idle weight (see {@link setIdleWeight}); 1 unless set. */
  getIdleWeight(id) {
    return this.animator.motions.idleWeights.get(id) ?? 1;
  }
  /** The idle weights that are not 1, by parameter ID. */
  get idleWeights() {
    return new Map(this.animator.motions.idleWeights);
  }
  /** Every idle weight back to 1. */
  resetIdleWeights() {
    this.animator.motions.idleWeights.clear();
    this.dirty = true;
  }
  // ------------------------------------------------- physics strength, wind
  /**
   * The model's physics settings in file order: ID and display name (from
   * the file's dictionary, or the ID; `named` tells which). Empty without a
   * physics file.
   */
  get physicsSettings() {
    const file = this.animator.physics?.file;
    if (!file) return [];
    return file.settings.map((s) => {
      const entry = file.names.find((n) => n.id === s.id);
      return { id: s.id, name: entry ? entry.name : s.id, named: entry !== void 0 };
    });
  }
  /**
   * How strongly physics moves the model's parameters (not reference
   * behavior). Each physics output moves its parameter from c, its value
   * before the output is written, to r, the value the physics file's rule
   * gives; with a strength k the parameter becomes c + (r − c)·k instead.
   * At 0 physics leaves its parameters as they are; at 1 (the default) it is
   * the reference, bit for bit; above 1 it exaggerates, limited to each
   * parameter's range. The simulation itself runs unchanged: its inputs,
   * gravity and wind act as before, so changing the strength never makes
   * the pendulums jump. The model's strength multiplies each setting's own
   * ({@link setPhysicsSettingStrength}). Negative values are limited to 0;
   * NaN and ±∞ throw a RangeError.
   */
  setPhysicsStrength(strength) {
    this.physicsStrengthValue = checkedStrength(strength, "the physics strength");
    if (this.animator.physics) this.animator.physics.strength = this.physicsStrengthValue;
    this.dirty = true;
  }
  /** The model's physics strength (see {@link setPhysicsStrength}); 1 unless set. */
  get physicsStrength() {
    return this.physicsStrengthValue;
  }
  /**
   * One physics setting's strength, by its ID (see {@link physicsSettings}):
   * it multiplies the model's strength for that setting's outputs (see
   * {@link setPhysicsStrength}). Returns false for an unknown ID.
   */
  setPhysicsSettingStrength(id, strength) {
    const k = checkedStrength(strength, `the physics strength of ${id}`);
    const rig = this.animator.physics;
    const indices = rig ? rig.file.settings.flatMap((s, i2) => s.id === id ? [i2] : []) : [];
    if (indices.length === 0) return false;
    for (const i2 of indices) rig.settingStrengths[i2] = k;
    if (k === 1) this.settingStrengths.delete(id);
    else this.settingStrengths.set(id, k);
    this.dirty = true;
    return true;
  }
  /** A physics setting's strength (see {@link setPhysicsSettingStrength}); 1 unless set. */
  getPhysicsSettingStrength(id) {
    return this.settingStrengths.get(id) ?? 1;
  }
  /** The physics settings' strengths that are not 1, by setting ID. */
  get physicsSettingStrengths() {
    return new Map(this.settingStrengths);
  }
  /** The model's physics strength and every setting's back to 1. */
  resetPhysicsStrengths() {
    this.physicsStrengthValue = 1;
    this.settingStrengths.clear();
    const rig = this.animator.physics;
    if (rig) {
      rig.strength = 1;
      rig.settingStrengths.fill(1);
    }
    this.dirty = true;
  }
  /**
   * The physics wind V (3n.2), a force added to every pendulum particle's,
   * in the physics' own units (gravity is (0, −1)), read at every physics
   * step: a change takes effect from the next one. Default (0, 0), or the
   * `animation.wind` option. Non-finite values throw a RangeError.
   */
  setPhysicsWind(x2, y) {
    if (!Number.isFinite(x2) || !Number.isFinite(y))
      throw new RangeError(`the physics wind (${x2}, ${y}) is not finite`);
    this.windValue = [x2, y];
    if (this.animator.physics) this.animator.physics.wind = [x2, y];
    this.dirty = true;
  }
  /** The physics wind (see {@link setPhysicsWind}). */
  get physicsWind() {
    return [this.windValue[0], this.windValue[1]];
  }
  /**
   * How much of the wind one physics setting feels, by its ID (not
   * reference behavior): its pendulum particles get the wind V times
   * `multiplier` instead of V, at every step and in the settle procedure.
   * 1, the default, is the reference, bit for bit; 0 shields the setting
   * from the wind; 2 doubles it; a negative multiplier turns it around. The
   * wind is a force, so the pendulums respond over the next steps; nothing
   * jumps. Gravity and the strengths are unaffected. Returns false for an
   * unknown ID; a non-finite multiplier throws a RangeError.
   */
  setPhysicsSettingWind(id, multiplier) {
    if (!Number.isFinite(multiplier))
      throw new RangeError(`the wind multiplier of ${id} (${multiplier}) is not finite`);
    const rig = this.animator.physics;
    const indices = rig ? rig.file.settings.flatMap((s, i2) => s.id === id ? [i2] : []) : [];
    if (indices.length === 0) return false;
    for (const i2 of indices) rig.settingWinds[i2] = multiplier;
    if (multiplier === 1) this.settingWinds.delete(id);
    else this.settingWinds.set(id, multiplier);
    this.dirty = true;
    return true;
  }
  /** A physics setting's wind multiplier (see {@link setPhysicsSettingWind}); 1 unless set. */
  getPhysicsSettingWind(id) {
    return this.settingWinds.get(id) ?? 1;
  }
  /** The physics settings' wind multipliers that are not 1, by setting ID. */
  get physicsSettingWinds() {
    return new Map(this.settingWinds);
  }
  /** Every setting's wind multiplier back to 1 (the wind itself stays). */
  resetPhysicsSettingWinds() {
    this.settingWinds.clear();
    this.animator.physics?.settingWinds.fill(1);
    this.dirty = true;
  }
  /**
   * The physics simulation rate, in steps per second (not reference
   * behavior): the pendulums advance in steps of 1/rate seconds, and each
   * frame's outputs are interpolated between the last two steps (3n.3). 0
   * steps once per frame, by the frame's length. Null restores the physics
   * file's `Fps`. A change takes effect from the next frame; the pendulums
   * do not jump. Above 1000, below 0 or non-finite throws a RangeError.
   */
  setPhysicsRate(rate) {
    if (rate !== null && !(Number.isFinite(rate) && rate >= 0 && rate <= 1e3))
      throw new RangeError(`the physics rate ${rate} is not from 0 to 1000 steps per second`);
    this.physicsRateValue = rate;
    if (this.animator.physics) this.animator.physics.rate = rate;
    this.dirty = true;
  }
  /**
   * The physics rate in use, in steps per second (0: once per frame): the
   * one set ({@link setPhysicsRate}), or the physics file's `Fps`. 0 without
   * physics.
   */
  get physicsRate() {
    return this.animator.physics?.stepRate ?? this.physicsRateValue ?? 0;
  }
  /**
   * A copy of the physics simulation's state now, or null without physics:
   * every pendulum's particles, the last outputs and the step timing (see
   * `PhysicsState`). For an editor that scrubs a timeline: save the state
   * after a frame, and {@link restorePhysicsState} later continues from
   * there bit for bit. The options (gravity, wind, strengths, rate) are not
   * part of it.
   */
  savePhysicsState() {
    return this.animator.physics?.saveState() ?? null;
  }
  /**
   * Puts the physics simulation back in a saved state ({@link
   * savePhysicsState}): the next frame continues exactly as the frame after
   * the save did, given the same parameter values, frame lengths and
   * options. The parameters physics drives show the restored pose from the
   * next frame (with `holdPhysicsInZeroSteps`, a frame of 0 s shows it).
   * RangeError when the model has no physics or the state was saved from
   * other physics settings.
   */
  restorePhysicsState(state) {
    const rig = this.animator.physics;
    if (!rig) throw new RangeError("the model has no physics");
    rig.restoreState(state);
    this.dirty = true;
  }
  // ----------------------------------------------------------- motion sync
  /**
   * The settings of the model's motion-sync file, in file order: ID,
   * dictionary name, and whether Mochi2D can run it. Empty without a file.
   */
  get motionSyncSettings() {
    return (this.bundle.motionSync?.settings ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      usable: s.usable
    }));
  }
  /** A setting by dictionary name or ID, or the first usable one. */
  motionSyncSetting(ref) {
    const file = this.bundle.motionSync;
    if (!file) return null;
    if (ref === void 0) return file.settings.find((s2) => s2.usable) ?? null;
    const s = findMotionSyncSetting(file, ref);
    if (!s) throw new RangeError(`${file.label}: no motion-sync setting "${ref}"`);
    return s;
  }
  /** Binds the sound of the start `ticket` to its entry's setting (see the motion-sync docs). */
  bindMotionSound(ticket, path, bytes, ref, clock) {
    const driver = this.animator.motionSync;
    const file = this.bundle.motionSync;
    if (!driver || !file) {
      this.warnings.push(
        `${path}: the motion names motion-sync setting "${ref}", but the model has no motion-sync file`
      );
      return;
    }
    const setting = findMotionSyncSetting(file, ref);
    if (!setting || !setting.usable) {
      this.warnings.push(
        `${path}: motion-sync setting "${ref}" ${setting ? "cannot run" : "is not in the file"}; the sound plays without motion sync`
      );
      return;
    }
    let sound = this.motionSyncSounds.get(path);
    if (sound === void 0) {
      try {
        sound = decodeMotionSyncWav(bytes);
      } catch (e) {
        sound = null;
        this.warnings.push(
          `${path}: ${e instanceof Error ? e.message : String(e)}; no motion sync`
        );
      }
      this.motionSyncSounds.set(path, sound);
    }
    if (!sound) return;
    driver.playSound(
      setting,
      sound,
      typeof clock === "function" ? clock : null
    );
    this.takeMotionSyncWarnings();
    this.motionSyncMotion = { ticket, fading: false };
    this.dirty = true;
  }
  takeMotionSyncWarnings() {
    const w = this.animator.motionSync?.warnings;
    if (w?.length) this.warnings.push(...w.splice(0));
  }
  /**
   * Plays a sound through motion sync (not reference behavior: Mochi2D's own
   * analysis drives the mouth): WAV bytes, or decoded channels. `setting` is a
   * dictionary name or ID, by default the first usable setting. `clock`
   * gives the playback position in seconds (an audio clock); without one, the
   * position is the sum of the frames' steps. The app plays the audio itself.
   * Returns false when the model has no usable motion-sync setting; throws a
   * RangeError for an unknown setting, and a `MotionSyncAudioError` for WAV
   * bytes it cannot read.
   */
  startMotionSync(sound, options = {}) {
    const driver = this.animator.motionSync;
    const setting = this.motionSyncSetting(options.setting);
    if (!driver || !setting) return false;
    const decoded = sound instanceof Uint8Array ? decodeMotionSyncWav(sound) : sound;
    const ok = driver.playSound(setting, decoded, options.clock ?? null);
    this.motionSyncMotion = null;
    this.takeMotionSyncWarnings();
    this.dirty = true;
    return ok;
  }
  /**
   * A live input (a microphone, an audio stream) drives the mouth through
   * `setting` (default the first usable one) until replaced or removed with
   * null (the mouth then settles to its Silence shape). Returns false when
   * the model has no usable motion-sync setting.
   */
  setMotionSyncInput(input, setting) {
    const driver = this.animator.motionSync;
    if (!driver) return false;
    if (!input) {
      driver.stop();
      return true;
    }
    const s = this.motionSyncSetting(setting);
    if (!s) return false;
    const ok = driver.setInput(s, input);
    this.takeMotionSyncWarnings();
    this.dirty = true;
    return ok;
  }
  /**
   * Ends motion sync's sound or input: after `fade` seconds of fading (a
   * sound only), the mouth settles to its Silence shape and motion sync
   * stops writing.
   */
  stopMotionSync(fade = 0) {
    this.animator.motionSync?.stop(fade);
  }
  /**
   * The latest motion-sync tick: the setting, the level (dBFS), the element
   * weights (Silence, A, I, U, E, O; they sum to 1), and the values written.
   * Null while nothing is bound. Updated at every tick (`SampleRate` per
   * second at most).
   */
  get motionSync() {
    return this.animator.motionSync?.tick ?? null;
  }
  /** What motion sync plays: the decoded sound or the live input, or null. */
  get motionSyncSource() {
    return this.animator.motionSync?.source ?? null;
  }
  /** Calls `listener` at every motion-sync tick; returns a function that removes it. */
  onMotionSyncTick(listener) {
    return this.animator.motionSync?.onTick(listener) ?? (() => {
    });
  }
  /** The voice profile motion sync analyzes with, or null (the neutral synthetic voice). */
  get voiceProfile() {
    return this.animator.motionSync?.profile ?? null;
  }
  /** Sets the voice profile (from `VoiceCalibration.profile()`), or null. */
  setVoiceProfile(profile) {
    this.animator.motionSync?.setProfile(profile);
  }
  /** Sets every parameter's base value back to its default. */
  resetParameters() {
    const ids = this.model.parameters.ids;
    for (let i2 = 0; i2 < ids.length; i2++)
      this.animator.setBaseParameter(i2, this.model.parameters.defaults[i2]);
    this.dirty = true;
  }
  getPartOpacity(id) {
    return this.animator.values.partOpacity(id);
  }
  setPartOpacity(id, value) {
    this.animator.setPartOpacity(id, value);
    this.dirty = true;
  }
  // ------------------------------------------------------------ tints
  /**
   * Tints an art mesh, until cleared (not reference behavior): `rgba` is
   * `[r, g, b]` or `[r, g, b, a]`. The drawn color, after the mesh's
   * multiply and screen colors, is multiplied by r, g and b, in [0, 2]:
   * below 1 a tint darkens, 1 leaves the mesh as it is, and above 1 it
   * brightens, the color limited to 1 (white) per channel. Its opacity is
   * multiplied by a, in [0, 1] (default 1). The mesh still masks as before
   * (masks use no colors or opacities). Values are limited to those ranges;
   * a value that is not finite throws a RangeError. Returns false for an
   * unknown ID.
   */
  setTint(meshId, rgba) {
    if (rgba.length !== 3 && rgba.length !== 4)
      throw new RangeError(`a tint is [r, g, b] or [r, g, b, a], not ${rgba.length} numbers`);
    for (const x2 of rgba)
      if (typeof x2 !== "number" || !Number.isFinite(x2))
        throw new RangeError(`tint of ${meshId}: ${String(x2)} is not a finite number`);
    const d = this.model.meshes.ids.indexOf(meshId);
    if (d < 0) return false;
    const t = this.drawableTints;
    for (let k = 0; k < 4; k++)
      t[4 * d + k] = Math.min(k < 3 ? MAX_TINT : 1, Math.max(0, rgba[k] ?? 1));
    this.tinted.add(d);
    this.tintVersion++;
    return true;
  }
  /** Removes an art mesh's tint. Returns false for an unknown ID or a mesh without one. */
  clearTint(meshId) {
    const d = this.model.meshes.ids.indexOf(meshId);
    if (d < 0 || !this.tinted.delete(d)) return false;
    this.drawableTints.fill(1, 4 * d, 4 * d + 4);
    this.tintVersion++;
    return true;
  }
  /** Removes every tint. */
  clearTints() {
    if (this.tinted.size === 0) return;
    this.tinted.clear();
    this.drawableTints.fill(1);
    this.tintVersion++;
  }
  /** An art mesh's tint as `[r, g, b, a]` (stored as float32), or null without one. */
  getTint(meshId) {
    const d = this.model.meshes.ids.indexOf(meshId);
    if (d < 0 || !this.tinted.has(d)) return null;
    const t = this.drawableTints;
    return [t[4 * d], t[4 * d + 1], t[4 * d + 2], t[4 * d + 3]];
  }
  /** The tinted art meshes: ID → `[r, g, b, a]`. */
  get tints() {
    const ids = this.model.meshes.ids;
    return new Map(
      [...this.tinted].sort((a, b) => a - b).map((d) => [ids[d], this.getTint(ids[d])])
    );
  }
  /** {@link drawableTints} when a tint is set, else null (renderers then skip tinting). */
  get activeTints() {
    return this.tinted.size > 0 ? this.drawableTints : null;
  }
  /** The model opacity of the latest frame (3u). */
  get opacity() {
    return this.animator.values.modelOpacity;
  }
  // ------------------------------------------------------------ effects
  /** Whether a component runs; components the model lacks are reported off. */
  effect(name2) {
    return this.effectAvailable(name2) && this.animator.enabled[name2];
  }
  /** Whether the model has what a component needs (a physics file, an EyeBlink group, …). */
  effectAvailable(name2) {
    const a = this.animator;
    switch (name2) {
      case "physics":
        return a.physics !== null;
      case "eyeBlink":
        return a.eyeBlink !== null;
      case "lipSync":
        return a.lipSync !== null;
      case "pose":
        return a.pose !== null;
      case "motionSync":
        return a.motionSync !== null;
      case "idle":
        return a.idleCount > 0;
      default:
        return true;
    }
  }
  setEffect(name2, on) {
    this.animator.enabled[name2] = on;
    if (name2 === "physics") this.updateLookTargets();
    if (name2 === "look" && !on) this.animator.setLookTarget(0, 0);
    this.dirty = true;
  }
  /** `stopMotions()` clears the current priority (convenience). */
  stopClearsPriority;
  /** Look writes the physics input of a target that physics overwrites (convenience). */
  updateLookTargets() {
    const m = this.model;
    const redirect = this.lookThroughPhysics && this.animator.enabled.physics && this.animator.physics !== null;
    const range = (id) => {
      const i2 = m.parameters.ids.indexOf(id);
      return i2 < 0 ? 1 : m.parameters.max[i2] - m.parameters.min[i2] || 1;
    };
    this.animator.look.entries = REFERENCE_LOOK.map((e) => {
      const src = redirect ? this.physicsDriven.get(e.id) : void 0;
      if (!src) return e;
      const s = range(src) / range(e.id);
      return { id: src, fx: e.fx * s, fy: e.fy * s, fxy: e.fxy * s };
    });
  }
  /** The look targets in use, as target and written parameter. */
  lookRouting() {
    return REFERENCE_LOOK.map((e, k) => ({
      target: e.id,
      writes: this.animator.look.entries[k].id
    }));
  }
  // ------------------------------------------------------------ motions
  /**
   * Starts motion `index` of a settings group (a random one when omitted),
   * with the entry's fades and sound. Resolves to the playback (with an
   * `ended` promise), or false when the start is refused by priority (3l.4);
   * rejects for an unknown group or a file that fails validation.
   */
  async startMotion(group, index, options = {}) {
    const entries = this.settings.motions.find((g) => g.group === group)?.entries;
    if (!entries || entries.length === 0)
      throw new Error(`${this.settingsPath}: no motion group "${group}"`);
    const i2 = index ?? Math.floor(Math.random() * entries.length);
    const entry = entries[i2];
    if (!entry) throw new RangeError(`motion group "${group}" has no entry ${i2}`);
    const motion = await this.loadMotion(entry.file);
    const sound = entry.sound && options.sound !== false ? await this.loadSound(entry.sound) : void 0;
    const accepted = this.animator.startMotion(
      {
        motion,
        ...entry.fadeInTime !== void 0 ? { fadeIn: entry.fadeInTime } : {},
        ...entry.fadeOutTime !== void 0 ? { fadeOut: entry.fadeOutTime } : {},
        ...sound ? { sound: sound.sound } : {}
      },
      this.motionStart(options)
    );
    if (accepted && sound && sound.bytes.length && entry.sound) {
      const clock = this.onSound?.(this.resolve(entry.sound), sound.bytes);
      if (entry.motionSync && motion)
        this.bindMotionSound(
          this.animator.motions.lastTicket,
          this.resolve(entry.sound),
          sound.bytes,
          entry.motionSync,
          clock
        );
    }
    this.dirty = true;
    return accepted ? this.playback(motion, group, i2) : false;
  }
  /**
   * Starts a motion file (path relative to the settings file) with its own
   * fades. Resolves to the playback, or false when refused by priority.
   */
  async startMotionFile(path, options = {}) {
    return this.playMotion(await this.loadMotion(path), options);
  }
  /** Starts an already parsed motion: the playback, or false when refused by priority. */
  playMotion(motion, options = {}) {
    const accepted = this.animator.startMotion({ motion }, this.motionStart(options));
    this.dirty = true;
    return accepted ? this.playback(motion, null, null) : false;
  }
  /** The playback of the start just accepted. */
  playback(motion, group, index) {
    const record = { group, index };
    const ended = new Promise((resolve) => record.resolve = resolve);
    this.starts.set(this.animator.motions.lastTicket, record);
    return { motion: motion.label, group, index, ended };
  }
  motionStart(o) {
    return {
      priority: o.priority ?? 2,
      loop: o.loop ?? false,
      ...o.fadeIn !== void 0 ? { fadeIn: o.fadeIn } : {},
      ...o.fadeOut !== void 0 ? { fadeOut: o.fadeOut } : {},
      ...o.weight !== void 0 ? { weight: o.weight } : {},
      ...o.hold ? { hold: true } : {},
      ...o.blinkWhileHeld === false ? { blinkWhileHeld: false } : {}
    };
  }
  /**
   * Calls `listener` for every motion that ends (each motion once; see
   * {@link MotionEnd}), idle motions included. Returns a function that
   * removes the listener.
   */
  onMotionEnd(listener) {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }
  /** Resolves the playbacks of ended motions and tells the listeners. */
  reportEnds(ends) {
    if (ends.length === 0) return;
    const queueEmpty = this.animator.motions.empty;
    for (const e of ends) {
      const ms = this.motionSyncMotion;
      if (ms && e.ticket === ms.ticket) {
        this.motionSyncMotion = null;
        if (e.reason !== "finished" && !ms.fading) this.animator.motionSync?.stop(0);
      }
      const start = this.starts.get(e.ticket);
      this.starts.delete(e.ticket);
      const end = {
        motion: e.motion.label,
        group: start?.group ?? null,
        index: start?.index ?? null,
        reason: e.reason,
        queueEmpty
      };
      start?.resolve?.(end);
      for (const listener of [...this.endListeners]) listener(end);
    }
  }
  /**
   * Stops all motions (their playbacks end with "stopped"). By default this
   * also clears the current priority, so the next start is accepted (the
   * frame procedure itself only clears it when an advance empties the queue,
   * C19); see `RuntimeOptions.stopClearsPriority`.
   */
  stopMotions() {
    this.animator.stopMotions();
    if (this.stopClearsPriority) this.animator.motions.currentPriority = 0;
    this.dirty = true;
    this.reportEnds(this.animator.motions.takeEnds());
  }
  /** Labels (paths) of the motions in the queue, oldest first. */
  get playingMotions() {
    return this.animator.motions.motions.map((m) => m.label);
  }
  // -------------------------------------------------------- expressions
  /**
   * Starts an expression by its settings name, or by file path (relative to
   * the settings file) when no expression has that name. `fades` replaces
   * the file's fade-in and fade-out times (seconds) for this start.
   */
  async setExpression(nameOrPath, fades) {
    checkFades(fades);
    const named = this.settings.expressions.find((e) => e.name === nameOrPath);
    this.playExpression(
      withFades(await this.loadExpression(named ? named.file : nameOrPath), fades)
    );
  }
  playExpression(expression) {
    this.animator.startExpression(expression);
    this.dirty = true;
  }
  /**
   * Fades the current expressions out: starts an empty expression with the
   * newest one's fade-out time, or `fades.fadeOut` seconds.
   */
  clearExpression(fades) {
    checkFades(fades);
    const list = this.animator.expressions.expressions;
    const newest = list[list.length - 1];
    if (!newest) return;
    const t = fades?.fadeOut ?? newest.fadeOut;
    this.playExpression({ label: "(none)", fadeIn: t, fadeOut: t, parameters: [] });
  }
  /** Labels (paths) of the expressions in the queue, oldest first. */
  get playingExpressions() {
    return this.animator.expressions.expressions.map((e) => e.label);
  }
  /** The source path an expression name or path stands for. */
  expressionPath(nameOrPath) {
    const named = this.settings.expressions.find((e) => e.name === nameOrPath);
    return this.resolve(named ? named.file : nameOrPath);
  }
  /**
   * Adds an expression on top of the others, with its file's fade-in (not
   * reference behavior): several can show at once, applied in the order they
   * were added, after the expression of {@link setExpression}, which keeps
   * replacing. Resolves true, or false when it is already added.
   */
  async addExpression(nameOrPath, fades) {
    checkFades(fades);
    const named = this.settings.expressions.find((e) => e.name === nameOrPath);
    const expression = withFades(await this.loadExpression(named ? named.file : nameOrPath), fades);
    const added = this.animator.expressionLayers.add(expression);
    this.dirty = true;
    return added;
  }
  /**
   * Fades out an expression added with {@link addExpression}, with its
   * fade-out (the file's, the one {@link addExpression} gave, or
   * `fades.fadeOut` seconds); without a name (or with null), every added
   * one. Returns whether one was removed.
   */
  removeExpression(nameOrPath, fades) {
    checkFades(fades);
    const label = nameOrPath == null ? null : this.expressionPath(nameOrPath);
    const n = this.animator.expressionLayers.remove(label, fades?.fadeOut);
    this.dirty = true;
    return n > 0;
  }
  /** Labels (paths) of the expressions added with {@link addExpression} and not removed, oldest first. */
  get addedExpressions() {
    return this.animator.expressionLayers.active.map((e) => e.label);
  }
  // --------------------------------------------------- look and lip sync
  /** Sets the look target: x right and y up, in [−1, 1] (3r). */
  lookAt(x2, y) {
    this.animator.setLookTarget(x2, y);
    this.dirty = true;
  }
  /** Returns the look target to the center. */
  releaseLook() {
    this.lookAt(0, 0);
  }
  /** Starts lip sync on a decoded sound; null stops it. */
  startLipSync(sound) {
    this.animator.startSound(sound);
    this.dirty = true;
  }
  /** Starts lip sync on a WAV file (3s.1). Returns false (and stops lip sync) if it cannot be analysed. */
  startLipSyncWav(bytes) {
    let sound = null;
    if (bytes)
      try {
        sound = decodeWav(bytes);
      } catch {
        sound = null;
      }
    this.startLipSync(sound);
    return sound !== null && this.animator.lipSync !== null;
  }
  /**
   * Adds a live lip-sync input, such as a microphone (`LiveLipSync`, not
   * reference behavior), or removes it with null. Every frame while the
   * lip-sync effect is on, its value is combined with the lip-sync
   * parameters by `mix` (added by default, after a playing sound; see
   * {@link LiveLipSyncMix}). Returns false when the model has no lip sync.
   */
  setLiveLipSync(source, mix = "add") {
    this.dirty = true;
    return this.animator.setLiveLipSync(source, mix);
  }
  /** The live lip-sync input, or null. */
  get liveLipSync() {
    return this.animator.lipSync?.liveSource ?? null;
  }
  /** How the live input combines with the lip-sync parameters (see {@link LiveLipSyncMix}). */
  get liveLipSyncMix() {
    return this.animator.lipSync?.liveMix ?? "add";
  }
  set liveLipSyncMix(mix) {
    if (this.animator.lipSync) this.animator.lipSync.liveMix = mix;
    this.dirty = true;
  }
  // ------------------------------------------------------------- frames
  /** Marks the model as changed, so the next frame runs even with a zero step. */
  touch() {
    this.dirty = true;
  }
  /**
   * Runs one frame of the procedure of 3j (steps 1–4) with step `dt`
   * seconds. A zero step with nothing changed is skipped (returns null).
   */
  animate(dt) {
    if (dt === 0 && !this.dirty) return null;
    const r = this.animator.frame(dt);
    this.lastFrame = r;
    const sound = this.pendingSound;
    this.pendingSound = null;
    if (sound && sound.ticket !== void 0 && this.animator.motions.motions.includes(sound.motion)) {
      const clock = this.onSound?.(sound.path, sound.bytes);
      if (sound.motionSync)
        this.bindMotionSound(sound.ticket, sound.path, sound.bytes, sound.motionSync, clock);
    }
    const ms = this.motionSyncMotion;
    if (ms && !ms.fading) {
      const fade = this.animator.motions.fadeOutOf(ms.ticket);
      if (fade !== null) {
        ms.fading = true;
        this.animator.motionSync?.stop(fade);
      }
    }
    for (const e of r.events) this.recentEvents.push(e);
    if (this.recentEvents.length > 20) this.recentEvents.splice(0, this.recentEvents.length - 20);
    this.reportEnds(r.ends);
    this.dirty = false;
    const v = this.animator.values;
    const same = v.values.every((x2, i2) => Object.is(x2, this.lastParams[i2])) && v.partOpacities.every((x2, i2) => Object.is(x2, this.lastParts[i2]));
    if (!same) {
      this.lastParams.set(v.values);
      this.lastParts.set(v.partOpacities);
      this.needsEvaluation = true;
    }
    return { ...r, changed: !same };
  }
  /** Evaluates the model with the current values (3j step 5) if they changed. Returns whether it did. */
  evaluate() {
    if (!this.needsEvaluation) return false;
    this.animator.applyTo(this.instance);
    this.instance.evaluate();
    this.needsEvaluation = false;
    return true;
  }
  /**
   * In-place value patches (see {@link ModelInstance.patch}): new values for
   * keyform positions, opacities, draw orders, colors, rotation values and
   * glue intensities and weights, by their MocData array and index. Like a
   * parameter change, they show at the next {@link update} (in a view, the
   * next frame); `update(0)` applies them at once. Throws, and applies
   * nothing, for an array that cannot be patched or elements outside it.
   */
  patch(patches) {
    this.instance.patch(patches);
    this.needsEvaluation = true;
    this.dirty = true;
  }
  /**
   * A runtime for other data of this model (an editor's structural edit):
   * the same settings, files, source and options with `model` in place of
   * the `.moc3`. It starts from this runtime's parameter base values, part
   * opacities, idle weights, tints and effect switches, matched by ID, and reuses the motion,
   * expression and sound files already read. Playing motions, expressions
   * and listeners do not carry over. This runtime is unchanged.
   */
  async withModel(model) {
    return this.derive(model, this.bundle.source, "model");
  }
  async derive(model, source, origin) {
    const moc = `${this.settings.moc}: `;
    const next = new _ModelRuntime(
      {
        ...this.bundle,
        source,
        model,
        warnings: [
          ...model.loadWarnings.map((w) => moc + w),
          ...this.bundle.warnings.filter((w) => !w.startsWith(moc))
        ]
      },
      this.options
    );
    const saved = this.animator.values.saved;
    this.model.parameters.ids.forEach((id, i2) => next.setParameter(id, saved[i2]));
    for (const p of this.parts) next.setPartOpacity(p.id, this.getPartOpacity(p.id));
    for (const name2 of Object.keys(this.animator.enabled))
      next.setEffect(name2, this.animator.enabled[name2]);
    for (const [id, w] of this.animator.motions.idleWeights) next.setIdleWeight(id, w);
    next.setVoiceProfile(this.voiceProfile);
    next.setPhysicsStrength(this.physicsStrengthValue);
    for (const [id, k] of this.settingStrengths) next.setPhysicsSettingStrength(id, k);
    for (const [id, k] of this.settingWinds) next.setPhysicsSettingWind(id, k);
    next.setPhysicsWind(...this.windValue);
    next.setPhysicsRate(this.physicsRateValue);
    for (const [id, rgba] of this.tints) next.setTint(id, rgba);
    if (this.liveLipSync) next.setLiveLipSync(this.liveLipSync, this.liveLipSyncMix);
    const sync = this.animator.motionSync;
    const input = sync?.source;
    if (sync?.playing && input && "read" in input && sync.setting)
      next.setMotionSyncInput(input, sync.setting.id || sync.setting.name);
    for (const [k, v] of this.motions) next.motions.set(k, v);
    for (const [k, v] of this.readyMotions) next.readyMotions.set(k, v);
    for (const [k, v] of this.readySounds) next.readySounds.set(k, v);
    for (const [k, v] of this.expressions) next.expressions.set(k, v);
    next.baseSource = this.baseSource;
    next.modelOrigin = origin;
    await next.preloadGroup("Idle");
    return next;
  }
  /**
   * {@link withModel} from `.moc3` bytes, or from {@link MocData} of a
   * `version` (written with `writeMoc`), loaded with this runtime's options.
   * The new runtime's {@link source} serves these bytes as the settings'
   * `.moc3`, so `NodeRenderer` draws its model. Rejects with the errors of
   * `writeMoc` and `loadMoc` (`MocWriteError`, `MocFormatError`).
   */
  async withData(moc, version) {
    let bytes;
    if (moc instanceof Uint8Array || moc instanceof ArrayBuffer) bytes = mocInputBytes(moc);
    else {
      if (version === void 0) throw new TypeError("MocData needs its version");
      bytes = mocInputBytes({ data: moc, version });
    }
    const model = loadMoc(bytes, this.loadOptions);
    const mocPath = joinPath(dirnameOf(this.settingsPath), this.settings.moc);
    return this.derive(model, sourceWithMocAt(this.baseSource, mocPath, bytes), "data");
  }
  /** {@link animate} then {@link evaluate}. */
  update(dt) {
    const r = this.animate(dt);
    this.evaluate();
    return r;
  }
  // ------------------------------------------------------------ mapping
  /**
   * Maps points from a deformer's input space (a warp's normalized grid
   * space, a rotation's local space) to model units through the deformer's
   * world form at the latest evaluation, its ancestors included, exactly as
   * the evaluator maps the vertices of its child meshes (outside regions of
   * warps included). `deformer` is a deformer ID, or null for none: the
   * points are then already in model space. `points` holds x, y pairs. With
   * `jacobian`, also the 2×2 Jacobian at each point, analytic per region.
   * Throws for an unknown deformer ID.
   */
  mapPoints(deformer, points, options = {}) {
    const d = deformer === null ? -1 : this.model.deformers.ids.indexOf(deformer);
    if (d < 0 && deformer !== null) throw new RangeError(`no deformer "${deformer}"`);
    const space = options.space ?? "model";
    const mapped = { points: this.instance.mapPoints(d, points, space) };
    if (options.jacobian) mapped.jacobians = this.instance.mapJacobians(d, points, space);
    return mapped;
  }
  // ----------------------------------------------------------- hit tests
  /** Bounding box of a drawable's vertices from the latest evaluation (model units, y up). */
  drawableBounds(id) {
    const d = this.model.meshes.ids.indexOf(id);
    return d < 0 ? null : vertexBounds(this.instance.drawableVertices[d]);
  }
  /** The settings' hit areas with their boxes from the latest evaluation (3t). */
  hitAreaBounds() {
    return this.settings.hitAreas.flatMap((a) => {
      const bounds = this.drawableBounds(a.id);
      return bounds ? [{ id: a.id, name: a.name || a.id, bounds }] : [];
    });
  }
  /** Names (or IDs) of the hit areas whose box contains the point (model units, 3t). */
  hitAreasAt(x2, y) {
    return this.hitAreaBounds().filter((a) => inside(a.bounds, x2, y)).map((a) => a.name);
  }
  /** The topmost drawn drawable (visible, opacity above 0) whose box contains the point, or null. */
  drawableAt(x2, y) {
    const inst = this.instance;
    const ids = this.model.meshes.ids;
    let top = -1;
    for (let d = 0; d < ids.length; d++)
      if (inst.drawableVisible[d] && inst.drawableOpacity[d] > 0 && inside(vertexBounds(inst.drawableVertices[d]), x2, y)) {
        if (top < 0 || inst.drawableRenderOrder[d] > inst.drawableRenderOrder[top]) top = d;
      }
    return top < 0 ? null : ids[top];
  }
};
var inside = (b, x2, y) => b.minX <= x2 && x2 <= b.maxX && b.minY <= y && y <= b.maxY;
function loadOptionsOf(o) {
  return {
    ...o.strictDrawOrders ? { drawOrderRange: "reject" } : {},
    ...o.nonFiniteOpacity ? { nonFiniteOpacity: o.nonFiniteOpacity } : {},
    ...o.offscreenKeyformRange ? { offscreenKeyformRange: o.offscreenKeyformRange } : {}
  };
}
function checkedStrength(k, what) {
  if (!Number.isFinite(k)) throw new RangeError(`${what} is ${k} (not finite)`);
  return Math.max(0, k);
}

// src/lib/load.ts
async function loadLiveModel(gl, source, settingsPath, options = {}) {
  const runtime = options.reuse ?? await ModelRuntime.load(source, settingsPath, options.runtime);
  if (!options.reuse) {
    for (const w of motionSoundWarnings(runtime.settings, options.sounds))
      if (!runtime.warnings.includes(w)) runtime.warnings.push(w);
  }
  const { loader, textures } = await loadModelTextures(
    gl,
    runtime.source,
    runtime.settingsPath,
    runtime.settings,
    {
      exact: true,
      mipmaps: true,
      oversize: "downscale",
      ...options.textureBudget !== void 0 ? { budgetBytes: options.textureBudget } : {},
      ...options.decodeWorkers !== void 0 ? { workers: options.decodeWorkers } : {},
      ...options.memory ? { memory: options.memory } : {},
      ...options.textures ? { limits: options.textures } : {}
    }
  );
  try {
    return new LiveModel(gl, runtime, textures, loader, {
      ...options.memory ? { memory: options.memory } : {},
      ...options.masks ? { masks: options.masks } : {},
      ...options.maskMeshes ? { maskMeshes: options.maskMeshes } : {},
      ...options.fit !== void 0 ? { fit: options.fit } : {},
      ...options.textures ? { textureLimits: options.textures } : {}
    });
  } catch (e) {
    loader.release(textures);
    loader.dispose();
    throw e;
  }
}

// src/lib/speech.ts
async function audioBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string" || data instanceof URL) {
    const res = await fetch(data);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${String(data)}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await data.arrayBuffer());
}
function soundFromAudioBuffer(buffer) {
  const samples = Array.from(
    { length: buffer.numberOfChannels },
    (_, c) => new Float64Array(buffer.getChannelData(c))
  );
  return {
    channels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    bitsPerSample: 32,
    frames: buffer.length,
    samples
  };
}
var SpeechPlayer = class {
  ctx = null;
  gain = null;
  source = null;
  ended = null;
  /** The audio context, created on first use. Browsers start it suspended until a user gesture. */
  context() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {
    });
    return this.ctx;
  }
  /**
   * Decodes a sound for playback and for lip sync. With `wavOnly` (a model's
   * own motion sounds), anything but a WAV file is not decoded: the browser
   * decodes compressed formats (FLAC, Ogg, MP3) to far more samples than
   * their size, which a file from a stranger could use, while a WAV's
   * samples are bounded by its size.
   */
  async prepare(bytes, options = {}) {
    const isWav = bytes.length >= 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WAVE";
    if (options.wavOnly && !isWav) return { buffer: null, sound: null, exact: false };
    let sound = null;
    try {
      sound = decodeWav(bytes);
    } catch {
      sound = null;
    }
    const ctx = this.context();
    let buffer = null;
    try {
      buffer = await ctx.decodeAudioData(bytes.slice().buffer);
    } catch {
      buffer = null;
    }
    if (!buffer && sound && sound.frames > 0) {
      buffer = ctx.createBuffer(sound.channels, sound.frames, sound.sampleRate);
      for (let c = 0; c < sound.channels; c++)
        buffer.getChannelData(c).set(Float32Array.from(sound.samples[c]));
    }
    if (sound) return { buffer, sound, exact: true };
    return { buffer, sound: buffer ? soundFromAudioBuffer(buffer) : null, exact: false };
  }
  /** Plays a buffer (stopping the previous one); `onEnded` runs when it ends or is stopped. */
  play(buffer, volume = 1, onEnded) {
    this.stop();
    const ctx = this.context();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    this.gain.gain.value = volume;
    this.ended = onEnded ?? null;
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      const done = this.ended;
      this.ended = null;
      done?.();
    };
    this.source = src;
    const start = ctx.currentTime;
    src.start(start);
    return {
      position: () => {
        const latency = ctx.outputLatency || ctx.baseLatency || 0;
        return Math.max(0, ctx.currentTime - start - latency);
      }
    };
  }
  get playing() {
    return this.source !== null;
  }
  stop() {
    const src = this.source;
    const done = this.ended;
    this.source = null;
    this.ended = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
      }
      src.disconnect();
    }
    done?.();
  }
  dispose() {
    this.stop();
    void this.ctx?.close().catch(() => {
    });
    this.ctx = null;
    this.gain = null;
  }
};

// src/anim/live-lip-sync.ts
var LIVE_LIP_SYNC_DEFAULTS = Object.freeze({
  gain: 12,
  gate: -45,
  attack: 0.03,
  release: 0.12
});
var LIVE_LIP_SYNC_NEUTRAL = Object.freeze({
  gain: 1,
  gate: -Infinity,
  attack: 0,
  release: 0
});
var LIVE_SILENCE_AFTER = 0.1;
function dbfsToAmplitude(db) {
  const a = 10 ** (db / 20);
  return a > 0 ? a : 0;
}
var LiveLipSync = class {
  constructor(sampleRate, settings = {}, maxWindow = 0.25) {
    this.sampleRate = sampleRate;
    this.maxWindow = maxWindow;
    this.settings = { ...LIVE_LIP_SYNC_DEFAULTS };
    for (const key of ["gain", "gate", "attack", "release"])
      if (settings[key] !== void 0) this.settings[key] = settings[key];
  }
  sampleRate;
  maxWindow;
  /** The settings in use; changes apply from the next frame. */
  settings;
  /** The RMS of the latest frame's samples (the input level), 0 before any. */
  level = 0;
  /** The value of the latest frame: what is added to the lip-sync parameters. */
  value = 0;
  /** Called at the start of each frame before the samples are taken (for a tap that is polled). */
  pull = null;
  sum = 0;
  count = 0;
  frames = 0;
  idle = 0;
  /** Adds a block of samples: one array per channel, all of the same length. */
  push(channels) {
    const n = channels[0]?.length ?? 0;
    if (n === 0) return;
    let sum = 0;
    for (const ch of channels) for (let i2 = 0; i2 < n; i2++) sum += ch[i2] * ch[i2];
    this.pushSums(sum, channels.length * n, n);
  }
  /**
   * Adds a block given by the sum of its squared values, its number of values
   * (channels × frames) and its number of frames.
   */
  pushSums(sumSquares, values, frames) {
    if (!(frames > 0) || !(values > 0) || !(sumSquares >= 0)) return;
    if (this.frames > 0 && this.frames + frames > this.maxWindow * this.sampleRate) {
      this.sum = 0;
      this.count = 0;
      this.frames = 0;
    }
    this.sum += sumSquares;
    this.count += values;
    this.frames += frames;
  }
  /** Seconds of samples waiting for the next frame. */
  get pending() {
    return this.frames / this.sampleRate;
  }
  /** This frame's value, ≥ 0, from the samples pushed since the previous frame. */
  next(dt) {
    this.pull?.();
    if (this.count > 0) {
      const rms = Math.sqrt(this.sum / this.count);
      const seconds = this.frames / this.sampleRate;
      this.sum = 0;
      this.count = 0;
      this.frames = 0;
      this.idle = 0;
      this.level = rms;
      this.value = this.step(rms, seconds);
    } else {
      this.idle += dt > 0 ? dt : 0;
      if (this.idle > LIVE_SILENCE_AFTER) {
        this.level = 0;
        this.value = this.step(0, dt);
      }
    }
    return this.value;
  }
  /** Clears the pending samples and the value. */
  reset() {
    this.sum = 0;
    this.count = 0;
    this.frames = 0;
    this.idle = 0;
    this.level = 0;
    this.value = 0;
  }
  /** Gate, gain and one smoothing step for a window of `seconds` with this RMS. */
  step(rms, seconds) {
    const s = this.settings;
    const gain = s.gain > 0 && s.gain < Infinity ? s.gain : 0;
    const target2 = gain * Math.max(0, rms - dbfsToAmplitude(s.gate));
    const tau = target2 > this.value ? s.attack : s.release;
    if (!(tau > 0)) return target2;
    if (!(seconds > 0)) return this.value;
    return this.value + (target2 - this.value) * (1 - Math.exp(-seconds / tau));
  }
};

// src/platform/live-audio.ts
var LiveAudioError = class extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
    this.name = "LiveAudioError";
  }
  code;
};
function pageAddress() {
  return location.origin && location.origin !== "null" ? location.origin : location.protocol;
}
function liveAudioProblem() {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return new LiveAudioError("unsupported", "Live audio needs a browser.");
  if (!window.isSecureContext)
    return new LiveAudioError(
      "insecure-context",
      `Browsers offer the microphone only on secure pages: HTTPS, or http://localhost. This page is ${pageAddress()}, so the microphone is not available here.`
    );
  if (!navigator.mediaDevices?.getUserMedia)
    return new LiveAudioError(
      "unsupported",
      "This browser does not offer microphone access (getUserMedia)."
    );
  if (typeof AudioContext === "undefined")
    return new LiveAudioError("unsupported", "This browser has no Web Audio.");
  return null;
}
function liveAudioError(e) {
  if (e instanceof LiveAudioError) return e;
  const name2 = e?.name;
  const options = { cause: e };
  switch (name2) {
    case "NotAllowedError":
      return new LiveAudioError(
        "denied",
        "Microphone access was denied. Allow the microphone for this site (in the address bar or the site settings), then try again. Some browsers also refuse a request that does not come from a tap or click.",
        options
      );
    case "SecurityError":
      return new LiveAudioError(
        "blocked",
        "The microphone is blocked on this page: by the page that embeds it (a permissions policy), or because the page is not secure.",
        options
      );
    case "NotFoundError":
      return new LiveAudioError("no-device", "No microphone was found.", options);
    case "OverconstrainedError":
      return new LiveAudioError(
        "no-device",
        "No microphone was found that fits the request: the one asked for may be unplugged, or its device ID may have changed.",
        options
      );
    case "NotReadableError":
    case "AbortError":
      return new LiveAudioError(
        "busy",
        "The microphone could not be opened. Another app may be using it.",
        options
      );
    default: {
      const detail = e instanceof Error && e.message ? `: ${e.message}` : "";
      return new LiveAudioError("failed", `Live audio could not start${detail}`, options);
    }
  }
}
var TAP_PROCESSOR = "mochi2d-live-tap";
var TAP_BLOCK = 256;
var TAP_SOURCE = `registerProcessor(${JSON.stringify(TAP_PROCESSOR)}, class extends AudioWorkletProcessor {
  constructor() { super(); this.s = 0; this.v = 0; this.f = 0; this.m = new Float32Array(${4 * TAP_BLOCK}); }
  process(inputs) {
    const input = inputs[0];
    const n = input && input.length > 0 ? input[0].length : 0;
    if (n > 0) {
      let s = 0;
      if (this.f + n > this.m.length) { const m = new Float32Array(2 * (this.f + n)); m.set(this.m.subarray(0, this.f)); this.m = m; }
      for (let i = 0; i < n; i++) this.m[this.f + i] = 0;
      for (let c = 0; c < input.length; c++) {
        const ch = input[c];
        for (let i = 0; i < n; i++) { s += ch[i] * ch[i]; this.m[this.f + i] += ch[i] / input.length; }
      }
      this.s += s; this.v += input.length * n; this.f += n;
      if (this.f >= ${TAP_BLOCK}) {
        const mono = this.m.slice(0, this.f);
        this.port.postMessage([this.s, this.v, this.f, mono], [mono.buffer]);
        this.s = 0; this.v = 0; this.f = 0;
      }
    }
    return true;
  }
});`;
var tapModules = /* @__PURE__ */ new WeakMap();
function loadTapModule(ctx) {
  let p = tapModules.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([TAP_SOURCE], { type: "text/javascript" }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    p.catch(() => tapModules.delete(ctx));
    tapModules.set(ctx, p);
  }
  return p;
}
var LiveAudioTap = class _LiveAudioTap {
  constructor(ctx, input, method) {
    this.ctx = ctx;
    this.method = method;
    if (method === "worklet") {
      const node = new AudioWorkletNode(ctx, TAP_PROCESSOR, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      });
      node.port.onmessage = (e) => {
        const [sum, values, frames, mono] = e.data;
        for (const sink of this.sinks)
          if (sink.pushSums) sink.pushSums(sum, values, frames);
          else sink.push([mono]);
      };
      input.connect(node);
      node.connect(ctx.destination);
      this.node = node;
    } else {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      input.connect(analyser);
      this.node = analyser;
      this.window = new Float32Array(analyser.fftSize);
      this.clock = ctx.currentTime;
    }
  }
  ctx;
  method;
  sinks = /* @__PURE__ */ new Set();
  node;
  window = null;
  clock = 0;
  static async create(ctx, input, method = "auto") {
    if (method !== "analyser" && typeof AudioWorkletNode === "function" && ctx.audioWorklet) {
      try {
        await loadTapModule(ctx);
        return new _LiveAudioTap(ctx, input, "worklet");
      } catch (e) {
        if (method === "worklet") throw e;
      }
    } else if (method === "worklet") {
      throw new LiveAudioError("unsupported", "This browser has no AudioWorklet.");
    }
    return new _LiveAudioTap(ctx, input, "analyser");
  }
  /** Feeds a sink from now on (and sets its sample rate). */
  add(sink) {
    sink.sampleRate = this.ctx.sampleRate;
    sink.pull = this.window ? () => this.poll() : null;
    this.sinks.add(sink);
  }
  remove(sink) {
    if (this.sinks.delete(sink)) sink.pull = null;
  }
  get sinkCount() {
    return this.sinks.size;
  }
  /** Analyser taps: hands the samples rendered since the previous call to the sinks. */
  poll() {
    const w = this.window;
    if (!w) return;
    const now = this.ctx.currentTime;
    const n = Math.min(w.length, Math.round((now - this.clock) * this.ctx.sampleRate));
    if (n <= 0) return;
    this.clock = now;
    this.node.getFloatTimeDomainData(w);
    const block = w.subarray(w.length - n);
    for (const sink of this.sinks) sink.push([block]);
  }
  dispose() {
    for (const sink of this.sinks) sink.pull = null;
    this.sinks.clear();
    this.node.disconnect();
    if (this.node instanceof AudioWorkletNode) {
      this.node.port.onmessage = null;
      this.node.port.close();
    }
  }
};
var GESTURES = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
var LiveAudioInput = class _LiveAudioInput {
  constructor(ctx, options) {
    this.ctx = ctx;
    this.own = !options.stream;
    this.voiceProcessing = options.voiceProcessing ?? true;
    this.releaseWhenHidden = options.releaseWhenHidden ?? true;
    this.deviceId = options.deviceId || null;
    this.output = ctx.createGain();
    this.tryResume();
  }
  ctx;
  state = "starting";
  /** Why the input stopped, if it failed. */
  error = null;
  /** Carries the input audio, for a meter. It stays the same when the microphone is reopened. */
  output;
  /** The microphone was opened here (not a stream passed in). */
  own;
  voiceProcessing;
  releaseWhenHidden;
  /** The microphone asked for, or null for the browser's choice. */
  deviceId;
  stream = null;
  source = null;
  tap = null;
  listeners = /* @__PURE__ */ new Set();
  unarm = null;
  generation = 0;
  /**
   * Opens the microphone (or uses `options.stream`). Call it from a tap or
   * click: the audio context is resumed first, while the gesture lasts.
   * Rejects with a {@link LiveAudioError}.
   */
  static async open(ctx, options = {}) {
    const input = new _LiveAudioInput(ctx, options);
    try {
      await input.init(options);
    } catch (e) {
      input.error = liveAudioError(e);
      input.close();
      throw input.error;
    }
    return input;
  }
  async init(options) {
    let stream = options.stream ?? null;
    if (!stream) {
      const problem = liveAudioProblem();
      if (problem) throw problem;
      stream = await navigator.mediaDevices.getUserMedia({ audio: this.constraints() });
    }
    this.stream = stream;
    if (stream.getAudioTracks().length === 0)
      throw new LiveAudioError("no-device", "The stream has no audio track.");
    this.tap = await LiveAudioTap.create(this.ctx, this.output, options.tap ?? "auto");
    if (this.state === "stopped") return;
    this.attachStream(stream);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.ctx.addEventListener("statechange", this.onContextState);
    this.updateRunning();
    if (document.visibilityState === "hidden") this.onVisibility();
  }
  /** The stream in use (null while released or after stop). */
  get currentStream() {
    return this.stream;
  }
  /** The microphone's name, when the browser tells it. */
  get label() {
    return this.stream?.getAudioTracks()[0]?.label ?? "";
  }
  /** How samples are taken: "worklet" or "analyser". */
  get tapMethod() {
    return this.tap?.method ?? null;
  }
  /** Calls `listener` after each state change; returns a function that removes it. */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  addSink(sink) {
    this.tap?.add(sink);
  }
  removeSink(sink) {
    this.tap?.remove(sink);
  }
  /** Stops: releases a microphone opened here (a stream passed in keeps running). */
  stop() {
    this.close();
  }
  // ------------------------------------------------------------ internals
  constraints() {
    const on = this.voiceProcessing;
    return {
      echoCancellation: on,
      noiseSuppression: on,
      autoGainControl: on,
      ...this.deviceId ? { deviceId: { exact: this.deviceId } } : {}
    };
  }
  attachStream(stream) {
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.output);
    for (const t of stream.getAudioTracks()) t.addEventListener("ended", this.onTrackEnded);
  }
  detachStream(stopTracks) {
    const stream = this.stream;
    this.source?.disconnect();
    this.source = null;
    this.stream = null;
    if (!stream) return;
    for (const t of stream.getAudioTracks()) {
      t.removeEventListener("ended", this.onTrackEnded);
      if (stopTracks) t.stop();
    }
  }
  setState(state) {
    if (this.state === state) return;
    this.state = state;
    for (const listener of [...this.listeners]) listener(this);
  }
  fail(error) {
    this.error = error;
    this.close();
  }
  close() {
    if (this.state === "stopped") return;
    this.generation++;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ctx.removeEventListener("statechange", this.onContextState);
    this.disarm();
    this.detachStream(this.own);
    this.tap?.dispose();
    this.tap = null;
    this.output.disconnect();
    this.setState("stopped");
  }
  onTrackEnded = () => {
    if (this.state === "stopped" || !this.stream) return;
    if (!this.stream.getAudioTracks().every((t) => t.readyState === "ended")) return;
    this.fail(
      new LiveAudioError(
        "ended",
        this.own ? "The microphone stopped: it was unplugged, or its permission was withdrawn." : "The audio stream ended."
      )
    );
  };
  onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (this.own && this.releaseWhenHidden && (this.state === "running" || this.state === "suspended")) {
        this.disarm();
        this.detachStream(true);
        this.setState("paused");
      }
    } else if (this.state === "paused") void this.reopen();
    else if (this.state === "suspended") this.tryResume();
  };
  /** Opens the microphone again after the page was hidden. */
  async reopen() {
    const generation = ++this.generation;
    this.setState("starting");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: this.constraints() });
    } catch (e) {
      if (generation === this.generation) this.fail(liveAudioError(e));
      return;
    }
    if (generation !== this.generation || this.state !== "starting") {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    this.attachStream(stream);
    this.updateRunning();
    if (document.visibilityState === "hidden") this.onVisibility();
  }
  onContextState = () => this.updateRunning();
  updateRunning() {
    if (!this.source || this.state === "stopped" || this.state === "paused") return;
    const s = this.ctx.state;
    if (s === "running") {
      this.disarm();
      this.setState("running");
    } else if (s === "closed") {
      this.fail(new LiveAudioError("failed", "The audio context was closed."));
    } else {
      this.setState("suspended");
      this.arm();
    }
  }
  /** Resumes the audio context on the next gesture. */
  arm() {
    if (this.unarm) return;
    const resume = () => this.tryResume();
    for (const type of GESTURES)
      window.addEventListener(type, resume, { capture: true, passive: true });
    this.unarm = () => {
      for (const type of GESTURES) window.removeEventListener(type, resume, { capture: true });
    };
    this.tryResume();
  }
  disarm() {
    this.unarm?.();
    this.unarm = null;
  }
  tryResume() {
    const s = this.ctx.state;
    if (s !== "running" && s !== "closed") void this.ctx.resume().catch(() => {
    });
  }
};

// src/lib/live-motion-sync.ts
var LiveSampleQueue = class {
  /** `keep`: seconds of unread samples kept, the oldest dropped beyond. */
  constructor(keep = 2) {
    this.keep = keep;
  }
  keep;
  sampleRate = 48e3;
  pull = null;
  chunks = [];
  length = 0;
  push(channels) {
    const n = channels[0]?.length ?? 0;
    if (n === 0) return;
    const mono = new Float32Array(n);
    for (const ch of channels)
      for (let i2 = 0; i2 < n; i2++) mono[i2] = mono[i2] + ch[i2] / channels.length;
    this.chunks.push(mono);
    this.length += n;
    while (this.length > this.keep * this.sampleRate && this.chunks.length > 1)
      this.length -= this.chunks.shift().length;
  }
  /** The samples since the previous call. */
  read() {
    this.pull?.();
    const out = new Float32Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    this.chunks = [];
    this.length = 0;
    return out;
  }
  /** How many samples wait to be read. */
  get waiting() {
    return this.length;
  }
};
var LiveMotionSyncControl = class {
  /** @internal */
  constructor(input, queue, runtime, detach) {
    this.input = input;
    this.queue = queue;
    this.runtime = runtime;
    this.detach = detach;
    this.unsubscribe = input.onChange(() => {
      if (input.state === "stopped") this.stop();
      else this.onstatechange?.(input.state);
    });
  }
  input;
  queue;
  runtime;
  detach;
  /** Called with the new state after each change, last with `"stopped"`. */
  onstatechange = null;
  ended = false;
  unsubscribe;
  /** See {@link LiveInputState}: `running`, `suspended` (waiting for a tap), `paused` (page hidden)… */
  get state() {
    return this.ended ? "stopped" : this.input.state;
  }
  /** Why it stopped, when the microphone or stream failed. */
  get error() {
    return this.input.error;
  }
  /**
   * The latest analysis: the level (dBFS), the element weights (Silence, A,
   * I, U, E, O) and the values written; null before the first.
   */
  get tick() {
    const rt = this.runtime();
    return !this.ended && rt.motionSyncSource === this.queue ? rt.motionSync : null;
  }
  /** The stream in use: the microphone's (null while released) or the one passed in. */
  get stream() {
    return this.ended ? null : this.input.currentStream;
  }
  /** The microphone's name, when the browser tells it. */
  get label() {
    return this.input.label;
  }
  /** How samples are taken: `"worklet"` or `"analyser"` (null once stopped). */
  get tap() {
    return this.ended ? null : this.input.tapMethod;
  }
  /** Stops: the mouth settles to its Silence shape. A shared microphone closes when nothing uses it. */
  stop() {
    if (this.ended) return;
    this.ended = true;
    this.unsubscribe();
    this.detach();
    this.onstatechange?.("stopped");
  }
};
var LiveSlot = class {
  control = null;
  token = 0;
  async start(open, what) {
    this.stop();
    const token = ++this.token;
    const control = await open();
    if (token !== this.token) {
      control.stop();
      throw new DOMException(`${what} was stopped while it started`, "AbortError");
    }
    this.control = control;
    return control;
  }
  /** The running control, or null. */
  get current() {
    const c = this.control;
    return c && c.state !== "stopped" ? c : null;
  }
  stop() {
    this.token++;
    const c = this.control;
    this.control = null;
    c?.stop();
  }
};

// src/lib/live-lip-sync.ts
var LiveLipSyncControl = class {
  /** @internal */
  constructor(input, lip, detach, runtime) {
    this.input = input;
    this.lip = lip;
    this.detach = detach;
    this.runtime = runtime;
    this.settings = lip.settings;
    this.unsubscribe = input.onChange(() => {
      if (input.state === "stopped") this.stop();
      else this.onstatechange?.(input.state);
    });
  }
  input;
  lip;
  detach;
  runtime;
  /** The mapping settings in use. Change them at any time; they apply from the next frame. */
  settings;
  /** Called with the new state after each change, last with `"stopped"`. */
  onstatechange = null;
  ended = false;
  unsubscribe;
  /** See {@link LiveInputState}: `running`, `suspended` (waiting for a tap), `paused` (page hidden)… */
  get state() {
    return this.ended ? "stopped" : this.input.state;
  }
  /** Why it stopped, when the microphone or stream failed. */
  get error() {
    return this.input.error;
  }
  /** The RMS of the latest frame's samples (the input level, linear). */
  get level() {
    return this.lip.level;
  }
  /** The value of the latest frame: what is combined with the lip-sync parameters. */
  get value() {
    return this.lip.value;
  }
  /** How the value combines with the lip-sync parameters; changes apply from the next frame. */
  get mix() {
    return this.runtime.liveLipSync === this.lip ? this.runtime.liveLipSyncMix : "add";
  }
  set mix(mix) {
    if (!this.ended && this.runtime.liveLipSync === this.lip) this.runtime.liveLipSyncMix = mix;
  }
  /** The stream in use: the microphone's (null while released) or the one passed in. */
  get stream() {
    return this.ended ? null : this.input.currentStream;
  }
  /** The microphone's name, when the browser tells it. */
  get label() {
    return this.input.label;
  }
  /** How samples are taken: `"worklet"` or `"analyser"` (null once stopped). */
  get tap() {
    return this.ended ? null : this.input.tapMethod;
  }
  /** Stops live lip sync on this model. A shared microphone closes when nothing uses it. */
  stop() {
    if (this.ended) return;
    this.ended = true;
    this.unsubscribe();
    this.detach();
    this.onstatechange?.("stopped");
  }
};
var LiveInputs = class {
  constructor(context) {
    this.context = context;
  }
  context;
  shared = /* @__PURE__ */ new Map();
  open = /* @__PURE__ */ new Set();
  disposed = false;
  /** Starts live lip sync on a runtime. */
  async start(runtime, options) {
    if (this.disposed) throw new Error("the view is disposed");
    if (!runtime.animator.lipSync)
      throw new LiveAudioError(
        "no-lip-sync",
        "The model has no lip-sync parameter: its settings list no LipSync parameters, and it has no ParamMouthOpenY."
      );
    const { input, release } = await this.acquire(options);
    const lip = new LiveLipSync(input.ctx.sampleRate, options);
    input.addSink(lip);
    runtime.setLiveLipSync(lip, options.mix ?? "add");
    return new LiveLipSyncControl(
      input,
      lip,
      () => {
        if (runtime.liveLipSync === lip) runtime.setLiveLipSync(null);
        input.removeSink(lip);
        release();
      },
      runtime
    );
  }
  /** Starts live motion sync on a runtime (read when needed: a replaced model's is the new one). */
  async startMotionSync(runtime, options) {
    if (this.disposed) throw new Error("the view is disposed");
    const settings = runtime().motionSyncSettings;
    if (!settings.some((s) => s.usable))
      throw new LiveAudioError(
        "no-motion-sync",
        "The model has no motion-sync setting to run: its settings name no .motionsync3.json file, or none of the file's settings has a known analysis type."
      );
    const ref = options.setting;
    if (ref !== void 0 && !settings.some((s) => s.name === ref || s.id === ref))
      throw new RangeError(`no motion-sync setting "${ref}"`);
    const { input, release } = await this.acquire({
      ...options,
      voiceProcessing: options.voiceProcessing ?? false
    });
    const queue = new LiveSampleQueue();
    input.addSink(queue);
    runtime().setMotionSyncInput(queue, ref);
    return new LiveMotionSyncControl(input, queue, runtime, () => {
      const rt = runtime();
      if (rt.motionSyncSource === queue) rt.setMotionSyncInput(null);
      input.removeSink(queue);
      release();
    });
  }
  /**
   * Records `seconds` of live audio, mono (for voice calibration). Waits
   * while the audio context is suspended; the clip is only handed back.
   */
  async record(seconds, options = {}) {
    if (this.disposed) throw new Error("the view is disposed");
    if (!(seconds > 0 && seconds <= 60))
      throw new RangeError("a recording lasts from 0 to 60 seconds");
    const { input, release } = await this.acquire({
      ...options,
      voiceProcessing: options.voiceProcessing ?? false
    });
    const queue = new LiveSampleQueue(seconds + 1);
    input.addSink(queue);
    try {
      const chunks = [];
      let n = 0;
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (input.state === "stopped" || this.disposed) {
            clearInterval(timer);
            reject(input.error ?? new LiveAudioError("failed", "The microphone stopped."));
            return;
          }
          const got = queue.read();
          if (got.length) {
            chunks.push(got);
            n += got.length;
          }
          if (n >= seconds * queue.sampleRate) {
            clearInterval(timer);
            resolve();
          }
        }, 40);
      });
      const out = new Float32Array(Math.round(seconds * queue.sampleRate));
      let o = 0;
      for (const c of chunks) {
        out.set(c.subarray(0, Math.max(0, out.length - o)), o);
        o += c.length;
      }
      return { sampleRate: queue.sampleRate, channels: [out] };
    } finally {
      input.removeSink(queue);
      release();
    }
  }
  track(input) {
    this.open.add(input);
    input.onChange(() => {
      if (input.state === "stopped") this.open.delete(input);
    });
    return input;
  }
  async acquire(options) {
    const settings = {
      ...options.voiceProcessing !== void 0 ? { voiceProcessing: options.voiceProcessing } : {},
      ...options.releaseWhenHidden !== void 0 ? { releaseWhenHidden: options.releaseWhenHidden } : {},
      ...options.tap ? { tap: options.tap } : {},
      ...options.deviceId ? { deviceId: options.deviceId } : {}
    };
    if (options.stream) {
      const input = this.track(
        await LiveAudioInput.open(this.context(), { ...settings, stream: options.stream })
      );
      return { input, release: () => input.stop() };
    }
    const key = JSON.stringify([
      settings.voiceProcessing ?? true,
      settings.releaseWhenHidden ?? true,
      settings.tap ?? "auto",
      settings.deviceId ?? ""
    ]);
    for (let attempt = 0; ; attempt++) {
      let entry = this.shared.get(key);
      if (!entry) {
        entry = { input: LiveAudioInput.open(this.context(), settings), users: 0 };
        const created = entry;
        this.shared.set(key, created);
        created.input.then(
          (input2) => {
            this.track(input2).onChange(() => {
              if (input2.state === "stopped" && this.shared.get(key) === created)
                this.shared.delete(key);
            });
          },
          () => {
            if (this.shared.get(key) === created) this.shared.delete(key);
          }
        );
      }
      entry.users++;
      let input;
      try {
        input = await entry.input;
      } catch (e) {
        entry.users--;
        throw e;
      }
      if (input.state === "stopped") {
        entry.users--;
        if (attempt === 0) continue;
        throw input.error ?? new LiveAudioError("failed", "The microphone stopped.");
      }
      if (this.disposed) {
        entry.users--;
        if (entry.users === 0) input.stop();
        throw new DOMException("the view was disposed", "AbortError");
      }
      const used = entry;
      let released = false;
      return {
        input,
        release: () => {
          if (released) return;
          released = true;
          if (--used.users > 0) return;
          if (this.shared.get(key) === used) this.shared.delete(key);
          input.stop();
        }
      };
    }
  }
  /** Stops every input. */
  dispose() {
    this.disposed = true;
    for (const input of [...this.open]) input.stop();
    for (const entry of this.shared.values())
      void entry.input.then(
        (i2) => i2.stop(),
        () => {
        }
      );
    this.shared.clear();
  }
};
var LiveLipSyncSlot = class {
  constructor(inputs, runtime) {
    this.inputs = inputs;
    this.runtime = runtime;
  }
  inputs;
  runtime;
  control = null;
  token = 0;
  async start(options) {
    this.stop();
    const token = ++this.token;
    const control = await this.inputs().start(this.runtime(), options);
    if (token !== this.token) {
      control.stop();
      throw new DOMException("live lip sync was stopped while it started", "AbortError");
    }
    this.control = control;
    return control;
  }
  /** The running control, or null. */
  get current() {
    const c = this.control;
    return c && c.state !== "stopped" ? c : null;
  }
  stop() {
    this.token++;
    const c = this.control;
    this.control = null;
    c?.stop();
  }
};

// src/lib/model.ts
function updateLiveTexture(live, index, image, at4 = {}) {
  live.updateTexture(index, image, at4.x ?? 0, at4.y ?? 0);
}
function liveTextures(live) {
  return live.textures.map((t) => ({
    label: t.label,
    width: t.texture.width,
    height: t.texture.height,
    originalWidth: t.originalWidth,
    originalHeight: t.originalHeight
  }));
}
function motionSyncSound(p) {
  if (p.buffer)
    return {
      sampleRate: p.buffer.sampleRate,
      channels: Array.from(
        { length: p.buffer.numberOfChannels },
        (_, c) => p.buffer.getChannelData(c)
      )
    };
  return p.sound ? { sampleRate: p.sound.sampleRate, channels: p.sound.samples } : null;
}
var MochiModel = class {
  /** @internal Created by {@link MochiView.load}. */
  constructor(host, live) {
    this.host = host;
    this.live = live;
  }
  host;
  live;
  speechToken = 0;
  replaceToken = 0;
  gone = false;
  liveSlot = new LiveLipSyncSlot(
    () => this.host.liveInputs,
    () => this.runtime
  );
  motionSlot = new LiveSlot();
  /** The sound {@link speak} plays through motion sync, if any. */
  speechSound = null;
  /** The model's runtime: animation, evaluation and the parsed files (advanced use). */
  get runtime() {
    return this.live.runtime;
  }
  /** Path of the settings file inside its source. */
  get name() {
    return this.runtime.settingsPath;
  }
  /** Parameters with display names and ranges, in display order. */
  get parameters() {
    return this.runtime.parameters;
  }
  get parts() {
    return this.runtime.parts;
  }
  /** The settings' motion groups and their sizes. */
  get motionGroups() {
    return this.runtime.motionGroups;
  }
  /** Names of the settings' expressions. */
  get expressions() {
    return this.runtime.expressionNames;
  }
  /** The settings' hit areas. */
  get hitAreas() {
    return this.runtime.hitAreas;
  }
  /** Files of the model folder (relative to the settings file), or undefined if the source cannot list them. */
  get files() {
    return this.runtime.files;
  }
  /** Problems with optional files (physics, pose, motions, …). */
  get warnings() {
    return this.runtime.warnings;
  }
  /** Text saying which textures were downscaled to fit the budget, or null. */
  get textureNotice() {
    return this.live.textureNotice;
  }
  /**
   * The model's canvas rectangle in model units (x right, y up): what the
   * fitted view shows. Its center is the view's (0, 0).
   */
  get canvas() {
    const c = this.runtime.model.canvas;
    const ppu = c.pixelsPerUnit;
    return {
      left: -c.originX / ppu,
      right: (c.width - c.originX) / ppu,
      bottom: (c.originY - c.height) / ppu,
      top: c.originY / ppu
    };
  }
  /** The model's opacity from its motions (3u). */
  get opacity() {
    return this.runtime.opacity;
  }
  get disposed() {
    return this.gone;
  }
  // ------------------------------------------------------------ values
  /**
   * A parameter's value in the latest frame: its base value with motions,
   * expressions and effects (breath, physics, look…) applied.
   */
  getParameter(id) {
    return this.runtime.getParameter(id);
  }
  /**
   * A parameter's base value: what {@link setParameter} set, or what motions
   * left in it; expressions and effects apply on top of it, and
   * {@link getParameter} reads the result.
   */
  getParameterBase(id) {
    return this.runtime.getParameterBase(id);
  }
  /**
   * How far the idle animation moves a parameter, 0–1 (default 1): 0 keeps
   * the idle animation off it, so tracking written with `setParameter`
   * shows; one-shot motions still apply. See `ModelRuntime.setIdleWeight`.
   * Returns false for an unknown ID.
   */
  setIdleWeight(id, weight) {
    return this.runtime.setIdleWeight(id, weight);
  }
  /** A parameter's idle weight; 1 unless set. */
  getIdleWeight(id) {
    return this.runtime.getIdleWeight(id);
  }
  /** Every idle weight back to 1. */
  resetIdleWeights() {
    this.runtime.resetIdleWeights();
  }
  /**
   * The physics settings in file order: ID, display name (the dictionary's,
   * or the ID) and whether the dictionary names it. Empty without physics.
   */
  get physicsSettings() {
    return this.runtime.physicsSettings;
  }
  /**
   * How strongly physics moves the parameters (not reference behavior):
   * each output moves its parameter by k times the way it would, so 0 leaves
   * them as they are, 1 (the default) is the reference and above 1
   * exaggerates within each parameter's range. The pendulums run unchanged.
   * See `ModelRuntime.setPhysicsStrength`.
   */
  setPhysicsStrength(strength) {
    this.runtime.setPhysicsStrength(strength);
  }
  /** The model's physics strength; 1 unless set. */
  get physicsStrength() {
    return this.runtime.physicsStrength;
  }
  /**
   * One physics setting's strength, times the model's (see
   * {@link physicsSettings}). Returns false for an unknown ID.
   */
  setPhysicsSettingStrength(id, strength) {
    return this.runtime.setPhysicsSettingStrength(id, strength);
  }
  /** A physics setting's strength; 1 unless set. */
  getPhysicsSettingStrength(id) {
    return this.runtime.getPhysicsSettingStrength(id);
  }
  /** The model's physics strength and every setting's back to 1. */
  resetPhysicsStrengths() {
    this.runtime.resetPhysicsStrengths();
  }
  /**
   * The physics wind, a force on every pendulum particle in the physics'
   * units (gravity is (0, −1)); it takes effect from the next physics step.
   */
  setPhysicsWind(x2, y) {
    this.runtime.setPhysicsWind(x2, y);
  }
  /** The physics wind; (0, 0) unless set. */
  get physicsWind() {
    return this.runtime.physicsWind;
  }
  /**
   * How much of the wind one physics setting feels, by ID: its pendulums get
   * the wind times `multiplier` (1, the default, is the reference; 0
   * shields the setting). Returns false for an unknown ID.
   */
  setPhysicsSettingWind(id, multiplier) {
    return this.runtime.setPhysicsSettingWind(id, multiplier);
  }
  /** A physics setting's wind multiplier (see {@link setPhysicsSettingWind}); 1 unless set. */
  getPhysicsSettingWind(id) {
    return this.runtime.getPhysicsSettingWind(id);
  }
  /** Every setting's wind multiplier back to 1. */
  resetPhysicsSettingWinds() {
    this.runtime.resetPhysicsSettingWinds();
  }
  /**
   * Sets the physics simulation rate, in steps per second, instead of the
   * physics file's `Fps` (not reference behavior); null restores the file's.
   * 0 steps once per frame. See `ModelRuntime.setPhysicsRate`.
   */
  setPhysicsRate(rate) {
    this.runtime.setPhysicsRate(rate);
  }
  /** The physics rate in use, steps per second (0: once per frame). */
  get physicsRate() {
    return this.runtime.physicsRate;
  }
  /**
   * A copy of the physics simulation's state, or null without physics; see
   * `ModelRuntime.savePhysicsState`.
   */
  savePhysicsState() {
    return this.runtime.savePhysicsState();
  }
  /**
   * Puts the physics back in a saved state: the next frame continues as the
   * one after the save did, bit for bit. See `ModelRuntime.restorePhysicsState`.
   */
  restorePhysicsState(state) {
    this.runtime.restorePhysicsState(state);
  }
  /** The model's textures in the settings' order: their size on the GPU and in the file. */
  get textures() {
    return liveTextures(this.live);
  }
  /**
   * Replaces texture `index` (in the settings' order), or the region of it
   * whose top-left texel is `at` (pixels from the top-left corner), with
   * `image` (straight alpha), without reloading anything: drawn from the
   * next frame. The image is prepared as textures are at load: premultiplied
   * exactly, and the mip texels over the region recomputed by the same exact
   * rule, so the result equals loading a file with the new pixels. It must
   * fit inside the texture as stored: `textures[index].width × height`,
   * which is smaller than the file when the texture budget downscaled it.
   * Throws a RangeError otherwise. (Not reference behavior.)
   */
  updateTexture(index, image, at4) {
    this.host.beforeGl?.();
    updateLiveTexture(this.live, index, image, at4);
  }
  /**
   * Tints an art mesh until cleared (not reference behavior): `rgba` is
   * `[r, g, b]` or `[r, g, b, a]`. Its drawn color, after its multiply and
   * screen colors, is multiplied by r, g and b (0–2: 1 changes nothing,
   * above 1 brightens up to white), and its opacity by a (0–1). It still masks as before. Returns false
   * for an unknown ID. See `ModelRuntime.setTint`.
   */
  setTint(meshId, rgba) {
    return this.runtime.setTint(meshId, rgba);
  }
  /** Removes an art mesh's tint; false for an unknown ID or a mesh without one. */
  clearTint(meshId) {
    return this.runtime.clearTint(meshId);
  }
  /** Removes every tint. */
  clearTints() {
    this.runtime.clearTints();
  }
  /** An art mesh's tint `[r, g, b, a]`, or null. */
  getTint(meshId) {
    return this.runtime.getTint(meshId);
  }
  /** The tinted art meshes: ID → `[r, g, b, a]`. */
  get tints() {
    return this.runtime.tints;
  }
  /**
   * In-place value patches for an editor: new values for keyform positions,
   * opacities, draw orders, colors, rotation values and glue intensities and
   * weights, by their MocData array and index (see {@link ValuePatch}),
   * without reloading. They show at the next frame. Throws, and applies
   * nothing, for an array that cannot be patched or elements outside it.
   */
  patch(patches) {
    this.runtime.patch(patches);
  }
  /**
   * Sets a parameter's base value; it stays until changed, and motions,
   * expressions and effects apply on top. Returns false for an unknown ID.
   * It shows at the next frame (`runtime.update(0)` applies it at once).
   */
  setParameter(id, value) {
    return this.runtime.setParameter(id, value);
  }
  /** Sets every parameter back to its default. */
  resetParameters() {
    this.runtime.resetParameters();
  }
  getPartOpacity(id) {
    return this.runtime.getPartOpacity(id);
  }
  setPartOpacity(id, value) {
    this.runtime.setPartOpacity(id, value);
  }
  // ------------------------------------------------------------ motions
  /**
   * Starts motion `index` of a group from the settings (a random one when
   * omitted). Resolves to the playback, whose `ended` promise resolves when
   * this motion ends and says why (see {@link MotionEnd}), or to false when a
   * motion of higher priority plays. `options.hold` keeps the last frame.
   */
  startMotion(group, index, options) {
    return this.runtime.startMotion(group, index, options);
  }
  /** Starts a motion file by its path relative to the settings file (as {@link startMotion}). */
  startMotionFile(path, options) {
    return this.runtime.startMotionFile(path, options);
  }
  /** Stops all motions, held ones included; their playbacks end with "stopped". */
  stopMotions() {
    this.runtime.stopMotions();
  }
  /** Paths of the playing motions, oldest first. */
  get motions() {
    return this.runtime.playingMotions;
  }
  // ------------------------------------------------------- expressions
  /**
   * Starts an expression by settings name, or by file path relative to the
   * settings file. `fades` (seconds) replaces the file's fade times for this
   * start.
   */
  setExpression(nameOrPath, fades) {
    return this.runtime.setExpression(nameOrPath, fades);
  }
  /**
   * Fades the current expression out (the one of {@link setExpression}),
   * over its fade-out or `fades.fadeOut` seconds.
   */
  clearExpression(fades) {
    this.runtime.clearExpression(fades);
  }
  /**
   * Adds an expression on top of the others, with its file's fade-in, so
   * several show at once (applied in the order they were added, after the
   * one of {@link setExpression}, which keeps replacing). Resolves false when
   * it is already added.
   */
  addExpression(nameOrPath, fades) {
    return this.runtime.addExpression(nameOrPath, fades);
  }
  /**
   * Fades out an expression added with {@link addExpression} (over its
   * fade-out, or `fades.fadeOut` seconds); without a name (or null), all of
   * them. Returns whether one was removed.
   */
  removeExpression(nameOrPath, fades) {
    return this.runtime.removeExpression(nameOrPath, fades);
  }
  /** Paths of the expressions added with {@link addExpression}, oldest first. */
  get addedExpressions() {
    return this.runtime.addedExpressions;
  }
  // -------------------------------------------------------------- look
  /**
   * Parameters physics overwrites (weight 100 %) while it runs, each with the
   * model parameters that drive it, largest weight first. While physics
   * runs, writing such a parameter has no visible effect (DeepSeek-chan's
   * physics writes `ParamAngleX` from `AngleX`): map head tracking and
   * sliders to a driving input instead. Look does this itself (the runtime's
   * `lookThroughPhysics`); see {@link lookRouting}. Empty without physics.
   */
  get physicsInputs() {
    return this.runtime.physicsInputs;
  }
  /**
   * The parameters look writes: for each look target (`ParamAngleX`, …), the
   * one written, which is the physics input when physics overwrites the
   * target and `lookThroughPhysics` is on.
   */
  lookRouting() {
    return this.runtime.lookRouting();
  }
  /** Look target: x right and y up, in [−1, 1]. See also {@link MochiView.lookAt}. */
  lookAt(x2, y) {
    this.runtime.lookAt(x2, y);
  }
  stopLooking() {
    this.runtime.releaseLook();
  }
  // ---------------------------------------------------------- lip sync
  /**
   * Plays a sound and moves the mouth with it (lip sync). Resolves when the
   * sound ends or is stopped. Browsers only play audio after a user gesture:
   * call it from a click or tap handler. WAV files are analysed as the
   * reference does; other formats from the browser's decoded samples.
   */
  async speak(audio, options = {}) {
    const bytes = await audioBytes(audio);
    const prepared = await this.host.speech.prepare(bytes);
    if (!prepared.buffer && !prepared.sound) throw new Error("the audio could not be decoded");
    this.stopSpeaking();
    const token = ++this.speechToken;
    if (options.motionSync !== void 0 && options.motionSync !== false) {
      await this.speakWithMotionSync(prepared, options, token);
      return;
    }
    const lipSync = prepared.exact || options.lipSyncFromDecodedAudio !== false ? prepared.sound : null;
    this.runtime.startLipSync(lipSync);
    if (!lipSync && !(options.play !== false && prepared.buffer))
      throw new Error("the audio is not a WAV file the lip-sync decoder reads");
    if (options.play !== false && prepared.buffer) {
      await new Promise(
        (resolve) => this.host.speech.play(prepared.buffer, options.volume ?? 1, resolve)
      );
    } else {
      await this.host.waitUntil(
        () => token !== this.speechToken || !(this.runtime.animator.lipSync?.playing ?? false)
      );
    }
  }
  /** Motion sync's part of {@link speak}. */
  async speakWithMotionSync(p, options, token) {
    const sound = motionSyncSound(p);
    if (!sound) throw new Error("the audio could not be decoded");
    const setting = typeof options.motionSync === "string" ? options.motionSync : void 0;
    const audible = options.play !== false && p.buffer !== null;
    let position = null;
    const clock = audible ? () => position?.() ?? 0 : void 0;
    if (!this.runtime.startMotionSync(sound, {
      ...setting ? { setting } : {},
      ...clock ? { clock } : {}
    }))
      throw new Error("the model has no motion-sync setting to run");
    this.speechSound = sound;
    if (audible) {
      await new Promise((resolve) => {
        position = this.host.speech.play(p.buffer, options.volume ?? 1, resolve).position;
      });
    } else {
      await this.host.waitUntil(
        () => token !== this.speechToken || this.runtime.motionSyncSource !== sound
      );
    }
  }
  /** Stops the sound, and lip sync or motion sync. */
  stopSpeaking() {
    this.speechToken++;
    this.host.speech.stop();
    this.runtime.startLipSync(null);
    if (this.speechSound && this.runtime.motionSyncSource === this.speechSound)
      this.runtime.stopMotionSync();
    this.speechSound = null;
  }
  /**
   * Moves the mouth with the microphone, or with `options.stream` (lip sync
   * from live audio; not reference behavior). Call it from a click or tap
   * handler: the browser asks for the microphone, and iOS Safari starts
   * audio only in a gesture. Resolves once the input is set up; rejects with
   * a `LiveAudioError` whose message can be shown (an insecure page, a denied
   * permission…). Runs alongside {@link speak}. Audio is processed in memory
   * only: it is never recorded, stored or sent anywhere.
   */
  startLiveLipSync(options = {}) {
    if (this.gone) return Promise.reject(new Error("the model is disposed"));
    return this.liveSlot.start(options);
  }
  /** Stops live lip sync. */
  stopLiveLipSync() {
    this.liveSlot.stop();
  }
  /** The running live lip sync, or null. */
  get liveLipSync() {
    return this.liveSlot.current;
  }
  // ------------------------------------------------------- motion sync
  /** The settings of the model's motion-sync file (ID, name, whether it runs); empty without one. */
  get motionSyncSettings() {
    return this.runtime.motionSyncSettings;
  }
  /**
   * The latest motion-sync analysis: the setting, the level (dBFS), the
   * element weights (Silence, A, I, U, E, O, summing to 1) and the values
   * written. Null while motion sync plays nothing.
   */
  get motionSync() {
    return this.runtime.motionSync;
  }
  /** Calls `listener` at every motion-sync analysis; returns a function that removes it. */
  onMotionSyncTick(listener) {
    return this.runtime.onMotionSyncTick(listener);
  }
  /**
   * Moves the mouth by motion sync with the microphone, or with
   * `options.stream`, through a setting of the model's motion-sync file
   * (Mochi2D's own analysis; not reference behavior). Call it from a click or
   * tap handler, as {@link startLiveLipSync}. Resolves once the input is set
   * up; rejects with a `LiveAudioError` (code `"no-motion-sync"` for a model
   * without a usable setting) or a RangeError for an unknown setting. Audio
   * is processed in memory only: it is never stored or sent anywhere.
   */
  startLiveMotionSync(options = {}) {
    if (this.gone) return Promise.reject(new Error("the model is disposed"));
    return this.motionSlot.start(
      () => this.host.liveInputs.startMotionSync(() => this.runtime, options),
      "live motion sync"
    );
  }
  /** Stops live motion sync: the mouth settles to its Silence shape. */
  stopLiveMotionSync() {
    this.motionSlot.stop();
  }
  /** The running live motion sync, or null. */
  get liveMotionSync() {
    return this.motionSlot.current;
  }
  /** The voice profile motion sync analyzes with (from `VoiceCalibration`), or null for the neutral voice. */
  get voiceProfile() {
    return this.runtime.voiceProfile;
  }
  setVoiceProfile(profile) {
    this.runtime.setVoiceProfile(profile);
  }
  // ----------------------------------------------------------- effects
  /** Whether a component runs (physics, eyeBlink, breath, look, idle, lipSync, pose, expressions, motionSync). */
  effect(name2) {
    return this.runtime.effect(name2);
  }
  /** Whether the model has what a component needs (e.g. a physics file). */
  effectAvailable(name2) {
    return this.runtime.effectAvailable(name2);
  }
  setEffect(name2, on) {
    this.runtime.setEffect(name2, on);
  }
  /**
   * Replaces the model's data and keeps the rest: its textures (not decoded
   * or uploaded again), the settings and their files, the view (zoom, pan,
   * rotation), and the parameter base values, part opacities and effect
   * switches, matched by ID. For an editor's structural edits, which patches
   * cannot make. `moc` is `.moc3` bytes, or {@link MocData} with its
   * `version` (as `mocModelFromData` takes them). Motions, expressions and
   * speech stop (motions end with "stopped"); a live lip-sync input stays.
   * Items pinned to a mesh stay pinned if the mesh (by ID) keeps the pinned
   * triangle; others are released where they are. Resolves once the new data
   * is shown. If it does not load, it rejects, and the current data stays.
   * One that a later call (or dispose) overtakes rejects with an
   * `AbortError` and shows nothing. `runtime` is a new object afterwards.
   */
  async replace(moc, version) {
    if (this.gone) throw new Error("the model is disposed");
    const token = ++this.replaceToken;
    const runtime = await this.runtime.withData(moc, version);
    if (this.gone || token !== this.replaceToken)
      throw new DOMException("the replacement was superseded by a later one", "AbortError");
    this.stopSpeaking();
    this.runtime.stopMotions();
    this.host.replaceRuntime(this, runtime);
  }
  /** Removes the model from its view and frees its GPU resources (its motions end with "stopped"). */
  dispose() {
    if (this.gone) return;
    this.stopSpeaking();
    this.stopLiveLipSync();
    this.stopLiveMotionSync();
    this.runtime.stopMotions();
    this.gone = true;
    this.host.release(this);
    this.live.dispose();
  }
};

// src/lib/items/compositor.ts
var VERTEX = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform mat3 uMap;
out vec2 vUv;
void main() {
  vUv = aPos;
  vec3 p = uMap * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`;
var FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vUv) * uOpacity;
}`;
var ItemCompositor = class {
  constructor(gl) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, VERTEX, FRAGMENT, "item composite");
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    const fb = gl.createFramebuffer();
    if (!vao || !buffer || !fb) throw new Error("could not create GL objects (context lost?)");
    this.vao = vao;
    this.buffer = buffer;
    this.probeFb = fb;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  gl;
  program;
  vao;
  buffer;
  probeFb;
  /**
   * Draws `texture` over the currently bound framebuffer (`width × height`):
   * texture coordinates (s, t) ∈ [0, 1]² go to clip space through `map`
   * (column-major 3 × 3), blended as premultiplied color.
   */
  draw(texture, map, width, height, opacity = 1) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program.program);
    gl.uniformMatrix3fv(this.program.uniform("uMap"), false, map);
    gl.uniform1f(this.program.uniform("uOpacity"), opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.program.uniform("uTex"), 0);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
  }
  /**
   * Reads one texel's alpha (0–1) of a texture's level 0. (u, v) are texture
   * coordinates with v = 0 at row 0; they wrap around like the renderer's
   * repeat mode.
   */
  readAlpha(texture, width, height, u, v) {
    const gl = this.gl;
    const x2 = Math.min(width - 1, Math.floor((u - Math.floor(u)) * width));
    const y = Math.min(height - 1, Math.floor((v - Math.floor(v)) * height));
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const px = new Uint8Array(4);
    let alpha = Number.NaN;
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      gl.readPixels(x2, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      alpha = px[3] / 255;
    }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    return alpha;
  }
  dispose() {
    const gl = this.gl;
    this.program.dispose();
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
    gl.deleteFramebuffer(this.probeFb);
  }
};

// src/lib/items/item-settings.ts
var isObject3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var num3 = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
var bool2 = (v) => typeof v === "boolean" ? v : null;
function parseItemSettings(json, file) {
  if (!isObject3(json) || !isObject3(json.ItemSettings)) return null;
  const s = json.ItemSettings;
  const triple = (prefix, fallback) => ({
    x: num3(s[`${prefix}_HeadAngleX`], fallback),
    y: num3(s[`${prefix}_HeadAngleY`], fallback),
    z: num3(s[`${prefix}_HeadAngleZ`], fallback)
  });
  return {
    multiplier: triple("Multiplier", 1),
    shift: triple("Shift", 0),
    smoothing: triple("Smoothing", 0),
    onlyMoveWhenPinned: bool2(s.OnlyMoveWhenPinned),
    allowNormalHotkeyTriggers: bool2(s.AllowNormalHotkeyTriggers),
    file
  };
}
async function readItemSettings(source, settingsPath) {
  const dir = dirnameOf(settingsPath);
  const base = settingsPath.slice(dir ? dir.length + 1 : 0).replace(/\.model3\.json$/i, "");
  const listed = source.list();
  let candidates;
  if (listed) {
    const prefix = dir ? `${dir}/` : "";
    const inFolder = listed.filter(
      (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && p.toLowerCase().endsWith(".vtube.json")
    );
    const named = inFolder.filter(
      (p) => p.slice(prefix.length).toLowerCase() === `${base}.vtube.json`.toLowerCase()
    );
    candidates = named.length ? named : inFolder.length === 1 ? inFolder : [];
  } else {
    candidates = [joinPath(dir, `${base}.vtube.json`)];
  }
  for (const path of candidates) {
    try {
      const json = JSON.parse(await readText(source, path));
      return parseItemSettings(json, path.slice(dir ? dir.length + 1 : 0));
    } catch {
    }
  }
  return null;
}
var HeadAngleSmoother = class {
  constructor(strength) {
    this.strength = strength;
  }
  strength;
  value = null;
  /** The smoothed value after a frame of `dt` seconds toward `target`. */
  step(target2, dt) {
    const tau = this.strength / 100;
    if (this.value === null || tau <= 0) this.value = target2;
    else if (dt > 0) this.value += (target2 - this.value) * (1 - Math.exp(-dt / tau));
    return this.value;
  }
  reset() {
    this.value = null;
  }
};

// src/lib/items/pin.ts
var INVERTED_MASK2 = 8;
var EPS2 = 1e-6;
function barycentric(px, py, ax, ay, bx, by, cx, cy) {
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(det) < 1e-18) return null;
  const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
  const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
  const w2 = 1 - w0 - w1;
  return w0 >= -EPS2 && w1 >= -EPS2 && w2 >= -EPS2 ? [w0, w1, w2] : null;
}
function triangleAt(model, inst, d, x2, y) {
  const v = inst.drawableVertices[d];
  const tris = model.meshes.triangles[d];
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const i0 = tris[t];
    const i1 = tris[t + 1];
    const i2 = tris[t + 2];
    const w = barycentric(
      x2,
      y,
      v[2 * i0],
      v[2 * i0 + 1],
      v[2 * i1],
      v[2 * i1 + 1],
      v[2 * i2],
      v[2 * i2 + 1]
    );
    if (w) return { triangle: t / 3, vertices: [i0, i1, i2], weights: w };
  }
  return null;
}
function alphaOf(model, d, hit, probe) {
  if (!probe) return void 0;
  const uv = model.meshes.uvs[d];
  let u = 0;
  let v = 0;
  for (let k = 0; k < 3; k++) {
    u += hit.weights[k] * uv[2 * hit.vertices[k]];
    v += hit.weights[k] * uv[2 * hit.vertices[k] + 1];
  }
  return probe(model.meshes.texture[d], u, v);
}
function findPinTarget(model, inst, x2, y, probe, minAlpha = 0.1) {
  const n = model.meshes.ids.length;
  const order = [];
  for (let d = 0; d < n; d++)
    if (inst.drawableVisible[d] && inst.drawableOpacity[d] > 0.01) order.push(d);
  order.sort((a, b) => inst.drawableRenderOrder[b] - inst.drawableRenderOrder[a]);
  const covers = (d) => {
    const hit = triangleAt(model, inst, d, x2, y);
    if (!hit) return false;
    const a = alphaOf(model, d, hit, probe);
    return a === void 0 || a >= minAlpha;
  };
  for (const d of order) {
    const hit = triangleAt(model, inst, d, x2, y);
    if (!hit) continue;
    const a = alphaOf(model, d, hit, probe);
    if (a !== void 0 && a * inst.drawableOpacity[d] < minAlpha) continue;
    const masks = model.meshes.masks[d];
    if (masks.length) {
      const inside2 = Array.from(masks).some(covers);
      const inverted = (model.meshes.flags[d] & INVERTED_MASK2) !== 0;
      if (inside2 === inverted) continue;
    }
    const v = inst.drawableVertices[d];
    const pts = hit.vertices.map((i2) => [v[2 * i2], v[2 * i2 + 1]]);
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    return {
      drawable: d,
      drawableId: model.meshes.ids[d],
      triangle: hit.triangle,
      vertices: hit.vertices,
      weights: hit.weights,
      reference: pts.flatMap(([px, py]) => [px - cx, py - cy])
    };
  }
  return null;
}
function pinPose(inst, pin) {
  const v = inst.drawableVertices[pin.drawable];
  const pts = pin.vertices.map((i2) => [v[2 * i2], v[2 * i2 + 1]]);
  let x2 = 0;
  let y = 0;
  for (let k = 0; k < 3; k++) {
    x2 += pin.weights[k] * pts[k][0];
    y += pin.weights[k] * pts[k][1];
  }
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
  let dot = 0;
  let cross = 0;
  for (let k = 0; k < 3; k++) {
    const ax = pin.reference[2 * k];
    const ay = pin.reference[2 * k + 1];
    const bx = pts[k][0] - cx;
    const by = pts[k][1] - cy;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  }
  return { x: x2, y, angle: Math.atan2(cross, dot) };
}

// src/lib/items/placement.ts
function isMeshPlace(v) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== 1) return false;
  const k = keys[0];
  return (k === "above" || k === "below") && typeof v[k] === "string";
}
function isDepth(v) {
  return v === "front" || v === "behind" || isMeshPlace(v);
}
function placeMesh(d) {
  if (typeof d === "string") return null;
  return "above" in d ? d.above : d.below;
}
function copyDepth(d) {
  return typeof d === "string" ? d : { ...d };
}
function copyPlacement(p) {
  const out = { ...p };
  if (p.layer) out.layer = copyDepth(p.layer);
  if (p.split) out.split = { mesh: p.split.mesh, back: copyDepth(p.split.back) };
  return out;
}
function checkedPlacement(p) {
  const out = { ...p };
  if (p.layer !== void 0 && p.layer !== null) {
    if (!isMeshPlace(p.layer))
      throw new TypeError("an item's layer is { above: meshId } or { below: meshId }, or null");
    out.layer = copyDepth(p.layer);
  }
  if (p.split !== void 0 && p.split !== null) {
    const s = p.split;
    if (typeof s !== "object" || typeof s.mesh !== "string" || !isDepth(s.back))
      throw new TypeError(
        `an item's split is { mesh: meshId, back: "front" | "behind" | { above } | { below } }, or null`
      );
    out.split = { mesh: p.split.mesh, back: copyDepth(p.split.back) };
  }
  return out;
}
function canvasRect(c) {
  const ppu = c.pixelsPerUnit;
  return {
    left: -c.originX / ppu,
    right: (c.width - c.originX) / ppu,
    top: c.originY / ppu,
    bottom: (c.originY - c.height) / ppu,
    pixelsPerUnit: ppu
  };
}
function applyAffine(m, x2, y) {
  return [m[0] * x2 + m[2] * y + m[4], m[1] * x2 + m[3] * y + m[5]];
}
function invertAffine(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) return [1, 0, 0, 1, 0, 0];
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}
function anchorPoint(item, p) {
  return [
    item.left + p.anchorX * (item.right - item.left),
    item.top - p.anchorY * (item.top - item.bottom)
  ];
}
function unitScale(item, main, scale2) {
  return scale2 * item.pixelsPerUnit / main.pixelsPerUnit;
}
function itemToMain(item, main, p) {
  const s = unitScale(item, main, p.scale);
  const r = p.rotation * Math.PI / 180;
  const cos = Math.cos(r) * s;
  const sin = Math.sin(r) * s;
  const [ax, ay] = anchorPoint(item, p);
  const m = p.mirror ? -1 : 1;
  const a = m * cos;
  const b = m * sin;
  return [a, b, -sin, cos, p.x - (a * ax - sin * ay), p.y - (b * ax + cos * ay)];
}
function defaultPlacement(main) {
  return {
    x: (main.left + main.right) / 2,
    y: (main.bottom + main.top) / 2,
    scale: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    front: true,
    mirror: false
  };
}

// src/lib/items/item-layer.ts
var HEAD_ANGLE_IDS = ["ParamAngleX", "ParamAngleY", "ParamAngleZ"];
var MAX_OFFSCREEN = 4096;
var meshIndices = /* @__PURE__ */ new WeakMap();
function meshIndex(model, id) {
  let map = meshIndices.get(model);
  if (!map) {
    map = new Map(model.meshes.ids.map((m, i2) => [m, i2]));
    meshIndices.set(model, map);
  }
  return map.get(id) ?? -1;
}
function resolvePlace(depth, front, main) {
  if (depth === "front" || depth === "behind") front = depth === "front";
  else if (depth) {
    const d = meshIndex(main.runtime.model, placeMesh(depth));
    if (d >= 0) {
      const above = "above" in depth;
      const pos = main.runtime.instance.drawableRenderOrder[d];
      return { key: 2 * pos + (above ? 1 : 0), drawable: d, above };
    }
  }
  return { key: front ? Infinity : -Infinity, drawable: -1, above: front };
}
var ItemEntry = class {
  constructor(live, settings, placement) {
    this.live = live;
    this.settings = settings;
    this.placement = copyPlacement(placement);
    this.rect = canvasRect(live.runtime.model.canvas);
    const s = settings?.smoothing;
    this.smoothers = [s?.x ?? 0, s?.y ?? 0, s?.z ?? 0].map((v) => new HeadAngleSmoother(v));
  }
  live;
  settings;
  /** The placement as set (a pinned item's position and rotation come from its pin). */
  placement;
  pin = null;
  /** Opacity of the whole item, 0–1. */
  opacity = 1;
  /** Shown (drawn and updated). */
  visible = true;
  smoothers;
  /** Values last fed to ParamAngleX/Y/Z, or null. */
  forwarded = [null, null, null];
  /** @internal The item's image; for a split item, its front part. */
  target = null;
  /** @internal A split item's back part, or null. */
  backTarget = null;
  /** @internal The render-order position where the images were split, or null (whole). */
  renderedSplit = null;
  /** @internal */
  renderedKey = "";
  /** @internal */
  drawnKey = "";
  rect;
  get canvas() {
    return this.rect;
  }
  /** The placement now: a pinned item's position and rotation follow its pin. */
  effectivePlacement(main) {
    const p = copyPlacement(this.placement);
    if (!this.pin || !main) return p;
    const pose = pinPose(main.runtime.instance, this.pin.target);
    return {
      ...p,
      x: pose.x,
      y: pose.y,
      rotation: this.pin.rotation + pose.angle * 180 / Math.PI
    };
  }
  /**
   * The render-order position of a split item where its front part starts,
   * or null: not split, the item has no art mesh with the split's ID, or
   * nothing is before it.
   */
  splitPosition() {
    const s = this.placement.split;
    if (!s) return null;
    const r = this.live.runtime;
    const d = meshIndex(r.model, s.mesh);
    const pos = d < 0 ? 0 : r.instance.drawableRenderOrder[d];
    return pos > 0 ? pos : null;
  }
  /** Item units → main-model units under the current placement. */
  toMain(main) {
    return itemToMain(
      this.rect,
      canvasRect(main.runtime.model.canvas),
      this.effectivePlacement(main)
    );
  }
};
var ItemLayer = class {
  constructor(gl) {
    this.gl = gl;
  }
  gl;
  entries = [];
  main = null;
  compositor = null;
  maxSize;
  /** The main model the items are placed over, or null. */
  get model() {
    return this.main;
  }
  /**
   * Places the items over `main` (or none). Pins refer to the previous main
   * model's meshes, so they are released, keeping each item where it is.
   */
  attach(main, options = {}) {
    if (main === this.main) return;
    if (this.main?.overlay === this) this.main.overlay = null;
    if (!options.keepPins) {
      for (const e of this.entries) if (e.pin) this.unpin(e);
    }
    this.main = main;
    if (main) main.overlay = this;
    this.touch();
  }
  /** A new item over the main model; `placement` overrides the defaults. */
  add(live, settings, placement = {}) {
    const base = this.main ? defaultPlacement(canvasRect(this.main.runtime.model.canvas)) : defaultPlacement(canvasRect(live.runtime.model.canvas));
    const e = new ItemEntry(live, settings, { ...base, ...checkedPlacement(placement) });
    this.entries.push(e);
    this.touch();
    return e;
  }
  /** Removes an item (its model is disposed). */
  remove(e) {
    const i2 = this.entries.indexOf(e);
    if (i2 < 0) return;
    this.entries.splice(i2, 1);
    e.target?.dispose();
    e.backTarget?.dispose();
    e.target = e.backTarget = null;
    e.live.dispose();
    this.touch();
  }
  /** Moves an item to the end of the drawing order (on top of the items at its place). */
  raise(e) {
    const i2 = this.entries.indexOf(e);
    if (i2 < 0) return;
    this.entries.splice(i2, 1);
    this.entries.push(e);
    this.touch();
  }
  // ------------------------------------------------------------- pinning
  /** Reads one texel's alpha of the main model's texture, for pinning. */
  probe = (texture, u, v) => {
    const t = this.main?.textures[texture]?.texture;
    if (!t) return void 0;
    const a = this.gpu().readAlpha(t.texture, t.width, t.height, u, v);
    return Number.isNaN(a) ? void 0 : a;
  };
  /**
   * Pins an item at its anchor: records the topmost visible drawable of the
   * main model there (where its texture is not transparent), a triangle and
   * barycentric coordinates. Returns false (and changes nothing) when nothing
   * of the main model is under the anchor.
   */
  pin(e) {
    const main = this.main;
    if (!main) return false;
    const p = e.effectivePlacement(main);
    const target2 = findPinTarget(main.runtime.model, main.runtime.instance, p.x, p.y, this.probe);
    if (!target2) return false;
    e.placement = p;
    e.pin = { target: target2, rotation: p.rotation };
    this.touch();
    return true;
  }
  /**
   * Pins an item to a given triangle of a drawable of the main model (a saved
   * layout). Its current placement becomes the reference. False if the main
   * model has no such drawable or triangle.
   */
  pinTo(e, drawableId, triangle, weights) {
    const main = this.main;
    if (!main || weights.length !== 3) return false;
    const model = main.runtime.model;
    const d = model.meshes.ids.indexOf(drawableId);
    const tris = d < 0 ? void 0 : model.meshes.triangles[d];
    if (!tris || 3 * triangle + 2 >= tris.length) return false;
    const vertices = [
      tris[3 * triangle],
      tris[3 * triangle + 1],
      tris[3 * triangle + 2]
    ];
    const v = main.runtime.instance.drawableVertices[d];
    const pts = vertices.map((i2) => [v[2 * i2], v[2 * i2 + 1]]);
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    const target2 = {
      drawable: d,
      drawableId,
      triangle,
      vertices,
      weights: [weights[0], weights[1], weights[2]],
      reference: pts.flatMap(([px, py]) => [px - cx, py - cy])
    };
    e.pin = { target: target2, rotation: e.placement.rotation };
    this.touch();
    return true;
  }
  /**
   * Before the main model shows other data (`MochiModel.replace`): keeps
   * each pin whose drawable, by ID, has the same triangle in `next` (at the
   * drawable's new index) and releases the others where they are.
   */
  keepPinsFor(next) {
    for (const e of this.entries) {
      const pin = e.pin;
      if (!pin) continue;
      const t = pin.target;
      const d = next.meshes.ids.indexOf(t.drawableId);
      const tris = d < 0 ? void 0 : next.meshes.triangles[d];
      const same = tris !== void 0 && 3 * t.triangle + 2 < tris.length && t.vertices.every((v, k) => tris[3 * t.triangle + k] === v);
      if (same) e.pin = { ...pin, target: { ...t, drawable: d } };
      else this.unpin(e);
    }
  }
  /** Releases a pin, keeping the item's current position and rotation. */
  unpin(e) {
    if (!e.pin) return;
    e.placement = e.effectivePlacement(this.main);
    e.pin = null;
    this.touch();
  }
  // ------------------------------------------------------------ hit tests
  /** The item drawn topmost at a point in main-model units, or null. */
  itemAt(x2, y) {
    const main = this.main;
    if (!main) return null;
    const shown = this.entries.map((e, i2) => ({ e, i: i2 })).filter(({ e }) => e.visible).map(({ e, i: i2 }) => ({ e, i: i2, key: this.frontPlace(e, main).key }));
    shown.sort((a, b) => a.key === b.key ? b.i - a.i : b.key - a.key);
    for (const { e } of shown) {
      const [ix, iy] = applyAffine(invertAffine(e.toMain(main)), x2, y);
      const r = e.live.runtime;
      if (findPinTarget(r.model, r.instance, ix, iy)) return e;
    }
    return null;
  }
  /** The anchor of an item in main-model units. */
  anchorOf(e) {
    const p = e.effectivePlacement(this.main);
    return [p.x, p.y];
  }
  /**
   * Moves an item's anchor to the item point now under (x, y) in main-model
   * units, keeping the item where it is on screen.
   */
  setAnchorAt(e, x2, y) {
    const main = this.main;
    if (!main) return;
    const wasPinned = e.pin !== null;
    if (wasPinned) this.unpin(e);
    const [ix, iy] = applyAffine(invertAffine(e.toMain(main)), x2, y);
    const r = e.canvas;
    e.placement.anchorX = (ix - r.left) / (r.right - r.left);
    e.placement.anchorY = (r.top - iy) / (r.top - r.bottom);
    e.placement.x = x2;
    e.placement.y = y;
    if (wasPinned) this.pin(e);
    this.touch();
  }
  // -------------------------------------------------------------- frames
  version = 0;
  drawnVersion = -1;
  /** Something about the items changed: redraw. */
  touch() {
    this.version++;
  }
  update(dt, main) {
    const values = HEAD_ANGLE_IDS.map(
      (id) => hasParameter(main, id) ? main.runtime.getParameter(id) : null
    );
    for (const e of this.entries) {
      if (!e.visible) continue;
      const s = e.settings;
      if (s) {
        const mult = [s.multiplier.x, s.multiplier.y, s.multiplier.z];
        const shift = [s.shift.x, s.shift.y, s.shift.z];
        const mirrored = e.placement.mirror === true;
        HEAD_ANGLE_IDS.forEach((id, k) => {
          const v = values[k];
          if (v === null || v === void 0 || !hasParameter(e.live, id)) return;
          const input = mirrored && k !== 1 ? -v : v;
          const target2 = mult[k] * input + shift[k];
          const smoothed = e.smoothers[k].step(target2, dt);
          e.forwarded[k] = smoothed;
          e.live.runtime.setParameter(id, smoothed);
        });
      }
      e.live.update(dt);
    }
  }
  /** The key of what an item's offscreen image shows, and its size and scale. */
  offscreenOf(e, main, width, height) {
    const k = main.framing(width, height).k;
    const r = e.canvas;
    const w = r.right - r.left;
    const h = r.top - r.bottom;
    const max2 = this.maxSize ??= Math.min(MAX_OFFSCREEN, maxTextureSize(this.gl));
    let kpx = k * unitScale(r, canvasRect(main.runtime.model.canvas), e.placement.scale);
    kpx = Math.min(kpx, max2 / w, max2 / h);
    const W = Math.max(1, Math.ceil(w * kpx));
    const H = Math.max(1, Math.ceil(h * kpx));
    const framing = {
      width: W,
      height: H,
      k: kpx,
      centerX: (r.left + r.right) / 2,
      centerY: (r.bottom + r.top) / 2
    };
    const tints = e.live.runtime.tintVersion;
    const split = e.splitPosition();
    return {
      framing,
      split,
      key: `${e.live.renderVersion} ${tints} ${W}x${H} ${kpx} ${split ?? "whole"}`
    };
  }
  needsRedraw(width, height, main) {
    if (this.version !== this.drawnVersion) return true;
    for (const e of this.entries) {
      if (!e.visible) continue;
      if (this.offscreenOf(e, main, width, height).key !== e.renderedKey) return true;
      if (this.compositeKey(e, main, width, height) !== e.drawnKey) return true;
    }
    return false;
  }
  compositeKey(e, main, width, height) {
    const p = e.effectivePlacement(main);
    const f = main.framing(width, height);
    const places = this.partsOf(e, main).map((q2) => q2.place.key);
    return `${p.x} ${p.y} ${p.scale} ${p.rotation} ${p.anchorX} ${p.anchorY} ${p.front} ${p.mirror ?? false} ${places} ${e.opacity} ${f.k} ${f.centerX} ${f.centerY} ${f.rotation ?? 0} ${width}x${height}`;
  }
  gpu() {
    return this.compositor ??= new ItemCompositor(this.gl);
  }
  prepare(width, height, main) {
    for (const e of this.entries) {
      if (!e.visible) continue;
      const { framing, key, split } = this.offscreenOf(e, main, width, height);
      if (key === e.renderedKey && e.target) continue;
      const image = (t, label) => {
        if (!t) return new RenderTarget(this.gl, framing.width, framing.height, { label });
        t.resize(framing.width, framing.height);
        return t;
      };
      const render = (t, range) => e.live.renderer.draw({
        framing,
        target: t.framebuffer,
        clear: true,
        tints: e.live.runtime.activeTints,
        range
      });
      e.target = image(e.target, "item");
      if (split === null) {
        e.backTarget?.dispose();
        e.backTarget = null;
        render(e.target, null);
      } else {
        e.backTarget = image(e.backTarget, "item back");
        render(e.backTarget, { from: 0, to: split });
        render(e.target, { from: split, to: Infinity });
      }
      e.renderedSplit = split;
      e.renderedKey = key;
    }
  }
  /** Where an item's front part (or the whole item) is drawn. */
  frontPlace(e, main) {
    return resolvePlace(e.placement.layer, e.placement.front, main);
  }
  /**
   * An item's images and where each is drawn, in drawing order: the whole
   * item, or a split item's back part, then its front part. A back part
   * that would be in front of the front part is drawn at its place.
   */
  partsOf(e, main) {
    const front = this.frontPlace(e, main);
    const split = e.placement.split;
    if (!e.target) return [];
    if (!split || e.renderedSplit === null || !e.backTarget)
      return [{ target: e.target, place: front }];
    let back = resolvePlace(split.back, e.placement.front, main);
    if (back.key > front.key) back = front;
    return [
      { target: e.backTarget, place: back },
      { target: e.target, place: front }
    ];
  }
  /** Draws the item parts behind (`front` false) or in front of the whole main model. */
  draw(width, height, main, front) {
    for (const e of this.entries) {
      if (!e.visible || !e.target) continue;
      for (const part of this.partsOf(e, main)) {
        const p = part.place;
        if (p.drawable < 0 && p.key > 0 === front)
          this.composite(e, part.target, width, height, main);
      }
      if (front) e.drawnKey = this.compositeKey(e, main, width, height);
    }
    if (front) this.drawnVersion = this.version;
  }
  /**
   * The item parts drawn at places in the main model's render order, for
   * its renderer ({@link FrameInsert}), or null when there are none.
   */
  inserts(width, height, main) {
    let map = null;
    for (const e of this.entries) {
      if (!e.visible || !e.target) continue;
      for (const part of this.partsOf(e, main)) {
        const p = part.place;
        if (p.drawable < 0) continue;
        map ??= /* @__PURE__ */ new Map();
        let at4 = map.get(p.drawable);
        if (!at4) map.set(p.drawable, at4 = { below: [], above: [] });
        const target2 = part.target;
        (p.above ? at4.above : at4.below).push(() => this.composite(e, target2, width, height, main));
      }
    }
    return map;
  }
  /** Draws one image of an item onto the bound framebuffer at its placement. */
  composite(e, image, width, height, main) {
    const f = main.framing(width, height);
    const [sx, sy, tx, ty] = clipTransform(f);
    const [t0, t1, t2] = clipTurn(f);
    const mainRect = canvasRect(main.runtime.model.canvas);
    const p = e.effectivePlacement(main);
    const r = e.canvas;
    const [a, b, c, d, ee, ff] = itemToMain(r, mainRect, p);
    const off = this.offscreenOf(e, main, width, height).framing;
    const w = off.width / off.k;
    const h = off.height / off.k;
    const left = off.centerX - w / 2;
    const bottom = off.centerY - h / 2;
    const cols = [
      [sx * a * w, sy * b * w],
      [sx * c * h, sy * d * h],
      [sx * (a * left + c * bottom + ee) + tx, sy * (b * left + d * bottom + ff) + ty]
    ];
    const map = new Float32Array(9);
    cols.forEach(([X, Y], k) => {
      map[3 * k] = t0 * X - t1 * Y;
      map[3 * k + 1] = t2 * X + t0 * Y;
    });
    map[8] = 1;
    this.gpu().draw(image.texture, map, width, height, e.opacity);
  }
  /** After a lost GPU context: forget GL objects (they are gone) so they are made again. */
  resetGpu() {
    this.compositor = null;
    for (const e of this.entries) {
      e.target = e.backTarget = null;
      e.renderedSplit = null;
      e.renderedKey = "";
    }
    this.touch();
  }
  /** Removes every item and frees the layer's GPU resources. */
  dispose() {
    for (const e of [...this.entries]) this.remove(e);
    this.compositor?.dispose();
    this.compositor = null;
    this.attach(null);
  }
};
var hasParameter = (live, id) => live.runtime.animator.values.index(id) >= 0;

// src/lib/item.ts
var MochiItem = class {
  /** @internal Created by {@link MochiView.addItem}. */
  constructor(host, entry, id) {
    this.host = host;
    this.entry = entry;
    this.id = id;
  }
  host;
  entry;
  id;
  gone = false;
  liveSlot = new LiveLipSyncSlot(
    () => this.host.liveInputs,
    () => this.runtime
  );
  motionSlot = new LiveSlot();
  /** The item's runtime: animation, evaluation and the parsed files (advanced use). */
  get runtime() {
    return this.entry.live.runtime;
  }
  /** Path of the settings file inside its source. */
  get name() {
    return this.runtime.settingsPath;
  }
  /** The `ItemSettings` of the item's `.vtube.json`, or null (then no inputs are forwarded). */
  get settings() {
    return this.entry.settings;
  }
  get disposed() {
    return this.gone;
  }
  // ---------------------------------------------------------- placement
  /** The placement now (a pinned item's position and rotation follow the main model). */
  get placement() {
    return this.entry.effectivePlacement(this.host.itemLayer.model);
  }
  /**
   * Changes the placement. Changing the position or rotation of a pinned item
   * unpins it first (it keeps its current placement, then moves). Giving
   * `front` without `layer` draws the item in front of or behind the whole
   * main model again. A malformed `layer` or `split` throws a TypeError;
   * their art mesh IDs are not checked here (see {@link MochiItem.layer}).
   */
  place(p) {
    const layer = this.host.itemLayer;
    const q2 = checkedPlacement(p);
    if (q2.front !== void 0 && q2.layer === void 0) q2.layer = null;
    if (this.entry.pin && (q2.x !== void 0 || q2.y !== void 0 || q2.rotation !== void 0))
      layer.unpin(this.entry);
    Object.assign(this.entry.placement, q2);
    layer.touch();
  }
  /**
   * Drawn in front of the main model (true, the default) or behind it. Setting
   * it draws the item in front of or behind the whole model (it clears
   * {@link MochiItem.layer}'s art mesh place).
   */
  get front() {
    return this.entry.placement.front;
  }
  set front(on) {
    this.place({ front: on });
  }
  /**
   * Where the item is drawn: `"front"` or `"behind"` the whole main model, or
   * at a place in its render order, `{ above: meshId }` or
   * `{ below: meshId }`: just above or below the main model's art mesh with
   * that ID, wherever the main model's draw order puts it. The item is then
   * drawn into whatever the art mesh is drawn into: inside an offscreen of
   * the main model, it is composited with the offscreen's opacity, colors,
   * blending and mask. The main model's clipping masks do not apply to the
   * item, nor the item's to the main model (each drawable keeps its own).
   *
   * Setting an art mesh place throws a RangeError when the main model has no
   * art mesh with that ID. A place whose art mesh is gone (another main model
   * was loaded, or a layout names one) draws the item per
   * {@link MochiItem.front}. Several items at one place are drawn in item
   * order ({@link MochiItem.raise} puts one on top).
   */
  get layer() {
    const p = this.entry.placement;
    return p.layer ? copyDepth(p.layer) : p.front ? "front" : "behind";
  }
  set layer(depth) {
    if (depth === "front" || depth === "behind") {
      this.place({ front: depth === "front" });
      return;
    }
    this.checkMainMesh(depth);
    this.place({ layer: depth });
  }
  /**
   * Draws the item in two parts, each at its own place (see
   * {@link ItemSplit}): its art mesh `mesh` and the drawables after it in its
   * render order are drawn at {@link MochiItem.layer}, the drawables before
   * it at `back`. The back part is never drawn in front of the front part.
   * An offscreen of the item that the split crosses is composited in each
   * part. Null (the default): drawn whole.
   *
   * Setting it throws a RangeError when the item has no art mesh `mesh`, or
   * `back` names an art mesh the main model does not have. A split whose
   * art mesh the item does not have draws the item whole.
   */
  get split() {
    const s = this.entry.placement.split;
    return s ? { mesh: s.mesh, back: copyDepth(s.back) } : null;
  }
  set split(split) {
    if (split) {
      checkedPlacement({ split });
      if (meshIndex(this.runtime.model, split.mesh) < 0)
        throw new RangeError(`the item has no art mesh ${JSON.stringify(split.mesh)}`);
      this.checkMainMesh(split.back);
    }
    this.place({ split });
  }
  checkMainMesh(depth) {
    if (!isDepth(depth))
      throw new TypeError(
        'an item depth is "front", "behind", { above: meshId } or { below: meshId }'
      );
    const id = placeMesh(depth);
    const main = this.host.itemLayer.model;
    if (id !== null && main && meshIndex(main.runtime.model, id) < 0)
      throw new RangeError(`the main model has no art mesh ${JSON.stringify(id)}`);
  }
  /**
   * Flipped horizontally: the item's left and right swapped about its anchor
   * (before its rotation). Drawing, hit tests (`itemAt`), dragging and pins
   * all follow it; a pinned item stays pinned. The forwarded head angles
   * `ParamAngleX` and `ParamAngleZ` are negated, so the item turns with the
   * main model on screen; the multipliers and shifts of its item settings
   * apply on top. Default false.
   */
  get mirror() {
    return this.entry.placement.mirror ?? false;
  }
  set mirror(on) {
    this.place({ mirror: on });
  }
  /** Opacity of the whole item, 0–1. */
  get opacity() {
    return this.entry.opacity;
  }
  set opacity(v) {
    this.entry.opacity = Math.min(1, Math.max(0, v));
    this.host.itemLayer.touch();
  }
  /** Hidden items are neither drawn nor animated. */
  get visible() {
    return this.entry.visible;
  }
  set visible(on) {
    this.entry.visible = on;
    this.host.itemLayer.touch();
  }
  /**
   * Draws this item above the other items at its place (and every other
   * item's place). It moves to the end of {@link MochiView.items}, which
   * lists the items in drawing order.
   */
  raise() {
    this.host.raiseItem(this);
  }
  /** This item's layout entry (JSON-serializable): id, settings path, placement, opacity, visibility, pin. */
  exportLayout() {
    const pin = this.pin;
    return {
      id: this.id,
      name: this.name,
      placement: this.placement,
      opacity: this.opacity,
      visible: this.visible,
      pin: pin ? { drawable: pin.drawable, triangle: pin.triangle, weights: [...pin.weights] } : null
    };
  }
  /**
   * Applies a layout entry to this item, whatever its id and name: placement,
   * opacity, visibility and pin. A pin is restored when the main model has its
   * drawable and triangle (the rotation is taken relative to the main model's
   * current pose); returns false when a pin was given but could not be.
   */
  applyLayout(entry) {
    this.unpin();
    this.place({ layer: null, split: null, ...entry.placement });
    this.opacity = entry.opacity ?? 1;
    this.visible = entry.visible ?? true;
    const pin = entry.pin;
    if (!pin) return true;
    return this.host.itemLayer.pinTo(this.entry, pin.drawable, pin.triangle, pin.weights);
  }
  // ------------------------------------------------------------- pinning
  /** Where the item is pinned, or null. */
  get pin() {
    const t = this.entry.pin?.target;
    if (!t) return null;
    return {
      drawable: t.drawableId,
      triangle: t.triangle,
      vertices: t.vertices,
      weights: t.weights
    };
  }
  /**
   * Pins the item to the main model at its anchor: to the topmost visible
   * drawable there (where its texture is not transparent). From then on the
   * item follows that point and the triangle's rotation. Returns false when
   * no part of the main model is under the anchor.
   */
  pinToModel() {
    return this.host.itemLayer.pin(this.entry);
  }
  /** Releases the pin; the item stays where it is. */
  unpin() {
    this.host.itemLayer.unpin(this.entry);
  }
  /** The values last fed to the item's ParamAngleX, Y and Z from the main model (null: not fed). */
  get headAngles() {
    return this.entry.forwarded;
  }
  // ------------------------------------------------- the model's controls
  get parameters() {
    return this.runtime.parameters;
  }
  get parts() {
    return this.runtime.parts;
  }
  getParameter(id) {
    return this.runtime.getParameter(id);
  }
  /** As {@link MochiModel.getParameterBase}. */
  getParameterBase(id) {
    return this.runtime.getParameterBase(id);
  }
  /** As {@link MochiModel.setIdleWeight}. */
  setIdleWeight(id, weight) {
    return this.runtime.setIdleWeight(id, weight);
  }
  /** As {@link MochiModel.getIdleWeight}. */
  getIdleWeight(id) {
    return this.runtime.getIdleWeight(id);
  }
  /** As {@link MochiModel.resetIdleWeights}. */
  resetIdleWeights() {
    this.runtime.resetIdleWeights();
  }
  /** As {@link MochiModel.physicsSettings}. */
  get physicsSettings() {
    return this.runtime.physicsSettings;
  }
  /** As {@link MochiModel.setPhysicsStrength}. */
  setPhysicsStrength(strength) {
    this.runtime.setPhysicsStrength(strength);
  }
  /** As {@link MochiModel.physicsStrength}. */
  get physicsStrength() {
    return this.runtime.physicsStrength;
  }
  /** As {@link MochiModel.setPhysicsSettingStrength}. */
  setPhysicsSettingStrength(id, strength) {
    return this.runtime.setPhysicsSettingStrength(id, strength);
  }
  /** As {@link MochiModel.getPhysicsSettingStrength}. */
  getPhysicsSettingStrength(id) {
    return this.runtime.getPhysicsSettingStrength(id);
  }
  /** As {@link MochiModel.resetPhysicsStrengths}. */
  resetPhysicsStrengths() {
    this.runtime.resetPhysicsStrengths();
  }
  /** As {@link MochiModel.setPhysicsWind}. */
  setPhysicsWind(x2, y) {
    this.runtime.setPhysicsWind(x2, y);
  }
  /** As {@link MochiModel.physicsWind}. */
  get physicsWind() {
    return this.runtime.physicsWind;
  }
  /** As {@link MochiModel.setPhysicsSettingWind}. */
  setPhysicsSettingWind(id, multiplier) {
    return this.runtime.setPhysicsSettingWind(id, multiplier);
  }
  /** As {@link MochiModel.getPhysicsSettingWind}. */
  getPhysicsSettingWind(id) {
    return this.runtime.getPhysicsSettingWind(id);
  }
  /** As {@link MochiModel.resetPhysicsSettingWinds}. */
  resetPhysicsSettingWinds() {
    this.runtime.resetPhysicsSettingWinds();
  }
  /** As {@link MochiModel.setPhysicsRate}. */
  setPhysicsRate(rate) {
    this.runtime.setPhysicsRate(rate);
  }
  /** As {@link MochiModel.physicsRate}. */
  get physicsRate() {
    return this.runtime.physicsRate;
  }
  /** As {@link MochiModel.savePhysicsState}. */
  savePhysicsState() {
    return this.runtime.savePhysicsState();
  }
  /** As {@link MochiModel.restorePhysicsState}. */
  restorePhysicsState(state) {
    this.runtime.restorePhysicsState(state);
  }
  /** As {@link MochiModel.textures}: the item's textures. */
  get textures() {
    return liveTextures(this.entry.live);
  }
  /** As {@link MochiModel.updateTexture}: replaces an item texture, or a region of it, in place. */
  updateTexture(index, image, at4) {
    updateLiveTexture(this.entry.live, index, image, at4);
  }
  /** As {@link MochiModel.setTint}: tints one of the item's art meshes. */
  setTint(meshId, rgba) {
    return this.runtime.setTint(meshId, rgba);
  }
  /** As {@link MochiModel.clearTint}. */
  clearTint(meshId) {
    return this.runtime.clearTint(meshId);
  }
  /** As {@link MochiModel.clearTints}. */
  clearTints() {
    this.runtime.clearTints();
  }
  /** As {@link MochiModel.getTint}. */
  getTint(meshId) {
    return this.runtime.getTint(meshId);
  }
  /** As {@link MochiModel.tints}. */
  get tints() {
    return this.runtime.tints;
  }
  /**
   * Sets a parameter's base value. Forwarded head angles overwrite
   * ParamAngleX, Y and Z every frame.
   */
  setParameter(id, value) {
    return this.runtime.setParameter(id, value);
  }
  resetParameters() {
    this.runtime.resetParameters();
  }
  getPartOpacity(id) {
    return this.runtime.getPartOpacity(id);
  }
  setPartOpacity(id, value) {
    this.runtime.setPartOpacity(id, value);
  }
  get motionGroups() {
    return this.runtime.motionGroups;
  }
  /** As {@link MochiModel.startMotion}: the playback, or false when refused by priority. */
  startMotion(group, index, options) {
    return this.runtime.startMotion(group, index, options);
  }
  startMotionFile(path, options) {
    return this.runtime.startMotionFile(path, options);
  }
  stopMotions() {
    this.runtime.stopMotions();
  }
  get expressions() {
    return this.runtime.expressionNames;
  }
  setExpression(nameOrPath, fades) {
    return this.runtime.setExpression(nameOrPath, fades);
  }
  clearExpression(fades) {
    this.runtime.clearExpression(fades);
  }
  /** As {@link MochiModel.addExpression}. */
  addExpression(nameOrPath, fades) {
    return this.runtime.addExpression(nameOrPath, fades);
  }
  removeExpression(nameOrPath, fades) {
    return this.runtime.removeExpression(nameOrPath, fades);
  }
  effect(name2) {
    return this.runtime.effect(name2);
  }
  effectAvailable(name2) {
    return this.runtime.effectAvailable(name2);
  }
  setEffect(name2, on) {
    this.runtime.setEffect(name2, on);
  }
  // ---------------------------------------------------- live lip sync
  /**
   * Moves this item's mouth with the microphone, or with `options.stream`,
   * as {@link MochiModel.startLiveLipSync} does for a model. Only this item
   * follows it; the main model and other items have their own.
   */
  startLiveLipSync(options = {}) {
    if (this.gone) return Promise.reject(new Error("the item is disposed"));
    return this.liveSlot.start(options);
  }
  stopLiveLipSync() {
    this.liveSlot.stop();
  }
  /** The running live lip sync, or null. */
  get liveLipSync() {
    return this.liveSlot.current;
  }
  // ------------------------------------------------- live motion sync
  /**
   * Moves this item's mouth by motion sync with the microphone, or with
   * `options.stream`, as {@link MochiModel.startLiveMotionSync} does for a
   * model. Only this item follows it.
   */
  startLiveMotionSync(options = {}) {
    if (this.gone) return Promise.reject(new Error("the item is disposed"));
    return this.motionSlot.start(
      () => this.host.liveInputs.startMotionSync(() => this.runtime, options),
      "live motion sync"
    );
  }
  stopLiveMotionSync() {
    this.motionSlot.stop();
  }
  /** The running live motion sync, or null. */
  get liveMotionSync() {
    return this.motionSlot.current;
  }
  /** The latest motion-sync analysis (weights, level, values), or null. */
  get motionSync() {
    return this.runtime.motionSync;
  }
  /** The voice profile motion sync analyzes with, or null for the neutral voice. */
  get voiceProfile() {
    return this.runtime.voiceProfile;
  }
  setVoiceProfile(profile) {
    this.runtime.setVoiceProfile(profile);
  }
  /** Removes the item from its view and frees its GPU resources (its motions end with "stopped"). */
  dispose() {
    if (this.gone) return;
    this.stopLiveLipSync();
    this.stopLiveMotionSync();
    this.runtime.stopMotions();
    this.gone = true;
    this.host.releaseItem(this);
  }
};

// src/core/io/file-limits.ts
var DEFAULT_FILE_LIMITS = Object.freeze({
  maxFileBytes: 2 ** 30,
  maxTotalBytes: 2 ** 31
});
var FileLimitError = class extends Error {
  constructor(path, kind2, limit, size) {
    super(
      kind2 === "file" ? `"${path}" holds ${size} bytes or more, more than the ${limit} allowed for one file` : `"${path}": reading it takes the files read to ${size} bytes, more than the ${limit} allowed in total`
    );
    this.path = path;
    this.kind = kind2;
    this.limit = limit;
    this.size = size;
    this.name = "FileLimitError";
  }
  path;
  kind;
  limit;
  size;
};
function resolveFileLimits(limits = {}) {
  const out = { ...DEFAULT_FILE_LIMITS };
  for (const key of ["maxFileBytes", "maxTotalBytes"]) {
    const v = limits[key];
    if (v === void 0) continue;
    if (typeof v !== "number" || Number.isNaN(v) || v < 0)
      throw new RangeError(`${key} must be a number \u2265 0 (Infinity for no cap)`);
    out[key] = v;
  }
  return out;
}
var FileBudget = class {
  limits;
  counted = /* @__PURE__ */ new Map();
  total = 0;
  constructor(limits = {}) {
    this.limits = Object.freeze(resolveFileLimits(limits));
  }
  /** Bytes read so far, each file once. */
  get readBytes() {
    return this.total;
  }
  /** Throws if a file of `size` bytes (known before reading) may not be read. */
  check(path, size) {
    const { maxFileBytes, maxTotalBytes } = this.limits;
    if (size > maxFileBytes) throw new FileLimitError(path, "file", maxFileBytes, size);
    if (!this.counted.has(path) && this.total + size > maxTotalBytes)
      throw new FileLimitError(path, "total", maxTotalBytes, this.total + size);
  }
  /** Counts a file read in full (once per path). */
  add(path, size) {
    if (this.counted.has(path)) return;
    this.counted.set(path, size);
    this.total += size;
  }
  /** The most bytes `path` may still hold: under the file cap, and what is left of the total. */
  allowance(path) {
    const { maxFileBytes, maxTotalBytes } = this.limits;
    return this.counted.has(path) ? maxFileBytes : Math.min(maxFileBytes, maxTotalBytes - this.total);
  }
};
async function readResponse(res, path, budget) {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 0 && res.headers.get("content-encoding") === null)
    budget.check(path, declared);
  const allowed = budget.allowance(path);
  const fail2 = (got) => {
    const { maxFileBytes, maxTotalBytes } = budget.limits;
    return got > maxFileBytes ? new FileLimitError(path, "file", maxFileBytes, got) : new FileLimitError(path, "total", maxTotalBytes, budget.readBytes + got);
  };
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.length > allowed) throw fail2(all.length);
    budget.add(path, all.length);
    return all;
  }
  const reader = res.body.getReader();
  const parts = [];
  let n = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    n += value.length;
    if (n > allowed) {
      await reader.cancel().catch(() => {
      });
      throw fail2(n);
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at4 = 0;
  for (const p of parts) {
    out.set(p, at4);
    at4 += p.length;
  }
  budget.add(path, n);
  return out;
}

// src/platform/browser-sources.ts
var BrowserFileSource = class {
  constructor(label, entries, limits) {
    this.label = label;
    this.budget = new FileBudget(limits);
    for (const [p, f] of entries) this.files.set(normalizePath(p), f);
  }
  label;
  files = /* @__PURE__ */ new Map();
  budget;
  list() {
    return [...this.files.keys()].sort();
  }
  async read(path) {
    const key = normalizePath(path);
    const f = this.files.get(key);
    if (!f) throw new FileNotFoundError(path, this.label);
    this.budget.check(key, f.size);
    const bytes = new Uint8Array(await f.arrayBuffer());
    this.budget.add(key, bytes.length);
    return bytes;
  }
};
async function readFileCapped(file, name2, limits) {
  new FileBudget(limits).check(name2, file.size);
  return new Uint8Array(await file.arrayBuffer());
}
function sourceFromFileList(list, limits) {
  const files = [...list];
  if (files.length === 1) rejectUnsupportedArchive(files[0].name);
  const entries = files.map((f) => [f.webkitRelativePath || f.name, f]);
  const label = commonRoot(entries.map(([p]) => p)) || "selected files";
  return new BrowserFileSource(label, entries, limits);
}
function commonRoot(paths) {
  const first = paths[0]?.split("/")[0];
  if (!first || paths.some((p) => !p.startsWith(first + "/"))) return "";
  return first;
}
async function sourceFromDataTransfer(dt, archive, files) {
  const entries = [];
  const roots = [...dt.items].filter((it) => it.kind === "file").map((it) => it.webkitGetAsEntry?.() ?? null);
  if (roots.some((r) => r)) {
    for (const root of roots) if (root) await walkEntry(root, "", entries);
  } else {
    for (const f of dt.files) entries.push([f.name, f]);
  }
  if (entries.length === 1) {
    const file = entries[0][1];
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    rejectUnsupportedArchive(file.name, head);
    if (archiveKind(file.name, head) === "zip")
      return sourceFromZip(file.name, await readFileCapped(file, file.name, files), archive);
  }
  const label = commonRoot(entries.map(([p]) => p)) || "dropped files";
  return new BrowserFileSource(label, entries, files);
}
async function walkEntry(entry, prefix, out) {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise(
      (res, rej) => entry.file(res, rej)
    );
    out.push([path, file]);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (; ; ) {
      const batch = await new Promise(
        (res, rej) => reader.readEntries(res, rej)
      );
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, path, out);
    }
  }
}
var HttpFileSource = class {
  constructor(baseUrl, label = baseUrl, limits) {
    this.label = label;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    this.budget = new FileBudget(limits);
  }
  label;
  baseUrl;
  budget;
  list() {
    return void 0;
  }
  async read(path) {
    const url = new URL(
      normalizePath(path).split("/").map(encodeURIComponent).join("/"),
      this.baseUrl
    );
    const res = await fetch(url);
    if (res.status === 404) throw new FileNotFoundError(path, this.label);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return readResponse(res, normalizePath(path), this.budget);
  }
};
async function sourceFromUrl(url, archive, files) {
  const u = new URL(url, location.href);
  rejectUnsupportedArchive(decodeURIComponent(u.pathname.split("/").pop() ?? ""));
  if (u.pathname.toLowerCase().endsWith(".zip")) {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${u}`);
    const name2 = decodeURIComponent(u.pathname.split("/").pop());
    return {
      source: sourceFromZip(name2, await readResponse(res, name2, new FileBudget(files)), archive)
    };
  }
  const slash = u.href.lastIndexOf("/");
  const base = u.href.slice(0, slash + 1);
  const entry = decodeURIComponent(u.href.slice(slash + 1).split(/[?#]/)[0]);
  return { source: new HttpFileSource(base, base, files), entry: entry || void 0 };
}

// src/lib/sources.ts
var isFileSource = (x2) => typeof x2 === "object" && x2 !== null && typeof x2.read === "function" && typeof x2.list === "function";
async function bytesOf(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array(await data.arrayBuffer());
}
var isZipName = (name2) => name2.toLowerCase().endsWith(".zip");
async function openModelInput(input, settings, archive, files) {
  let source;
  let entry;
  if (typeof input === "string" || input instanceof URL) {
    const r = await sourceFromUrl(String(input), archive, files);
    source = r.source;
    entry = r.entry;
    if (entry && !entry.toLowerCase().endsWith(".model3.json"))
      throw new Error(`${String(input)}: expected a URL of a *.model3.json file or a .zip archive`);
  } else if (typeof DataTransfer !== "undefined" && input instanceof DataTransfer) {
    source = await sourceFromDataTransfer(input, archive, files);
  } else if (typeof Blob !== "undefined" && input instanceof Blob) {
    const name2 = typeof File !== "undefined" && input instanceof File ? input.name : "model.zip";
    rejectUnsupportedArchive(name2, new Uint8Array(await input.slice(0, 8).arrayBuffer()));
    if (!isZipName(name2) && !/zip/.test(input.type))
      throw new Error(
        `${name2}: a single file must be a .zip archive (pass a folder's files or a URL instead)`
      );
    source = sourceFromZip(name2, await readFileCapped(input, name2, files), archive);
  } else if (typeof FileList !== "undefined" && input instanceof FileList || Array.isArray(input)) {
    const list = Array.from(input);
    if (list.length === 1) rejectUnsupportedArchive(list[0].name);
    if (list.length === 1 && isZipName(list[0].name))
      source = sourceFromZip(
        list[0].name,
        await readFileCapped(list[0], list[0].name, files),
        archive
      );
    else source = sourceFromFileList(list, files);
  } else if (isFileSource(input)) {
    source = input;
  } else if (typeof input === "object" && input !== null && "files" in input) {
    const mem2 = new MemoryFileSource("files");
    const entries = input.files instanceof Map ? [...input.files.entries()] : Object.entries(input.files);
    for (const [path, data] of entries) mem2.set(path, await bytesOf(data));
    source = mem2;
  } else {
    throw new TypeError("unsupported model input");
  }
  return { source, settingsPath: resolveSettingsPath(source, settings ?? entry) };
}

// src/core/format-names.ts
var FORMAT_PREFIX = "mochi2d-";
var LEGACY_FORMAT_PREFIX = "lively2d-";
function currentFormatName(name2) {
  return typeof name2 === "string" && name2.startsWith(LEGACY_FORMAT_PREFIX) ? FORMAT_PREFIX + name2.slice(LEGACY_FORMAT_PREFIX.length) : name2;
}

// src/platform/png-encode.ts
var crcTable;
function crc322(bytes, start, end) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c2 = n;
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 3988292384 ^ c2 >>> 1 : c2 >>> 1;
      crcTable[n] = c2 >>> 0;
    }
  }
  let c = 4294967295;
  for (let i2 = start; i2 < end; i2++) c = crcTable[(c ^ bytes[i2]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function encodePngRgba8(width, height, rgba, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`encodePngRgba8: invalid size ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePngRgba8: got ${rgba.length} bytes, expected ${width}x${height}x4`);
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = zlibSync(raw, { level: options.level ?? 6 });
  const chunks = [];
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(["IHDR", ihdr], ["IDAT", idat], ["IEND", new Uint8Array(0)]);
  const size = 8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0);
  const out = new Uint8Array(size);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(out.buffer);
  let p = 8;
  for (const [type, data] of chunks) {
    view.setUint32(p, data.length);
    for (let i2 = 0; i2 < 4; i2++) out[p + 4 + i2] = type.charCodeAt(i2);
    out.set(data, p + 8);
    view.setUint32(p + 8 + data.length, crc322(out, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  }
  return out;
}

// src/render/gl/readback.ts
function readbackRgba(gl, target2, options = {}) {
  const source = options.source ?? "premultiplied";
  const output = options.output ?? "straight";
  const full = target2 ? { x: 0, y: 0, width: target2.width, height: target2.height } : { x: 0, y: 0, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  const r = options.rect ?? full;
  const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target2 ? target2.framebuffer : null);
  try {
    const px = readFramebufferRgba(gl, r.x, r.y, r.width, r.height);
    return {
      width: r.width,
      height: r.height,
      data: source === output ? px : convertAlpha(px, source, output),
      alpha: output
    };
  } finally {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
  }
}

// src/lib/clock.ts
var PlaybackClock = class {
  playing = true;
  /** Model seconds per real second. */
  speed = 1;
  /** Total model time in seconds. */
  time = 0;
  /** Real-time gaps longer than this (e.g. a background tab) are clamped. */
  maxRealStep = 0.1;
  /** Length of one {@link step} in model seconds. */
  stepSeconds = 1 / 60;
  pendingStep = 0;
  /**
   * Advances by `realDt` real seconds. Returns the model-time delta for this
   * frame: scaled by `speed` while playing, plus any requested steps.
   */
  tick(realDt) {
    let dt = 0;
    if (this.playing && realDt > 0) dt = Math.min(realDt, this.maxRealStep) * this.speed;
    dt += this.pendingStep;
    this.pendingStep = 0;
    this.time += dt;
    return dt;
  }
  /** Requests a step of `frames × stepSeconds` model time at the next tick (pauses playback). */
  step(frames = 1) {
    this.playing = false;
    this.pendingStep += frames * this.stepSeconds;
  }
  toggle() {
    this.playing = !this.playing;
    return this.playing;
  }
  reset() {
    this.time = 0;
    this.pendingStep = 0;
  }
};

// src/lib/frame-stats.ts
var FrameStats = class {
  constructor(window2 = 120) {
    this.window = window2;
  }
  window;
  intervals = [];
  cpu = [];
  record(intervalMs, cpuMs) {
    if (!(intervalMs > 0)) return;
    this.intervals.push(intervalMs);
    this.cpu.push(cpuMs);
    if (this.intervals.length > this.window) {
      this.intervals.shift();
      this.cpu.shift();
    }
  }
  snapshot() {
    const n = this.intervals.length;
    if (n === 0) return { fps: 0, frameMs: 0, worstFrameMs: 0, cpuMs: 0, frames: 0 };
    const sum = this.intervals.reduce((a, b) => a + b, 0);
    return {
      fps: 1e3 * n / sum,
      frameMs: sum / n,
      worstFrameMs: Math.max(...this.intervals),
      cpuMs: this.cpu.reduce((a, b) => a + b, 0) / n,
      frames: n
    };
  }
};

// src/lib/stage.ts
var Stage = class {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = createGl2Context(canvas, {
      preserveDrawingBuffer: false,
      antialias: options.antialias ?? true,
      premultipliedAlpha: true
    });
    this.maxPixelRatio = options.maxPixelRatio ?? Infinity;
    this.autoResize = options.autoResize ?? true;
    const lost = (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.drawnKey = "";
      this.onContextLost?.();
    };
    const restored = () => {
      this.contextLost = false;
      this.memory.clear();
      this.onContextRestored?.();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    this.unbind = () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }
  canvas;
  gl;
  memory = new GpuMemoryTracker();
  clock = new PlaybackClock();
  stats = new FrameStats();
  /** Straight-alpha RGB in [0, 1]; ignored when `transparent`. */
  background = [0.91, 0.91, 0.93];
  transparent = false;
  model = null;
  /** True if the last frame was not redrawn because nothing changed. */
  idle = false;
  /** Upper limit of the device pixel ratio for the drawing buffer. */
  maxPixelRatio;
  autoResize;
  /**
   * Whether frames draw. While false, the loop and {@link tick} still advance
   * the clock and update the model (and call the frame listeners), but leave
   * the canvas as it is; {@link draw} draws the current state.
   */
  drawing = true;
  /** The WebGL context is lost (until it is restored). */
  contextLost = false;
  /** Called when the context is lost, and when it is restored (GPU resources must be recreated). */
  onContextLost = null;
  onContextRestored = null;
  listeners = [];
  beforeListeners = [];
  drawnKey = "";
  drawnModel = null;
  screenshotWaiters = [];
  last = 0;
  running = false;
  rafId = 0;
  unbind;
  /** Listens to every frame, after drawing. Returns a function that removes the listener. */
  onFrame(fn) {
    this.listeners.push(fn);
    return () => this.listeners.splice(this.listeners.indexOf(fn) >>> 0, 1);
  }
  /** Listens to every frame, before the model updates (to set inputs). */
  onBeforeUpdate(fn) {
    this.beforeListeners.push(fn);
    return () => this.beforeListeners.splice(this.beforeListeners.indexOf(fn) >>> 0, 1);
  }
  get isRunning() {
    return this.running;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    const loop = (t) => {
      if (!this.running) return;
      this.frame(t);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
  /** The device pixel ratio the drawing buffer uses. */
  get pixelRatio() {
    return Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio);
  }
  /** Sizes the drawing buffer to the canvas's CSS size now. Returns whether it changed. */
  resize() {
    return resizeCanvasToDisplaySize(this.canvas, this.pixelRatio);
  }
  /** Resolves with a PNG (straight alpha) of the next rendered frame. */
  screenshot() {
    if (!this.running || !this.drawing) {
      const p = new Promise((resolve) => this.screenshotWaiters.push(resolve));
      this.tick(0, true);
      return p;
    }
    return new Promise((resolve) => this.screenshotWaiters.push(resolve));
  }
  /**
   * Runs one frame now with `realDt` seconds of real time (for hosts that
   * drive their own loop). With `draw` false (default: {@link drawing}), it
   * updates without drawing.
   */
  tick(realDt, draw = this.drawing) {
    this.step(realDt, realDt * 1e3, draw);
  }
  /** Draws the current state now (a frame that takes no time), even while {@link drawing} is off. */
  draw() {
    this.tick(0, true);
  }
  frame(t) {
    const realDt = this.last ? (t - this.last) / 1e3 : 0;
    const interval = this.last ? t - this.last : 0;
    this.last = t;
    this.step(realDt, interval, this.drawing);
  }
  step(realDt, interval, draw) {
    if (this.contextLost || this.gl.isContextLost()) return;
    const cpu0 = performance.now();
    const gl = this.gl;
    if (this.autoResize) this.resize();
    const dt = this.clock.tick(realDt);
    for (const l of this.beforeListeners) l({ dt, realDt, time: this.clock.time });
    this.model?.update(dt, this.clock.time);
    const { width, height } = this.canvas;
    const key = `${width}x${height} ${this.transparent ? "transparent" : this.background.join(",")}`;
    const redraw = draw && (this.screenshotWaiters.length > 0 || key !== this.drawnKey || this.model !== this.drawnModel || (this.model?.needsRedraw?.(width, height) ?? true));
    this.idle = draw && !redraw;
    if (redraw) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      if (this.transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(this.background[0], this.background[1], this.background[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.model?.draw(width, height);
      this.drawnKey = key;
      this.drawnModel = this.model;
    }
    if (redraw && this.screenshotWaiters.length) {
      const px = readbackRgba(gl, null, { source: "premultiplied", output: "straight" });
      const png = encodePngRgba8(px.width, px.height, px.data);
      for (const w of this.screenshotWaiters.splice(0)) w(png);
    }
    this.stats.record(interval, performance.now() - cpu0);
    for (const l of this.listeners) l({ dt, realDt, time: this.clock.time });
  }
  /** Stops the loop and removes the stage's listeners (the model is not disposed). */
  dispose() {
    this.stop();
    this.unbind();
    this.listeners.length = 0;
    this.beforeListeners.length = 0;
  }
};

// src/lib/texture-budget.ts
var MiB = 1024 * 1024;
var CONSTRAINED_TEXTURE_BUDGET = 256 * MiB;
var DEFAULT_TEXTURE_BUDGET = 1024 * MiB;
function currentDeviceInfo() {
  const nav = globalThis.navigator;
  if (!nav) return {};
  const info = {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    platform: nav.platform
  };
  if (typeof nav.userAgentData?.mobile === "boolean") info.mobile = nav.userAgentData.mobile;
  if (typeof nav.deviceMemory === "number") info.deviceMemory = nav.deviceMemory;
  return info;
}
function deviceProfile(info = currentDeviceInfo()) {
  const ua = info.userAgent ?? "";
  const ipad = /Macintosh|MacIntel/.test(ua + (info.platform ?? "")) && (info.maxTouchPoints ?? 0) > 1;
  const mobile = info.mobile === true || /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || ipad;
  const lowMemory = info.deviceMemory !== void 0 && info.deviceMemory <= 4;
  return {
    mobile,
    constrained: mobile || lowMemory,
    reason: mobile ? ipad ? "iPad" : /iPhone|iPod/.test(ua) ? "iPhone" : "mobile device" : lowMemory ? `${info.deviceMemory} GiB device memory` : "desktop"
  };
}
function resolveTextureBudget(setting, profile = deviceProfile()) {
  if (setting === "full") return { bytes: void 0, label: "full size" };
  if (setting === "auto") {
    const bytes = profile.constrained ? CONSTRAINED_TEXTURE_BUDGET : DEFAULT_TEXTURE_BUDGET;
    return { bytes, label: `${bytes / MiB} MiB (auto: ${profile.reason})` };
  }
  if (!(setting > 0)) throw new RangeError(`texture budget ${setting} MiB is not positive`);
  return { bytes: setting * MiB, label: `${setting} MiB` };
}
function defaultMaxPixelRatio(profile = deviceProfile()) {
  return profile.mobile ? 2 : Infinity;
}

// src/lib/view.ts
var MASK_SETTINGS = {
  atlas: "atlas",
  "atlas-fine": "atlas-fine",
  reference: "4096"
};
var MochiView = class {
  canvas;
  options;
  /** @internal */
  stage;
  /** @internal */
  speech = new SpeechPlayer();
  /** @internal */
  liveInputs = new LiveInputs(() => this.speech.context());
  events = new Emitter();
  current = null;
  loadToken = 0;
  waiters = [];
  unbindGestures;
  stopEnds = null;
  disposed = false;
  backgroundCss = "transparent";
  /** @internal */
  itemLayer;
  itemList = [];
  itemDrag = null;
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = { ...options };
    const profile = deviceProfile();
    this.stage = new Stage(canvas, {
      antialias: options.antialias ?? true,
      maxPixelRatio: options.maxPixelRatio ?? defaultMaxPixelRatio(profile),
      autoResize: options.autoResize ?? true
    });
    this.itemLayer = new ItemLayer(this.stage.gl);
    this.background = options.background ?? "transparent";
    const look = options.look ?? "follow";
    if (look !== "off" || options.zoom || options.pan) canvas.style.touchAction = "none";
    this.unbindGestures = bindGestures(
      canvas,
      {
        press: (x2, y, info) => this.press(x2, y, info),
        drag: (x2, y, dx, dy, mode) => {
          const live = this.current?.live;
          if (!live) return;
          if (mode === "look") live.lookAtPixel(x2, y, canvas.width, canvas.height);
          else if (mode === "pan") live.panBy(dx, dy, canvas.width, canvas.height);
          else if (mode === "item" && this.itemDrag) {
            const [ux, uy] = live.toModelStep(dx, dy, canvas.width, canvas.height);
            const p = this.itemDrag.entry.placement;
            p.x += ux;
            p.y += uy;
            this.itemLayer.touch();
          }
        },
        release: (mode) => {
          if (mode === "look") this.current?.live.releaseLook();
          if (mode === "item" && this.itemDrag) {
            if (this.itemDrag.repin) this.itemLayer.pin(this.itemDrag.entry);
            this.itemDrag = null;
          }
        },
        tap: (x2, y, info) => {
          if (info.button === 0) this.tap(x2, y);
        },
        ...options.zoom || options.pan ? { doubleTap: () => this.resetView() } : {},
        ...options.zoom ? {
          pinch: (f, cx, cy, dx, dy) => {
            const live = this.current?.live;
            if (!live) return;
            live.zoomAt(f, cx, cy, canvas.width, canvas.height);
            live.panBy(dx, dy, canvas.width, canvas.height);
          },
          wheel: (f, x2, y) => this.current?.live.zoomAt(f, x2, y, canvas.width, canvas.height)
        } : {},
        ...look === "follow" ? {
          hover: (x2, y) => this.current?.live.lookAtPixel(x2, y, canvas.width, canvas.height),
          leave: () => this.current?.live.releaseLook()
        } : {}
      },
      { wheel: options.zoom ?? false }
    );
    this.stage.onFrame(({ dt, time }) => this.afterFrame(dt, time));
    this.stage.onContextLost = () => this.events.emit("contextlost", {});
    this.stage.onContextRestored = () => void this.restoreGpu();
    if (options.autoStart ?? true) this.stage.start();
  }
  // ------------------------------------------------------------- events
  on(type, listener) {
    return this.events.on(type, listener);
  }
  once(type, listener) {
    return this.events.once(type, listener);
  }
  off(type, listener) {
    this.events.off(type, listener);
  }
  // ------------------------------------------------------------- models
  /** The model shown, or null. */
  get model() {
    return this.current;
  }
  /**
   * Loads a model and shows it in place of the current one, which is
   * disposed once the new one is ready. See {@link ModelInput} for inputs.
   */
  async load(input, options = {}) {
    if (this.disposed) throw new Error("the view is disposed");
    const token = ++this.loadToken;
    const opened = await openModelInput(input, options.settings, options.archive, options.files);
    const source = options.moc === void 0 ? opened.source : await sourceWithMoc(opened.source, opened.settingsPath, mocInputBytes(options.moc));
    const profile = deviceProfile();
    let loaded = null;
    const live = await loadLiveModel(this.stage.gl, source, opened.settingsPath, {
      textureBudget: resolveTextureBudget(this.options.textureBudget ?? "auto", profile).bytes,
      ...options.textures ? { textures: options.textures } : {},
      ...options.sounds ? { sounds: options.sounds } : {},
      ...profile.constrained ? { decodeWorkers: 1 } : {},
      masks: MASK_SETTINGS[this.options.masks ?? "atlas"],
      ...this.options.maskMeshes ? { maskMeshes: this.options.maskMeshes } : {},
      fit: this.options.fit ?? DEFAULT_FIT,
      memory: this.stage.memory,
      runtime: {
        ...this.runtimeOptions(),
        onSound: (path, bytes) => this.playMotionSound(bytes, path, options.sounds, () => loaded?.runtime.warnings)
      }
    });
    loaded = live;
    if (token !== this.loadToken || this.disposed) {
      live.dispose();
      throw new DOMException("the load was superseded by a later one", "AbortError");
    }
    live.update(0);
    const model = new MochiModel(this, live);
    const previous = this.current;
    if (options.keepView && previous) Object.assign(live.view, previous.live.view);
    this.current = model;
    this.attach(model);
    previous?.dispose();
    this.events.emit("load", { model });
    return model;
  }
  /** Removes and disposes the current model. */
  unload() {
    this.current?.dispose();
  }
  attach(model, keepPins = false) {
    this.stage.model = model.live;
    this.itemLayer.attach(model.live, { keepPins });
    model.live.onFrame = (r) => {
      for (const value of r.events) this.events.emit("motionevent", { model, value });
    };
    this.stopEnds?.();
    this.stopEnds = model.runtime.onMotionEnd(
      (end) => this.events.emit("motionend", { ...end, model })
    );
  }
  /** @internal */
  release(model) {
    if (this.current !== model) return;
    this.stopEnds?.();
    this.stopEnds = null;
    this.current = null;
    this.stage.model = null;
    this.itemLayer.attach(null);
    for (const w of this.waiters.splice(0)) w.resolve();
  }
  /** The options of the runtimes this view loads: the app's, and the physics hold. */
  runtimeOptions() {
    return {
      ...this.options.runtime,
      holdPhysicsInZeroSteps: this.options.holdPhysicsWhenPaused ?? true
    };
  }
  /** @internal */
  replaceRuntime(model, runtime) {
    if (this.current === model) this.itemLayer.keepPinsFor(runtime.model);
    const fresh = model.live.withRuntime(runtime);
    model.live = fresh;
    fresh.runtime.touch();
    fresh.update(0);
    if (this.current === model) this.attach(model, true);
  }
  /** @internal */
  waitUntil(done) {
    if (done()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ done, resolve }));
  }
  /**
   * Plays a motion's sound once decoded. Returns its clock for motion sync:
   * 0 while it decodes, then the playback position; null (count the frames)
   * when it cannot be played.
   */
  playMotionSound(bytes, path, sounds, warnings) {
    const skip = (reason2) => {
      const w = skippedSoundWarning(path, reason2);
      const list = warnings();
      if (list && !list.includes(w)) list.push(w);
    };
    const reason = skippedSoundReason(bytes, sounds);
    if (reason) {
      skip(reason);
      return () => null;
    }
    let playback = null;
    let failed = false;
    void (async () => {
      try {
        const p = await this.speech.prepare(bytes, { wavOnly: !sounds?.compressed });
        if (p.buffer) playback = this.speech.play(p.buffer);
        else {
          failed = true;
          skip("the browser could not decode it");
        }
      } catch (error) {
        failed = true;
        this.events.emit("error", { error });
      }
    })();
    return () => playback ? playback.position() : failed ? null : 0;
  }
  /** After a lost GPU context: textures and renderer again, same animation state. */
  async restoreGpu() {
    this.itemLayer.resetGpu();
    await this.restoreItems();
    const model = this.current;
    if (!model) return this.events.emit("contextrestored", {});
    try {
      const reload = (old2) => loadLiveModel(this.stage.gl, old2.runtime.source, old2.runtime.settingsPath, {
        reuse: old2.runtime,
        textureBudget: resolveTextureBudget(this.options.textureBudget ?? "auto", deviceProfile()).bytes,
        ...old2.textureLimits ? { textures: old2.textureLimits } : {},
        masks: old2.masks,
        ...this.options.maskMeshes ? { maskMeshes: this.options.maskMeshes } : {},
        fit: old2.fit,
        memory: this.stage.memory
      });
      let old = model.live;
      let fresh = await reload(old);
      while (model.live !== old && !model.disposed && this.current === model) {
        fresh.dispose();
        old = model.live;
        fresh = await reload(old);
      }
      Object.assign(fresh.view, old.view);
      old.dispose();
      if (model.disposed || this.current !== model) return fresh.dispose();
      model.live = fresh;
      fresh.runtime.touch();
      fresh.update(0);
      this.attach(model, true);
      this.events.emit("contextrestored", {});
    } catch (error) {
      this.events.emit("error", { error });
    }
  }
  // -------------------------------------------------------------- items
  /** The items over the main model, in drawing order within each side. */
  get items() {
    return this.itemList;
  }
  /**
   * Loads a further model as an item over the current model. It takes the
   * same inputs as {@link load}. The item animates
   * on its own; when its folder has a `.vtube.json` with `ItemSettings`, it
   * is also fed the main model's head angles. By default it is centered on
   * the main model's canvas, at the same pixel size, in front.
   */
  async addItem(input, options = {}) {
    if (this.disposed) throw new Error("the view is disposed");
    if (!this.current) throw new Error("load a model before adding items");
    if (options.id !== void 0 && this.itemList.some((i2) => i2.id === options.id))
      throw new Error(`the view already has an item with id "${options.id}"`);
    const opened = await openModelInput(input, options.settings, options.archive, options.files);
    const profile = deviceProfile();
    const live = await loadLiveModel(this.stage.gl, opened.source, opened.settingsPath, {
      textureBudget: resolveTextureBudget(this.options.textureBudget ?? "auto", profile).bytes,
      ...options.textures ? { textures: options.textures } : {},
      // Items play no motion sounds of their own; an app's onSound gets them.
      sounds: { ...options.sounds, played: this.options.runtime?.onSound !== void 0 },
      ...profile.constrained ? { decodeWorkers: 1 } : {},
      masks: MASK_SETTINGS[this.options.masks ?? "atlas"],
      ...this.options.maskMeshes ? { maskMeshes: this.options.maskMeshes } : {},
      memory: this.stage.memory,
      runtime: this.runtimeOptions()
    });
    if (this.disposed) {
      live.dispose();
      throw new DOMException("the view was disposed", "AbortError");
    }
    live.update(0);
    const settings = await readItemSettings(opened.source, opened.settingsPath);
    let id = options.id;
    if (id !== void 0 && this.itemList.some((i2) => i2.id === id)) {
      live.dispose();
      throw new Error(`the view already has an item with id "${id}"`);
    }
    if (id === void 0) {
      const used = new Set(this.itemList.map((i2) => i2.id));
      let n = 1;
      while (used.has(`${opened.settingsPath}#${n}`)) n++;
      id = `${opened.settingsPath}#${n}`;
    }
    const entry = this.itemLayer.add(live, settings, options.placement);
    const item = new MochiItem(this, entry, id);
    this.itemList.push(item);
    return item;
  }
  /** The item with this id, or null. */
  item(id) {
    return this.itemList.find((i2) => i2.id === id) ?? null;
  }
  /** @internal */
  raiseItem(item) {
    const i2 = this.itemList.indexOf(item);
    if (i2 < 0) return;
    this.itemList.splice(i2, 1);
    this.itemList.push(item);
    this.itemLayer.raise(item.entry);
  }
  /** @internal */
  releaseItem(item) {
    const i2 = this.itemList.indexOf(item);
    if (i2 < 0) return;
    this.itemList.splice(i2, 1);
    if (this.itemDrag?.entry === item.entry) this.itemDrag = null;
    this.itemLayer.remove(item.entry);
  }
  /** The item drawn topmost at a point given in page coordinates, or null. */
  itemAt(clientX, clientY) {
    const [px, py] = this.pixel(clientX, clientY);
    return this.itemAtPixel(px, py);
  }
  itemAtPixel(px, py) {
    const live = this.current?.live;
    if (!live) return null;
    const [x2, y] = live.toModel(px, py, this.canvas.width, this.canvas.height);
    const entry = this.itemLayer.itemAt(x2, y);
    return this.itemList.find((i2) => i2.entry === entry) ?? null;
  }
  /**
   * Where the items are, as Mochi2D's own layout file (JSON-serializable).
   * The entries come in drawing order, as {@link items} lists them.
   */
  exportItemLayout() {
    return {
      format: "mochi2d-item-layout/1",
      model: this.current?.name ?? null,
      items: this.itemList.map((item) => item.exportLayout())
    };
  }
  /**
   * Applies a saved layout to the loaded items: entries are matched to items
   * by id first, then the remaining ones by settings path, in order (layouts
   * saved before 0.4.0 have no ids). Returns how many items it placed. A pin
   * is restored when the main model has its drawable and triangle; the
   * rotation is taken relative to the main model's current pose. The
   * entries' order is the drawing order: the placed items are drawn in it,
   * above the items the layout does not place, which keep their order.
   */
  applyItemLayout(layout) {
    if (currentFormatName(layout?.format) !== "mochi2d-item-layout/1" || !Array.isArray(layout.items))
      throw new Error("not a mochi2d-item-layout/1 file");
    layout.items.forEach((saved, k) => {
      try {
        checkedPlacement(saved?.placement ?? {});
      } catch (error) {
        throw new TypeError(`item layout entry ${k}: ${error.message}`);
      }
    });
    const free = [...this.itemList];
    const take = (match) => {
      const i2 = free.findIndex(match);
      return i2 < 0 ? null : free.splice(i2, 1)[0];
    };
    const targets = layout.items.map(
      (saved) => typeof saved?.id === "string" ? take((item) => item.id === saved.id) : null
    );
    const order = [];
    layout.items.forEach((saved, k) => {
      const item = targets[k] ?? take((i2) => i2.name === saved?.name);
      if (!item) return;
      item.applyLayout(saved);
      order.push(item);
    });
    for (const item of order) this.raiseItem(item);
    return order.length;
  }
  /** After a lost GPU context: each item's textures and renderer again. */
  async restoreItems() {
    for (const item of this.itemList) {
      const old = item.entry.live;
      try {
        const fresh = await loadLiveModel(
          this.stage.gl,
          old.runtime.source,
          old.runtime.settingsPath,
          {
            reuse: old.runtime,
            textureBudget: resolveTextureBudget(
              this.options.textureBudget ?? "auto",
              deviceProfile()
            ).bytes,
            ...old.textureLimits ? { textures: old.textureLimits } : {},
            masks: old.masks,
            memory: this.stage.memory
          }
        );
        old.dispose();
        item.entry.live = fresh;
        fresh.runtime.touch();
        fresh.update(0);
      } catch (error) {
        this.events.emit("error", { error });
      }
    }
    this.itemLayer.touch();
  }
  // --------------------------------------------------------------- loop
  /** Starts the render loop (it starts by itself unless `autoStart` is false). */
  start() {
    this.stage.start();
  }
  /** Stops the render loop; the canvas keeps the last frame. */
  stop() {
    this.stage.stop();
  }
  get running() {
    return this.stage.isRunning;
  }
  /** Pauses animation (drawing continues, so the view can still move). */
  get paused() {
    return !this.stage.clock.playing;
  }
  set paused(on) {
    this.stage.clock.playing = !on;
  }
  /** Animation speed: model seconds per real second. Default 1. */
  get speed() {
    return this.stage.clock.speed;
  }
  set speed(v) {
    this.stage.clock.speed = v;
  }
  /** Model time in seconds. */
  get time() {
    return this.stage.clock.time;
  }
  /**
   * Advances the animation by `seconds` and draws, for applications that run
   * their own loop (with `autoStart: false`). Zero just draws.
   *
   * With `draw: false` (or while {@link drawing} is off) it advances without
   * drawing: motions and their events, expressions, physics, live lip sync,
   * items and the parameter values all move on, and `"frame"` events fire,
   * but the canvas keeps its last picture. {@link draw} shows the state
   * later, the same picture as drawing every frame would have shown.
   */
  advance(seconds, options = {}) {
    const playing = this.stage.clock.playing;
    this.stage.clock.playing = true;
    const max2 = this.stage.clock.maxRealStep;
    this.stage.clock.maxRealStep = Math.max(max2, seconds);
    this.stage.tick(seconds, options.draw ?? this.stage.drawing);
    this.stage.clock.maxRealStep = max2;
    this.stage.clock.playing = playing;
  }
  /**
   * Whether frames draw; default true. While false, the render loop and
   * {@link advance} keep the model moving without drawing (a window nobody
   * sees: a hidden or minimized one); {@link draw} and `screenshot()` still
   * draw.
   */
  get drawing() {
    return this.stage.drawing;
  }
  set drawing(on) {
    this.stage.drawing = on;
  }
  /** Draws the current state now, without advancing (also while {@link drawing} is off). */
  draw() {
    this.stage.draw();
  }
  /** Sizes the drawing buffer to the canvas's current CSS size now. */
  resize() {
    this.stage.resize();
  }
  afterFrame(dt, time) {
    if (this.waiters.length) {
      const still = [];
      for (const w of this.waiters) w.done() ? w.resolve() : still.push(w);
      this.waiters = still;
    }
    this.events.emit("frame", { dt, time });
  }
  // ------------------------------------------------------------- display
  /** A CSS color, or "transparent". */
  get background() {
    return this.backgroundCss;
  }
  set background(css) {
    this.backgroundCss = css;
    const rgb = parseCssColor(css);
    this.stage.transparent = rgb === null;
    if (rgb) this.stage.background = rgb;
  }
  /**
   * The view relative to the fitted view (see {@link ViewTransform}): zoom,
   * the model point at the canvas center, rotation, and the CSS pixels per
   * model unit on screen.
   */
  get viewTransform() {
    const live = this.current?.live;
    const v = live?.view ?? { zoom: 1, dx: 0, dy: 0, rotation: 0 };
    const k = live ? live.framing(this.canvas.width, this.canvas.height).k : 0;
    const css = this.canvas.getBoundingClientRect().width;
    const scale2 = this.canvas.width > 0 && css > 0 ? css / this.canvas.width : 1;
    return { zoom: v.zoom, x: v.dx, y: v.dy, rotation: v.rotation, pixelsPerUnit: k * scale2 };
  }
  /**
   * Changes the view; fields left out keep their value. `zoom` scales the
   * fitted view, `x` and `y` are the model point shown at the canvas center
   * (model units, offset from the center of the model's canvas rectangle,
   * x right and y up in the model's own directions), and `rotation` turns
   * the picture counterclockwise about the canvas center, in degrees. See
   * {@link ViewTransform}.
   */
  setView(view) {
    const live = this.current?.live;
    if (!live) return;
    if (view.zoom !== void 0) live.view.zoom = view.zoom;
    if (view.x !== void 0) live.view.dx = view.x;
    if (view.y !== void 0) live.view.dy = view.y;
    if (view.rotation !== void 0) live.setRotation(view.rotation);
  }
  /**
   * Moves the model on screen by (dx, dy) CSS pixels, x right and y down
   * (screen directions, whatever the rotation), as a drag does.
   */
  panBy(dx, dy) {
    const live = this.current?.live;
    if (!live) return;
    const r = this.canvas.getBoundingClientRect();
    const sx = r.width > 0 ? this.canvas.width / r.width : 1;
    const sy = r.height > 0 ? this.canvas.height / r.height : 1;
    live.panBy(dx * sx, dy * sy, this.canvas.width, this.canvas.height);
  }
  /** Back to the fitted view: zoom 1, centered, not rotated. */
  resetView() {
    this.current?.live.resetView();
  }
  /** Page coordinates → drawing-buffer pixels. */
  pixel(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return [
      (clientX - r.left) * this.canvas.width / Math.max(1, r.width),
      (clientY - r.top) * this.canvas.height / Math.max(1, r.height)
    ];
  }
  /** Page coordinates → model units (y up), or null without a model. */
  toModel(clientX, clientY) {
    const live = this.current?.live;
    if (!live) return null;
    const [px, py] = this.pixel(clientX, clientY);
    const [x2, y] = live.toModel(px, py, this.canvas.width, this.canvas.height);
    return { x: x2, y };
  }
  /**
   * Model units (y up) → page coordinates (the viewport coordinates of
   * `clientX` and `clientY`), or null without a model: the inverse of
   * {@link toModel} under the current view, for placing page elements over
   * the model.
   */
  toPage(x2, y) {
    const live = this.current?.live;
    if (!live) return null;
    const { width, height } = this.canvas;
    if (!(width > 0 && height > 0)) return null;
    const [px, py] = live.toImage(x2, y, width, height);
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + px * Math.max(1, r.width) / width,
      y: r.top + py * Math.max(1, r.height) / height
    };
  }
  /** Makes the model look at a point given in page coordinates. */
  lookAt(clientX, clientY) {
    const live = this.current?.live;
    if (!live) return;
    const [px, py] = this.pixel(clientX, clientY);
    live.lookAtPixel(px, py, this.canvas.width, this.canvas.height);
  }
  /** What lies under a point given in page coordinates. */
  hitTest(clientX, clientY) {
    const live = this.current?.live;
    if (!live) return null;
    const [px, py] = this.pixel(clientX, clientY);
    return this.hitAtPixel(live, px, py);
  }
  hitAtPixel(live, px, py) {
    const { width, height } = this.canvas;
    const [x2, y] = live.toModel(px, py, width, height);
    const r = this.canvas.getBoundingClientRect();
    return {
      areas: live.runtime.hitAreasAt(x2, y),
      drawable: live.runtime.drawableAt(x2, y),
      x: x2,
      y,
      clientX: r.left + px * r.width / Math.max(1, width),
      clientY: r.top + py * r.height / Math.max(1, height)
    };
  }
  press(x2, y, info) {
    const live = this.current?.live;
    if (!live) return "none";
    if (this.options.dragItems && info.button === 0 && !info.shift) {
      const item = this.itemAtPixel(x2, y);
      if (item) {
        const repin = item.pin !== null;
        item.unpin();
        this.itemDrag = { entry: item.entry, repin };
        return "item";
      }
    }
    const look = this.options.look ?? "follow";
    const pan = this.options.pan ?? false;
    if (pan && (info.button !== 0 || info.shift)) return "pan";
    if (look !== "off" && info.button === 0) {
      live.lookAtPixel(x2, y, this.canvas.width, this.canvas.height);
      return "look";
    }
    return pan ? "pan" : "none";
  }
  tap(px, py) {
    const model = this.current;
    if (!model) return;
    const e = { model, ...this.hitAtPixel(model.live, px, py) };
    this.events.emit("tap", e);
    if (e.areas.length) this.events.emit("hit", e);
  }
  /** A PNG image of the next frame (straight alpha). */
  async screenshot() {
    const png = await this.stage.screenshot();
    return new Blob([png], { type: "image/png" });
  }
  /**
   * Records `seconds` (up to 60) of the microphone, or of `options.stream`,
   * mixed to mono: a clip for voice calibration (`VoiceCalibration.add`).
   * Call it from a click or tap handler. Resolves when the clip is complete;
   * time spent waiting for the audio to start does not count. As for live
   * motion sync, `voiceProcessing` defaults to false. The clip is only
   * handed back: it is never stored or sent anywhere.
   */
  recordAudio(seconds, options = {}) {
    return this.liveInputs.record(seconds, options);
  }
  /** Stops the loop, disposes the model and frees the GPU context's resources. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loadToken++;
    this.current?.dispose();
    for (const item of [...this.itemList]) item.dispose();
    this.itemLayer.dispose();
    this.unbindGestures();
    this.stage.dispose();
    this.liveInputs.dispose();
    this.speech.dispose();
    this.events.clear();
  }
};
function parseCssColor(css) {
  const c = css.trim().toLowerCase();
  if (c === "" || c === "transparent" || c === "none") return null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((x2) => x2 + x2).join("") : m[1];
    const n = parseInt(h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  m = /^rgba?\(([^)]*)\)$/.exec(c);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((v) => Number.isFinite(v))) {
      if (parts.length >= 4 && parts[3] === 0) return null;
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
    }
  }
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      const sentinel = "#010203";
      ctx.fillStyle = sentinel;
      ctx.fillStyle = c;
      const v = ctx.fillStyle;
      if (typeof v === "string" && v !== sentinel && v !== c) return parseCssColor(v);
    }
  }
  return null;
}

// src/lib/version.ts
var MOCHI2D_VERSION = true ? "0.24.1" : "dev";
export {
  ArchiveLimitError,
  BrowserFileSource,
  CONSTRAINED_TEXTURE_BUDGET,
  DEFAULT_ARCHIVE_LIMITS,
  DEFAULT_FILE_LIMITS,
  DEFAULT_TEXTURE_BUDGET,
  DEFAULT_TEXTURE_LIMITS,
  FileLimitError,
  FileNotFoundError,
  GestureTracker,
  HttpFileSource,
  LIVE_LIP_SYNC_DEFAULTS,
  LIVE_LIP_SYNC_NEUTRAL,
  LiveAudioError,
  LiveLipSync,
  LiveLipSyncControl,
  LiveMotionSyncControl,
  MOCHI2D_VERSION,
  MOTION_SYNC_ELEMENTS,
  MemoryFileSource,
  MocFormatError,
  MocWriteError,
  MochiItem,
  MochiModel,
  MochiView,
  ModelRuntime,
  MotionSyncAudioError,
  PATCHABLE_FIELDS,
  TextureFormatError,
  TextureLimitError,
  UnsupportedArchiveError,
  VoiceCalibration,
  WRITABLE_VERSIONS,
  ZipFileSource,
  ZipFormatError,
  archiveKind,
  bindGestures,
  dbfsToAmplitude,
  decodeMotionSyncWav,
  deviceProfile,
  liveAudioProblem,
  mocModelFromData,
  neutralVoiceProfile,
  openModelInput,
  parseCssColor,
  parseMotionSync,
  parsePhysics,
  readMoc,
  readTextureHeader,
  resolveTextureBudget,
  soundFormat,
  sourceFromDataTransfer,
  sourceFromFileList,
  sourceFromZip,
  voiceProfileFromJson,
  writeMoc,
  writeMotionSync,
  writePhysics
};
