import * as THREE from "three";
import { createSpring, stepSpring, type Spring } from "@/lib/spring";
import { GESTURE_NAMES_V2, isGestureNameV2, type GestureNameV2 } from "@/lib/tiktok-live-avatar-motion";
import { solveTwoBoneIK, computeHeadRelativeWorldPoint } from "@/lib/avatar-arm-ik";

// ============================================================================
// 20 procedural, client-side, bone-based interaction gestures — layered on
// top of the EXISTING procedural idle system (AvatarIdleEngine/breathing) and
// the EXISTING older gesture system (computeGesturePose in AvatarCanvas.tsx,
// still used for the original 14 AvatarGesture names: wave/point/nod/shake/
// thumbs_up/open_hand/thinking/excited/welcome/scratch_head/salute/
// cover_mouth/palms_together). This is a NEW, separate, richer engine
// (shoulders + wrists + fingers + chest lean + head, per-gesture phase
// timing, two-hand coordination) for a DIFFERENT, larger vocabulary of 20
// gesture names — it does not replace, modify, or remove the older system,
// which keeps working exactly as before for any reply still classified with
// one of its 14 names.
//
// Deliberately reuses this project's own established spring primitive
// (spring.ts, already used by AvatarIdleEngine/AvatarGazeEngine) rather than
// a fixed-duration damp()/smootherstep envelope — springs naturally
// accelerate away from rest and decelerate into a new target, and critically
// DON'T reproduce the exact bug already found and fixed twice in
// avatar-animation-controller.ts (a velocity discontinuity when a held-still
// value suddenly starts moving again): a spring sitting at a settled target
// already has ~0 velocity, so its NEXT target change naturally eases in from
// a standing start instead of snapping into motion.
// ============================================================================

// The name vocabulary itself lives in tiktok-live-avatar-motion.ts (a
// framework-free file safe for server-side import) — re-exported here under
// the shorter names this file's own code uses throughout.
export type GestureName = GestureNameV2;
export const GESTURE_NAMES = GESTURE_NAMES_V2;
export const isGestureName = isGestureNameV2;

// Finger bone suffixes this engine can pose — same 14-joint set
// FINGER_CURL_JOINTS in AvatarCanvas.tsx already uses for idle (audited: this
// project's VRM has Proximal/Distal for thumb, Proximal/Intermediate/Distal
// for the other four — not every model guarantees these; the caller already
// null-checks each bone lookup, so a model missing some of them just skips
// those joints silently, never throws).
export const FINGER_BONE_SUFFIXES = [
  "ThumbProximal",
  "ThumbDistal",
  "IndexProximal",
  "IndexIntermediate",
  "IndexDistal",
  "MiddleProximal",
  "MiddleIntermediate",
  "MiddleDistal",
  "RingProximal",
  "RingIntermediate",
  "RingDistal",
  "LittleProximal",
  "LittleIntermediate",
  "LittleDistal",
] as const;
export type FingerBoneSuffix = (typeof FINGER_BONE_SUFFIXES)[number];

/** Absolute curl/spread targets (radians-ish, same units as AvatarCanvas's FINGER_CURL_JOINTS) — NOT deltas. Omitted joints fall back to the idle/relaxed baseline. */
export type FingerPose = Partial<Record<FingerBoneSuffix, { curl?: number; spread?: number }>>;

// Named, reusable finger shapes — built once, referenced by name from
// gesture steps so 20 gestures don't each hand-roll 14 joint values. Kept
// deliberately gentle (see project convention: an earlier idle-finger pass
// that curled too hard read as a "claw" per direct feedback) — natural/
// relaxed-looking over anatomically extreme.
const RELAXED: FingerPose = {};
const CURLED_SOFT: FingerPose = {
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
};
const OPEN_SPREAD: FingerPose = {
  ThumbProximal: { curl: -0.05 },
  IndexProximal: { curl: 0.02, spread: 0.12 },
  MiddleProximal: { curl: 0.04, spread: 0.04 },
  RingProximal: { curl: 0.04, spread: -0.04 },
  LittleProximal: { curl: 0.06, spread: -0.12 },
};
const POINT_INDEX: FingerPose = {
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
};
const THUMBS_UP_SHAPE: FingerPose = {
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
};
// Thumb + index curl inward toward each other (the "point" of one lobe of a
// heart shape when both hands are brought together) — the other three
// fingers stay softly curled/relaxed rather than forced straight, per spec
// ("jangan memaksakan bentuk matematis sempurna").
const HEART_SHAPE: FingerPose = {
  ThumbProximal: { curl: 0.55, spread: 0.15 },
  ThumbDistal: { curl: 0.35 },
  IndexProximal: { curl: 0.35, spread: -0.1 },
  IndexIntermediate: { curl: 0.55 },
  IndexDistal: { curl: 0.3 },
  MiddleProximal: { curl: 0.55 },
  MiddleIntermediate: { curl: 0.6 },
  RingProximal: { curl: 0.6 },
  RingIntermediate: { curl: 0.65 },
  LittleProximal: { curl: 0.65 },
  LittleIntermediate: { curl: 0.7 },
};

/** Absolute (already sign-corrected for THIS model, via the calibration passed to the engine's constructor) rotation targets — every field optional; an omitted field means "this gesture doesn't drive that bone," so it stays under idle's (or the older gesture system's) control untouched. */
export interface GestureBonePose {
  leftShoulderZ?: number;
  rightShoulderZ?: number;
  leftUpperArmX?: number;
  leftUpperArmY?: number;
  leftUpperArmZ?: number;
  rightUpperArmX?: number;
  rightUpperArmY?: number;
  rightUpperArmZ?: number;
  leftLowerArmZ?: number;
  rightLowerArmZ?: number;
  leftHandX?: number;
  leftHandZ?: number;
  rightHandX?: number;
  rightHandZ?: number;
  /** Additive on top of whatever idle's own breathing/spine chain already wrote this frame — never a full override, see module note on chest/spine ownership. */
  chestLeanX?: number;
  spineLeanX?: number;
  /** Additive on top of idle's head chain / gaze head-follow, same reasoning as chestLeanX. */
  headOffsetX?: number;
  headOffsetY?: number;
  leftFingers?: FingerPose;
  rightFingers?: FingerPose;
}

