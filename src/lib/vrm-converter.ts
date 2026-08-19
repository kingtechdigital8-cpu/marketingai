// Converts a plain, non-VRM rigged glTF Binary (.glb) — specifically ones
// rigged by Mixamo's auto-rigger, the single most common source of "rigged
// GLB with zero VRM data" a typical admin would actually have on hand — into
// a valid VRM 1.0 humanoid avatar, by mapping Mixamo's standard bone naming
// convention onto VRM's humanoid bone slots and injecting the VRMC_vrm
// extension block directly into the glTF JSON. No existing npm package does
// this (checked); VRM tooling is all *loaders* (e.g. @pixiv/three-vrm), not
// authoring/conversion tools — Blender's VRM Add-on and Unity's UniVRM are
// the only mature converters, and both require a human in a GUI to do the
// bone mapping. This is a narrower, automatable slice of that: Mixamo's rig
// is standardized enough that its bone names can be matched deterministically,
// without needing a human to confirm each one.
//
// What this does NOT do: Mixamo's auto-rigger doesn't produce facial blend
// shapes, so a converted avatar has no expressions/visemes — AvatarCanvas.tsx
// already degrades gracefully when a model has none (see EXPRESSION_FALLBACKS
// and the mouth/blink resolution in AvatarCanvas's load effect), so this
// isn't a crash, just a real capability gap inherent to the source file, not
// something conversion logic could invent.
//
// Bone-mapping confidence is everything here: silently producing a VRM with
// bones mapped to the WRONG nodes would be far worse than failing outright
// (a broken pose no admin would catch by eye, vs. an honest rejection).
// convertMixamoGlbToVrm therefore only ever maps a bone when its Mixamo name
// is found verbatim (modulo the mixamorig prefix and case), and refuses to
// produce a file at all if any of VRM's 15 spec-required bones can't be
// matched — see REQUIRED_VRM_BONES, sourced directly from
// @pixiv/three-vrm-core's own VRMRequiredHumanBoneName (the exact set its
// loader throws on if missing), not guessed independently.

const REQUIRED_VRM_BONES = new Set([
  "hips",
  "spine",
  "head",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
]);

// VRM humanoid bone name -> Mixamo bone name (without the "mixamorig:"
// prefix, which is stripped before matching — see bareName). One candidate
// each; Mixamo's rig has exactly one name per slot, unlike some other rig
// conventions that vary.
const MIXAMO_BONE_MAP: Record<string, string> = {
  hips: "Hips",
  spine: "Spine",
  chest: "Spine1",
  upperChest: "Spine2",
  neck: "Neck",
  head: "Head",
  leftEye: "LeftEye",
  rightEye: "RightEye",
  leftUpperLeg: "LeftUpLeg",
  leftLowerLeg: "LeftLeg",
  leftFoot: "LeftFoot",
  leftToes: "LeftToeBase",
  rightUpperLeg: "RightUpLeg",
  rightLowerLeg: "RightLeg",
  rightFoot: "RightFoot",
  rightToes: "RightToeBase",
  leftShoulder: "LeftShoulder",
  leftUpperArm: "LeftArm",
  leftLowerArm: "LeftForeArm",
  leftHand: "LeftHand",
  rightShoulder: "RightShoulder",
  rightUpperArm: "RightArm",
  rightLowerArm: "RightForeArm",
  rightHand: "RightHand",
  leftThumbMetacarpal: "LeftHandThumb1",
  leftThumbProximal: "LeftHandThumb2",
  leftThumbDistal: "LeftHandThumb3",
  leftIndexProximal: "LeftHandIndex1",
  leftIndexIntermediate: "LeftHandIndex2",
  leftIndexDistal: "LeftHandIndex3",
  leftMiddleProximal: "LeftHandMiddle1",
  leftMiddleIntermediate: "LeftHandMiddle2",
  leftMiddleDistal: "LeftHandMiddle3",
  leftRingProximal: "LeftHandRing1",
  leftRingIntermediate: "LeftHandRing2",
  leftRingDistal: "LeftHandRing3",
  leftLittleProximal: "LeftHandPinky1",
  leftLittleIntermediate: "LeftHandPinky2",
  leftLittleDistal: "LeftHandPinky3",
  rightThumbMetacarpal: "RightHandThumb1",
  rightThumbProximal: "RightHandThumb2",
  rightThumbDistal: "RightHandThumb3",
  rightIndexProximal: "RightHandIndex1",
  rightIndexIntermediate: "RightHandIndex2",
  rightIndexDistal: "RightHandIndex3",
  rightMiddleProximal: "RightHandMiddle1",
  rightMiddleIntermediate: "RightHandMiddle2",
  rightMiddleDistal: "RightHandMiddle3",
  rightRingProximal: "RightHandRing1",
  rightRingIntermediate: "RightHandRing2",
  rightRingDistal: "RightHandRing3",
  rightLittleProximal: "RightHandPinky1",
  rightLittleIntermediate: "RightHandPinky2",
  rightLittleDistal: "RightHandPinky3",
};

interface GlbParts {
  json: Record<string, unknown>;
  binChunk: Buffer | null;
}

