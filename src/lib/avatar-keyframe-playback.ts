import { Quaternion, Euler } from "three";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { FingerPose, FingerBoneSuffix } from "@/lib/avatar-gesture-engine";

// Shared by the VRM Animation Studio (page-level playback, driving the
// public AvatarCanvasHandle imperative API for live scrubbing/editing) and
// AvatarCanvas.tsx's own runtime playCustomAnimation (Phase J — driven by
// its internal useFrame loop, writing straight into its override refs for
// efficiency). Keeping the actual interpolation math in exactly one place
// means a saved animation looks IDENTICAL whether it's being previewed in
// the studio or played back live — the one thing that differs between the
// two contexts is the `KeyframePoseApplier` each one passes in.
//
// Imports `Quaternion`/`Euler` from three (not the full renderer/loaders —
// just three's small, tree-shakeable core math classes) for bone rotation
// interpolation — see lerpBoneRotation's own comment for why independent
// per-axis Euler lerp isn't good enough here. This does mean the VRM
// Animation Studio page, which imports this file statically, now pulls in
// three's math module as part of its initial bundle (previously avoided —
// see that page's own comment on why AvatarCanvas itself is dynamically
// imported instead) — a deliberate, small trade-off for correct rotation
// interpolation, not an oversight.

export type InterpolationType = "linear" | "easeIn" | "easeOut" | "easeInOut" | "smooth";

// A keyframe's pose only records bones/fingers/face that were DELIBERATELY
// posed at capture time, never a snapshot of every bone's live value — an
// untouched bone/joint stays under idle's control during playback exactly
// like it does during manual editing, rather than freezing whatever idle's
// breathing happened to be doing at capture time.
export interface KeyframePose {
  bones: Partial<Record<VRMHumanBoneName, { x: number; y: number; z: number }>>;
  leftFingers: FingerPose | null;
  rightFingers: FingerPose | null;
  /**
   * Every posed VRM expression/blend-shape name (model-specific — could be
   * a standard preset like "happy", or a model's own custom "browAngry"/
   * "eyeSquint"/etc.) mapped to its weight (0-1), all independently
   * controllable and simultaneously active — eyebrows, blink, mouth shape,
   * and an emotion preset can all be posed at once in the same keyframe.
   * Replaces the older single `{preset, weight}` shape (only one expression
   * at a time) — see normalizeFacePose() at the Studio page for how an
   * old-format saved animation is upgraded transparently on load. `null`/
   * `{}` means nothing was deliberately posed, same "untouched stays under
   * idle/AI-emotion control" convention as bones/fingers above.
   */
  face: Record<string, number> | null;
}

export interface Keyframe {
  id: string;
  time: number;
  interpolation: InterpolationType;
  pose: KeyframePose;
}

