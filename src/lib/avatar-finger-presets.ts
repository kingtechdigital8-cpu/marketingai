import { FINGER_BONE_SUFFIXES, type FingerBoneSuffix, type FingerPose } from "@/lib/avatar-gesture-engine";

// Phase D (VRM Animation Studio) finger presets — a separate, purpose-built
// set of 8 named shapes for the admin-facing pose editor, NOT the same
// object identities as avatar-gesture-engine.ts's own internal RELAXED/
// CURLED_SOFT/OPEN_SPREAD/POINT_INDEX/THUMBS_UP_SHAPE/HEART_SHAPE (those stay
// private to that file, untouched, still driving the 20 live gestures
// exactly as before). This file only REUSES that file's already-established
// FingerPose type and curl(=rotation.z)/spread(=rotation.y) convention/units
// so a pose authored here reads identically once AvatarCanvas applies it —
// see AvatarBoneEditorApi.setFingerPose's own comment for how the override
// is applied (same armSignRef-calibrated sign the live runtime already uses).
export type FingerPresetName = "relaxed" | "open" | "closed" | "fist" | "point" | "thumbs_up" | "palm" | "pinch";

export const FINGER_PRESET_LABELS: Record<FingerPresetName, string> = {
  relaxed: "Relaxed",
  open: "Open",
  closed: "Closed",
  fist: "Fist",
  point: "Point",
  thumbs_up: "Thumbs Up",
  palm: "Palm",
  pinch: "Pinch",
};

// "relaxed" is intentionally NOT one of these — picking it means "clear the
// override and let the idle engine's own natural resting micro-curl show
// through" (see the studio page's togglePreset), not "force every joint to
// exactly 0." Forcing to exactly 0 is what "palm" is for (a deliberately
// flat, straight-fingered hand), which would otherwise look identical to
// "relaxed" if both were just `{}`.
export const FINGER_PRESETS: Record<Exclude<FingerPresetName, "relaxed">, FingerPose> = {
  open: {
    ThumbProximal: { curl: -0.05 },
    IndexProximal: { curl: 0.02, spread: 0.12 },
    MiddleProximal: { curl: 0.04, spread: 0.04 },
    RingProximal: { curl: 0.04, spread: -0.04 },
    LittleProximal: { curl: 0.06, spread: -0.12 },
  },
  closed: {
    ThumbProximal: { curl: 0.35 },
    ThumbDistal: { curl: 0.3 },
    IndexProximal: { curl: 0.75 },
    IndexIntermediate: { curl: 0.85 },
    IndexDistal: { curl: 0.6 },
    MiddleProximal: { curl: 0.8 },
    MiddleIntermediate: { curl: 0.9 },
    MiddleDistal: { curl: 0.65 },
    RingProximal: { curl: 0.8 },
    RingIntermediate: { curl: 0.9 },
    RingDistal: { curl: 0.65 },
    LittleProximal: { curl: 0.75 },
    LittleIntermediate: { curl: 0.85 },
    LittleDistal: { curl: 0.6 },
  },
  // A real clenched fist, harder than "closed" — thumb wraps across the
  // folded fingers rather than staying beside the hand.
  fist: {
    ThumbProximal: { curl: 0.6, spread: 0.08 },
    ThumbDistal: { curl: 0.55 },
    IndexProximal: { curl: 1.1 },
    IndexIntermediate: { curl: 1.25 },
    IndexDistal: { curl: 0.9 },
    MiddleProximal: { curl: 1.1 },
    MiddleIntermediate: { curl: 1.25 },
    MiddleDistal: { curl: 0.9 },
    RingProximal: { curl: 1.1 },
    RingIntermediate: { curl: 1.25 },
    RingDistal: { curl: 0.9 },
    LittleProximal: { curl: 1.05 },
    LittleIntermediate: { curl: 1.2 },
    LittleDistal: { curl: 0.85 },
  },
  point: {
    ThumbProximal: { curl: 0.5 },
    ThumbDistal: { curl: 0.4 },
    IndexProximal: { curl: -0.03 },
    IndexIntermediate: { curl: -0.02 },
    IndexDistal: { curl: 0 },
    MiddleProximal: { curl: 0.95 },
    MiddleIntermediate: { curl: 1.05 },
    MiddleDistal: { curl: 0.75 },
    RingProximal: { curl: 0.95 },
    RingIntermediate: { curl: 1.05 },
    RingDistal: { curl: 0.75 },
    LittleProximal: { curl: 0.9 },
    LittleIntermediate: { curl: 1.0 },
    LittleDistal: { curl: 0.7 },
  },
  thumbs_up: {
    ThumbProximal: { curl: -0.35 },
    ThumbDistal: { curl: -0.15 },
    IndexProximal: { curl: 0.95 },
    IndexIntermediate: { curl: 1.05 },
    IndexDistal: { curl: 0.75 },
    MiddleProximal: { curl: 0.95 },
    MiddleIntermediate: { curl: 1.05 },
    MiddleDistal: { curl: 0.75 },
    RingProximal: { curl: 0.9 },
    RingIntermediate: { curl: 1.0 },
    RingDistal: { curl: 0.7 },
    LittleProximal: { curl: 0.9 },
    LittleIntermediate: { curl: 1.0 },
    LittleDistal: { curl: 0.7 },
  },
  // Deliberately explicit zeros (not `{}`) on every joint — a flat, straight,
  // fingers-together hand, distinct from "relaxed" clearing the override
  // entirely and distinct from "open" spreading the fingers apart.
  palm: Object.fromEntries(FINGER_BONE_SUFFIXES.map((suffix) => [suffix, { curl: 0, spread: 0 }])) as FingerPose,
  pinch: {
    ThumbProximal: { curl: 0.45, spread: 0.1 },
    ThumbDistal: { curl: 0.5 },
    IndexProximal: { curl: 0.35 },
    IndexIntermediate: { curl: 0.55 },
    IndexDistal: { curl: 0.45 },
    MiddleProximal: { curl: 0.8 },
    MiddleIntermediate: { curl: 0.9 },
    MiddleDistal: { curl: 0.65 },
    RingProximal: { curl: 0.8 },
    RingIntermediate: { curl: 0.9 },
    RingDistal: { curl: 0.65 },
    LittleProximal: { curl: 0.75 },
    LittleIntermediate: { curl: 0.85 },
    LittleDistal: { curl: 0.6 },
  },
};

// One row per finger for the studio's per-joint slider UI — groups the 14
// flat FingerBoneSuffix joints back into their 5 anatomical fingers.
export const FINGER_JOINT_GROUPS: { label: string; joints: FingerBoneSuffix[] }[] = [
  { label: "Thumb", joints: ["ThumbProximal", "ThumbDistal"] },
  { label: "Index", joints: ["IndexProximal", "IndexIntermediate", "IndexDistal"] },
  { label: "Middle", joints: ["MiddleProximal", "MiddleIntermediate", "MiddleDistal"] },
  { label: "Ring", joints: ["RingProximal", "RingIntermediate", "RingDistal"] },
  { label: "Little", joints: ["LittleProximal", "LittleIntermediate", "LittleDistal"] },
];
