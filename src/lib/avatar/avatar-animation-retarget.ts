import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

// ============================================================================
// Mixamo FBX → VRM humanoid retargeting for full-body "interaction" clips
// (bow/clapping/excited/greeting/salute/victory/waving) — a generalized,
// full-skeleton version of the same proven algorithm already used for the
// idle system's lower-body-only retarget (see mixamo-vrm-retarget.ts, kept
// as-is/unused elsewhere). Confirmed empirically against this project's own
// Mixamo exports: bone names are "mixamorigHips" (no colon) — but the
// resolver below does NOT hardcode that single convention, per explicit
// instruction to handle "mixamorig:", "mixamorig_", bare "LeftArm", etc.
// ============================================================================

// Mixamo-style bone SUFFIX (the part after any prefix) → VRM humanoid bone
// name. Finger bones ARE included (audited: every gesture FBX in
// /public/animations genuinely has real finger keyframe data — up to
// 30 finger tracks per clip, confirmed by directly parsing each file) —
// previously excluded out of caution over a "jari ekstrem" (extreme/broken
// finger pose) failure mode, but that risk is now handled by
// clampFingerQuaternion below (a hard ceiling on how far any single finger
// joint can rotate from rest) rather than by discarding real animation data
// wholesale. The idle system's own finger curl still fully owns fingers
// whenever no gesture is playing/blending (see AvatarAnimationController's
// generic idle-capture-and-blend mechanism — unchanged, now just also
// applies to these bones).
const BONE_SUFFIX_TO_VRM: Record<string, VRMHumanBoneName> = {
  Hips: "hips",
  Spine: "spine",
  Spine1: "chest",
  Spine2: "upperChest",
  Neck: "neck",
  Head: "head",
  LeftShoulder: "leftShoulder",
  LeftArm: "leftUpperArm",
  LeftForeArm: "leftLowerArm",
  LeftHand: "leftHand",
  RightShoulder: "rightShoulder",
  RightArm: "rightUpperArm",
  RightForeArm: "rightLowerArm",
  RightHand: "rightHand",
  LeftUpLeg: "leftUpperLeg",
  LeftLeg: "leftLowerLeg",
  LeftFoot: "leftFoot",
  LeftToeBase: "leftToes",
  RightUpLeg: "rightUpperLeg",
  RightLeg: "rightLowerLeg",
  RightFoot: "rightFoot",
  RightToeBase: "rightToes",
  LeftHandThumb1: "leftThumbMetacarpal",
  LeftHandThumb2: "leftThumbProximal",
  LeftHandThumb3: "leftThumbDistal",
  LeftHandIndex1: "leftIndexProximal",
  LeftHandIndex2: "leftIndexIntermediate",
  LeftHandIndex3: "leftIndexDistal",
  LeftHandMiddle1: "leftMiddleProximal",
  LeftHandMiddle2: "leftMiddleIntermediate",
  LeftHandMiddle3: "leftMiddleDistal",
  LeftHandRing1: "leftRingProximal",
  LeftHandRing2: "leftRingIntermediate",
  LeftHandRing3: "leftRingDistal",
  LeftHandPinky1: "leftLittleProximal",
  LeftHandPinky2: "leftLittleIntermediate",
  LeftHandPinky3: "leftLittleDistal",
  RightHandThumb1: "rightThumbMetacarpal",
  RightHandThumb2: "rightThumbProximal",
  RightHandThumb3: "rightThumbDistal",
  RightHandIndex1: "rightIndexProximal",
  RightHandIndex2: "rightIndexIntermediate",
  RightHandIndex3: "rightIndexDistal",
  RightHandMiddle1: "rightMiddleProximal",
  RightHandMiddle2: "rightMiddleIntermediate",
  RightHandMiddle3: "rightMiddleDistal",
  RightHandRing1: "rightRingProximal",
  RightHandRing2: "rightRingIntermediate",
  RightHandRing3: "rightRingDistal",
  RightHandPinky1: "rightLittleProximal",
  RightHandPinky2: "rightLittleIntermediate",
  RightHandPinky3: "rightLittleDistal",
};

// Bone-name fragments identifying a finger joint — used to scope the safety
// clamp below to fingers only (arms/legs/spine are untouched, same as before).
const FINGER_NAME_PATTERN = /Thumb|Index|Middle|Ring|Little/;

// Hard ceiling on a finger joint's rotation relative to its VRM rest pose.
// Real natural finger flexion tops out well under this (measured directly
// against the actual FBX files used here: max ~71° on a sampled joint across
// all 7 clips) — this exists purely as a safety net against a retargeting
// edge case (e.g. an unusual keyframe/axis composition) producing a wild
// value, not as the primary shaping mechanism for how fingers move.
const MAX_FINGER_ROTATION = THREE.MathUtils.degToRad(100);