type OscillateAxis = "leftLowerArmZ" | "rightLowerArmZ" | "leftUpperArmX" | "rightUpperArmX" | "headOffsetY";

/**
 * 2-bone IK config for a step whose hand must reach a specific point near
 * another body part (currently: salute's hand-to-forehead) rather than just
 * a rotation amount — see avatar-arm-ik.ts. Both offsets are expressed in
 * the HEAD bone's own rest-local axes and re-evaluated fresh every frame
 * from the head's CURRENT world transform (see computeHeadRelativeWorldPoint)
 * — never a static world-space coordinate, so the target keeps following the
 * head through idle sway/look-at/nod exactly as required. `poleOffset` only
 * needs to be roughly right — it fixes which side the elbow bends toward,
 * not a point that must be exactly reached.
 */
export interface GestureIkConfig {
  side: "left" | "right";
  targetOffset: THREE.Vector3;
  poleOffset: THREE.Vector3;
}

interface GestureStep {
  phase: "prepare" | "action" | "settle" | "hold" | "release" | "return";
  pose: GestureBonePose;
  /** Fixed ms, or a [min,max] range (a fresh random pick each time this step is entered) — matches the spec's per-gesture hold ranges. */
  holdMs: number | [number, number];
  /** Optional additive oscillation layered onto the step's target while it's active — e.g. wave's hand wiggle, no_no's left-right, excited's small bounce. Reuses the same "sine * envelope" technique already proven in the older gesture system. */
  oscillate?: { axis: OscillateAxis; amplitudeRad: number; cyclesPerStep: number };
  /** When set, this step's upperArm/lowerArm rotation on `side` is driven by 2-bone IK instead of (and in addition to, via priority — see AvatarCanvas.tsx) the normal pose-target springs — any leftUpperArmZ/rightUpperArmX/etc in `pose` for that same side is ignored for those two bones while IK owns them. */
  ik?: GestureIkConfig;
}

export interface GestureDefinition {
  steps: GestureStep[];
  /** Facial expression this gesture leans toward while active, purely advisory — AvatarCanvas already owns expression blending independently (see module note); the caller MAY use this to nudge currentEmotionTargetRef, gesture playback itself never touches expressions directly. */
  suggestedExpression?: string;
  suggestedExpressionIntensity?: number;
}

function randRange(range: number | [number, number]): number {
  if (typeof range === "number") return range;
  return range[0] + Math.random() * (range[1] - range[0]);
}

// Salute's hand target: the temple, roughly level with the eyebrow — offset
// from the HEAD bone in ITS OWN rest-local axes (x = toward the saluting
// side, y = up, z = forward — sign/magnitude tuned empirically against a
// live render with the debug target sphere, ?avatarDebug=1, see
// AvatarCanvas.tsx's debug rendering; adjust these two vectors directly if
// the sphere/hand ever lands in the wrong place on a different VRM). The
// pole biases the elbow to point down and slightly forward/out, not up or
// straight forward.
const SALUTE_IK: GestureIkConfig = {
  side: "right",
  targetOffset: new THREE.Vector3(0.09, 0.02, 0.05),
  poleOffset: new THREE.Vector3(0.12, -0.45, 0.35),
};