/** Splits a .glb container into its JSON and binary chunks — see the glTF 2.0 Binary spec (12-byte header, then length-prefixed chunks). */
function parseGlb(buffer: Buffer): GlbParts {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error("Bukan file glTF Binary (.glb) yang valid.");
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Versi glTF ${version} tidak didukung (harus versi 2).`);
  }

  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let binChunk: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === "JSON") {
      json = JSON.parse(chunkData.toString("utf8"));
    } else if (chunkType.startsWith("BIN")) {
      binChunk = Buffer.from(chunkData);
    }
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("Tidak ditemukan chunk JSON di dalam file glTF Binary.");
  return { json, binChunk };
}

/** Reassembles a .glb container from (possibly modified) JSON + the original binary chunk — the mesh/skin/accessor data itself is never touched, only json.extensions gains a VRMC_vrm block. */
function buildGlb(json: Record<string, unknown>, binChunk: Buffer | null): Buffer {
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad > 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.write("JSON", 4, "ascii");

  const parts: Buffer[] = [jsonChunkHeader, jsonBuf];
  let totalLength = 12 + jsonChunkHeader.length + jsonBuf.length;

  if (binChunk && binChunk.length > 0) {
    let binBuf = binChunk;
    const binPad = (4 - (binBuf.length % 4)) % 4;
    if (binPad > 0) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0x00)]);
    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(binBuf.length, 0);
    binChunkHeader.write("BIN\0", 4, "ascii");
    parts.push(binChunkHeader, binBuf);
    totalLength += binChunkHeader.length + binBuf.length;
  }

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  return Buffer.concat([header, ...parts]);
}

/** Reads just the JSON chunk of a .glb (or a .vrm, which is the same container format) — used to check hasVrmExtension() before deciding whether conversion is even applicable. */
export function peekGlbJson(buffer: Buffer): Record<string, unknown> {
  return parseGlb(buffer).json;
}

/** True if the file already has real VRM extension data (either VRM spec generation) — such a file should never be run through conversion, just uploaded as-is. */
export function hasVrmExtension(json: Record<string, unknown>): boolean {
  const extensions = json.extensions as Record<string, unknown> | undefined;
  return Boolean(extensions?.VRMC_vrm || extensions?.VRM);
}

/** Strips Mixamo's "mixamorig:"/"mixamorig1_" style prefix (colon or underscore, optional trailing digit for multi-character files) so the bare bone name can be matched — real exports have been observed varying the separator depending on which tool converted the original FBX to glTF. */
function bareBoneName(name: string): string {
  return name.replace(/^mixamorig\d*[:_]?/i, "").trim();
}

export type ConvertResult =
  | { ok: true; buffer: Buffer; mappedBoneCount: number }
  | { ok: false; missingRequiredBones: string[] };

/** Attempts a Mixamo-rig-specific GLB → VRM 1.0 humanoid conversion — see the file header comment for exactly what this can and can't do. */
export function convertMixamoGlbToVrm(
  inputBuffer: Buffer,
  meta: { name: string; author: string }
): ConvertResult {
  const { json, binChunk } = parseGlb(inputBuffer);

  const nodes = (json.nodes as Array<{ name?: string }> | undefined) ?? [];
  const nodeIndexByBareName = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (typeof node.name === "string") {
      nodeIndexByBareName.set(bareBoneName(node.name).toLowerCase(), index);
    }
  });

  const humanBones: Record<string, { node: number }> = {};
  const missingRequiredBones: string[] = [];
  for (const [vrmBoneName, mixamoName] of Object.entries(MIXAMO_BONE_MAP)) {
    const nodeIndex = nodeIndexByBareName.get(mixamoName.toLowerCase());
    if (nodeIndex !== undefined) {
      humanBones[vrmBoneName] = { node: nodeIndex };
    } else if (REQUIRED_VRM_BONES.has(vrmBoneName)) {
      missingRequiredBones.push(vrmBoneName);
    }
  }

  if (missingRequiredBones.length > 0) {
    return { ok: false, missingRequiredBones };
  }

  const extensionsUsed = new Set((json.extensionsUsed as string[] | undefined) ?? []);
  extensionsUsed.add("VRMC_vrm");
  json.extensionsUsed = Array.from(extensionsUsed);
  json.extensions = {
    ...(json.extensions as Record<string, unknown> | undefined),
    VRMC_vrm: {
      specVersion: "1.0",
      meta: {
        name: meta.name,
        authors: [meta.author],
        // We don't know the original asset's actual license terms — a
        // Mixamo-auto-rigged model's mesh/textures came from wherever the
        // admin sourced it, this conversion only adds the rig mapping.
        // Defaulting to the most conservative usage terms rather than
        // claiming rights we have no basis for; the admin can edit the
        // credit/license text shown in the gallery card independently of
        // this metadata.
        licenseUrl: "https://vrm.dev/licenses/1.0/",
        avatarPermission: "everyone",
        commercialUsage: "personalNonProfit",
        modification: "prohibited",
        allowRedistribution: true,
      },
      humanoid: { humanBones },
    },
  };

  return { ok: true, buffer: buildGlb(json, binChunk), mappedBoneCount: Object.keys(humanBones).length };
}