// Reused every call — avoids allocating a new Quaternion per keyframe per
// finger track (this runs inside a hot retargeting loop over every frame of
// every finger bone).
const _clampScratch = new THREE.Quaternion();

/** Scales a quaternion's rotation angle down to maxRadians if it exceeds it, preserving its axis. No-op if already within range. Mutates and returns `q`. */
function clampQuaternionAngle(q: THREE.Quaternion, maxRadians: number): THREE.Quaternion {
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(q.w), -1, 1));
  if (angle <= maxRadians || angle < 1e-6) return q;
  _clampScratch.set(0, 0, 0, 1); // identity — slerping from here toward q by (max/angle) yields the same axis at exactly maxRadians
  _clampScratch.slerp(q, maxRadians / angle);
  return q.copy(_clampScratch);
}

// Tried in order against each suffix — covers every Mixamo export convention
// this codebase has actually seen ("mixamorigHips", no colon) plus the
// documented variants explicitly called out to handle defensively.
const PREFIX_CANDIDATES = ["mixamorig", "mixamorig:", "mixamorig_", ""];

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * Builds a { actualBoneName -> VRMHumanBoneName } map by testing every
 * suffix/prefix combination against the SET of bone names actually present
 * in this specific loaded FBX asset, falling back to a case-insensitive
 * full-name match. Bones the resolver can't confidently match are simply
 * absent from the returned map — callers skip those tracks rather than guess.
 */
export function resolveMixamoBoneMap(asset: THREE.Object3D): Map<string, VRMHumanBoneName> {
  const actualNames = new Set<string>();
  asset.traverse((obj) => {
    if (obj instanceof THREE.Bone) actualNames.add(obj.name);
  });
  const lowerNameLookup = new Map<string, string>();
  actualNames.forEach((n) => lowerNameLookup.set(n.toLowerCase(), n));

  const resolved = new Map<string, VRMHumanBoneName>();
  (Object.keys(BONE_SUFFIX_TO_VRM) as (keyof typeof BONE_SUFFIX_TO_VRM)[]).forEach((suffix) => {
    const vrmBone = BONE_SUFFIX_TO_VRM[suffix];
    for (const prefix of PREFIX_CANDIDATES) {
      const candidate = `${prefix}${suffix}`;
      if (actualNames.has(candidate)) {
        resolved.set(candidate, vrmBone);
        return;
      }
    }
    // Bare-lowercase-first variant ("leftArm") — not covered by the prefix
    // loop above since that only pairs prefixes with the PascalCase suffix.
    const lowerBare = lowerFirst(suffix);
    if (actualNames.has(lowerBare)) {
      resolved.set(lowerBare, vrmBone);
      return;
    }
    // Last resort: case-insensitive match against every actual bone name,
    // trying each prefix candidate again case-insensitively.
    for (const prefix of PREFIX_CANDIDATES) {
      const match = lowerNameLookup.get(`${prefix}${suffix}`.toLowerCase());
      if (match) {
        resolved.set(match, vrmBone);
        return;
      }
    }
    // Not found under any convention — left unresolved. The caller skips
    // this bone's track entirely rather than crash or guess.
  });
  return resolved;
}

// A retargeted clip's hips translation is scaled to this VRM's own
// proportions (see hipsPositionScale below, same technique as the idle
// system), but even after scaling, a source animation with a large hip
// translation (a big lunge/step in the original mocap) could still move the
// avatar visibly away from its overlay position. Clamped to a small radius
// as a hard safety net — "jangan membuat avatar melayang atau berpindah jauh."
const MAX_HIPS_DISPLACEMENT = 0.12; // meters, relative to rest position

export interface RetargetResult {
  clip: THREE.AnimationClip;
  /** VRM bone NODE NAMES (not Mixamo names) the clip actually has tracks for — lets the controller know exactly which bones to cache/blend against idle, without re-deriving it from the clip every frame. */
  affectedBoneNames: string[];
  /** True if not every bone this clip's source data covers could be resolved on this VRM (e.g. no leftToes) — informational only, never fatal. */
  partial: boolean;
}

/**
 * Retargets every resolvable track in a Mixamo FBX asset's animation clip
 * onto the given VRM's normalized humanoid bone space. Missing bones are
 * skipped silently (never throws for a partial skeleton) — only throws if
 * the asset has no animation clip at all, or NOTHING could be resolved.
 */