// ============================================================================
// Gesture definitions — data, not code. Each is a short sequence of target
// poses the engine's springs chase in order; "hold" repeats the action pose
// (or a settled variant) for the requested duration, "return" is always an
// empty pose so every gesture unwinds through the exact same relax-to-idle
// mechanism. Timings below are the spec's own starting points.
//
// Sign convention matches the OLDER gesture system's `raise()` helper: 0 is
// ARM_DOWN_Z (idle rest), positive is somewhere between rest and fully
// horizontal/raised depending on the target's magnitude. leftUpperArmZ is
// mirrored (negative of the equivalent right value) since the engine
// receives per-model armSign/armReach calibration and applies it internally
// — gesture data below is written as if for a canonical right-handed model
// and mirrored automatically for the left arm targets that need it.
// ============================================================================
const GESTURE_DEFINITIONS: Record<GestureName, GestureDefinition> = {
  wave: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.4,
    steps: [
      { phase: "prepare", pose: { rightShoulderZ: 0.08, rightUpperArmZ: 0.5, rightLowerArmZ: -0.3 }, holdMs: 300 },
      {
        phase: "action",
        pose: { rightShoulderZ: 0.1, rightUpperArmZ: 0.55, rightLowerArmZ: -0.55, rightHandZ: 0, headOffsetY: 0.06, rightFingers: OPEN_SPREAD },
        holdMs: [900, 1400],
        oscillate: { axis: "rightHandZ" as OscillateAxis, amplitudeRad: 0.32, cyclesPerStep: 3 },
      },
      { phase: "hold", pose: { rightShoulderZ: 0.1, rightUpperArmZ: 0.55, rightLowerArmZ: -0.55, headOffsetY: 0.06, rightFingers: OPEN_SPREAD }, holdMs: [200, 400] },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  greeting: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.45,
    steps: [
      { phase: "prepare", pose: { headOffsetY: 0.05 }, holdMs: 400 },
      {
        phase: "action",
        pose: { rightShoulderZ: 0.1, rightUpperArmZ: 0.5, rightLowerArmZ: -0.5, headOffsetY: 0.06, rightFingers: OPEN_SPREAD },
        holdMs: 600,
        oscillate: { axis: "rightHandZ" as OscillateAxis, amplitudeRad: 0.2, cyclesPerStep: 2 },
      },
      { phase: "hold", pose: { rightShoulderZ: 0.1, rightUpperArmZ: 0.5, rightLowerArmZ: -0.5, headOffsetY: 0.06, rightFingers: OPEN_SPREAD }, holdMs: 400 },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  salute: {
    steps: [
      // RAISE — a plain rotation-based anticipation lift, no IK yet (mirrors
      // the spec's own "upper arm naik secara diagonal" as a distinct first
      // beat before the hand commits to reaching for a specific point).
      { phase: "prepare", pose: { rightShoulderZ: 0.06, rightUpperArmZ: 0.42, rightLowerArmZ: -0.35 }, holdMs: 320 },
      // REACH — IK takes over: the hand travels to the temple/forehead
      // target computed fresh from the head bone every frame (see SALUTE_IK
      // and computeHeadRelativeWorldPoint in avatar-arm-ik.ts).
      { phase: "action", pose: { headOffsetX: 0.03 }, ik: SALUTE_IK, holdMs: 260 },
      // SETTLE — same IK target, just a short beat for the blend-in weight to finish easing to full strength before HOLD.
      { phase: "settle", pose: { headOffsetX: 0.03 }, ik: SALUTE_IK, holdMs: 160 },
      { phase: "hold", pose: { headOffsetX: 0.03 }, ik: SALUTE_IK, holdMs: [500, 900] },
      // RELEASE — IK lets go (no `ik` here — its blend weight eases back to
      // 0 on its own, see the engine's ikWeightSpring), arm drops via a
      // plain rotation target on the way back to idle.
      { phase: "release", pose: { rightShoulderZ: 0.15, rightUpperArmZ: 0.35, rightLowerArmZ: -0.3 }, holdMs: 380 },
      { phase: "return", pose: {}, holdMs: 400 },
    ],
  },

  point_camera: {
    steps: [
      { phase: "prepare", pose: { rightShoulderZ: 0.06, rightUpperArmZ: 0.3, rightLowerArmZ: -0.2 }, holdMs: 400 },
      { phase: "action", pose: { rightShoulderZ: 0.08, rightUpperArmZ: 0.32, rightUpperArmY: 0.15, rightLowerArmZ: -0.15, rightFingers: POINT_INDEX }, holdMs: 500 },
      {
        phase: "hold",
        pose: { rightShoulderZ: 0.08, rightUpperArmZ: 0.32, rightUpperArmY: 0.15, rightLowerArmZ: -0.15, rightFingers: POINT_INDEX },
        holdMs: [800, 1500],
        oscillate: { axis: "rightHandZ" as OscillateAxis, amplitudeRad: 0.05, cyclesPerStep: 1 },
      },
      { phase: "return", pose: {}, holdMs: 600 },
    ],
  },

  no_no: {
    steps: [
      { phase: "prepare", pose: { rightUpperArmZ: 0.28, rightLowerArmZ: -0.55, rightFingers: POINT_INDEX }, holdMs: 400 },
      {
        phase: "action",
        pose: { rightUpperArmZ: 0.28, rightLowerArmZ: -0.55, rightHandZ: 0, rightFingers: POINT_INDEX },
        holdMs: [1200, 1800],
        oscillate: { axis: "rightHandZ" as OscillateAxis, amplitudeRad: 0.14, cyclesPerStep: 4 },
      },
      { phase: "hold", pose: { rightUpperArmZ: 0.28, rightLowerArmZ: -0.55, rightFingers: POINT_INDEX }, holdMs: 200 },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  heart_hands: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.5,
    steps: [
      { phase: "prepare", pose: { leftUpperArmZ: 0.4, rightUpperArmZ: 0.4, leftUpperArmX: 0.3, rightUpperArmX: 0.3 }, holdMs: 500 },
      {
        phase: "action",
        pose: {
          leftUpperArmZ: 0.55,
          rightUpperArmZ: 0.55,
          leftUpperArmX: 0.52,
          rightUpperArmX: 0.52,
          leftLowerArmZ: -1.0,
          rightLowerArmZ: -1.0,
          leftFingers: HEART_SHAPE,
          rightFingers: HEART_SHAPE,
          headOffsetX: -0.04,
        },
        holdMs: 700,
      },
      {
        phase: "hold",
        pose: {
          leftUpperArmZ: 0.55,
          rightUpperArmZ: 0.55,
          leftUpperArmX: 0.52,
          rightUpperArmX: 0.52,
          leftLowerArmZ: -1.0,
          rightLowerArmZ: -1.0,
          leftFingers: HEART_SHAPE,
          rightFingers: HEART_SHAPE,
          headOffsetX: -0.04,
        },
        holdMs: [1000, 2000],
      },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  thank_you: {
    steps: [
      { phase: "prepare", pose: { leftUpperArmZ: 0.35, rightUpperArmZ: 0.35, leftUpperArmX: 0.35, rightUpperArmX: 0.35 }, holdMs: 400 },
      {
        phase: "action",
        pose: {
          leftUpperArmZ: 0.5,
          rightUpperArmZ: 0.5,
          leftUpperArmX: 0.5,
          rightUpperArmX: 0.5,
          leftLowerArmZ: -0.95,
          rightLowerArmZ: -0.95,
          chestLeanX: 0.1,
          headOffsetX: 0.12,
        },
        holdMs: 500,
      },
      {
        phase: "hold",
        pose: {
          leftUpperArmZ: 0.5,
          rightUpperArmZ: 0.5,
          leftUpperArmX: 0.5,
          rightUpperArmX: 0.5,
          leftLowerArmZ: -0.95,
          rightLowerArmZ: -0.95,
          chestLeanX: 0.1,
          headOffsetX: 0.12,
        },
        holdMs: 600,
      },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  shh: {
    steps: [
      { phase: "prepare", pose: { rightUpperArmZ: -0.05, rightUpperArmX: 0.5, rightLowerArmZ: -1.15 }, holdMs: 400 },
      {
        phase: "action",
        pose: { rightUpperArmZ: -0.05, rightUpperArmX: 0.58, rightLowerArmZ: -1.3, rightFingers: POINT_INDEX, headOffsetX: 0.04 },
        holdMs: 500,
      },
      {
        phase: "hold",
        pose: { rightUpperArmZ: -0.05, rightUpperArmX: 0.58, rightLowerArmZ: -1.3, rightFingers: POINT_INDEX, headOffsetX: 0.04 },
        holdMs: [800, 1500],
      },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  stop: {
    steps: [
      { phase: "prepare", pose: { rightUpperArmZ: 0.3, rightLowerArmZ: -0.4 }, holdMs: 400 },
      { phase: "action", pose: { rightUpperArmZ: 0.4, rightLowerArmZ: -0.85, rightFingers: OPEN_SPREAD }, holdMs: 500 },
      { phase: "hold", pose: { rightUpperArmZ: 0.4, rightLowerArmZ: -0.85, rightFingers: OPEN_SPREAD }, holdMs: [800, 1500] },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  point_left: {
    steps: [
      { phase: "prepare", pose: { rightUpperArmZ: 0.25, rightLowerArmZ: -0.15, headOffsetY: -0.1 }, holdMs: 400 },
      { phase: "action", pose: { rightUpperArmZ: 0.3, rightUpperArmY: -0.35, rightLowerArmZ: -0.1, rightFingers: POINT_INDEX, headOffsetY: -0.14 }, holdMs: 500 },
      { phase: "hold", pose: { rightUpperArmZ: 0.3, rightUpperArmY: -0.35, rightLowerArmZ: -0.1, rightFingers: POINT_INDEX, headOffsetY: -0.14 }, holdMs: [800, 1500] },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  point_right: {
    steps: [
      { phase: "prepare", pose: { leftUpperArmZ: 0.25, leftLowerArmZ: -0.15, headOffsetY: 0.1 }, holdMs: 400 },
      { phase: "action", pose: { leftUpperArmZ: 0.3, leftUpperArmY: 0.35, leftLowerArmZ: -0.1, leftFingers: POINT_INDEX, headOffsetY: 0.14 }, holdMs: 500 },
      { phase: "hold", pose: { leftUpperArmZ: 0.3, leftUpperArmY: 0.35, leftLowerArmZ: -0.1, leftFingers: POINT_INDEX, headOffsetY: 0.14 }, holdMs: [800, 1500] },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  thumbs_up: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.35,
    steps: [
      { phase: "prepare", pose: { rightUpperArmZ: 0.4, rightLowerArmZ: -0.5 }, holdMs: 400 },
      { phase: "action", pose: { rightUpperArmZ: 0.45, rightLowerArmZ: -0.75, rightFingers: THUMBS_UP_SHAPE }, holdMs: 500 },
      {
        phase: "hold",
        pose: { rightUpperArmZ: 0.45, rightLowerArmZ: -0.75, rightFingers: THUMBS_UP_SHAPE },
        holdMs: [800, 1500],
        oscillate: { axis: "rightHandZ" as OscillateAxis, amplitudeRad: 0.06, cyclesPerStep: 1 },
      },
      { phase: "return", pose: {}, holdMs: 500 },
    ],
  },

  thinking: {
    suggestedExpression: "thinking",
    suggestedExpressionIntensity: 0.4,
    steps: [
      { phase: "prepare", pose: { rightUpperArmZ: 0.2, rightUpperArmX: 0.55, rightLowerArmZ: -0.85, headOffsetY: 0.08 }, holdMs: 500 },
      { phase: "action", pose: { rightUpperArmZ: 0.22, rightUpperArmX: 0.68, rightLowerArmZ: -1.1, headOffsetX: 0.05, headOffsetY: 0.1 }, holdMs: 700 },
      { phase: "hold", pose: { rightUpperArmZ: 0.22, rightUpperArmX: 0.68, rightLowerArmZ: -1.1, headOffsetX: 0.05, headOffsetY: 0.1 }, holdMs: [1500, 3000] },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  cute: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.5,
    steps: [
      { phase: "prepare", pose: { leftUpperArmZ: 0.4, rightUpperArmZ: 0.4, leftUpperArmX: 0.25, rightUpperArmX: 0.25 }, holdMs: 500 },
      {
        phase: "action",
        pose: {
          leftUpperArmZ: 0.58,
          rightUpperArmZ: 0.58,
          leftUpperArmX: 0.42,
          rightUpperArmX: 0.42,
          leftLowerArmZ: -1.05,
          rightLowerArmZ: -1.05,
          leftFingers: CURLED_SOFT,
          rightFingers: CURLED_SOFT,
          headOffsetX: -0.03,
        },
        holdMs: 600,
      },
      {
        phase: "hold",
        pose: {
          leftUpperArmZ: 0.58,
          rightUpperArmZ: 0.58,
          leftUpperArmX: 0.42,
          rightUpperArmX: 0.42,
          leftLowerArmZ: -1.05,
          rightLowerArmZ: -1.05,
          leftFingers: CURLED_SOFT,
          rightFingers: CURLED_SOFT,
          headOffsetX: -0.03,
        },
        holdMs: [1000, 2000],
      },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  excited: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.55,
    steps: [
      { phase: "prepare", pose: { leftShoulderZ: 0.06, rightShoulderZ: 0.06, leftUpperArmZ: 0.3, rightUpperArmZ: 0.3, leftUpperArmY: -0.12, rightUpperArmY: 0.12 }, holdMs: 400 },
      {
        phase: "action",
        pose: {
          leftShoulderZ: 0.1,
          rightShoulderZ: 0.1,
          leftUpperArmZ: 0.38,
          rightUpperArmZ: 0.38,
          leftUpperArmY: -0.18,
          rightUpperArmY: 0.18,
          chestLeanX: -0.05,
          headOffsetX: -0.03,
        },
        holdMs: 600,
        oscillate: { axis: "headOffsetY" as OscillateAxis, amplitudeRad: 0.05, cyclesPerStep: 2 },
      },
      {
        phase: "hold",
        pose: { leftShoulderZ: 0.1, rightShoulderZ: 0.1, leftUpperArmZ: 0.38, rightUpperArmZ: 0.38, leftUpperArmY: -0.18, rightUpperArmY: 0.18, chestLeanX: -0.05, headOffsetX: -0.03 },
        holdMs: [800, 1500],
      },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  happy: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.5,
    steps: [
      { phase: "prepare", pose: { leftUpperArmY: -0.06, rightUpperArmY: 0.06, chestLeanX: -0.03 }, holdMs: 400 },
      { phase: "action", pose: { leftUpperArmY: -0.1, rightUpperArmY: 0.1, chestLeanX: -0.05, headOffsetY: 0.03 }, holdMs: 600 },
      { phase: "hold", pose: { leftUpperArmY: -0.1, rightUpperArmY: 0.1, chestLeanX: -0.05, headOffsetY: 0.03 }, holdMs: [800, 1500] },
      { phase: "return", pose: {}, holdMs: 600 },
    ],
  },

  laugh: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.55,
    steps: [
      { phase: "prepare", pose: { headOffsetX: -0.08, chestLeanX: -0.04 }, holdMs: 300 },
      {
        phase: "action",
        pose: { headOffsetX: -0.12, chestLeanX: -0.06, leftShoulderZ: 0.05, rightShoulderZ: 0.05 },
        holdMs: [1000, 1800],
        oscillate: { axis: "headOffsetY" as OscillateAxis, amplitudeRad: 0.04, cyclesPerStep: 4 },
      },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  sad: {
    suggestedExpression: "sad",
    suggestedExpressionIntensity: 0.5,
    steps: [
      { phase: "prepare", pose: { leftShoulderZ: -0.04, rightShoulderZ: -0.04, headOffsetX: 0.06 }, holdMs: 600 },
      { phase: "action", pose: { leftShoulderZ: -0.07, rightShoulderZ: -0.07, chestLeanX: 0.06, headOffsetX: 0.14, headOffsetY: 0 }, holdMs: 700 },
      { phase: "hold", pose: { leftShoulderZ: -0.07, rightShoulderZ: -0.07, chestLeanX: 0.06, headOffsetX: 0.14 }, holdMs: [1500, 2500] },
      { phase: "return", pose: {}, holdMs: 1000 },
    ],
  },

  angry_hands_on_hips: {
    suggestedExpression: "angry",
    suggestedExpressionIntensity: 0.7,
    steps: [
      { phase: "prepare", pose: { leftUpperArmZ: 0.25, rightUpperArmZ: 0.25, chestLeanX: -0.03 }, holdMs: 400 },
      {
        phase: "action",
        pose: {
          leftUpperArmZ: 0.42,
          rightUpperArmZ: 0.42,
          leftUpperArmY: -0.22,
          rightUpperArmY: 0.22,
          leftLowerArmZ: -1.35,
          rightLowerArmZ: -1.35,
          leftHandZ: 0.2,
          rightHandZ: -0.2,
          leftShoulderZ: 0.05,
          rightShoulderZ: 0.05,
          chestLeanX: -0.07,
          headOffsetX: 0.06,
          leftFingers: CURLED_SOFT,
          rightFingers: CURLED_SOFT,
        },
        holdMs: 600,
      },
      { phase: "settle", pose: { leftHandZ: 0.15, rightHandZ: -0.15 }, holdMs: 250 },
      {
        phase: "hold",
        pose: {
          leftUpperArmZ: 0.42,
          rightUpperArmZ: 0.42,
          leftUpperArmY: -0.22,
          rightUpperArmY: 0.22,
          leftLowerArmZ: -1.35,
          rightLowerArmZ: -1.35,
          leftHandZ: 0.15,
          rightHandZ: -0.15,
          leftShoulderZ: 0.05,
          rightShoulderZ: 0.05,
          chestLeanX: -0.07,
          headOffsetX: 0.06,
          leftFingers: CURLED_SOFT,
          rightFingers: CURLED_SOFT,
        },
        holdMs: [1000, 2500],
      },
      { phase: "release", pose: { leftUpperArmZ: 0.2, rightUpperArmZ: 0.2 }, holdMs: 400 },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },

  welcome: {
    suggestedExpression: "happy",
    suggestedExpressionIntensity: 0.4,
    steps: [
      { phase: "prepare", pose: { leftUpperArmZ: 0.3, rightUpperArmZ: 0.3, leftUpperArmY: -0.1, rightUpperArmY: 0.1 }, holdMs: 500 },
      {
        phase: "action",
        pose: { leftUpperArmZ: 0.45, rightUpperArmZ: 0.45, leftUpperArmY: -0.32, rightUpperArmY: 0.32, leftLowerArmZ: -0.35, rightLowerArmZ: -0.35, headOffsetY: 0 },
        holdMs: 700,
      },
      {
        phase: "hold",
        pose: { leftUpperArmZ: 0.45, rightUpperArmZ: 0.45, leftUpperArmY: -0.32, rightUpperArmY: 0.32, leftLowerArmZ: -0.35, rightLowerArmZ: -0.35 },
        holdMs: [800, 1500],
      },
      { phase: "return", pose: {}, holdMs: 700 },
    ],
  },
};

// ============================================================================
// Engine
// ============================================================================

interface AxisSpring {
  spring: Spring;
  stiffness: number;
  damping: number;
}

// Body axes are heavier/slower than fingers — same stiffness philosophy as
// AvatarIdleEngine's arm chain (lead bones a bit softer, trailing bones a
// bit snappier so they don't lag visibly behind).
const BODY_STIFFNESS = 42;
const BODY_DAMPING = 11;
const FINGER_STIFFNESS = 30;
const FINGER_DAMPING = 9;
// How fast the IK solve's influence on the arm ramps in/out — a critically-
// damped ~250-300ms settle (2*sqrt(stiffness) ≈ damping), independent of the
// step-duration timings above so it can be tuned without touching gesture data.
const IK_WEIGHT_STIFFNESS = 55;
const IK_WEIGHT_DAMPING = 15;

const BODY_AXES: (keyof GestureBonePose & string)[] = [
  "leftShoulderZ",
  "rightShoulderZ",
  "leftUpperArmX",
  "leftUpperArmY",
  "leftUpperArmZ",
  "rightUpperArmX",
  "rightUpperArmY",
  "rightUpperArmZ",
  "leftLowerArmZ",
  "rightLowerArmZ",
  "leftHandX",
  "leftHandZ",
  "rightHandX",
  "rightHandZ",
  "chestLeanX",
  "spineLeanX",
  "headOffsetX",
  "headOffsetY",
];

export interface GestureCalibration {
  armSign: { left: 1 | -1; right: 1 | -1 };
  armReach: { left: { axis: "x" | "y"; sign: 1 | -1 }; right: { axis: "x" | "y"; sign: 1 | -1 } };
  headSign: 1 | -1;
}

/** Real bone references for whichever gesture step needs 2-bone IK (see GestureIkConfig) — passed into update() each frame by the caller, which already has these looked up for its own use. Optional/nullable: gestures without any `ik` step never touch this. */
export interface GestureIkBones {
  head: THREE.Object3D;
  leftUpperArm: THREE.Object3D;
  leftLowerArm: THREE.Object3D;
  leftHand: THREE.Object3D;
  rightUpperArm: THREE.Object3D;
  rightLowerArm: THREE.Object3D;
  rightHand: THREE.Object3D;
}

export interface GestureFrame {
  pose: Required<Pick<GestureBonePose, never>> & GestureBonePose;
  leftFingers: FingerPose | null;
  rightFingers: FingerPose | null;
  suggestedExpression?: string;
  suggestedExpressionIntensity?: number;
}

/** Return value of AvatarGestureEngine.applyArmIk() — see that method's doc comment for why it's a separate call from update()/GestureFrame. Purely for the ?avatarDebug=1 visualization AvatarCanvas.tsx renders; not used for any pose logic itself. */
export interface GestureIkDebug {
  targetWorld: THREE.Vector3;
  poleWorld: THREE.Vector3;
  handWorld: THREE.Vector3;
}

/**
 * One instance per mounted VRM, created at load time alongside
 * AvatarIdleEngine/AvatarGazeEngine, driven every frame from the same
 * useFrame loop. update() returns null whenever no gesture is active/
 * unwinding — the common case, and a cheap check for the caller.
 */
export class AvatarGestureEngine {
  private readonly calibration: GestureCalibration;
  private current: GestureName | null = null;
  private stepIndex = 0;
  private stepElapsedMs = 0;
  private stepHoldMs = 0;
  private oscillatePhaseRad = 0;

  private readonly bodySprings = new Map<string, AxisSpring>();
  private readonly leftFingerSprings = new Map<FingerBoneSuffix, { curl: AxisSpring; spread: AxisSpring }>();
  private readonly rightFingerSprings = new Map<FingerBoneSuffix, { curl: AxisSpring; spread: AxisSpring }>();

  // 2-bone IK state (see solveTwoBoneIK in avatar-arm-ik.ts and GestureIkConfig above).
  // A single shared weight spring is enough since only one arm is ever IK-
  // driven at a time across the current gesture set — generalize to a
  // per-side map if a future gesture ever needs both arms reaching
  // independent targets simultaneously.
  private readonly ikWeightSpring = createSpring();
  private lastIkConfig: GestureIkConfig | null = null;
  // Bone-length/aim-axis cache — computed once per side, lazily, the first
  // time IK bones are available (a normalized VRM bone's LOCAL position
  // relative to its parent never changes under our rotation-only posing, so
  // this is safe to compute once and reuse for the VRM's whole lifetime).
  private readonly armLengthCache = new Map<"left" | "right", { upperLength: number; lowerLength: number; upperChildAxis: THREE.Vector3; lowerChildAxis: THREE.Vector3 }>();
  private readonly ikTargetScratch = new THREE.Vector3();
  private readonly ikPoleScratch = new THREE.Vector3();
  private readonly ikIdleUpperQuat = new THREE.Quaternion();
  private readonly ikIdleLowerQuat = new THREE.Quaternion();
  private readonly ikResultUpperQuat = new THREE.Quaternion();
  private readonly ikResultLowerQuat = new THREE.Quaternion();
  private readonly ikHandWorldScratch = new THREE.Vector3();

  constructor(calibration: GestureCalibration) {
    this.calibration = calibration;
    for (const axis of BODY_AXES) this.bodySprings.set(axis, { spring: createSpring(), stiffness: BODY_STIFFNESS, damping: BODY_DAMPING });
    for (const suffix of FINGER_BONE_SUFFIXES) {
      this.leftFingerSprings.set(suffix, {
        curl: { spring: createSpring(), stiffness: FINGER_STIFFNESS, damping: FINGER_DAMPING },
        spread: { spring: createSpring(), stiffness: FINGER_STIFFNESS, damping: FINGER_DAMPING },
      });
      this.rightFingerSprings.set(suffix, {
        curl: { spring: createSpring(), stiffness: FINGER_STIFFNESS, damping: FINGER_DAMPING },
        spread: { spring: createSpring(), stiffness: FINGER_STIFFNESS, damping: FINGER_DAMPING },
      });
    }
  }

  /** Starts (or restarts, if a different gesture is already mid-flight) a gesture — springs simply retarget from wherever they currently are, no snap. */
  playGesture(name: GestureName) {
    if (this.current === name) return; // idempotent, matches AvatarAnimationController's playAnimation() convention
    this.current = name;
    this.stepIndex = 0;
    this.stepElapsedMs = 0;
    this.stepHoldMs = randRange(GESTURE_DEFINITIONS[name].steps[0].holdMs);
  }

  stopGesture() {
    this.current = null;
  }

  isPlaying(name?: GestureName): boolean {
    if (!this.current) return false;
    return name === undefined || this.current === name;
  }

  getCurrentGesture(): GestureName | null {
    return this.current;
  }

  getDebugState() {
    return {
      currentGesture: this.current,
      stepIndex: this.stepIndex,
      stepPhase: this.current ? GESTURE_DEFINITIONS[this.current].steps[this.stepIndex]?.phase ?? null : null,
    };
  }

  private mirrorPoseForModel(pose: GestureBonePose): GestureBonePose {
    const { armSign, armReach, headSign } = this.calibration;
    const out: GestureBonePose = { ...pose };
    if (out.leftUpperArmZ !== undefined) out.leftUpperArmZ = armSign.left * out.leftUpperArmZ;
    if (out.rightUpperArmZ !== undefined) out.rightUpperArmZ = armSign.right * out.rightUpperArmZ;
    if (out.leftLowerArmZ !== undefined) out.leftLowerArmZ = armSign.left * out.leftLowerArmZ;
    if (out.rightLowerArmZ !== undefined) out.rightLowerArmZ = armSign.right * out.rightLowerArmZ;
    if (out.leftHandZ !== undefined) out.leftHandZ = armSign.left * out.leftHandZ;
    if (out.rightHandZ !== undefined) out.rightHandZ = armSign.right * out.rightHandZ;
    // The reach axis (X vs Y, and its sign) is per-model calibrated — a
    // "reach toward center/up" value written as leftUpperArmX/Y in gesture
    // data gets redirected onto whichever axis THIS model's calibration
    // actually uses, same principle as calibrateArmReachAxis's callers in
    // the older gesture system.
    if (out.leftUpperArmX !== undefined) {
      const magnitude = out.leftUpperArmX;
      out.leftUpperArmX = armReach.left.axis === "x" ? armReach.left.sign * magnitude : 0;
      out.leftUpperArmY = armReach.left.axis === "y" ? armReach.left.sign * magnitude : out.leftUpperArmY;
    }
    if (out.rightUpperArmX !== undefined) {
      const magnitude = out.rightUpperArmX;
      out.rightUpperArmX = armReach.right.axis === "x" ? armReach.right.sign * magnitude : 0;
      out.rightUpperArmY = armReach.right.axis === "y" ? armReach.right.sign * magnitude : out.rightUpperArmY;
    }
    if (out.headOffsetX !== undefined) out.headOffsetX = headSign * out.headOffsetX;
    return out;
  }

  /** Real bone lengths/aim-axes for one side, computed once and cached — see armLengthCache's own comment. */
  private getArmLengths(side: "left" | "right", upperBone: THREE.Object3D, lowerBone: THREE.Object3D, handBone: THREE.Object3D) {
    let cached = this.armLengthCache.get(side);
    if (!cached) {
      cached = {
        upperLength: lowerBone.position.length(),
        lowerLength: handBone.position.length(),
        upperChildAxis: lowerBone.position.clone().normalize(),
        lowerChildAxis: handBone.position.clone().normalize(),
      };
      this.armLengthCache.set(side, cached);
    }
    return cached;
  }

  /** Called once per frame, AFTER idle/gaze/older-gesture code has already written this frame's pose (see module note on additive vs. override bone ownership) and BEFORE the AnimationMixer-driven interaction clips. Returns null when idle should have full, unmodified control AND no IK fade-out is still settling. Does NOT touch bones for IK — call applyArmIk() separately, LATER in the frame, for that (see its own doc comment for why). */
  update(deltaSeconds: number): GestureFrame | null {
    const deltaMs = deltaSeconds * 1000;

    if (this.current) {
      this.stepElapsedMs += deltaMs;
      const def = GESTURE_DEFINITIONS[this.current];
      if (this.stepElapsedMs >= this.stepHoldMs) {
        this.stepIndex += 1;
        this.stepElapsedMs = 0;
        if (this.stepIndex >= def.steps.length) {
          // Finished unwinding — hand full control back to idle.
          this.current = null;
        } else {
          this.stepHoldMs = randRange(def.steps[this.stepIndex].holdMs);
        }
      }
    }

    if (!this.current) {
      // Let every spring relax toward 0 (idle) even with no active gesture,
      // so a gesture that gets retriggered mid-relax still starts from a
      // smooth, continuous spring state rather than a hard reset.
      for (const axis of BODY_AXES) {
        const s = this.bodySprings.get(axis)!;
        stepSpring(s.spring, 0, deltaSeconds, s.stiffness, s.damping);
      }
      const settled = BODY_AXES.every((axis) => Math.abs(this.bodySprings.get(axis)!.spring.value) < 0.001);
      let anyFingerLive = false;
      for (const map of [this.leftFingerSprings, this.rightFingerSprings]) {
        for (const [, axes] of map) {
          stepSpring(axes.curl.spring, 0, deltaSeconds, axes.curl.stiffness, axes.curl.damping);
          stepSpring(axes.spread.spring, 0, deltaSeconds, axes.spread.stiffness, axes.spread.damping);
          if (Math.abs(axes.curl.spring.value) > 0.001 || Math.abs(axes.spread.spring.value) > 0.001) anyFingerLive = true;
        }
      }
      const ikSettling = stepSpring(this.ikWeightSpring, 0, deltaSeconds, IK_WEIGHT_STIFFNESS, IK_WEIGHT_DAMPING) > 0.001;
      if (!ikSettling) this.lastIkConfig = null;
      if (settled && !anyFingerLive && !ikSettling) return null; // fully relaxed — cheap no-op for the caller from here on
      // Still relaxing — fall through and report the (near-zero, shrinking) pose so the caller keeps blending it out smoothly instead of cutting it off.
    }

    const def = this.current ? GESTURE_DEFINITIONS[this.current] : null;
    const step = def ? def.steps[this.stepIndex] : null;
    const rawTarget = step ? this.mirrorPoseForModel(step.pose) : {};

    if (step?.oscillate) {
      const { axis, amplitudeRad, cyclesPerStep } = step.oscillate;
      this.oscillatePhaseRad += deltaSeconds * cyclesPerStep * Math.PI * 2 * (1000 / Math.max(1, this.stepHoldMs));
      const wiggle = Math.sin(this.oscillatePhaseRad) * amplitudeRad;
      (rawTarget as Record<string, number>)[axis] = ((rawTarget as Record<string, number>)[axis] ?? 0) + wiggle;
    } else {
      this.oscillatePhaseRad = 0;
    }

    const pose: GestureBonePose = {};
    for (const axis of BODY_AXES) {
      const s = this.bodySprings.get(axis)!;
      const target = (rawTarget as Record<string, number | undefined>)[axis] ?? 0;
      const value = stepSpring(s.spring, target, deltaSeconds, s.stiffness, s.damping);
      if (Math.abs(value) > 0.0005) (pose as Record<string, number>)[axis] = value;
    }

    const leftFingers = this.stepFingerHand(this.leftFingerSprings, step?.pose.leftFingers ?? RELAXED, deltaSeconds);
    const rightFingers = this.stepFingerHand(this.rightFingerSprings, step?.pose.rightFingers ?? RELAXED, deltaSeconds);

    // Advance the IK blend weight here (pure spring math, no bone I/O) so
    // its timing stays in lockstep with everything else this engine tracks
    // — but the ACTUAL bone read/write is deliberately NOT done in this
    // method. See applyArmIk()'s own doc comment for why.
    if (step?.ik) this.lastIkConfig = step.ik;
    if (this.current) {
      // The `!this.current` branch above already steps ikWeightSpring
      // toward 0 when idle/fading — stepping it again here would double-
      // advance it in the same frame.
      const ikWeightTarget = step?.ik ? 1 : 0;
      stepSpring(this.ikWeightSpring, ikWeightTarget, deltaSeconds, IK_WEIGHT_STIFFNESS, IK_WEIGHT_DAMPING);
    }

    return {
      pose,
      leftFingers,
      rightFingers,
      suggestedExpression: def?.suggestedExpression,
      suggestedExpressionIntensity: def?.suggestedExpressionIntensity,
    };
  }

  /**
   * 2-bone IK (see solveTwoBoneIK in avatar-arm-ik.ts) — only engages while
   * a step has requested it (currently salute's action/settle/hold; the
   * blend weight itself, advanced in update() above, eases it in/out over
   * time exactly like every other transition in this engine, never an
   * instant on/off).
   *
   * Deliberately a SEPARATE method from update(), called by AvatarCanvas
   * AFTER its own normal idle/approach()-driven writes to these same arm
   * bones for this frame (not before) — the IK solve needs to capture
   * THIS FRAME's fresh idle pose as its blend baseline, and if it ran
   * earlier (e.g. inside update(), which the caller must call BEFORE its
   * own bone writes so `pose`'s spring-driven fields are ready in time for
   * them), it would capture last frame's stale pose instead — and on the
   * following frame, keep capturing its OWN previous output as "idle,"
   * compounding rather than tracking idle's continuing motion. Calling it
   * late avoids that: idle writes first (as always, unconditionally — never
   * skipped, never suppressed for whichever arm IK is about to use), THEN
   * this captures that fresh write and overwrites it with the IK-blended
   * result — the same "idle/spring layer always writes, a specialized layer
   * captures-then-overwrites after" pattern avatar-animation-controller.ts
   * already established and had to fix twice to get right; reused
   * deliberately rather than re-inventing a new ordering here.
   *
   * Returns debug-only world-space points (target/pole/actual hand) for
   * ?avatarDebug=1 visualization, or null when no IK is currently blended in.
   */
  applyArmIk(ikBones: GestureIkBones | null): GestureIkDebug | null {
    const ikWeight = this.ikWeightSpring.value;
    if (!ikBones || !this.lastIkConfig || ikWeight <= 0.001) return null;

    const config = this.lastIkConfig;
    const side = config.side;
    const upperBone = side === "right" ? ikBones.rightUpperArm : ikBones.leftUpperArm;
    const lowerBone = side === "right" ? ikBones.rightLowerArm : ikBones.leftLowerArm;
    const handBone = side === "right" ? ikBones.rightHand : ikBones.leftHand;
    const lengths = this.getArmLengths(side, upperBone, lowerBone, handBone);

    computeHeadRelativeWorldPoint(ikBones.head, config.targetOffset, this.ikTargetScratch);
    computeHeadRelativeWorldPoint(ikBones.head, config.poleOffset, this.ikPoleScratch);

    // Capture idle's pose for these two bones BEFORE the IK solve overwrites
    // them, into DISTINCT scratch objects — the exact same self-reference
    // pitfall documented at length in avatar-animation-controller.ts
    // applies here too, so this mirrors that file's now-corrected pattern
    // deliberately.
    this.ikIdleUpperQuat.copy(upperBone.quaternion);
    this.ikIdleLowerQuat.copy(lowerBone.quaternion);

    solveTwoBoneIK(
      upperBone,
      lowerBone,
      lengths.upperChildAxis,
      lengths.lowerChildAxis,
      lengths.upperLength,
      lengths.lowerLength,
      this.ikTargetScratch,
      this.ikPoleScratch
    );

    this.ikResultUpperQuat.copy(upperBone.quaternion);
    this.ikResultLowerQuat.copy(lowerBone.quaternion);

    upperBone.quaternion.copy(this.ikIdleUpperQuat).slerp(this.ikResultUpperQuat, ikWeight);
    lowerBone.quaternion.copy(this.ikIdleLowerQuat).slerp(this.ikResultLowerQuat, ikWeight);
    upperBone.updateMatrixWorld(true);
    lowerBone.updateMatrixWorld(true);

    handBone.getWorldPosition(this.ikHandWorldScratch);
    return {
      targetWorld: this.ikTargetScratch.clone(),
      poleWorld: this.ikPoleScratch.clone(),
      handWorld: this.ikHandWorldScratch.clone(),
    };
  }

  private stepFingerHand(
    springs: Map<FingerBoneSuffix, { curl: AxisSpring; spread: AxisSpring }>,
    target: FingerPose,
    deltaSeconds: number
  ): FingerPose | null {
    const out: FingerPose = {};
    let anyNonZero = false;
    for (const suffix of FINGER_BONE_SUFFIXES) {
      const axes = springs.get(suffix)!;
      const t = target[suffix];
      const curl = stepSpring(axes.curl.spring, t?.curl ?? 0, deltaSeconds, axes.curl.stiffness, axes.curl.damping);
      const spread = stepSpring(axes.spread.spring, t?.spread ?? 0, deltaSeconds, axes.spread.stiffness, axes.spread.damping);
      if (Math.abs(curl) > 0.001 || Math.abs(spread) > 0.001) {
        out[suffix] = { curl, spread };
        anyNonZero = true;
      }
    }
    return anyNonZero ? out : null;
  }
}