// Default EaseInOut per spec. easeInOut/smooth intentionally differ (cubic
// vs. smoothstep) rather than aliasing one to the other — five genuinely
// distinct curves, matching the 5 named options the spec asks for.
export const EASING: Record<InterpolationType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  smooth: (t) => t * t * (3 - 2 * t),
};

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Upgrades a keyframe's face pose from the older single `{preset, weight}`
 * shape (any AvatarAnimation saved before the multi-blend-shape Face panel
 * existed — confirmed for real: "Wave"/"Sad"/"Angry Hands On Hips" in the
 * live database) into the current `Record<string, number>` map — the
 * preset name IS a valid expression name either way, so this is lossless.
 * Applied defensively right here, not just at the VRM Animation Studio
 * page's own load-time pass, because the live TikTok runtime reads saved
 * keyframe JSON straight from the database with NO Studio-side
 * normalization in between (AvatarOverlayPlayer -> playCustomAnimation ->
 * applyKeyframePoseAtTime, this file's own functions, called directly) —
 * without this, an old-format `{preset, weight}` object's OWN KEYS
 * ("preset"/"weight") get misread as if they were blend-shape names
 * themselves, so nothing meaningful ever gets applied and the animation's
 * baked-in expression silently stops showing on the live overlay. The
 * TypeScript type here says `Record<string, number> | null` already, but
 * that's only a compile-time promise — data loaded from the database's Json
 * column was never runtime-validated against it, and old rows predate the
 * shape entirely.
 */
function normalizeFacePose(face: KeyframePose["face"]): Record<string, number> | null {
  if (!face) return null;
  if ("preset" in face && "weight" in face) {
    const legacy = face as unknown as { preset: unknown; weight: unknown };
    return typeof legacy.preset === "string" && typeof legacy.weight === "number" ? { [legacy.preset]: legacy.weight } : null;
  }
  return face;
}

// Module-level scratch objects, reused across every call rather than
// allocated per-frame — safe here (unlike inside a React component) since
// this is plain utility code with no render-purity constraints. THREE
// separate instances specifically to avoid the exact self-referencing-
// slerp bug this project has already hit twice elsewhere (e.g.
// avatar-animation-controller.ts's own documented fix): `.slerp()` mutates
// its receiver, so the receiver must never be the SAME object as either
// input.
const scratchQuatA = new Quaternion();
const scratchQuatB = new Quaternion();
const scratchQuatResult = new Quaternion();
const scratchEuler = new Euler();

/**
 * Slerps a bone's rotation between two Euler poses, rather than lerping
 * x/y/z independently. A joint that's mostly rotating around ONE dominant
 * axis (a typical elbow hinge) looks identical either way — with only one
 * axis actually changing, per-axis lerp and slerp agree. But a manually-
 * posed head/chest/torso keyframe is usually a COMPOUND rotation (nod +
 * turn + tilt all at once between two keyframes), and independent per-axis
 * Euler lerp does NOT trace a smooth, constant-velocity rotational path for
 * that — THREE.Euler's XYZ composition order means the intermediate values
 * don't correspond to a natural straight-line rotation between the two
 * endpoints, which reads as visibly uneven/"patah-patah" motion exactly in
 * proportion to how many axes are changing at once. Quaternion slerp is the
 * standard fix: constant angular velocity, shortest rotational path,
 * regardless of how many axes are involved.
 */
function lerpBoneRotation(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, t: number) {
  scratchEuler.set(a.x, a.y, a.z, "XYZ");
  scratchQuatA.setFromEuler(scratchEuler);
  scratchEuler.set(b.x, b.y, b.z, "XYZ");
  scratchQuatB.setFromEuler(scratchEuler);
  scratchQuatResult.copy(scratchQuatA).slerp(scratchQuatB, t);
  scratchEuler.setFromQuaternion(scratchQuatResult, "XYZ");
  return { x: scratchEuler.x, y: scratchEuler.y, z: scratchEuler.z };
}

// The minimal write surface an interpolated pose needs — deliberately a
// STRUCTURAL subset of AvatarCanvasHandle (not an explicit implements
// relationship), so `avatarRef.current` can be passed directly as an
// applier from the studio page with no adapter object, while
// AvatarCanvas.tsx's own runtime playback constructs a small local object
// that writes straight into its override refs instead of round-tripping
// through its own public handle.
export interface KeyframePoseApplier {
  /**
   * Called once at the START of every applyInterpolatedKeyframePose, before
   * any setBoneOverride calls for the CURRENT segment — bones are the one
   * pose category with no per-call "whole state" replacement (unlike
   * fingers' clearFingerPose(side) and setFaceOverrides' null-means-empty
   * map): setBoneOverride only ever ADDS/updates a bone, nothing ever
   * removes one specifically. Without this reset, a bone posed in an
   * EARLIER segment (e.g. keyframe 2→3) but absent from a LATER one (e.g.
   * keyframe 4→5, because that particular bone was never touched again)
   * stayed stuck at whatever the earlier segment last set — visibly
   * "bleeding" that pose into every later keyframe's preview/playback even
   * though the later keyframes' own stored data never mentioned it.
   * Confirmed as a real, reported bug specifically surfacing on head/eye
   * rotation once eyes became a posable bone (new keyframes touch them,
   * older ones in the same clip never did).
   */
  clearAllBoneOverrides: () => void;
  setBoneOverride: (bone: VRMHumanBoneName, x: number, y: number, z: number) => void;
  setFingerPose: (side: "left" | "right", pose: FingerPose) => void;
  clearFingerPose: (side: "left" | "right") => void;
  /**
   * Replaces the WHOLE current facial-expression override in one call
   * (never incremental per-name) — `null` means no override active at all
   * (falls back to the live TikTok runtime's AI-emotion system). A name
   * omitted from a non-null map is driven to 0, exactly like an omitted
   * bone/finger stays at 0 rather than holding a stale prior value — see
   * AvatarCanvas.tsx's own frame-loop comment for why "whole state every
   * call" is what avoids a blend shape getting stuck once nothing
   * mentions it anymore.
   */
  setFaceOverrides: (overrides: Record<string, number> | null) => void;
}

/**
 * Applies a blend between two keyframes' poses at fraction t (already
 * eased) — t=0 reproduces poseA exactly, t=1 reproduces poseB exactly, so
 * this doubles as the "hold at an edge keyframe" case too (call with
 * poseA===poseB, t=0). Bones/joints present in only one side hold that
 * side's value rather than interpolating toward/from an assumed 0, which
 * would read as an unintended snap back to straight/neutral.
 */
export function applyInterpolatedKeyframePose(applier: KeyframePoseApplier, poseA: KeyframePose, poseB: KeyframePose, t: number) {
  // See clearAllBoneOverrides' own doc comment — this segment's bone set is
  // about to be established fresh below, so any bone left over from a
  // DIFFERENT, earlier segment must not survive into this one.
  applier.clearAllBoneOverrides();
  const boneNames = new Set<VRMHumanBoneName>([...Object.keys(poseA.bones), ...Object.keys(poseB.bones)] as VRMHumanBoneName[]);
  boneNames.forEach((bone) => {
    const a = poseA.bones[bone];
    const b = poseB.bones[bone];
    if (a && b) {
      const { x, y, z } = lerpBoneRotation(a, b, t);
      applier.setBoneOverride(bone, x, y, z);
    } else if (b) applier.setBoneOverride(bone, b.x, b.y, b.z);
    else if (a) applier.setBoneOverride(bone, a.x, a.y, a.z);
  });

  (["left", "right"] as const).forEach((side) => {
    const a = side === "left" ? poseA.leftFingers : poseA.rightFingers;
    const b = side === "left" ? poseB.leftFingers : poseB.rightFingers;
    if (!a && !b) {
      applier.clearFingerPose(side);
      return;
    }
    // Deliberately still independent curl(Z)/spread(Y) lerp, not slerp —
    // unlike a body bone's x/y/z, curl and spread aren't THREE arbitrary
    // Euler axes of one compound rotation; they're two named, semantically
    // distinct amounts (how curled, how splayed) that this project's own
    // finger convention (avatar-gesture-engine.ts/AvatarCanvas.tsx) already
    // treats as independently-tunable — and at finger-joint rotation
    // magnitudes, the artifact lerpBoneRotation exists to fix is
    // negligible anyway.
    const joints = new Set<FingerBoneSuffix>([...(a ? Object.keys(a) : []), ...(b ? Object.keys(b) : [])] as FingerBoneSuffix[]);
    const merged: FingerPose = {};
    joints.forEach((joint) => {
      const av = a?.[joint];
      const bv = b?.[joint];
      const curl = av?.curl !== undefined && bv?.curl !== undefined ? lerp(av.curl, bv.curl, t) : (bv?.curl ?? av?.curl ?? 0);
      const spread = av?.spread !== undefined && bv?.spread !== undefined ? lerp(av.spread, bv.spread, t) : (bv?.spread ?? av?.spread ?? 0);
      merged[joint] = { curl, spread };
    });
    applier.setFingerPose(side, merged);
  });

  // Every blend-shape name posed on EITHER side gets its own independent
  // lerp (curl/spread-style plain lerp, not slerp — a blend shape weight is
  // a single scalar 0-1, not a rotation) — a name missing from one side
  // lerps toward/from 0 rather than snapping, so e.g. a blink that's only
  // posed at the destination keyframe eases in instead of popping.
  // normalizeFacePose first — see its own comment for why this can't be
  // skipped even though the type already says Record<string, number>.
  const faceA = normalizeFacePose(poseA.face);
  const faceB = normalizeFacePose(poseB.face);
  const faceNamesA = faceA ? Object.keys(faceA) : [];
  const faceNamesB = faceB ? Object.keys(faceB) : [];
  if (faceNamesA.length === 0 && faceNamesB.length === 0) {
    applier.setFaceOverrides(null);
  } else {
    const merged: Record<string, number> = {};
    new Set([...faceNamesA, ...faceNamesB]).forEach((name) => {
      const a = faceA?.[name] ?? 0;
      const b = faceB?.[name] ?? 0;
      merged[name] = lerp(a, b, t);
    });
    applier.setFaceOverrides(merged);
  }
}

/** Resolves time t against a (time-sorted) keyframe list and applies the resulting pose via applyInterpolatedKeyframePose — holds at the first/last keyframe's pose outside their time range. */
export function applyKeyframePoseAtTime(applier: KeyframePoseApplier, keyframes: Keyframe[], t: number) {
  if (keyframes.length === 0) return;
  if (t <= keyframes[0].time) {
    applyInterpolatedKeyframePose(applier, keyframes[0].pose, keyframes[0].pose, 0);
    return;
  }
  const lastKeyframe = keyframes[keyframes.length - 1];
  if (t >= lastKeyframe.time) {
    applyInterpolatedKeyframePose(applier, lastKeyframe.pose, lastKeyframe.pose, 0);
    return;
  }
  let kfA = keyframes[0];
  let kfB = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].time <= t && t <= keyframes[i + 1].time) {
      kfA = keyframes[i];
      kfB = keyframes[i + 1];
      break;
    }
  }
  const span = kfB.time - kfA.time;
  const rawFraction = span > 0 ? (t - kfA.time) / span : 1;
  // Which keyframe's interpolation curve governs the transition INTO it —
  // the destination keyframe's own setting, standard convention (matches
  // how the spec frames it: an interpolation choice belongs to the
  // keyframe being approached).
  const eased = EASING[kfB.interpolation](Math.min(1, Math.max(0, rawFraction)));
  applyInterpolatedKeyframePose(applier, kfA.pose, kfB.pose, eased);
}