export function retargetMixamoClip(asset: THREE.Object3D, animations: THREE.AnimationClip[], vrm: VRM): RetargetResult {
  const sourceClip = THREE.AnimationClip.findByName(animations, "mixamo.com") ?? animations[0];
  if (!sourceClip) throw new Error("File animasi tidak berisi clip animasi apa pun.");

  const boneMap = resolveMixamoBoneMap(asset);
  if (boneMap.size === 0) {
    throw new Error("Tidak ada bone yang cocok antara file animasi ini dan skeleton Mixamo yang dikenali.");
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const affectedBoneNames = new Set<string>();
  let resolvedTrackBones = 0;
  let totalTrackBones = 0;

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatBuffer = new THREE.Quaternion();

  const motionHips = asset.getObjectByName([...boneMap.keys()].find((k) => boneMap.get(k) === "hips") ?? "");
  const vrmHipsRestY = vrm.humanoid?.normalizedRestPose.hips?.position?.[1] ?? 1;
  const hipsPositionScale = motionHips && motionHips.position.y !== 0 ? vrmHipsRestY / motionHips.position.y : 1;
  const isLegacyVrm0 = vrm.meta?.metaVersion === "0";

  const trackBoneNames = new Set(sourceClip.tracks.map((t) => t.name.split(".")[0]));
  totalTrackBones = trackBoneNames.size;

  sourceClip.tracks.forEach((track) => {
    const [mixamoRigName, propertyName] = track.name.split(".");
    const vrmBoneName = boneMap.get(mixamoRigName);
    if (!vrmBoneName) return; // unresolvable on this VRM/skeleton — skip, don't fail the whole clip

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);
    if (!vrmNode || !mixamoRigNode || !mixamoRigNode.parent) return;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);
      const isFinger = FINGER_NAME_PATTERN.test(vrmBoneName);

      const values = track.values.slice();
      for (let i = 0; i < values.length; i += 4) {
        quatBuffer.fromArray(values, i);
        quatBuffer.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        // Safety net for fingers only (see MAX_FINGER_ROTATION's comment) —
        // every other bone here is unchanged from the original, already-
        // proven retargeting math.
        if (isFinger) clampQuaternionAngle(quatBuffer, MAX_FINGER_ROTATION);
        quatBuffer.toArray(values, i);
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNode.name}.${propertyName}`,
          Array.from(track.times),
          isLegacyVrm0 ? values.map((v, i) => (i % 2 === 0 ? -v : v)) : values
        )
      );
      affectedBoneNames.add(vrmNode.name);
      resolvedTrackBones++;
    } else if (track instanceof THREE.VectorKeyframeTrack && vrmBoneName === "hips") {
      // Position tracks only make sense for hips (root translation) — every
      // other bone's translation in a humanoid rig is a fixed skeletal
      // offset, not something a retargeted animation should touch (that's
      // literally what would break proportions between a slim/heavy VRM and
      // the source mocap actor). Clamped per MAX_HIPS_DISPLACEMENT.
      const restX = vrmNode.position.x;
      const restY = vrmNode.position.y;
      const restZ = vrmNode.position.z;
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        const rawX = (isLegacyVrm0 ? -track.values[i] : track.values[i]) * hipsPositionScale;
        const rawY = track.values[i + 1] * hipsPositionScale;
        const rawZ = (isLegacyVrm0 ? -track.values[i + 2] : track.values[i + 2]) * hipsPositionScale;
        values[i] = restX + THREE.MathUtils.clamp(rawX - restX, -MAX_HIPS_DISPLACEMENT, MAX_HIPS_DISPLACEMENT);
        values[i + 1] = restY + THREE.MathUtils.clamp(rawY - restY, -MAX_HIPS_DISPLACEMENT, MAX_HIPS_DISPLACEMENT);
        values[i + 2] = restZ + THREE.MathUtils.clamp(rawZ - restZ, -MAX_HIPS_DISPLACEMENT, MAX_HIPS_DISPLACEMENT);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${vrmNode.name}.${propertyName}`, Array.from(track.times), Array.from(values)));
      affectedBoneNames.add(vrmNode.name);
    }
  });

  if (tracks.length === 0) {
    throw new Error("Tidak ada track animasi yang berhasil di-retarget ke skeleton VRM ini.");
  }

  return {
    clip: new THREE.AnimationClip(sourceClip.name || "vrmClip", sourceClip.duration, tracks),
    affectedBoneNames: Array.from(affectedBoneNames),
    partial: resolvedTrackBones < totalTrackBones,
  };
}
