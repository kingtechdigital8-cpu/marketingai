"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, VRMLookAtBoneApplier, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { Loader2 } from "lucide-react";
import { findActiveViseme, type VisemeInterval, type VisemeShape, type Vowel } from "@/lib/tiktok-live-viseme";
import { sampleAmplitude, type AmplitudeEnvelope } from "@/lib/avatar-audio-amplitude";
import type { AvatarEmotion, AvatarGesture } from "@/lib/tiktok-live-avatar-motion";
import { gestureOverrideSlug } from "@/lib/tiktok-live-avatar-motion";
import { AvatarIdleEngine } from "@/lib/avatar-idle-engine";
import { AvatarGazeEngine, type GazeDebugState } from "@/lib/avatar-gaze-engine";
import { AvatarAnimationController, type AvatarAnimationDebugState } from "@/lib/avatar/avatar-animation-controller";
import { AVATAR_CLIP_NAMES, type AvatarClipName } from "@/lib/avatar/avatar-animation-registry";
import {
  AvatarGestureEngine,
  GESTURE_NAMES,
  type GestureName,
  type GestureFrame,
  type GestureIkBones,
  type GestureIkDebug,
  type FingerPose,
  type FingerBoneSuffix,
} from "@/lib/avatar-gesture-engine";
import { solveTwoBoneIK } from "@/lib/avatar-arm-ik";
import { AvatarSpeakingGestureEngine, type SpeakingGestureFrame } from "@/lib/avatar-speaking-gesture-engine";
import { applyKeyframePoseAtTime, type Keyframe, type KeyframePoseApplier } from "@/lib/avatar-keyframe-playback";
import { cn } from "@/lib/utils";

// VRM1.0 preset names — three-vrm already normalizes legacy VRM0.x letter
// names ("A"/"I"/"U"/"E"/"O") to these at load time, so this covers both
// generations. Still resolved defensively against the loaded model's own
// expressionMap below rather than assumed, in case a model registers custom
// (non-preset) names instead.
const VOWEL_TO_PRESET: Record<Vowel, string> = { a: "aa", i: "ih", u: "ou", e: "ee", o: "oh" };

// Opening snaps faster than closing — a real mouth hits a vowel shape
// quickly on onset, then eases off rather than closing at the same speed.
// Symmetric 26 (former single rate) is kept as the closing speed; opening is
// raised for a livelier reaction to shape changes.
const LIPSYNC_OPEN_RATE = 32;
const LIPSYNC_CLOSE_RATE = 22;
// `audio.currentTime` reports the media element's decode/read position, which
// browsers commonly keep slightly AHEAD of what's actually audible through
// speakers (output buffering in the audio pipeline) — without compensating
// for that, the mouth shape for "now" is queried and shown before that
// instant of audio is actually heard, reading as the mouth leading the
// sound. Querying the viseme timeline this far behind currentTime instead
// lines the visual up with what's actually audible. Empirical starting
// point, not measured against this specific setup — adjust if it still
// reads early/late once you can judge it by ear.
const LIPSYNC_LATENCY_COMPENSATION_SECONDS = 0.12;
// Full-strength (1.0) blend-shape weight read as an exaggerated, "over" mouth
// movement — halved to 0.5 per earlier feedback, then still "too over per
// vowel" per direct feedback on a real render — cut further to 0.32.
const BASE_MOUTH_INTENSITY = 0.32;
const BLINK_CLOSE_SECONDS = 0.08;
const BLINK_HOLD_SECONDS = 0.05;
const BLINK_OPEN_SECONDS = 0.12;

// Brings the arms down from the VRM's raw T-pose (rest pose, arms straight
// out to the sides) into a relaxed resting position — the idle engine (see
// AvatarIdleEngine) layers breathing/sway/secondary-motion on top of this
// baseline every frame. The gesture engine below temporarily overrides this
// per-arm while a gesture plays, then hands control back once it finishes.
// 1.42 (raised from 1.15 to close a visible arm-to-torso gap) read as too
// tight against the thighs per direct feedback on a real render — 1.30
// splits the difference: closer to the body than the original 1.15, but
// with clearance from the leg mesh again.
const ARM_DOWN_Z = 1.3; // radians — how far the upper arm drops from horizontal
const ELBOW_BEND_Z = 0.18; // slight natural elbow bend, not ramrod straight

// A flat, straight-fingered resting hand reads as stiff/plastic — a gentle
// per-joint curl (heavier on the middle "intermediate" joint, lighter on
// the thumb) reads as a naturally relaxed hand instead. Deliberately reuses
// armSignRef's already-calibrated sign rather than calibrating fingers
// separately: fingers are downstream in the same kinematic chain as the
// elbow, which already bends correctly with that same sign (see
// ELBOW_BEND_Z), so the rig's Z-axis convention should carry through.
// Roughly halved from an earlier pass — direct feedback on a real render
// called the previous values a "claw"/never-straight look, too deep for a
// relaxed hanging hand.
const FINGER_CURL_JOINTS: ReadonlyArray<{ bone: string; curl: number }> = [
  { bone: "ThumbProximal", curl: 0.06 },
  { bone: "ThumbDistal", curl: 0.07 },
  { bone: "IndexProximal", curl: 0.11 },
  { bone: "IndexIntermediate", curl: 0.15 },
  { bone: "IndexDistal", curl: 0.09 },
  { bone: "MiddleProximal", curl: 0.12 },
  { bone: "MiddleIntermediate", curl: 0.16 },
  { bone: "MiddleDistal", curl: 0.1 },
  { bone: "RingProximal", curl: 0.12 },
  { bone: "RingIntermediate", curl: 0.16 },
  { bone: "RingDistal", curl: 0.1 },
  { bone: "LittleProximal", curl: 0.13 },
  { bone: "LittleIntermediate", curl: 0.17 },
  { bone: "LittleDistal", curl: 0.11 },
];

// Slower/weightier than the mouth's approach rate — arms and head are much
// bigger, heavier-reading motions than a mouth shape, snapping them at the
// same speed would look twitchy rather than alive. Also used to blend
// between a gesture's pose and the idle engine's output so neither ever pops.
const BODY_APPROACH_RATE = 7;
// How fast "speaking/gesturing" dials the idle engine's amplitude down (see
// AvatarIdleEngine's activityLevel) and back up once it stops — tuned for a
// ~300-800ms settle, not an instant snap in either direction.
const ACTIVITY_SETTLE_RATE = 3.2;

// How long a Phase J one-shot custom animation's final pose takes to hand a
// touched bone back to idle once the clip finishes — see the releasingBonesRef
// block's own comment for why this exists (idle's own smoothing/spring state
// keeps silently converging toward its OWN target the entire time a bone is
// hard-overridden, since it's still computed every frame underneath, just
// clobbered; deleting the override outright therefore doesn't resume from
// where the visible bone actually was, it resumes from wherever that
// invisible state already drifted to — a hard snap in proportion to how far
// the clip's final pose differs from idle's equilibrium).
const CUSTOM_ANIMATION_RELEASE_SECONDS = 0.3;

// A reply's whole emotion+gesture classification is deliberately optional
// (see AVATAR_MOTION_RULE in tiktok-live-manager.ts) — most replies should
// stay neutral/gesture-less, this is occasional emphasis, not a performance
// on every line.
// Reaches full weight in ~0.2s — fast enough to read as a deliberate change
// rather than a slow fade a viewer might miss entirely, especially on
// realistic-style VRM models whose expression blend shapes are already
// visually subtle by nature (a slight, human-looking smile rather than an
// exaggerated anime one) — snappier timing is the one lever code has to make
// that subtlety still register as "something changed."
const EXPRESSION_APPROACH_RATE = 10;
// Most VRM emotion presets (happy especially) bake their own mouth/smile
// shape into the blend — running that at full strength AT THE SAME TIME as
// an active viseme shape additively stacks two different mouth deltas on
// top of each other (VRM blendshapes just sum), which is what read as the
// lower lip pushed too far forward while talking. Not "either shape is too
// strong alone" — it's the combination. Capped only while audio is actually
// audible; between replies the expression is free to read at full strength.
// 0.55 still read as too much per direct feedback — cut to 0.3.
const EXPRESSION_PEAK_WHILE_SPEAKING = 0.3;
// Only 6 of the 8 requested emotions have a dedicated standard VRM preset
// (happy/angry/sad/relaxed/surprised/neutral — confirmed against a real
// loaded model's own expressionMap during Phase 1). "excited" and
// "thinking"/"confused" have no dedicated preset in the VRM spec itself —
// approximated with the closest existing one rather than inventing a fake
// preset name a model will never actually have.
const EMOTION_TO_EXPRESSION: Record<AvatarEmotion, string> = {
  neutral: "neutral",
  happy: "happy",
  sad: "sad",
  angry: "angry",
  surprised: "surprised",
  excited: "happy",
  thinking: "relaxed",
  confused: "relaxed",
};
// The unique set of values from the map above — what actually gets
// resolved/blended each frame, not every AvatarEmotion key (several share a
// target). Exported for the VRM Animation Studio's Face panel (Phase
// Face) — every one of these always resolves to SOMETHING on any model
// (see EXPRESSION_FALLBACKS' own comment), so they're always safe to offer
// as a fixed list of preset buttons without a per-VRM availability check.
export const EXPRESSION_PRESET_NAMES = Array.from(new Set(Object.values(EMOTION_TO_EXPRESSION)));
// A model's own expressionMap doesn't necessarily implement every preset
// (confirmed directly: a real uploaded model here has no "surprised" blend
// shape at all) — without a fallback, an emotion that resolves to a missing
// preset silently blends toward nothing, reading as "the face did nothing."
// Each list is tried in order at load time; the first one the model actually
// has wins. Every list ends at a preset every VRM guarantees ("neutral"),
// so resolution always finds SOMETHING rather than leaving a gap.
const EXPRESSION_FALLBACKS: Partial<Record<string, string[]>> = {
  surprised: ["surprised", "happy", "neutral"],
  relaxed: ["relaxed", "happy", "neutral"],
  happy: ["happy", "neutral"],
  sad: ["sad", "neutral"],
  angry: ["angry", "neutral"],
};

// One-shot procedural animations, not mocap or authored keyframe clips. The
// first 7 (wave/welcome/excited/open_hand/thumbs_up/point/thinking) use ONLY
// the up/down swing axis already proven correct per-model by
// calibrateArmDownSign — that axis alone can't bring a hand to the head or
// chest center, though, so the 4 reach gestures below (scratch_head/salute/
// cover_mouth/palms_together) add a second, separately-calibrated axis (see
// calibrateArmReachSign) that swings the upper arm toward the head instead
// of side-to-side. nod/shake use calibrateHeadNodSign on the head bone.
const GESTURE_DURATION_SECONDS = 2.2;
const HEAD_GESTURE_DURATION_SECONDS = 1.6;
// How far the upper arm swings on the reach axis for a hand-to-head gesture
// vs. the shallower swing that's enough to bring both hands to chest center.
const ARM_REACH_TO_HEAD = 0.85;
const ARM_REACH_TO_CHEST = 0.55;

interface GesturePose {
  rightUpperArmZ?: number;
  leftUpperArmZ?: number;
  rightLowerArmZ?: number;
  leftLowerArmZ?: number;
  rightUpperArmX?: number;
  leftUpperArmX?: number;
  headX?: number;
  headY?: number;
}

/**
 * Target bone rotations at normalized progress t∈[0,1] through the gesture's
 * duration — NOT yet sign-adjusted per model (see armSignRef/headSignRef in
 * the caller) and NOT yet smoothed (the caller approaches these targets via
 * BODY_APPROACH_RATE same as idle, so starting/stopping never pops).
 * envelope rises over the first 20%, holds, eases back over the last 20% —
 * a plain linear snap-to-target would look mechanical for anything this size.
 */
function computeGesturePose(gesture: AvatarGesture, t: number): GesturePose {
  const envelope = t < 0.2 ? t / 0.2 : t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
  const raise = (target: number) => ARM_DOWN_Z - envelope * (ARM_DOWN_Z - target);

  switch (gesture) {
    case "wave": {
      const wiggle = Math.sin(t * Math.PI * 2 * 4) * 0.28 * envelope;
      return { rightUpperArmZ: raise(0.35), rightLowerArmZ: ELBOW_BEND_Z - envelope * 0.5 + wiggle };
    }
    case "welcome":
      return { rightUpperArmZ: raise(0.4), leftUpperArmZ: raise(0.4) };
    case "excited": {
      const bounce = Math.sin(t * Math.PI * 2 * 3) * 0.15 * envelope;
      return {
        rightUpperArmZ: raise(0.25) + bounce,
        leftUpperArmZ: raise(0.25) - bounce,
      };
    }
    case "open_hand":
      return { rightUpperArmZ: raise(0.5) };
    case "thumbs_up":
      return { rightUpperArmZ: raise(0.45), rightLowerArmZ: ELBOW_BEND_Z - envelope * 0.7 };
    case "point":
      return { rightUpperArmZ: raise(0.3) };
    case "thinking":
      return { rightUpperArmZ: raise(0.25), rightLowerArmZ: ELBOW_BEND_Z - envelope * 1.0, headY: envelope * 0.15 };
    case "nod":
      return { headX: Math.sin(t * Math.PI * 2 * 2) * 0.22 * envelope };
    case "shake":
      return { headY: Math.sin(t * Math.PI * 2 * 2) * 0.28 * envelope };
    case "scratch_head": {
      const scratch = Math.sin(t * Math.PI * 2 * 5) * 0.1 * envelope;
      return {
        rightUpperArmZ: raise(-0.15),
        rightUpperArmX: envelope * ARM_REACH_TO_HEAD,
        rightLowerArmZ: ELBOW_BEND_Z - envelope * 1.35 + scratch,
      };
    }
    case "salute":
      return {
        rightUpperArmZ: raise(0.1),
        rightUpperArmX: envelope * ARM_REACH_TO_HEAD,
        rightLowerArmZ: ELBOW_BEND_Z - envelope * 1.3,
      };
    case "cover_mouth":
      return {
        rightUpperArmZ: raise(0.3),
        rightUpperArmX: envelope * ARM_REACH_TO_HEAD,
        rightLowerArmZ: ELBOW_BEND_Z - envelope * 1.4,
      };
    case "palms_together":
      return {
        rightUpperArmZ: raise(0.55),
        leftUpperArmZ: raise(0.55),
        rightUpperArmX: envelope * ARM_REACH_TO_CHEST,
        leftUpperArmX: envelope * ARM_REACH_TO_CHEST,
        rightLowerArmZ: ELBOW_BEND_Z - envelope * 1.1,
        leftLowerArmZ: ELBOW_BEND_Z - envelope * 1.1,
      };
    case "none":
    default:
      return {};
  }
}

/**
 * The VRM normalized bone frame doesn't guarantee the same local-axis sign
 * for "rotate this arm down" across every model/rig — confirmed empirically:
 * a fixed sign that correctly lowered one model's arms sent a different
 * model's arms straight up instead. Calibrated once per loaded model rather
 * than assumed: nudge the bone a small amount, check whether a downstream
 * point (the hand) actually moved down in world space, and flip the sign if
 * it moved up instead.
 */
function calibrateArmDownSign(bone: THREE.Object3D, handBone: THREE.Object3D): 1 | -1 {
  const before = new THREE.Vector3();
  handBone.getWorldPosition(before);
  const probeAngle = 0.3;
  bone.rotateZ(probeAngle);
  bone.updateMatrixWorld(true);
  const after = new THREE.Vector3();
  handBone.getWorldPosition(after);
  bone.rotateZ(-probeAngle);
  bone.updateMatrixWorld(true);
  return after.y < before.y ? 1 : -1;
}

/**
 * calibrateArmDownSign's up/down swing axis can't bring a hand to the head
 * or chest — it only sweeps side-to-side in that one plane. This calibrates
 * a SECOND, independent axis for that reach — but unlike calibrateArmDownSign
 * (which only needs to pick a SIGN, since the "up/down" axis is a known
 * given), there's no guarantee upfront which local axis a given VRM rig
 * actually uses for "swing toward the body's center/front": empirically, X
 * on one axis assumption produced arms swinging further OUT to the sides
 * instead of in — the opposite of what "palms together at the chest" needs.
 * So this probes BOTH X and Y, each sign, and keeps whichever single
 * axis+sign combination brings the hand CLOSEST to the head bone (measured
 * as straight-line world distance) — the thing that actually matters, not
 * an assumed direction. Reused at a shallower angle for "palms_together"
 * (hands toward chest center) since it's the same reach motion, just not
 * carried as far.
 */
function calibrateArmReachAxis(
  bone: THREE.Object3D,
  handBone: THREE.Object3D,
  headBone: THREE.Object3D
): { axis: "x" | "y"; sign: 1 | -1 } {
  const headPos = new THREE.Vector3();
  headBone.getWorldPosition(headPos);

  // Critical: this must use the SAME mechanism the gestures actually use at
  // runtime — direct Euler component assignment (bone.rotation.set(x,y,z)),
  // NOT bone.rotateX()/rotateY() incremental local rotations. Those two
  // don't compose equivalently once more than one axis is involved (Euler
  // XYZ composes intrinsically; rotateX() etc. right-multiply the CURRENT
  // quaternion, a different operation), and confirmed empirically: a probe
  // done via rotateX()/rotateY() from the bone's bare T-pose rest picked an
  // axis/sign that reliably reduced hand-to-head distance in isolation, but
  // the SAME axis/sign combined with the real Z raise these gestures
  // actually hold (via direct assignment, same as here) did the opposite —
  // left the hand no closer than idle. Calibrating with rotation.set() at a
  // representative Z, exactly like the real runtime state, is what makes
  // the measurement match what actually gets rendered.
  const testZ = 0.15; // representative of the various raise() targets these gestures hold (-0.15 to 0.55)
  const testAngle = 0.7;

  function measureAt(x: number, y: number): number {
    bone.rotation.set(x, y, testZ);
    bone.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    handBone.getWorldPosition(pos);
    return pos.distanceTo(headPos);
  }

  const restDistance = measureAt(0, 0);
  const candidates: Array<{ axis: "x" | "y"; sign: 1 | -1; dist: number }> = [
    { axis: "x", sign: 1, dist: measureAt(testAngle, 0) },
    { axis: "x", sign: -1, dist: measureAt(-testAngle, 0) },
    { axis: "y", sign: 1, dist: measureAt(0, testAngle) },
    { axis: "y", sign: -1, dist: measureAt(0, -testAngle) },
  ];
  bone.rotation.set(0, 0, 0);
  bone.updateMatrixWorld(true);

  const best = candidates.reduce((a, b) => (b.dist < a.dist ? b : a));
  // If literally nothing brings the hand closer (shouldn't happen for a
  // normal humanoid rig), fall back to X+ rather than picking a direction
  // that actively makes things worse.
  return best.dist < restDistance ? { axis: best.axis, sign: best.sign } : { axis: "x", sign: 1 };
}

/**
 * Same calibration principle as calibrateArmDownSign, applied to the head's
 * pitch axis for the "nod" gesture — checks whether a small rotation moves
 * the eye bones DOWN in world space (a forward nod should lower the face),
 * flips the sign otherwise. "shake" (yaw) deliberately has no equivalent:
 * it's a symmetric left-right-left-right oscillation, so either starting
 * sign produces the same motion — nothing to get wrong.
 */
function calibrateHeadNodSign(headBone: THREE.Object3D, eyeBone: THREE.Object3D): 1 | -1 {
  const before = new THREE.Vector3();
  eyeBone.getWorldPosition(before);
  const probeAngle = 0.3;
  headBone.rotateX(probeAngle);
  headBone.updateMatrixWorld(true);
  const after = new THREE.Vector3();
  eyeBone.getWorldPosition(after);
  headBone.rotateX(-probeAngle);
  headBone.updateMatrixWorld(true);
  return after.y < before.y ? 1 : -1;
}

interface BlinkPhase {
  stage: "idle" | "closing" | "holding" | "opening";
  t: number;
  nextAt: number;
}

/** ?avatarDebug=1 only — mutated in place every frame inside useFrame (never setState there, see the "no setState per frame" rule), read by AvatarCanvas's own setInterval-based debug poll. "unavailable" covers both "not loaded yet" and "this VRM has no compatible lookAt" (see AvatarCanvas's load effect). */
interface AvatarLiveDebugSnapshot {
  gazeState: GazeDebugState["state"] | "unavailable";
  gazeNextEventInSeconds: number;
  gazeYawDeg: number;
  gazePitchDeg: number;
  blinkStage: BlinkPhase["stage"];
  isSpeaking: boolean;
  /** Non-null only while a gesture's 2-bone IK is actively blended in (see avatar-arm-ik.ts) — drives the debug target/pole/hand spheres (?avatarDebug=1 only, see the sphere-repositioning block in useFrame). */
  ikDebug: GestureIkDebug | null;
}

// Bones exposed to the Phase B manual pose editor (VRM Animation Studio,
// /admin/avatar-animation) — body/limbs only. Finger joints get their own
// dedicated UI in a later phase (fingers need curl/spread presets, not a
// generic 3-axis rotation slider) rather than being lumped into this list.
// Filtered per-VRM at load time via getAvailableBones() to whichever of
// these the loaded model actually has — never assumed present.
const EDITOR_BONE_NAMES: VRMHumanBoneName[] = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  // Eyeballs — filtered out for most VRM models (they typically drive gaze
  // via blend shapes or have no separate eye bones at all), included here
  // for the ones that do. See the useFrame loop's own comment, right after
  // vrm.update(), for why these two specifically need a second write pass
  // that the other bones above don't.
  "leftEye",
  "rightEye",
];

/**
 * Phase B editor-only surface (VRM Animation Studio) — manual per-bone pose
 * overrides, completely separate from the live TikTok runtime's idle/
 * gesture/animation systems. Overrides are applied LAST in useFrame, after
 * everything else (idle/gestures/Mixamo clips/gaze-follow), so idle keeps
 * computing and every other bone keeps moving completely normally
 * underneath — this only ever wins the final word on whichever specific
 * bones the editor is actively posing, never disables anything else. Always
 * empty during normal TikTok Live playback (AvatarOverlayPlayer never calls
 * any of these), so this can't affect the live runtime even in principle.
 */
export interface AvatarBoneEditorApi {
  getAvailableBones: () => VRMHumanBoneName[];
  getBoneRotation: (boneName: VRMHumanBoneName) => { x: number; y: number; z: number } | null;
  setBoneOverride: (boneName: VRMHumanBoneName, x: number, y: number, z: number) => void;
  clearBoneOverride: (boneName: VRMHumanBoneName) => void;
  clearAllBoneOverrides: () => void;
  /** Current WORLD-space position of a bone — for initializing an IK gizmo's starting position (e.g. the hand target starts at the hand's current position). Null if the bone doesn't exist on this VRM. */
  getBoneWorldPosition: (boneName: VRMHumanBoneName) => { x: number; y: number; z: number } | null;
  /**
   * Phase C: 2-bone IK (see avatar-arm-ik.ts's solveTwoBoneIK, the exact
   * same solver + roll-constraint already proven correct fixing the
   * runtime salute gesture) for one hand — upperArm+lowerArm follow
   * `targetWorld` (the hand's destination) automatically, biased toward
   * `poleWorld` for which way the elbow bends. Applied at FULL strength
   * every frame (no blend weight — this is direct manual posing in the
   * editor, not an animated transition) until clearHandIkTarget() is
   * called. Automatically clears any Phase B manual rotation override on
   * that same arm's upperArm/lowerArm the moment IK activates for that
   * side, so the two mechanisms never fight over the same bones.
   */
  setHandIkTarget: (side: "left" | "right", targetWorld: { x: number; y: number; z: number }, poleWorld: { x: number; y: number; z: number }) => void;
  clearHandIkTarget: (side: "left" | "right") => void;
  isHandIkActive: (side: "left" | "right") => boolean;
  /**
   * Phase D: full-strength manual finger pose for one hand — same
   * curl(=rotation.z)/spread(=rotation.y) convention and the same
   * armSignRef-calibrated per-model sign the live runtime's own
   * FINGER_CURL_JOINTS loop already applies for idle/gestures (see
   * avatar-finger-presets.ts), so a pose authored here looks identical to
   * how it will look once played back at runtime later (Phase J). Omitted
   * joints in `pose` fall back to 0 (straight), not the idle baseline —
   * this is a full override, not a blend, same as setBoneOverride.
   */
  setFingerPose: (side: "left" | "right", pose: FingerPose) => void;
  clearFingerPose: (side: "left" | "right") => void;
  isFingerPoseActive: (side: "left" | "right") => boolean;
  /**
   * Phase Face: full-strength manual facial expression override — a map of
   * EVERY posed blend-shape name (any name the loaded model's own
   * expressionMap has — see getAvailableFaceExpressions, not just the 6
   * emotion presets) to its weight (0-1), all independently controllable
   * and simultaneously active. `null`/`{}` clears the override entirely,
   * handing facial control back to the live runtime's AI-emotion system
   * (only relevant on the live runtime; the Studio never has that system
   * running). A name omitted from a non-null map is driven to 0.
   */
  setFaceOverrides: (overrides: Record<string, number> | null) => void;
  isFaceExpressionActive: () => boolean;
  /** Every blend-shape name this loaded model's expressionManager actually has — the Studio's Face panel builds its controls from this instead of a fixed list, since a model's custom names (eyebrows, eye squint, etc.) can't be known ahead of time. Empty until a VRM has finished loading. */
  getAvailableFaceExpressions: () => string[];
}

interface AvatarModelProps {
  vrmUrl: string;
  audioRef: RefObject<HTMLAudioElement | null>;
  visemeDataRef: RefObject<VisemeInterval[] | null>;
  /** Optional real-loudness envelope for the currently playing reply (see avatar-audio-amplitude.ts) — scales how OPEN the viseme-driven mouth shape is; null/no data degrades to the previous fixed-intensity behavior. */
  amplitudeEnvelopeRef: RefObject<AmplitudeEnvelope | null>;
  emotionRef: RefObject<AvatarEmotion | null>;
  gestureRef: RefObject<AvatarGesture | null>;
  gestureKeyRef: RefObject<string | null>;
  onReady: () => void;
  onError: (message: string) => void;
  /** 0-100, or null once loading finishes (success or error) — some hosts (e.g. a browser's cache-disabled dev tools) never report a usable total, so this can stay null the whole time even mid-download; that's expected, not a bug. */
  onProgress: (percent: number | null) => void;
  /** Fired once, right when the interaction-animation controller for the freshly-loaded VRM is constructed — see AvatarCanvas's useImperativeHandle for why the outer component needs this rather than owning the controller itself. */
  onControllerReady: (controller: AvatarAnimationController | null) => void;
  /** Same bridging pattern as onControllerReady, for the 20-gesture procedural engine. */
  onGestureEngineReady: (engine: AvatarGestureEngine | null) => void;
  /** Same bridging pattern as onControllerReady, for the Phase B manual pose editor (see AvatarBoneEditorApi) — only ever populated for the VRM Animation Studio page, unused by the live TikTok runtime. */
  onBoneEditorReady: (api: AvatarBoneEditorApi | null) => void;
  /** Fired once on mount with a stable ref object AvatarModel mutates every frame (never setState) — see AvatarLiveDebugSnapshot. Only ever read from AvatarCanvas's existing setInterval-based debug poll, never per-frame. */
  onDebugRefReady: (ref: RefObject<AvatarLiveDebugSnapshot>) => void;
  /** Fired once, right after the one-time "medium shot" auto-framing below sets the camera's position/lookAt target. The live runtime never reads this (nothing else repositions the camera afterward), but an editor that mounts its own OrbitControls (VRM Animation Studio, Phase C) needs this exact Y to hand OrbitControls as its `target` — otherwise OrbitControls' own default target of (0,0,0) wins on the next orbit interaction and silently reframes the shot down at the model's feet. */
  onCameraFramed?: (target: { x: number; y: number; z: number }, distance: number) => void;
  /** Fired once on mount (not gated behind VRM load — see AvatarCustomAnimationApi's own doc comment for why this one, unlike onBoneEditorReady, is meant to work on the live runtime too). */
  onCustomAnimationApiReady: (api: AvatarCustomAnimationApi) => void;
}

function AvatarModel({
  vrmUrl,
  audioRef,
  visemeDataRef,
  amplitudeEnvelopeRef,
  emotionRef,
  gestureRef,
  gestureKeyRef,
  onReady,
  onError,
  onProgress,
  onControllerReady,
  onGestureEngineReady,
  onBoneEditorReady,
  onDebugRefReady,
  onCameraFramed,
  onCustomAnimationApiReady,
}: AvatarModelProps) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  // Phase B (VRM Animation Studio) manual pose overrides — see
  // AvatarBoneEditorApi. Always empty during normal TikTok Live playback.
  const boneOverridesRef = useRef<Map<VRMHumanBoneName, { x: number; y: number; z: number }>>(new Map());
  // Bones a Phase J one-shot custom animation just finished touching, mid
  // hand-back to idle — see CUSTOM_ANIMATION_RELEASE_SECONDS' own comment.
  // Populated only at one-shot completion (never by Phase B/C/D, which want
  // instant, no-lag posing), drained automatically as each bone's release
  // blend reaches t=1.
  const releasingBonesRef = useRef<Map<VRMHumanBoneName, { from: { x: number; y: number; z: number }; startedAt: number }>>(new Map());
  // Scratch quaternion/Euler objects for releasingBonesRef's slerp, reused
  // across frames rather than allocated per-frame — THREE separate instances
  // specifically to avoid the self-referencing-slerp bug this project has
  // already hit twice elsewhere (`.slerp()` mutates its receiver, so the
  // receiver must never be the same object as either input). Per-instance
  // (useRef, not module-level) since more than one AvatarCanvas can be
  // mounted at once (e.g. the Studio's own preview alongside a dashboard
  // overlay preview) and slerp mutation would otherwise race between them.
  const releaseScratchQuatARef = useRef(new THREE.Quaternion());
  const releaseScratchQuatBRef = useRef(new THREE.Quaternion());
  const releaseScratchQuatResultRef = useRef(new THREE.Quaternion());
  const releaseScratchEulerRef = useRef(new THREE.Euler());
  // Slerps toward wherever idle/gesture ALREADY put this bone THIS frame
  // (not a fixed pose) — see the releasingBonesRef application block below
  // for why `b` must be read fresh every call, right before this runs.
  function slerpReleaseRotation(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, t: number) {
    releaseScratchEulerRef.current.set(a.x, a.y, a.z, "XYZ");
    releaseScratchQuatARef.current.setFromEuler(releaseScratchEulerRef.current);
    releaseScratchEulerRef.current.set(b.x, b.y, b.z, "XYZ");
    releaseScratchQuatBRef.current.setFromEuler(releaseScratchEulerRef.current);
    releaseScratchQuatResultRef.current.copy(releaseScratchQuatARef.current).slerp(releaseScratchQuatBRef.current, t);
    releaseScratchEulerRef.current.setFromQuaternion(releaseScratchQuatResultRef.current, "XYZ");
    return { x: releaseScratchEulerRef.current.x, y: releaseScratchEulerRef.current.y, z: releaseScratchEulerRef.current.z };
  }
  // Phase C (VRM Animation Studio) hand IK targets — see AvatarBoneEditorApi.
  // Always empty during normal TikTok Live playback.
  const handIkRef = useRef<Map<"left" | "right", { target: THREE.Vector3; pole: THREE.Vector3 }>>(new Map());
  // Phase D (VRM Animation Studio) manual finger pose overrides — see
  // AvatarBoneEditorApi.setFingerPose. Always empty during normal TikTok
  // Live playback; a present entry (even `{}`) fully replaces that side's
  // idle/gesture finger curl+spread for this frame, same "full strength, no
  // blend weight" behavior as boneOverridesRef/handIkRef above.
  const fingerOverridesRef = useRef<Map<"left" | "right", FingerPose>>(new Map());
  // Phase Face (VRM Animation Studio) manual expression override — see
  // AvatarBoneEditorApi.setFaceOverrides. Always null during normal TikTok
  // Live playback (falls back to the AI-emotion system then); when set,
  // it's the WHOLE desired facial state for this frame (every blend-shape
  // name the model has, defaulting to 0 if absent from the map) — same
  // full-override priority as the other Studio-only refs above.
  const faceExpressionOverrideRef = useRef<Record<string, number> | null>(null);
  // Phase J runtime custom-animation playback — see AvatarCustomAnimationApi.
  // Unlike the Studio-only refs above, this is NOT always empty on the live
  // runtime: it's the mechanism a future trigger would use to play a saved
  // clip during an actual TikTok Live stream. `time` is this clip's own
  // playhead in seconds, advanced every frame in useFrame while `playing`.
  const customAnimationRef = useRef<{ keyframes: Keyframe[]; time: number; loop: boolean; playing: boolean } | null>(null);
  // useRef's initial-value argument is only ever actually stored on the
  // FIRST render (every render after that just discards this fresh object
  // literal) — the standard way to seed a ref with something once without
  // the "conditionally read/write .current during render" pattern the
  // project's lint config flags as an error. Its closures only ever
  // reference the stable refs above, so there's nothing that would need
  // recomputing on a later render anyway.
  //
  // setFaceOverrides writes into the SAME faceExpressionOverrideRef slot the
  // Phase B/C Studio editor already uses (see boneEditorApi's own
  // setFaceOverrides below) — the AI-emotion blend (see the frame loop)
  // already treats that slot as strictly higher priority than the AI's
  // classified emotion, exactly like every other override in this file
  // (bones/fingers), so this isn't a new conflict — a saved gesture's
  // baked-in expression (if any) wins outright while it's actively playing,
  // same as its pose does, then hands back to AI emotion the instant the
  // clip finishes (see finishedOneShot below) — no special release blend
  // needed here unlike bones, since the expression blend above already
  // smooths toward whatever the current target is every frame regardless.
  const runtimeApplierRef = useRef<KeyframePoseApplier>({
    // boneOverridesRef is exclusively Phase J's on the live runtime (Phase B
    // manual editing never runs there — see this ref's own declaration
    // comment), so clearing it fresh every applyInterpolatedKeyframePose
    // call (every frame during playback) can't collide with anything else.
    clearAllBoneOverrides: () => boneOverridesRef.current.clear(),
    setBoneOverride: (bone, x, y, z) => boneOverridesRef.current.set(bone, { x, y, z }),
    setFingerPose: (side, pose) => fingerOverridesRef.current.set(side, pose),
    clearFingerPose: (side) => fingerOverridesRef.current.delete(side),
    setFaceOverrides: (overrides) => {
      faceExpressionOverrideRef.current = overrides;
    },
  });
  const mouthExpressionsRef = useRef<Partial<Record<Vowel, string>>>({});
  const blinkNameRef = useRef<string | null>(null);
  const blinkPhaseRef = useRef<BlinkPhase>({ stage: "idle", t: 0, nextAt: 2.5 });
  const armSignRef = useRef<{ left: 1 | -1; right: 1 | -1 }>({ left: 1, right: -1 });
  const armReachRef = useRef<{
    left: { axis: "x" | "y"; sign: 1 | -1 };
    right: { axis: "x" | "y"; sign: 1 | -1 };
  }>({ left: { axis: "x", sign: 1 }, right: { axis: "x", sign: 1 } });
  const headNodSignRef = useRef<1 | -1>(1);
  // Which of the model's own expression names correspond to each logical
  // preset in EXPRESSION_PRESET_NAMES — resolved defensively at load time,
  // same reasoning as mouthExpressionsRef (a model's expressionMap is the
  // source of truth, never assumed).
  const faceExpressionsRef = useRef<Partial<Record<string, string>>>({});
  // Deduplicated resolved morph names from faceExpressionsRef — several
  // presets can fall back to the same underlying name (see
  // EXPRESSION_FALLBACKS), so the per-frame blend loop iterates this instead
  // of iterating presets directly.
  const faceExpressionUniqueNamesRef = useRef<string[]>([]);
  // EVERY blend-shape name the loaded model's expressionManager actually
  // has (raw expressionMap keys, not just the resolved emotion-preset
  // subset above) — what a Phase Face manual override (faceExpressionOverrideRef)
  // gets applied against every frame, so a custom eyebrow/eye/mouth name
  // this specific model happens to define is just as controllable as the
  // 6 standard emotion presets. Also what the Studio's Face panel reads via
  // getAvailableFaceExpressions() to build its controls.
  const allExpressionNamesRef = useRef<string[]>([]);
  // Which preset is currently being blended toward — cleared back to
  // "neutral" once the reply that set it stops playing, so an emotion never
  // gets stuck on the avatar after the line that prompted it ends.
  const currentEmotionTargetRef = useRef<string>("neutral");
  // Identifies which reply's gesture is "current" — compared against
  // gestureKeyRef each frame so a NEW reply (even with the identical gesture
  // name as the previous one) still retriggers playback, and a repeated
  // prop value alone never does.
  const lastGestureKeyRef = useRef<string | null>(null);
  const activeGestureRef = useRef<{ name: AvatarGesture; startedAt: number; isHeadGesture: boolean } | null>(null);
  // Whether the current reply's audio has been confirmed playing at least
  // once — see the emotion-decay logic in useFrame for why this matters.
  const hasBeenAudibleRef = useRef(false);

  // Procedural idle body motion (pelvis/spine/shoulders/arms/legs) — one
  // instance per loaded model, created at load time below, driven every
  // frame from useFrame. See avatar-idle-engine.ts.
  const idleEngineRef = useRef<AvatarIdleEngine | null>(null);
  // Smoothed 0 (fully idle) → 1 (speaking/gesturing) signal fed into the
  // engine so idle amplitude dials down without a hard cut — see
  // ACTIVITY_SETTLE_RATE.
  const activityLevelRef = useRef(0);
  // Per-axis smoothing state for the `approach()` helper below, keyed by a
  // caller-chosen string (e.g. "leftUpperArm.z") — see that helper's comment
  // for why this can no longer read the live bone rotation as its "current"
  // value.
  const idleApproachStateRef = useRef<Record<string, number>>({});

  // Mixamo-retargeted interaction animations (bow/clapping/excited/greeting/
  // salute/victory/waving) — separate layer from idle/lip-sync/blink above,
  // see avatar-animation-controller.ts for how it blends with them.
  const animationControllerRef = useRef<AvatarAnimationController | null>(null);

  // 20 procedural, client-side gesture vocabulary (wave/greeting/salute/
  // point_camera/no_no/heart_hands/thank_you/shh/stop/point_left/
  // point_right/thumbs_up/thinking/cute/excited/happy/laugh/sad/
  // angry_hands_on_hips/welcome) — a NEW, separate layer from the OLDER
  // computeGesturePose system below (still used unchanged for its own 14
  // AvatarGesture names) and from the Mixamo AnimationController above (no
  // FBX/external files here at all). See avatar-gesture-engine.ts.
  const gestureEngineRef = useRef<AvatarGestureEngine | null>(null);

  // "professional_presenter_hands" — continuous, looping speaking-idle layer
  // (REST -> hands together -> open -> return), active only while the
  // avatar is audible, fading in/out via its own internal weight spring.
  // Separate from gestureEngineRef above (one-shot reactions) and
  // idleEngineRef (always-on baseline) — see avatar-speaking-gesture-engine.ts.
  const speakingGestureEngineRef = useRef<AvatarSpeakingGestureEngine | null>(null);

  // Eye-gaze micro-behavior (see avatar-gaze-engine.ts) — layered on top of
  // vrm.lookAt, not a replacement for it. Only ever constructed when the
  // loaded VRM actually has a usable vrm.lookAt (checked once at load time
  // below) — stays null otherwise, and every read of it below is optional-
  // chained, so a VRM without compatible lookAt just quietly skips gaze
  // entirely while every other system keeps working (per explicit "fail
  // gracefully" requirement).
  const gazeEngineRef = useRef<AvatarGazeEngine | null>(null);
  // The object vrm.lookAt.target actually points at — a child of the R3F
  // camera (not the VRM scene), repositioned every frame from the gaze
  // engine's output. Parenting to the camera (rather than placing it in
  // world space once) means "look at the viewer" stays correct for free
  // even if the camera were ever repositioned later.
  const gazeTargetRef = useRef<THREE.Object3D | null>(null);
  // Camera-to-avatar distance, captured once from the same framing math that
  // already positions the camera at load time — needed to convert the gaze
  // engine's yaw/pitch angles into a local (x,y) offset on gazeTargetRef.
  // 1.5 is a reasonable fallback if the framing block below is ever skipped
  // (e.g. an empty/zero-size bounding box) — never left at 0, which would
  // make every glance angle collapse to a zero offset.
  const cameraDistanceRef = useRef(1.5);
  // ?avatarDebug=1 only — 3 small spheres visualizing the current IK solve
  // (see avatar-arm-ik.ts): red = forehead/temple target, blue = elbow-pole
  // bias, green = the arm's actual resulting hand position. Created once at
  // load time (only when debug is on), added as children of vrm.scene so a
  // world-space point can be placed on them via worldToLocal() regardless of
  // any transform on the group/scene root, repositioned every frame in
  // useFrame, hidden (never destroyed) whenever no IK is active that frame.
  const ikDebugSpheresRef = useRef<{ target: THREE.Mesh; pole: THREE.Mesh; hand: THREE.Mesh } | null>(null);
  // Mutated in place every frame below (never setState inside useFrame) —
  // bridged up once via onDebugRefReady so AvatarCanvas's existing
  // setInterval-based debug poll can read it. ?avatarDebug=1 only.
  const liveDebugRef = useRef<AvatarLiveDebugSnapshot>({
    gazeState: "unavailable",
    gazeNextEventInSeconds: 0,
    gazeYawDeg: 0,
    gazePitchDeg: 0,
    blinkStage: "idle",
    isSpeaking: false,
    ikDebug: null,
  });
  useEffect(() => {
    onDebugRefReady(liveDebugRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDebugRefReady is stable enough here; the ref object itself never changes identity
  }, []);

  // Phase J — constructed once at mount, NOT gated behind VRM load (unlike
  // onBoneEditorReady): play()/stop() only ever touch customAnimationRef,
  // which needs no VRM-specific data to exist, and the live TikTok runtime
  // (AvatarOverlayPlayer) needs this available immediately, not only once a
  // model happens to finish loading.
  useEffect(() => {
    const api: AvatarCustomAnimationApi = {
      play: (keyframes, options) => {
        customAnimationRef.current = {
          keyframes: [...keyframes].sort((a, b) => a.time - b.time),
          time: 0,
          loop: options?.loop ?? false,
          playing: true,
        };
      },
      stop: () => {
        customAnimationRef.current = null;
      },
      isPlaying: () => customAnimationRef.current?.playing ?? false,
    };
    onCustomAnimationApiReady(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCustomAnimationApiReady is stable enough here; only ever called once at mount
  }, []);

  // Randomizing the first blink delay outside render — the linter rightly
  // rejects Math.random() during render since idempotency matters when React
  // Compiler is involved, even though this specific value only ever mattered once.
  useEffect(() => {
    blinkPhaseRef.current.nextAt = 2.5 + Math.random() * 4; // 2.5-6.5s, per spec
  }, []);
  const clockRef = useRef(0);
  // `!audio.paused` alone isn't a strong enough "audio is actually audible
  // right now" signal — it flips true synchronously the instant .play() is
  // called, even while the file is still downloading/buffering from R2 with
  // nothing audible yet. The `playing` event is the browser's own signal for
  // "playback has genuinely resumed after buffering" — anchor to that
  // instead, and drop back to false on `waiting` (rebuffering mid-playback)
  // so a stall doesn't leave the mouth animating to a paused soundtrack.
  const isAudibleRef = useRef(false);
  // Tracks which <audio> element has already been wired (event listeners +
  // Web Audio graph) — deliberately NOT a useEffect keyed on audioRef: that
  // ref object's identity never changes, so such an effect only ever runs
  // once, and if the <audio> DOM element hasn't mounted yet at that exact
  // instant (R2F's Canvas and the plain <audio> sibling mount through
  // separate paths with no ordering guarantee between them), it silently
  // wires nothing, forever — the mouth would just never move. Checking
  // inside useFrame instead guarantees this runs again every frame until
  // the element genuinely exists, at which point it wires exactly once.
  const wiredAudioElRef = useRef<HTMLAudioElement | null>(null);

  function wireAudioElement(audio: HTMLAudioElement) {
    const setAudible = () => {
      isAudibleRef.current = true;
    };
    const setNotAudible = () => {
      isAudibleRef.current = false;
    };
    audio.addEventListener("playing", setAudible);
    audio.addEventListener("waiting", setNotAudible);
    audio.addEventListener("pause", setNotAudible);
    audio.addEventListener("ended", setNotAudible);

    // No Web Audio analyser here anymore — deliberately. It was only ever a
    // secondary RMS intensity modulator, but routing a cross-origin <audio>
    // element (the reply file, served from R2/the CDN, not this origin)
    // through createMediaElementSource() without CORS headers doesn't just
    // fail to analyze it: the browser SILENTLY ZEROES every sample flowing
    // through that entire graph, including the connection to speakers —
    // "MediaElementAudioSource outputs zeroes due to CORS access
    // restrictions" (confirmed directly from a real browser console). That
    // takes down real, audible playback, not just the analyser — a
    // secondary enhancement is never worth that risk. Plain audio.play() on
    // the element is completely unaffected by any of this and always
    // produces real sound regardless of CORS, which is exactly why removing
    // this entirely is the fix, not a proxy or a crossOrigin workaround.
  }

  useEffect(() => {
    let cancelled = false;
    onProgress(0);
    const group = groupRef.current;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      vrmUrl,
      (gltf) => {
        if (cancelled) return;
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          onProgress(null);
          onError("File VRM tidak valid atau tidak didukung.");
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.rotateVRM0(vrm); // no-op unless this is a legacy VRM0.x export (those face backwards otherwise)
        vrm.scene.traverse((obj) => {
          // A skinned/morphed mesh's auto-computed bounding box can be wrong
          // enough to cull the whole character out of view; there's only one
          // character on screen, so the perf trade-off doesn't matter here.
          obj.frustumCulled = false;
        });

        const expressionMap = vrm.expressionManager?.expressionMap ?? {};
        const expressionNames = Object.keys(expressionMap);
        const mouthNames: Partial<Record<Vowel, string>> = {};
        (Object.keys(VOWEL_TO_PRESET) as Vowel[]).forEach((vowel) => {
          const preset = VOWEL_TO_PRESET[vowel];
          if (expressionMap[preset]) {
            mouthNames[vowel] = preset;
            return;
          }
          const fallback = expressionNames.find((n) => n.toLowerCase() === vowel || n.toLowerCase() === preset);
          if (fallback) mouthNames[vowel] = fallback;
        });
        mouthExpressionsRef.current = mouthNames;
        blinkNameRef.current = expressionMap["blink"]
          ? "blink"
          : expressionNames.find((n) => n.toLowerCase() === "blink") ?? null;

        // Same defensive-resolution pattern as mouth/blink above — never
        // assume a model registers "happy"/"sad"/etc. under exactly those
        // names, even though they're standard VRM1.0 presets. Beyond that,
        // walk EXPRESSION_FALLBACKS so a preset this specific model simply
        // doesn't implement (confirmed for real: some uploaded models have
        // no "surprised" blend shape at all) still resolves to the closest
        // one the model actually has, instead of blending toward nothing.
        const faceNames: Partial<Record<string, string>> = {};
        EXPRESSION_PRESET_NAMES.forEach((preset) => {
          const candidates = EXPRESSION_FALLBACKS[preset] ?? [preset];
          for (const candidate of candidates) {
            if (expressionMap[candidate]) {
              faceNames[preset] = candidate;
              return;
            }
            const fallback = expressionNames.find((n) => n.toLowerCase() === candidate.toLowerCase());
            if (fallback) {
              faceNames[preset] = fallback;
              return;
            }
          }
        });
        faceExpressionsRef.current = faceNames;
        faceExpressionUniqueNamesRef.current = Array.from(new Set(Object.values(faceNames).filter((n): n is string => Boolean(n))));
        allExpressionNamesRef.current = expressionNames;

        group?.add(vrm.scene);
        vrmRef.current = vrm;
        idleEngineRef.current = new AvatarIdleEngine();
        speakingGestureEngineRef.current = new AvatarSpeakingGestureEngine();
        const controller = new AvatarAnimationController(vrm);
        animationControllerRef.current = controller;
        onControllerReady(controller);

        vrm.scene.updateMatrixWorld(true);

        const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
        const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
        const leftHand = vrm.humanoid?.getNormalizedBoneNode("leftHand");
        const rightHand = vrm.humanoid?.getNormalizedBoneNode("rightHand");
        if (leftUpperArm && leftHand) armSignRef.current.left = calibrateArmDownSign(leftUpperArm, leftHand);
        if (rightUpperArm && rightHand) armSignRef.current.right = calibrateArmDownSign(rightUpperArm, rightHand);

        const headBone = vrm.humanoid?.getNormalizedBoneNode("head");
        const leftEye = vrm.humanoid?.getNormalizedBoneNode("leftEye");
        if (headBone && leftEye) headNodSignRef.current = calibrateHeadNodSign(headBone, leftEye);

        if (headBone && leftUpperArm && leftHand) {
          armReachRef.current.left = calibrateArmReachAxis(leftUpperArm, leftHand, headBone);
        }
        if (headBone && rightUpperArm && rightHand) {
          armReachRef.current.right = calibrateArmReachAxis(rightUpperArm, rightHand, headBone);
        }

        // New 20-gesture procedural engine — built AFTER the calibration
        // above so it can reuse the exact same per-model sign/axis
        // calibration the older gesture system already computed, instead of
        // re-probing the rig a second time.
        const gestureEngine = new AvatarGestureEngine({
          armSign: armSignRef.current,
          armReach: armReachRef.current,
          headSign: headNodSignRef.current,
        });
        gestureEngineRef.current = gestureEngine;
        onGestureEngineReady(gestureEngine);

        boneOverridesRef.current.clear();
        fingerOverridesRef.current.clear();
        faceExpressionOverrideRef.current = null;
        const boneEditorApi: AvatarBoneEditorApi = {
          getAvailableBones: () => EDITOR_BONE_NAMES.filter((name) => Boolean(vrm.humanoid?.getNormalizedBoneNode(name))),
          getBoneRotation: (boneName) => {
            const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
            return bone ? { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z } : null;
          },
          setBoneOverride: (boneName, x, y, z) => {
            boneOverridesRef.current.set(boneName, { x, y, z });
          },
          clearBoneOverride: (boneName) => {
            boneOverridesRef.current.delete(boneName);
          },
          clearAllBoneOverrides: () => {
            boneOverridesRef.current.clear();
          },
          getBoneWorldPosition: (boneName) => {
            const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
            if (!bone) return null;
            vrm.scene.updateMatrixWorld(true);
            const pos = new THREE.Vector3();
            bone.getWorldPosition(pos);
            return { x: pos.x, y: pos.y, z: pos.z };
          },
          setHandIkTarget: (side, targetWorld, poleWorld) => {
            // IK and Phase B's manual per-bone override both ultimately
            // drive upperArm/lowerArm quaternions — letting both stay
            // active on the same arm would mean whichever runs later in
            // useFrame silently wins every frame with no visual indication
            // why. Activating IK for a side clears any override on that
            // arm's bones instead, so there's exactly one source of truth.
            const upperArmName: VRMHumanBoneName = side === "left" ? "leftUpperArm" : "rightUpperArm";
            const lowerArmName: VRMHumanBoneName = side === "left" ? "leftLowerArm" : "rightLowerArm";
            boneOverridesRef.current.delete(upperArmName);
            boneOverridesRef.current.delete(lowerArmName);
            handIkRef.current.set(side, {
              target: new THREE.Vector3(targetWorld.x, targetWorld.y, targetWorld.z),
              pole: new THREE.Vector3(poleWorld.x, poleWorld.y, poleWorld.z),
            });
          },
          clearHandIkTarget: (side) => {
            handIkRef.current.delete(side);
          },
          isHandIkActive: (side) => handIkRef.current.has(side),
          setFingerPose: (side, pose) => {
            fingerOverridesRef.current.set(side, pose);
          },
          clearFingerPose: (side) => {
            fingerOverridesRef.current.delete(side);
          },
          isFingerPoseActive: (side) => fingerOverridesRef.current.has(side),
          setFaceOverrides: (overrides) => {
            faceExpressionOverrideRef.current = overrides;
          },
          isFaceExpressionActive: () => faceExpressionOverrideRef.current !== null,
          getAvailableFaceExpressions: () => allExpressionNamesRef.current,
        };
        onBoneEditorReady(boneEditorApi);

        if (readAvatarDebugFlag()) {
          const makeSphere = (color: number) =>
            new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
          const target = makeSphere(0xff3333);
          const pole = makeSphere(0x3388ff);
          const hand = makeSphere(0x33ff77);
          target.visible = false;
          pole.visible = false;
          hand.visible = false;
          target.renderOrder = 999;
          pole.renderOrder = 999;
          hand.renderOrder = 999;
          vrm.scene.add(target, pole, hand);
          ikDebugSpheresRef.current = { target, pole, hand };
        }

        // Frame the camera as a medium/half-body shot (head down to roughly
        // waist) from the model's actual rendered bounding box, not a
        // guessed bone offset — hair/accessories push the visual top well
        // above the head bone itself, and a fixed offset tuned for one
        // model reads wrong on any other model's proportions. Went through
        // full-body framing first (fit the whole head-to-feet box) per
        // earlier feedback, then direct feedback on a real render flipped
        // that: a medium shot reads better for this avatar than full body
        // — legs/feet are still fully posed and animated underneath, just
        // outside the visible frame, exactly like a real webcam/vtuber shot.
        const box = new THREE.Box3().setFromObject(vrm.scene);
        if (Number.isFinite(box.min.y) && Number.isFinite(box.max.y)) {
          const totalHeight = box.max.y - box.min.y;
          // Roughly head-to-waist — human waist sits close to half the
          // total standing height, a hair above that in practice once hair/
          // shoes are included in the bounding box.
          const HALF_BODY_FRACTION = 0.55;
          const topY = box.max.y;
          const bottomY = box.max.y - totalHeight * HALF_BODY_FRACTION;
          const targetY = (topY + bottomY) / 2;
          const frameHeight = (topY - bottomY) * 1.15; // headroom above the head, mainly
          const perspectiveCamera = camera as THREE.PerspectiveCamera;
          const halfFov = THREE.MathUtils.degToRad((perspectiveCamera.fov ?? 28) / 2);
          const distance = frameHeight / 2 / Math.tan(halfFov);
          camera.position.set(0, targetY, distance);
          camera.lookAt(0, targetY, 0);
          cameraDistanceRef.current = distance;
          onCameraFramed?.({ x: 0, y: targetY, z: 0 }, distance);
        }

        // Eye-gaze — vrm.lookAt is part of the standard VRM pipeline (three-
        // vrm's VRMLoaderPlugin constructs it whenever the model has a
        // usable head/eye setup, falling back to an expression-based
        // applier for models with no separate eye bones), but it's not
        // guaranteed on every possible file — checked defensively rather
        // than assumed, per explicit "fail gracefully" requirement. When
        // absent, gazeEngineRef/gazeTargetRef simply stay null and every
        // read of them below is optional-chained — lip-sync/blink/breathing/
        // gestures/everything else keeps working untouched.
        if (vrm.lookAt) {
          const gazeTarget = new THREE.Object3D();
          camera.add(gazeTarget);
          vrm.lookAt.target = gazeTarget;
          gazeTargetRef.current = gazeTarget;

          // VRMLookAtBoneApplier scales its input angle down before applying
          // it to the eye bone (outputScale/inputMaxValue, e.g. a real
          // loaded model measured at 10°/90° — a "subtle" 9° glance request
          // was landing as under 1° of actual eye rotation, invisible in
          // practice). Only VRMLookAtBoneApplier exposes this; a model using
          // the expression-based applier instead has no equivalent concept,
          // so this stays at the default (no compensation) for that case.
          let inputCompensationScale = 1;
          if (vrm.lookAt.applier instanceof VRMLookAtBoneApplier) {
            const { inputMaxValue, outputScale } = vrm.lookAt.applier.rangeMapHorizontalOuter;
            if (outputScale > 0) inputCompensationScale = inputMaxValue / outputScale;
          }
          gazeEngineRef.current = new AvatarGazeEngine({ inputCompensationScale });
        } else {
          console.warn("[avatar] this VRM has no usable vrm.lookAt — eye-gaze micro-behavior disabled, everything else unaffected.");
        }

        onProgress(null);
        onReady();
      },
      (progressEvent) => {
        if (cancelled) return;
        // .total is 0 when the server response doesn't send a
        // Content-Length (some proxies/CDNs strip it) — indeterminate
        // progress is still strictly better than the old silent blank
        // canvas, but there's no honest percentage to show in that case.
        onProgress(progressEvent.total > 0 ? Math.round((progressEvent.loaded / progressEvent.total) * 100) : null);
      },
      (err) => {
        if (!cancelled) {
          onProgress(null);
          onError(err instanceof Error ? err.message : "Gagal memuat file VRM.");
        }
      }
    );

    return () => {
      cancelled = true;
      const vrm = vrmRef.current;
      if (vrm) {
        group?.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrmRef.current = null;
      }
      idleEngineRef.current = null;
      speakingGestureEngineRef.current = null;
      animationControllerRef.current?.dispose();
      animationControllerRef.current = null;
      gestureEngineRef.current = null;
      onGestureEngineReady(null);
      onControllerReady(null);
      boneOverridesRef.current = new Map();
      handIkRef.current = new Map();
      fingerOverridesRef.current = new Map();
      faceExpressionOverrideRef.current = null;
      // A loaded clip's keyframes reference this model's own bone names —
      // stop playback rather than let it keep running against a since-
      // unmounted/changed VRM.
      customAnimationRef.current = null;
      onBoneEditorReady(null);
      // The sphere meshes themselves are children of vrm.scene, already
      // disposed by VRMUtils.deepDispose() above — just drop the stale ref.
      ikDebugSpheresRef.current = null;
      if (gazeTargetRef.current) camera.remove(gazeTargetRef.current);
      gazeTargetRef.current = null;
      gazeEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReady/onError are stable enough here; re-subscribing on their identity would reload the model every render
  }, [vrmUrl]);

  useFrame((_state, rawDelta) => {
    // Runs every frame regardless of any outside mount-order timing, unlike
    // an effect keyed on the (stable, never-changing) audioRef object —
    // guarantees the element gets wired exactly once, whenever it actually
    // becomes available, rather than possibly never.
    const audioEl = audioRef.current;
    if (audioEl && wiredAudioElRef.current !== audioEl) {
      wiredAudioElRef.current = audioEl;
      wireAudioElement(audioEl);
    }

    // Clamp so a throttled/backgrounded OBS source doesn't jump-cut motion on
    // resume — 0.05s (20fps-equivalent) keeps the new spring-damped idle
    // motion from lurching on a big stall; the old flat approach()-smoothed
    // motion tolerated a looser 0.1s clamp fine, springs are more sensitive.
    const delta = Math.min(rawDelta, 0.05);
    clockRef.current += delta;
    const vrm = vrmRef.current;
    if (!vrm) return;

    // Phase J: runtime custom-animation playback (see
    // avatar-keyframe-playback.ts) — always null unless something
    // explicitly called playCustomAnimation (the live TikTok reply pipeline,
    // via AvatarOverlayPlayer, or the VRM Animation Studio's own testing).
    // Runs FIRST, before anything below reads boneOverridesRef/
    // fingerOverridesRef/faceExpressionOverrideRef, since it writes
    // directly into those same refs — same full-strength "no blend weight"
    // override priority as every other Studio-originated system, just
    // driven by this component's own clock instead of a page-level rAF
    // loop, so it plays correctly with no Studio page open.
    const customAnim = customAnimationRef.current;
    if (customAnim?.playing) {
      customAnim.time += delta;
      const lastTime = customAnim.keyframes[customAnim.keyframes.length - 1]?.time ?? 0;
      const finishedOneShot = customAnim.time >= lastTime && !(customAnim.loop && lastTime > 0);
      if (customAnim.time >= lastTime && customAnim.loop && lastTime > 0) {
        customAnim.time = customAnim.time % lastTime;
      } else {
        customAnim.time = Math.min(customAnim.time, lastTime);
      }
      applyKeyframePoseAtTime(runtimeApplierRef.current, customAnim.keyframes, customAnim.time);
      if (finishedOneShot) {
        // A one-shot clip finishing must hand control back to idle, not
        // freeze the avatar in its final pose forever — the same "gesture
        // ends, idle resumes" behavior playGesture/playAnimation already
        // give (their own engines auto-relax/fade back out). Only clears
        // the bones/fingers THIS clip actually touched, exactly like
        // clearing a Studio bone override — anything idle already owned
        // was never written here in the first place.
        //
        // Bones hand off through releasingBonesRef (a brief blend, see
        // CUSTOM_ANIMATION_RELEASE_SECONDS) instead of an instant delete —
        // deleting outright caused a visible snap right as the clip ended:
        // idle's own smoothing/spring state keeps converging toward ITS
        // target the entire time a bone sits hard-overridden here (it's
        // still computed every frame underneath, just clobbered by the
        // override afterward), so by the time a multi-second clip finishes
        // that hidden state has usually already drifted most of the way to
        // idle's resting pose — deleting the override then made the visible
        // bone jump straight to wherever that invisible state had drifted,
        // not ease there. Fingers keep the instant clear: their rotation
        // magnitudes are small enough that the same snap is negligible (see
        // avatar-keyframe-playback.ts's own reasoning for not slerping them).
        const touchedBones = new Set<VRMHumanBoneName>();
        let touchedLeftFingers = false;
        let touchedRightFingers = false;
        let touchedFace = false;
        customAnim.keyframes.forEach((kf) => {
          (Object.keys(kf.pose.bones) as VRMHumanBoneName[]).forEach((bone) => touchedBones.add(bone));
          if (kf.pose.leftFingers) touchedLeftFingers = true;
          if (kf.pose.rightFingers) touchedRightFingers = true;
          if (kf.pose.face) touchedFace = true;
        });
        touchedBones.forEach((bone) => {
          const finalPose = boneOverridesRef.current.get(bone);
          if (finalPose) releasingBonesRef.current.set(bone, { from: finalPose, startedAt: clockRef.current });
          boneOverridesRef.current.delete(bone);
        });
        if (touchedLeftFingers) fingerOverridesRef.current.delete("left");
        if (touchedRightFingers) fingerOverridesRef.current.delete("right");
        // Hands back to AI emotion (or neutral) cleanly — the expression
        // blend already eases toward whatever target is current every
        // frame (see EXPRESSION_APPROACH_RATE), so simply clearing the
        // override here is enough; no bone-style release blend needed.
        if (touchedFace) faceExpressionOverrideRef.current = null;
        customAnimationRef.current = null;
      }
    }

    // A new reply's gestureKey (its own comment id) always differs from the
    // previous one, even when the AI happened to classify the same gesture
    // or emotion twice in a row — that's what actually retriggers playback,
    // not the gesture/emotion value itself changing.
    const gestureKey = gestureKeyRef.current;
    if (gestureKey !== lastGestureKeyRef.current) {
      lastGestureKeyRef.current = gestureKey;
      const gesture = gestureRef.current;
      activeGestureRef.current =
        gesture && gesture !== "none"
          ? { name: gesture, startedAt: clockRef.current, isHeadGesture: gesture === "nod" || gesture === "shake" }
          : null;
      currentEmotionTargetRef.current = EMOTION_TO_EXPRESSION[emotionRef.current ?? "neutral"] ?? "neutral";
      // A fresh reply hasn't been heard yet — don't let the "decay once
      // it's no longer audible" check below immediately undo the target
      // just set above before the audio has even had a chance to start
      // (buffering from R2 routinely takes a beat longer than one frame).
      hasBeenAudibleRef.current = false;
    }
    if (activeGestureRef.current) {
      const duration = activeGestureRef.current.isHeadGesture ? HEAD_GESTURE_DURATION_SECONDS : GESTURE_DURATION_SECONDS;
      if (clockRef.current - activeGestureRef.current.startedAt >= duration) activeGestureRef.current = null;
    }
    // An expression shouldn't linger on the avatar's face after the line
    // that prompted it has finished playing — decay back to neutral once
    // this reply was genuinely heard and then stopped, NOT just "isn't
    // audible this exact frame" (that's also true in the normal gap before
    // a fresh reply's audio has started buffering/playing).
    if (isAudibleRef.current) {
      hasBeenAudibleRef.current = true;
    } else if (hasBeenAudibleRef.current) {
      currentEmotionTargetRef.current = "neutral";
    }

    const active = activeGestureRef.current;
    const gesturePose = active
      ? computeGesturePose(
          active.name,
          Math.min(
            1,
            (clockRef.current - active.startedAt) / (active.isHeadGesture ? HEAD_GESTURE_DURATION_SECONDS : GESTURE_DURATION_SECONDS)
          )
        )
      : null;

    // New 20-gesture procedural engine — computed every frame regardless of
    // whether the older gesture system is also active (independent state
    // machines; playGesture()/the older activeGestureRef never touch each
    // other). Returns null once fully relaxed back to idle. Below, this
    // takes priority over the older gesturePose, which takes priority over
    // idle — "Gesture > Head Motion > Idle" per spec, and never both driving
    // the same bone at once.
    const newGesture: GestureFrame | null = gestureEngineRef.current?.update(delta) ?? null;

    // "professional_presenter_hands" — continuous speaking-idle hand
    // gesture, see avatar-speaking-gesture-engine.ts. Only contributes
    // (via its own internal weight fade) while isAudibleRef is true;
    // computed every frame regardless so its weight spring can fade out
    // smoothly rather than cutting instantly the moment audio stops.
    // Gated off arms/chest/head entirely while either gesture system is
    // actively driving those bones (noActiveGesture below) — a deliberate
    // reaction gesture always wins over this ambient background layer.
    const noActiveGesture = !active && !newGesture;
    let voiceAmplitude = 0;
    const speakingAudioEl = audioRef.current;
    if (speakingAudioEl && isAudibleRef.current) {
      const compensatedTime = Math.max(0, speakingAudioEl.currentTime - LIPSYNC_LATENCY_COMPENSATION_SECONDS);
      voiceAmplitude = sampleAmplitude(amplitudeEnvelopeRef.current, compensatedTime);
    }
    const speakingFrame: SpeakingGestureFrame =
      speakingGestureEngineRef.current?.update(delta, isAudibleRef.current, voiceAmplitude) ?? {
        leftRaiseDelta: 0,
        rightRaiseDelta: 0,
        leftReach: 0,
        rightReach: 0,
        leftElbowDelta: 0,
        rightElbowDelta: 0,
        leftWristDelta: 0,
        rightWristDelta: 0,
        chestLeanDelta: 0,
        headOffsetXDelta: 0,
        headOffsetYDelta: 0,
      };

    // Smoothly approach whatever the current target is (idle pose or a
    // gesture pose) — used for arms and head alike, so a gesture starting,
    // finishing, or the idle sway underneath it never visibly pops.
    //
    // Keyed by a caller-chosen string, NOT the live bone rotation — every
    // one of these bones is also writable by AvatarAnimationController
    // (Mixamo interaction clips: bow/clapping/excited/greeting/salute/
    // victory/waving) whenever one is playing or fading. That controller
    // writes blended QUATERNIONS (idle capture slerped against the clip
    // pose) directly onto these same nodes every frame, which Three.js then
    // reflects back into `.rotation` automatically. Reading `bone.rotation`
    // as "current" here would make this smoothing chase whatever the
    // OTHER system last wrote — a feedback loop between two independent
    // smoothers on the same bone — instead of the idle system's own,
    // uncontaminated trajectory. That feedback loop was the actual cause of
    // the choppy ("patah-patah") return-to-idle after a clip finishes: each
    // frame's "idle" baseline the controller captured was itself already
    // partly clip-pose, compounding frame over frame through the fade.
    // Tracking this system's own state independently fixes it regardless of
    // what any other system does to the bone in between calls.
    const approach = (key: string, target: number) => {
      const state = idleApproachStateRef.current;
      const current = state[key] ?? target;
      const next = current + (target - current) * Math.min(1, BODY_APPROACH_RATE * delta);
      state[key] = next;
      return next;
    };

    // Idle amplitude dials down (never to zero) while speaking or mid-gesture
    // — a live body doesn't freeze the instant it starts talking, per spec.
    // Smoothed rather than snapped so the transition back to full idle after
    // audio/gesture stops takes a couple hundred ms, not one frame.
    const rawActivity = isAudibleRef.current || Boolean(active) ? 1 : 0;
    activityLevelRef.current += (rawActivity - activityLevelRef.current) * Math.min(1, ACTIVITY_SETTLE_RATE * delta);

    // Drives pelvis/spine/shoulders/legs directly (see AvatarIdleEngine) and
    // returns torsoLean/breath for the arm secondary-motion calls below.
    const idlePose = idleEngineRef.current?.update(vrm, delta, { activityLevel: activityLevelRef.current }) ?? {
      torsoLean: 0,
      breath: 0,
      fingerAdjustL: 0,
      fingerAdjustR: 0,
      fingerSpreadL: 0,
      fingerSpreadR: 0,
    };
    // Always stepped (even mid-gesture) so the springs stay "warm" and don't
    // jump the instant a gesture ends and idle secondary motion resumes.
    const armSecondaryLeft = idleEngineRef.current?.applyArmSecondaryMotion("left", idlePose.torsoLean, idlePose.breath, delta) ?? {
      upperArm: 0,
      lowerArm: 0,
      hand: 0,
      wristFlex: 0,
    };
    const armSecondaryRight = idleEngineRef.current?.applyArmSecondaryMotion("right", idlePose.torsoLean, idlePose.breath, delta) ?? {
      upperArm: 0,
      lowerArm: 0,
      hand: 0,
      wristFlex: 0,
    };

    const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
    const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
    const leftHand = vrm.humanoid?.getNormalizedBoneNode("leftHand");
    const rightHand = vrm.humanoid?.getNormalizedBoneNode("rightHand");
    const { left: leftArmSign, right: rightArmSign } = armSignRef.current;
    if (leftUpperArm)
      leftUpperArm.rotation.z = approach(
        "leftUpperArm.z",
        newGesture?.pose.leftUpperArmZ !== undefined
          ? newGesture.pose.leftUpperArmZ
          : gesturePose?.leftUpperArmZ !== undefined
            ? leftArmSign * gesturePose.leftUpperArmZ
            : leftArmSign * (ARM_DOWN_Z + armSecondaryLeft.upperArm + speakingFrame.leftRaiseDelta)
      );
    if (rightUpperArm)
      rightUpperArm.rotation.z = approach(
        "rightUpperArm.z",
        newGesture?.pose.rightUpperArmZ !== undefined
          ? newGesture.pose.rightUpperArmZ
          : gesturePose?.rightUpperArmZ !== undefined
            ? rightArmSign * gesturePose.rightUpperArmZ
            : rightArmSign * (ARM_DOWN_Z + armSecondaryRight.upperArm + speakingFrame.rightRaiseDelta)
      );
    if (leftLowerArm) {
      leftLowerArm.rotation.z = approach(
        "leftLowerArm.z",
        newGesture?.pose.leftLowerArmZ !== undefined
          ? newGesture.pose.leftLowerArmZ
          : gesturePose?.leftLowerArmZ !== undefined
            ? leftArmSign * gesturePose.leftLowerArmZ
            : leftArmSign * (ELBOW_BEND_Z + armSecondaryLeft.lowerArm + speakingFrame.leftElbowDelta)
      );
      // x/y are unconditionally reset to 0 every frame — nothing in the
      // rotation-based gesture systems (old or new) ever wants a non-zero
      // elbow x/y, that axis pair was always assumed to be a pure Z-hinge.
      // BUT the 2-bone IK solve (avatar-arm-ik.ts, salute) sets this bone's
      // FULL quaternion directly, which decomposes into non-zero x/y Euler
      // components — and since nothing else here ever wrote those two axes,
      // they used to stay permanently stuck at whatever the IK solve last
      // left them at (confirmed live: rightLowerArm.x was still ~-179° long
      // after a salute had fully finished and returned to idle — "tangan
      // terkilir ke belakang"). Explicitly driving them back to 0 here,
      // same approach()-smoothed pattern as every other axis, is what lets
      // them recover instead of being permanently abandoned.
      leftLowerArm.rotation.x = approach("leftLowerArm.x", 0);
      leftLowerArm.rotation.y = approach("leftLowerArm.y", 0);
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.z = approach(
        "rightLowerArm.z",
        newGesture?.pose.rightLowerArmZ !== undefined
          ? newGesture.pose.rightLowerArmZ
          : gesturePose?.rightLowerArmZ !== undefined
            ? rightArmSign * gesturePose.rightLowerArmZ
            : rightArmSign * (ELBOW_BEND_Z + armSecondaryRight.lowerArm + speakingFrame.rightElbowDelta)
      );
      // See leftLowerArm's identical comment just above.
      rightLowerArm.rotation.x = approach("rightLowerArm.x", 0);
      rightLowerArm.rotation.y = approach("rightLowerArm.y", 0);
    }
    // Wrist — idle drives both axes by default (see armSecondaryLeft/Right);
    // the new gesture engine can override rotation.z (e.g. angry_hands_on_
    // hips' hands-on-hip twist) — the older gesture system never drove
    // either wrist axis, so there's nothing to slot in ahead of it here.
    if (leftHand) {
      leftHand.rotation.z = approach(
        "leftHand.z",
        newGesture?.pose.leftHandZ !== undefined
          ? newGesture.pose.leftHandZ
          : leftArmSign * (armSecondaryLeft.hand + speakingFrame.leftWristDelta)
      );
      leftHand.rotation.x = approach("leftHand.x", newGesture?.pose.leftHandX !== undefined ? newGesture.pose.leftHandX : armSecondaryLeft.wristFlex);
    }
    if (rightHand) {
      rightHand.rotation.z = approach(
        "rightHand.z",
        newGesture?.pose.rightHandZ !== undefined
          ? newGesture.pose.rightHandZ
          : rightArmSign * (armSecondaryRight.hand + speakingFrame.rightWristDelta)
      );
      rightHand.rotation.x = approach("rightHand.x", newGesture?.pose.rightHandX !== undefined ? newGesture.pose.rightHandX : armSecondaryRight.wristFlex);
    }

    // Phase D (VRM Animation Studio) manual finger override — highest
    // priority, checked ahead of the live gesture engine's own finger poses.
    // Always undefined during normal TikTok Live playback (fingerOverridesRef
    // stays empty there), so this has zero effect on existing behavior.
    const leftFingerOverride = fingerOverridesRef.current.get("left");
    const rightFingerOverride = fingerOverridesRef.current.get("right");
    for (const { bone, curl } of FINGER_CURL_JOINTS) {
      const leftFinger = vrm.humanoid?.getNormalizedBoneNode(`left${bone}` as VRMHumanBoneName);
      const rightFinger = vrm.humanoid?.getNormalizedBoneNode(`right${bone}` as VRMHumanBoneName);
      const boneSuffix = bone as FingerBoneSuffix;
      const leftGestureFinger = newGesture?.leftFingers?.[boneSuffix];
      const rightGestureFinger = newGesture?.rightFingers?.[boneSuffix];
      const leftOverrideFinger = leftFingerOverride?.[boneSuffix];
      const rightOverrideFinger = rightFingerOverride?.[boneSuffix];
      if (leftFinger) {
        // Multiplied by leftArmSign for the same reason the idle baseline
        // below is — see FINGER_CURL_JOINTS' own comment: fingers are
        // downstream of the same kinematic chain as the elbow, so they
        // follow the arm's own calibrated mirroring sign rather than
        // needing a separate probe.
        leftFinger.rotation.z = approach(
          `left${bone}.z`,
          leftFingerOverride
            ? leftArmSign * (leftOverrideFinger?.curl ?? 0)
            : leftGestureFinger?.curl !== undefined
              ? leftArmSign * leftGestureFinger.curl
              : leftArmSign * (curl + idlePose.fingerAdjustL)
        );
        leftFinger.rotation.y = approach(
          `left${bone}.y`,
          leftFingerOverride
            ? leftArmSign * (leftOverrideFinger?.spread ?? 0)
            : leftGestureFinger?.spread !== undefined
              ? leftArmSign * leftGestureFinger.spread
              : leftArmSign * idlePose.fingerSpreadL
        );
      }
      if (rightFinger) {
        rightFinger.rotation.z = approach(
          `right${bone}.z`,
          rightFingerOverride
            ? rightArmSign * (rightOverrideFinger?.curl ?? 0)
            : rightGestureFinger?.curl !== undefined
              ? rightArmSign * rightGestureFinger.curl
              : rightArmSign * (curl + idlePose.fingerAdjustR)
        );
        rightFinger.rotation.y = approach(
          `right${bone}.y`,
          rightFingerOverride
            ? rightArmSign * (rightOverrideFinger?.spread ?? 0)
            : rightGestureFinger?.spread !== undefined
              ? rightArmSign * rightGestureFinger.spread
              : rightArmSign * idlePose.fingerSpreadR
        );
      }
    }

    // Shoulder/chest/spine — these bones are written INTERNALLY by
    // AvatarIdleEngine every frame (breathing propagation/counterbalance,
    // see avatar-idle-engine.ts — deliberately untouched by this task, per
    // explicit instruction not to modify idle/breathing). The new gesture
    // engine's contribution here is ADDITIVE on top of whatever idle just
    // wrote, the same pattern already established for the head bone's own
    // gaze-follow addition below — never a full override, so breathing never
    // stops or gets replaced, a gesture's shrug/lean just rides on top of it.
    const leftShoulder = vrm.humanoid?.getNormalizedBoneNode("leftShoulder");
    const rightShoulder = vrm.humanoid?.getNormalizedBoneNode("rightShoulder");
    const chest = vrm.humanoid?.getNormalizedBoneNode("chest");
    const spine = vrm.humanoid?.getNormalizedBoneNode("spine");
    if (leftShoulder && newGesture?.pose.leftShoulderZ !== undefined) leftShoulder.rotation.z += newGesture.pose.leftShoulderZ;
    if (rightShoulder && newGesture?.pose.rightShoulderZ !== undefined) rightShoulder.rotation.z += newGesture.pose.rightShoulderZ;
    if (chest && newGesture?.pose.chestLeanX !== undefined) chest.rotation.x += newGesture.pose.chestLeanX;
    if (spine && newGesture?.pose.spineLeanX !== undefined) spine.rotation.x += newGesture.pose.spineLeanX;
    // professional_presenter_hands' own small torso follow — only while
    // neither gesture system already owns chest/spine this frame (see
    // noActiveGesture above), so a deliberate reaction gesture's own
    // shrug/lean is never compounded with this ambient layer's.
    if (chest && noActiveGesture) chest.rotation.x += speakingFrame.chestLeanDelta;

    // Reach axis — idle rest is 0 on both X and Y (untouched by anything
    // else), only the 4 hand-to-head/chest gestures ever set it. Which axis
    // is actually "toward the head" on this model, and which sign, was
    // determined once at load time (calibrateArmReachAxis) — not assumed to
    // be X, and not shared with armSignRef's calibration (the two axes don't
    // necessarily agree on a given model).
    const { left: leftReach, right: rightReach } = armReachRef.current;
    const leftReachTarget =
      gesturePose?.leftUpperArmX !== undefined
        ? leftReach.sign * gesturePose.leftUpperArmX
        : noActiveGesture
          ? leftReach.sign * speakingFrame.leftReach
          : 0;
    const rightReachTarget =
      gesturePose?.rightUpperArmX !== undefined
        ? rightReach.sign * gesturePose.rightUpperArmX
        : noActiveGesture
          ? rightReach.sign * speakingFrame.rightReach
          : 0;
    // The new gesture engine already redirects its own "reach toward head/
    // chest" semantic (leftUpperArmX in gesture data) through this exact
    // same per-model calibration internally (see mirrorPoseForModel in
    // avatar-gesture-engine.ts) before this frame's pose is read here — so
    // newGesture.pose.leftUpperArmX/Y below are already final, ready-to-
    // assign values, not raw gesture-space ones. Its separate "elbows out"
    // semantic (also leftUpperArmY) is NOT per-model calibrated the way
    // reach is — see that file's module note on this as a known limitation.
    if (leftUpperArm) {
      leftUpperArm.rotation.x = approach(
        "leftUpperArm.x",
        newGesture?.pose.leftUpperArmX !== undefined ? newGesture.pose.leftUpperArmX : leftReach.axis === "x" ? leftReachTarget : 0
      );
      leftUpperArm.rotation.y = approach(
        "leftUpperArm.y",
        newGesture?.pose.leftUpperArmY !== undefined ? newGesture.pose.leftUpperArmY : leftReach.axis === "y" ? leftReachTarget : 0
      );
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.x = approach(
        "rightUpperArm.x",
        newGesture?.pose.rightUpperArmX !== undefined ? newGesture.pose.rightUpperArmX : rightReach.axis === "x" ? rightReachTarget : 0
      );
      rightUpperArm.rotation.y = approach(
        "rightUpperArm.y",
        newGesture?.pose.rightUpperArmY !== undefined ? newGesture.pose.rightUpperArmY : rightReach.axis === "y" ? rightReachTarget : 0
      );
    }

    // Eye-gaze — computed every frame regardless of gesture/speaking state
    // (real eyes don't freeze during either), null-safe throughout so a VRM
    // without compatible lookAt (gazeEngineRef/gazeTargetRef both stay null
    // in that case — see the load effect) just skips this whole block via
    // the outer `if`. gazeTargetRef is a child of the camera (see load
    // effect), so its LOCAL x/y position is exactly the lateral/vertical
    // offset — in world units — that yields the desired yaw/pitch angle as
    // seen from the avatar, at the known camera distance.
    const gazePose = gazeEngineRef.current?.update(delta) ?? null;
    if (gazePose && gazeTargetRef.current) {
      const dist = cameraDistanceRef.current;
      gazeTargetRef.current.position.set(dist * Math.tan(gazePose.eyeYaw), dist * Math.tan(gazePose.eyePitch), 0);
    }

    // Head: rotation.x/z already carry the idle engine's spine-chain
    // propagation (pitch + breathing + a hair of the pelvis's own lean) from
    // idleEngineRef.current.update() above — only overridden here when a
    // gesture (nod/thinking's tilt) actively wants a bigger, deliberate
    // motion on that same axis. rotation.y is untouched by the chain, so
    // "shake" is free to use it with no conflict either way. When no
    // gesture is driving a given axis, a small delayed fraction of the
    // gaze's own eye movement (gazePose.headFollow*) is layered in instead —
    // real heads drift slightly toward whatever the eyes are looking at.
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      if (newGesture?.pose.headOffsetX !== undefined) {
        // Additive, same reasoning as gazePose.headFollowPitch below — head
        // .rotation.x already carries this frame's fully-resolved idle-chain
        // value, a gesture's head tilt rides on top of it rather than
        // replacing breathing/pelvis-lean's contribution.
        head.rotation.x += newGesture.pose.headOffsetX;
      } else if (gesturePose?.headX !== undefined) {
        head.rotation.x = approach("head.x", headNodSignRef.current * gesturePose.headX);
      } else if (gazePose) {
        // Additive, not approach()'d — head.rotation.x already equals this
        // frame's fully-resolved idle-chain value at this point, and
        // gazePose.headFollowPitch is itself already spring-smoothed inside
        // the gaze engine, so this adds exactly once per frame (never
        // accumulates — next frame's idle-chain write resets the base).
        head.rotation.x += gazePose.headFollowPitch;
      }
      // professional_presenter_hands' own small head tilt/nod — additive,
      // same reasoning as the gaze/gesture terms just above, only while no
      // reaction gesture already owns the head this frame.
      if (noActiveGesture) head.rotation.x += speakingFrame.headOffsetXDelta;
      head.rotation.y = approach(
        "head.y",
        newGesture?.pose.headOffsetY !== undefined
          ? newGesture.pose.headOffsetY
          : gesturePose?.headY !== undefined
            ? gesturePose.headY
            : (gazePose?.headFollowYaw ?? 0) + (noActiveGesture ? speakingFrame.headOffsetYDelta : 0)
      );
    }

    // 2-bone arm IK (salute's hand-to-forehead, see avatar-arm-ik.ts) — MUST
    // run after every normal idle/approach()-driven bone write above
    // (including the head block just above, since the forehead target is
    // computed from the head's CURRENT world transform) and after an
    // explicit matrix-world update, since Three.js doesn't recompute world
    // transforms until the renderer's next pass otherwise — reading world
    // positions/rotations right after a plain `.rotation = x` assignment
    // would see last frame's stale transform. See
    // AvatarGestureEngine.applyArmIk()'s own doc comment for why this is a
    // separate, later call than gestureEngineRef's earlier update().
    if (head && leftUpperArm && leftLowerArm && leftHand && rightUpperArm && rightLowerArm && rightHand && gestureEngineRef.current) {
      vrm.scene.updateMatrixWorld(true);
      const ikBones: GestureIkBones = { head, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand };
      liveDebugRef.current.ikDebug = gestureEngineRef.current.applyArmIk(ikBones);
    } else {
      liveDebugRef.current.ikDebug = null;
    }

    // ?avatarDebug=1 only — reposition the 3 IK visualization spheres (see
    // their creation in the load effect above) directly from this frame's
    // ikDebug, converting each world-space point into vrm.scene's own local
    // space (worldToLocal) so they render correctly regardless of any
    // transform between the scene root and vrm.scene.
    const spheres = ikDebugSpheresRef.current;
    if (spheres) {
      const ikDebug = liveDebugRef.current.ikDebug;
      const visible = ikDebug !== null;
      spheres.target.visible = visible;
      spheres.pole.visible = visible;
      spheres.hand.visible = visible;
      if (ikDebug) {
        spheres.target.position.copy(vrm.scene.worldToLocal(ikDebug.targetWorld.clone()));
        spheres.pole.position.copy(vrm.scene.worldToLocal(ikDebug.poleWorld.clone()));
        spheres.hand.position.copy(vrm.scene.worldToLocal(ikDebug.handWorld.clone()));
      }
    }

    // Interaction animations (bow/clapping/excited/greeting/salute/victory/
    // waving) — blends against whatever body pose the idle engine + gesture
    // code above just wrote, see avatar-animation-controller.ts. Must run
    // AFTER all body bone writes above and BEFORE vrm.update() below (that
    // call finalizes spring bones/look-at from the pose as it stands then).
    // Never touches expressions/blink/lip-sync — those stay fully independent.
    animationControllerRef.current?.update(delta);

    const blinkName = blinkNameRef.current;
    if (blinkName) {
      const phase = blinkPhaseRef.current;
      phase.t += delta;
      let weight = 0;
      if (phase.stage === "idle") {
        if (phase.t >= phase.nextAt) {
          phase.stage = "closing";
          phase.t = 0;
        }
      } else if (phase.stage === "closing") {
        weight = Math.min(1, phase.t / BLINK_CLOSE_SECONDS);
        if (phase.t >= BLINK_CLOSE_SECONDS) {
          phase.stage = "holding";
          phase.t = 0;
        }
      } else if (phase.stage === "holding") {
        weight = 1;
        if (phase.t >= BLINK_HOLD_SECONDS) {
          phase.stage = "opening";
          phase.t = 0;
        }
      } else {
        weight = Math.max(0, 1 - phase.t / BLINK_OPEN_SECONDS);
        if (phase.t >= BLINK_OPEN_SECONDS) {
          phase.stage = "idle";
          phase.t = 0;
          phase.nextAt = 2.5 + Math.random() * 4; // 2.5-6.5s, per spec
        }
      }
      vrm.expressionManager?.setValue(blinkName, weight);
      liveDebugRef.current.blinkStage = phase.stage;
    }

    // Debug-only snapshot (?avatarDebug=1) — mutated in place, never
    // setState here (see the ref's own comment for why). Cheap: a handful
    // of field writes, no allocation.
    liveDebugRef.current.isSpeaking = isAudibleRef.current;
    if (gazeEngineRef.current) {
      const gazeDebug = gazeEngineRef.current.getDebugState();
      liveDebugRef.current.gazeState = gazeDebug.state;
      liveDebugRef.current.gazeNextEventInSeconds = gazeDebug.nextEventInSeconds;
      liveDebugRef.current.gazeYawDeg = gazeDebug.yawDeg;
      liveDebugRef.current.gazePitchDeg = gazeDebug.pitchDeg;
    } else {
      liveDebugRef.current.gazeState = "unavailable";
    }

    // Facial expression — same additive-approach technique as the mouth
    // shapes below, just faster (EXPRESSION_APPROACH_RATE) so it reads as a
    // clear change rather than a slow fade. Two mutually exclusive modes:
    //
    // Phase Face (VRM Animation Studio) manual override active — drives
    // EVERY blend-shape name the model has (allExpressionNamesRef, not just
    // the emotion-preset subset) toward the override map's value for that
    // name (0 if the name isn't in the map), so eyebrows/eyes/mouth/emotion
    // shapes can all be posed independently and simultaneously. Always null
    // during normal TikTok Live playback, so this branch has zero effect on
    // existing behavior there.
    //
    // No override (the live runtime's normal case) — falls back to the
    // AI-emotion system exactly as before: only the resolved emotion-preset
    // names are touched, one "winning" name at a time. Keyed by the
    // RESOLVED NAME, not the preset: EXPRESSION_FALLBACKS can point two
    // different presets at the same underlying morph (e.g. "surprised"
    // falling back to "happy" on a model missing a dedicated surprised
    // blend shape) — iterating by preset would process both, and whichever
    // preset happened to come later in EXPRESSION_PRESET_NAMES would
    // silently overwrite the other's value with 0 on every frame where it
    // wasn't the active target.
    const faceOverrides = faceExpressionOverrideRef.current;
    if (faceOverrides) {
      allExpressionNamesRef.current.forEach((name) => {
        const target = faceOverrides[name] ?? 0;
        const current = vrm.expressionManager?.getValue(name) ?? 0;
        const next = current + (target - current) * Math.min(1, EXPRESSION_APPROACH_RATE * delta);
        vrm.expressionManager?.setValue(name, next);
      });
    } else {
      const faceNames = faceExpressionsRef.current;
      const emotionTarget = currentEmotionTargetRef.current;
      const winningExpressionName = faceNames[emotionTarget];
      // Dialed back ONLY for "happy" while actively talking — that's the
      // one preset confirmed to collide with the viseme mouth shapes (per
      // direct feedback: it visibly pushed the lower lip forward).
      // "excited" also resolves to the "happy" preset (see
      // EMOTION_TO_EXPRESSION) so it's covered too — every other emotion is
      // left at full strength always, speaking or not, since nothing else
      // showed this collision.
      const emotionPeak = isAudibleRef.current && emotionTarget === "happy" ? EXPRESSION_PEAK_WHILE_SPEAKING : 1;
      faceExpressionUniqueNamesRef.current.forEach((name) => {
        const target = name === winningExpressionName ? emotionPeak : 0;
        const current = vrm.expressionManager?.getValue(name) ?? 0;
        const next = current + (target - current) * Math.min(1, EXPRESSION_APPROACH_RATE * delta);
        vrm.expressionManager?.setValue(name, next);
      });
    }

    const audio = audioRef.current;
    let targetShape: VisemeShape | null = null;
    let targetIntensity = 0;
    // Gated on the `playing` event (see isAudibleRef above), not just
    // !audio.paused — that flips false synchronously the instant .play() is
    // called, well before the file has actually downloaded/buffered enough
    // to produce real sound. Without this, a reply could visibly start
    // moving the mouth while the audio is still loading from R2.
    if (audio && isAudibleRef.current) {
      const compensatedTime = Math.max(0, audio.currentTime - LIPSYNC_LATENCY_COMPENSATION_SECONDS);
      const active = findActiveViseme(visemeDataRef.current ?? [], compensatedTime);
      if (active) {
        targetShape = active.shape;
        // Base strength scaled per-interval — full for vowels, reduced for
        // "neutral" consonants and anticipatory pre-shaping, 0 for "closed"
        // (see tiktok-live-viseme.ts). Full-strength (1.0 scale, vowels)
        // read as exaggerated/"over" per feedback, hence BASE_MOUTH_INTENSITY
        // itself already being halved. Further scaled by the reply's actual
        // loudness at this instant (see avatar-audio-amplitude.ts) when an
        // envelope is available — 1 (no-op) otherwise, so quiet vs loud
        // syllables read differently instead of every vowel snapping to the
        // exact same intensity.
        const amplitude = sampleAmplitude(amplitudeEnvelopeRef.current, compensatedTime);
        targetIntensity = BASE_MOUTH_INTENSITY * active.intensityScale * amplitude;
      }
    }

    const mouthNames = mouthExpressionsRef.current;
    // The "ih" preset doubles as the resting/neutral talking shape for
    // consonants that aren't a full bilabial closure (VisemeShape's
    // "neutral") — reusing an existing resolved preset name rather than
    // needing a dedicated blend-shape target for it.
    const neutralName = mouthNames.i;
    (Object.keys(VOWEL_TO_PRESET) as Vowel[]).forEach((vowel) => {
      const name = mouthNames[vowel];
      if (!name) return;
      // A Phase Face override explicitly posing this SAME blend-shape name
      // (e.g. the Studio's own "AA"/"OU"/etc sliders — VRM's standard vowel
      // preset names are exactly the mouth shapes these sliders expose)
      // wins outright, same override priority as everywhere else in this
      // file. Without this, lip-sync ran unconditionally every frame
      // (driving every vowel toward 0 whenever it's not the currently
      // "spoken" one — which in the Studio is ALWAYS true, since no audio
      // ever plays there) and silently fought the Face panel back to 0 the
      // instant the admin let go of a mouth slider, making it look
      // completely unresponsive despite the override genuinely being set.
      if (faceExpressionOverrideRef.current && name in faceExpressionOverrideRef.current) return;
      const isTarget = targetShape === vowel || (targetShape === "neutral" && name === neutralName);
      const target = isTarget ? targetIntensity : 0;
      const current = vrm.expressionManager?.getValue(name) ?? 0;
      // Approach the target smoothly instead of snapping, so brief consonant
      // gaps between vowels don't visibly chatter the mouth shape. Opening
      // and closing deliberately approach at different rates — see
      // LIPSYNC_OPEN_RATE/LIPSYNC_CLOSE_RATE.
      const rate = target > current ? LIPSYNC_OPEN_RATE : LIPSYNC_CLOSE_RATE;
      const next = current + (target - current) * Math.min(1, rate * delta);
      vrm.expressionManager?.setValue(name, next);
    });

    // Phase J one-shot release blend — see releasingBonesRef's own comment
    // and CUSTOM_ANIMATION_RELEASE_SECONDS. Runs AFTER idle/gestures/gaze/
    // lip-sync above (so `bone.rotation` right now already holds whatever
    // idle naturally wants THIS frame, unclobbered) but BEFORE the Phase B
    // override block below (so a fresh Studio/Phase-J override on the same
    // bone this same frame always wins outright — see the block below).
    // Known gap, not fixed here: leftEye/rightEye specifically don't
    // actually release smoothly through this — same vrm.update()-overwrites-
    // eyes issue documented after vrm.update() below applies to whatever
    // this block writes for them too, since this runs BEFORE vrm.update().
    // Low-impact in practice (a saved clip would need to have deliberately
    // posed eye bones, a brand new capability as of this same change) —
    // worth fixing properly if that combination turns out to matter.
    if (releasingBonesRef.current.size > 0) {
      releasingBonesRef.current.forEach((state, boneName) => {
        const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (!bone) {
          releasingBonesRef.current.delete(boneName);
          return;
        }
        const t = Math.min(1, (clockRef.current - state.startedAt) / CUSTOM_ANIMATION_RELEASE_SECONDS);
        if (t >= 1) {
          releasingBonesRef.current.delete(boneName);
          return;
        }
        // Blending toward the CURRENT frame's idle-driven rotation (not a
        // fixed target captured once) — idle keeps moving underneath the
        // whole release, so this tracks it instead of aiming at a value
        // that's already stale by the time the blend finishes.
        const blended = slerpReleaseRotation(state.from, { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z }, t);
        bone.rotation.set(blended.x, blended.y, blended.z);
      });
    }

    // Phase B manual pose overrides (VRM Animation Studio only — always
    // empty during normal TikTok Live playback, since AvatarOverlayPlayer
    // never calls setBoneOverride) — applied LAST, after idle/gestures/
    // Mixamo clips/gaze-follow/everything else above, so the editor's
    // explicit pose always wins on whichever bones it's actively touching,
    // while every other bone (and every other system: blink, gaze, lip-
    // sync, breathing) keeps running completely normally underneath. Also
    // wins over a same-frame releasing bone above (a fresh override always
    // takes priority over a fading-out one) simply by running later.
    if (boneOverridesRef.current.size > 0) {
      boneOverridesRef.current.forEach((rotation, boneName) => {
        const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (bone) bone.rotation.set(rotation.x, rotation.y, rotation.z);
      });
    }

    // Phase C hand IK (VRM Animation Studio only — always empty during
    // normal TikTok Live playback). Runs AFTER the manual override block
    // above so IK always wins over a stale override on the same arm (also
    // guarded defensively at the source: setHandIkTarget already clears any
    // override on that arm the moment IK activates — see its own comment).
    // Same solveTwoBoneIK + roll-constrained aim already proven correct
    // fixing the runtime salute gesture (avatar-arm-ik.ts), applied at full
    // strength (no blend weight) since this is direct manual posing, not an
    // animated transition.
    if (handIkRef.current.size > 0) {
      vrm.scene.updateMatrixWorld(true);
      handIkRef.current.forEach(({ target, pole }, side) => {
        const upperBone = vrm.humanoid?.getNormalizedBoneNode(side === "left" ? "leftUpperArm" : "rightUpperArm");
        const lowerBone = vrm.humanoid?.getNormalizedBoneNode(side === "left" ? "leftLowerArm" : "rightLowerArm");
        const handBone = vrm.humanoid?.getNormalizedBoneNode(side === "left" ? "leftHand" : "rightHand");
        if (!upperBone || !lowerBone || !handBone) return;
        const upperLength = lowerBone.position.length();
        const lowerLength = handBone.position.length();
        const upperAxis = lowerBone.position.clone().normalize();
        const lowerAxis = handBone.position.clone().normalize();
        solveTwoBoneIK(upperBone, lowerBone, upperAxis, lowerAxis, upperLength, lowerLength, target, pole);
      });
    }

    vrm.expressionManager?.update();
    vrm.update(delta);

    // Eyeballs (Phase B manual override only) — reapplied AFTER vrm.update()
    // specifically, unlike every other overridden bone above. vrm.update()
    // internally calls vrm.lookAt.update(), which recalculates leftEye/
    // rightEye rotation from vrm.lookAt.target — running any EARLIER in the
    // frame (same spot as the rest of boneOverridesRef, right before
    // vrm.update()) would just get silently overwritten by that
    // recalculation a moment later, making a manual eye-bone pose look like
    // it does nothing. Nothing else vrm.update() touches has this problem —
    // it only recalculates eyes.
    if (boneOverridesRef.current.size > 0) {
      (["leftEye", "rightEye"] as const).forEach((boneName) => {
        const rotation = boneOverridesRef.current.get(boneName);
        if (!rotation) return;
        const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (bone) bone.rotation.set(rotation.x, rotation.y, rotation.z);
      });
    }
  });

  return <group ref={groupRef} />;
}

/**
 * Imperative handle for triggering interaction animations from outside the
 * component — e.g. `avatarRef.current?.playAnimation("greeting")`. Future
 * AI-driven emotion/gesture metadata (not implemented yet, see
 * avatar-animation-registry.ts's module comment) would call through this
 * same surface rather than needing new props threaded down.
 */
export interface AvatarCanvasHandle {
  playAnimation: (name: AvatarClipName, options?: { fadeDuration?: number }) => Promise<boolean>;
  stopAnimation: (fadeDuration?: number) => void;
  crossFadeTo: (name: AvatarClipName, duration?: number) => Promise<boolean>;
  isPlaying: (name?: AvatarClipName) => boolean;
  getCurrentAnimation: () => AvatarClipName | null;
  preloadAnimation: (name: AvatarClipName) => Promise<boolean>;
  preloadAll: () => Promise<void>;
  /** The 20-gesture procedural engine — e.g. `avatarRef.current?.playGesture("wave")`. Separate surface from playAnimation() above (that one drives Mixamo-retargeted full-body clips); these are client-side/bone-procedural only. */
  playGesture: (name: GestureName) => void;
  stopGesture: () => void;
  isPlayingGesture: (name?: GestureName) => boolean;
  getCurrentGesture: () => GestureName | null;
  /**
   * Which step of the currently-playing gesture is active right now — the
   * exact same data the `?avatarDebug=1` on-screen panel already reads via
   * `AvatarGestureEngine.getDebugState()`, just also exposed here so a
   * caller (the VRM Animation Studio's "Edit Gesture" — see that page's
   * buildGestureSeedKeyframes) can synchronize sampling to REAL step
   * transitions instead of guessing at arbitrary time intervals. Null
   * whenever no gesture is currently playing.
   */
  getGestureDebugState: () => { currentGesture: GestureName | null; stepIndex: number; stepPhase: string | null } | null;
  /** Phase B manual pose editor (VRM Animation Studio) — see AvatarBoneEditorApi. Empty/no-op until a VRM has finished loading; always safe to call regardless. */
  getAvailableBones: () => VRMHumanBoneName[];
  getBoneRotation: (boneName: VRMHumanBoneName) => { x: number; y: number; z: number } | null;
  setBoneOverride: (boneName: VRMHumanBoneName, x: number, y: number, z: number) => void;
  clearBoneOverride: (boneName: VRMHumanBoneName) => void;
  clearAllBoneOverrides: () => void;
  getBoneWorldPosition: (boneName: VRMHumanBoneName) => { x: number; y: number; z: number } | null;
  /** Phase C hand IK (VRM Animation Studio) — see AvatarBoneEditorApi. */
  setHandIkTarget: (side: "left" | "right", targetWorld: { x: number; y: number; z: number }, poleWorld: { x: number; y: number; z: number }) => void;
  clearHandIkTarget: (side: "left" | "right") => void;
  isHandIkActive: (side: "left" | "right") => boolean;
  /** Phase D manual finger pose (VRM Animation Studio) — see AvatarBoneEditorApi. */
  setFingerPose: (side: "left" | "right", pose: FingerPose) => void;
  clearFingerPose: (side: "left" | "right") => void;
  isFingerPoseActive: (side: "left" | "right") => boolean;
  /** Phase Face manual expression override (VRM Animation Studio) — see AvatarBoneEditorApi. */
  setFaceOverrides: (overrides: Record<string, number> | null) => void;
  isFaceExpressionActive: () => boolean;
  getAvailableFaceExpressions: () => string[];
  /** Phase J runtime custom-animation playback — see AvatarCustomAnimationApi. Unlike the Phase B/C/D/Face methods above, this one is meant to work on the live TikTok runtime too, not just the Studio. */
  playCustomAnimation: (keyframes: Keyframe[], options?: { loop?: boolean }) => void;
  stopCustomAnimation: () => void;
  isCustomAnimationPlaying: () => boolean;
}

/**
 * Phase J — plays back a saved VRM Animation Studio clip's keyframes
 * directly on the RUNTIME avatar (unlike AvatarBoneEditorApi above, this is
 * NOT studio-only — it's meant to also work from AvatarOverlayPlayer during
 * a real TikTok Live stream). Driven by this component's own useFrame loop
 * (not a page-level rAF loop, since a live overlay has no Studio page
 * running its own playback effect), reusing the exact same interpolation
 * math the Studio's preview already uses (see avatar-keyframe-playback.ts)
 * so a clip looks identical in both places. Deliberately just the playback
 * MECHANISM — nothing calls play() yet from the AI emotion/gesture
 * decision pipeline (tiktok-live-manager.ts), per explicit instruction not
 * to touch that system in this pass; wiring an actual trigger is future
 * work.
 */
export interface AvatarCustomAnimationApi {
  play: (keyframes: Keyframe[], options?: { loop?: boolean }) => void;
  stop: () => void;
  isPlaying: () => boolean;
}

interface AvatarCanvasProps {
  vrmUrl: string;
  /**
   * Accepted for backward compatibility with existing callers (live-tiktok
   * page, AvatarOverlayPlayer) but currently unused — idle motion is fully
   * procedural now (see AvatarIdleEngine), not driven by a per-gender
   * retargeted clip. Kept as a prop rather than removed from every call site
   * in case a future gender-tuned amplitude preset wants it.
   */
  gender?: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  visemeData: VisemeInterval[] | null;
  /** Optional real-loudness envelope for the currently playing reply — see avatar-audio-amplitude.ts. Null (including while a fresh one is still decoding) degrades to the previous fixed-intensity lip-sync, never breaks it. */
  amplitudeEnvelope?: AmplitudeEnvelope | null;
  /** AI-classified alongside the reply text — see AVATAR_MOTION_RULE in tiktok-live-manager.ts. Null/omitted reads as neutral. */
  emotion?: AvatarEmotion | null;
  /** Same classification pass; "none"/null plays no gesture, which is the common case. */
  gesture?: AvatarGesture | null;
  /** A stable per-reply identity (the comment's own id) — what actually retriggers gesture/expression playback, not the emotion/gesture value itself changing. */
  gestureKey?: string | null;
  /**
   * Saved "Edit Gesture" overrides for the 20-name procedural vocabulary
   * (VRM Animation Studio), keyed by the gesture name's own slug — see
   * gestureOverrideSlug(). When present for a gesture about to be played
   * (via the imperative playGesture() or the ?avatarDebug=1 panel's own
   * buttons), the saved keyframes play instead of AvatarGestureEngine's
   * hardcoded default, exactly like editing/saving already does in the
   * Studio's own preview — this is what makes that edit actually show up on
   * the live overlay too, not just in the editor. Omitted/empty always
   * falls back to the original procedural motion, so existing callers
   * (Studio's own canvas, which needs the RAW original when seeding a
   * first-time edit — see openGesture's own comment) are unaffected.
   */
  gestureOverrides?: Record<string, { keyframes: Keyframe[] }>;
  className?: string;
  /** Imperative animation control — see AvatarCanvasHandle. React 19 accepts `ref` as a plain prop on function components, no forwardRef() wrapper needed. */
  ref?: Ref<AvatarCanvasHandle>;
  /**
   * Editor-only extension point (VRM Animation Studio, Phase C) — rendered
   * INSIDE the same <Canvas> as the avatar, alongside <AvatarModel>, so a
   * caller can compose its own R3F objects (camera controls, IK target
   * gizmos) that share the exact same scene/camera context without
   * AvatarCanvas needing to know anything about them. Omitted (the live
   * TikTok runtime never passes this) renders nothing extra — zero effect
   * on existing behavior.
   */
  children?: ReactNode;
  /** Editor-only (VRM Animation Studio, Phase C) — see AvatarModelProps.onCameraFramed. Omitted (the live TikTok runtime never passes this) has zero effect on existing behavior. */
  onCameraFramed?: (target: { x: number; y: number; z: number }, distance: number) => void;
}

/** ?avatarDebug=1 in the URL, checked once — never on by default in production, per explicit instruction. Read outside React state since it can't change during a session. */
function readAvatarDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("avatarDebug") === "1";
}

/**
 * Realtime 3D VRM avatar — meant to be mounted via next/dynamic(ssr:false),
 * since <Canvas> touches WebGL/document during Next's server-side render
 * pass even inside a "use client" component.
 */
export default function AvatarCanvas({
  vrmUrl,
  audioRef,
  visemeData,
  amplitudeEnvelope,
  emotion,
  gesture,
  gestureKey,
  gestureOverrides,
  className,
  ref,
  children,
  onCameraFramed,
}: AvatarCanvasProps) {
  const visemeDataRef = useRef<VisemeInterval[] | null>(visemeData);
  useEffect(() => {
    visemeDataRef.current = visemeData;
  }, [visemeData]);

  const amplitudeEnvelopeRef = useRef<AmplitudeEnvelope | null>(amplitudeEnvelope ?? null);
  useEffect(() => {
    amplitudeEnvelopeRef.current = amplitudeEnvelope ?? null;
  }, [amplitudeEnvelope]);

  const emotionRef = useRef<AvatarEmotion | null>(emotion ?? null);
  useEffect(() => {
    emotionRef.current = emotion ?? null;
  }, [emotion]);

  const gestureRef = useRef<AvatarGesture | null>(gesture ?? null);
  useEffect(() => {
    gestureRef.current = gesture ?? null;
  }, [gesture]);

  const gestureKeyRef = useRef<string | null>(gestureKey ?? null);
  useEffect(() => {
    gestureKeyRef.current = gestureKey ?? null;
  }, [gestureKey]);

  const gestureOverridesRef = useRef(gestureOverrides);
  useEffect(() => {
    gestureOverridesRef.current = gestureOverrides;
  }, [gestureOverrides]);

  const [error, setError] = useState<string | null>(null);
  // A VRM file can be several/tens of MB (the shared gallery templates run
  // ~10MB+) and this canvas otherwise renders nothing at all — just an empty
  // transparent area — until the model is fully loaded. Without this, a slow
  // connection reads as "stuck/broken" rather than "still downloading."
  const [loadingPercent, setLoadingPercent] = useState<number | null>(0);

  // The controller instance lives inside AvatarModel (it's VRM-specific,
  // recreated on every vrmUrl change) — bridged up here via onControllerReady
  // so the imperative handle below always calls through to whichever
  // controller is current, without AvatarCanvas needing to own VRM loading itself.
  const controllerRef = useRef<AvatarAnimationController | null>(null);
  // Same bridging pattern as controllerRef, for the 20-gesture engine.
  const gestureEngineOuterRef = useRef<AvatarGestureEngine | null>(null);
  // Same bridging pattern, for the Phase B manual pose editor.
  const boneEditorOuterRef = useRef<AvatarBoneEditorApi | null>(null);
  // Same bridging pattern, for Phase J runtime custom-animation playback —
  // populated at MOUNT (see AvatarModel's own onCustomAnimationApiReady
  // effect), not gated behind VRM load like boneEditorOuterRef, since the
  // live runtime needs this available immediately.
  const customAnimationOuterRef = useRef<AvatarCustomAnimationApi | null>(null);

  // Shared by the imperative playGesture() handle AND the ?avatarDebug=1
  // panel's own gesture buttons below — a saved Studio override (see
  // gestureOverrides prop's own comment) plays via the SAME one-shot custom-
  // animation mechanism the AI-picked Global Library already uses, not the
  // hardcoded procedural engine. No saved override falls straight through to
  // the original behavior, unchanged.
  function triggerGesture(name: GestureName) {
    const override = gestureOverridesRef.current?.[gestureOverrideSlug(name)];
    if (override && override.keyframes.length > 0) {
      customAnimationOuterRef.current?.play(override.keyframes, { loop: false });
    } else {
      gestureEngineOuterRef.current?.playGesture(name);
    }
  }
  function stopTriggeredGesture() {
    gestureEngineOuterRef.current?.stopGesture();
    customAnimationOuterRef.current?.stop();
  }

  useImperativeHandle(
    ref,
    () => ({
      playAnimation: (name, options) => controllerRef.current?.playAnimation(name, options) ?? Promise.resolve(false),
      stopAnimation: (fadeDuration) => controllerRef.current?.stopAnimation(fadeDuration),
      crossFadeTo: (name, duration) => controllerRef.current?.crossFadeTo(name, duration) ?? Promise.resolve(false),
      isPlaying: (name) => controllerRef.current?.isPlaying(name) ?? false,
      getCurrentAnimation: () => controllerRef.current?.getCurrentAnimation() ?? null,
      preloadAnimation: (name) => controllerRef.current?.preloadAnimation(name) ?? Promise.resolve(false),
      preloadAll: () => controllerRef.current?.preloadAll() ?? Promise.resolve(),
      playGesture: (name) => triggerGesture(name),
      stopGesture: () => stopTriggeredGesture(),
      isPlayingGesture: (name) => gestureEngineOuterRef.current?.isPlaying(name) ?? false,
      getCurrentGesture: () => gestureEngineOuterRef.current?.getCurrentGesture() ?? null,
      getGestureDebugState: () => gestureEngineOuterRef.current?.getDebugState() ?? null,
      getAvailableBones: () => boneEditorOuterRef.current?.getAvailableBones() ?? [],
      getBoneRotation: (boneName) => boneEditorOuterRef.current?.getBoneRotation(boneName) ?? null,
      setBoneOverride: (boneName, x, y, z) => boneEditorOuterRef.current?.setBoneOverride(boneName, x, y, z),
      clearBoneOverride: (boneName) => boneEditorOuterRef.current?.clearBoneOverride(boneName),
      clearAllBoneOverrides: () => boneEditorOuterRef.current?.clearAllBoneOverrides(),
      getBoneWorldPosition: (boneName) => boneEditorOuterRef.current?.getBoneWorldPosition(boneName) ?? null,
      setHandIkTarget: (side, targetWorld, poleWorld) => boneEditorOuterRef.current?.setHandIkTarget(side, targetWorld, poleWorld),
      clearHandIkTarget: (side) => boneEditorOuterRef.current?.clearHandIkTarget(side),
      isHandIkActive: (side) => boneEditorOuterRef.current?.isHandIkActive(side) ?? false,
      setFingerPose: (side, pose) => boneEditorOuterRef.current?.setFingerPose(side, pose),
      clearFingerPose: (side) => boneEditorOuterRef.current?.clearFingerPose(side),
      isFingerPoseActive: (side) => boneEditorOuterRef.current?.isFingerPoseActive(side) ?? false,
      setFaceOverrides: (overrides) => boneEditorOuterRef.current?.setFaceOverrides(overrides),
      isFaceExpressionActive: () => boneEditorOuterRef.current?.isFaceExpressionActive() ?? false,
      getAvailableFaceExpressions: () => boneEditorOuterRef.current?.getAvailableFaceExpressions() ?? [],
      playCustomAnimation: (keyframes, options) => customAnimationOuterRef.current?.play(keyframes, options),
      stopCustomAnimation: () => customAnimationOuterRef.current?.stop(),
      isCustomAnimationPlaying: () => customAnimationOuterRef.current?.isPlaying() ?? false,
    }),
    []
  );

  // ?avatarDebug=1 only — never rendered by default, checked once (can't
  // change mid-session). Powers both the small state panel and the
  // dev-only test buttons below.
  const [debugEnabled] = useState(readAvatarDebugFlag);
  const [debugState, setDebugState] = useState<AvatarAnimationDebugState | null>(null);
  const [gestureDebugState, setGestureDebugState] = useState<ReturnType<AvatarGestureEngine["getDebugState"]> | null>(null);
  // Bridged up once from AvatarModel (see onDebugRefReady) — AvatarModel
  // mutates the ref's `.current` in place every frame; this component only
  // ever reads it from the same non-per-frame poll below, never inside useFrame.
  const liveDebugSourceRef = useRef<RefObject<AvatarLiveDebugSnapshot> | null>(null);
  const [liveDebug, setLiveDebug] = useState<AvatarLiveDebugSnapshot | null>(null);
  useEffect(() => {
    if (!debugEnabled) return;
    // Polled on an interval rather than per-frame — this is a debug-only
    // display, not part of the render loop, so setState here never conflicts
    // with the "no setState per frame" rule that applies to useFrame.
    const id = setInterval(() => {
      setDebugState(controllerRef.current?.getDebugState() ?? null);
      setGestureDebugState(gestureEngineOuterRef.current?.getDebugState() ?? null);
      const snapshot = liveDebugSourceRef.current?.current;
      if (snapshot) setLiveDebug({ ...snapshot });
    }, 400);
    return () => clearInterval(id);
  }, [debugEnabled]);

  return (
    <div className={cn("relative", className)}>
      <Canvas
        camera={{ fov: 28, near: 0.1, far: 20 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[0.6, 1.2, 1]} intensity={0.8} />
        <AvatarModel
          vrmUrl={vrmUrl}
          audioRef={audioRef}
          visemeDataRef={visemeDataRef}
          amplitudeEnvelopeRef={amplitudeEnvelopeRef}
          emotionRef={emotionRef}
          gestureRef={gestureRef}
          gestureKeyRef={gestureKeyRef}
          onReady={() => setError(null)}
          onError={setError}
          onProgress={setLoadingPercent}
          onControllerReady={(controller) => {
            controllerRef.current = controller;
          }}
          onGestureEngineReady={(engine) => {
            gestureEngineOuterRef.current = engine;
          }}
          onBoneEditorReady={(api) => {
            boneEditorOuterRef.current = api;
          }}
          onDebugRefReady={(ref) => {
            liveDebugSourceRef.current = ref;
          }}
          onCameraFramed={onCameraFramed}
          onCustomAnimationApiReady={(api) => {
            customAnimationOuterRef.current = api;
          }}
        />
        {children}
      </Canvas>
      {loadingPercent !== null && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs">{loadingPercent > 0 ? `Memuat avatar... ${loadingPercent}%` : "Memuat avatar..."}</span>
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-xs text-red-300">
          {error}
        </div>
      )}
      {debugEnabled && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-black/70 p-2 font-mono text-[10px] leading-tight text-lime-300">
          <div>Animation: {debugState?.currentAnimation ?? "idle"} (blend {debugState?.blend ?? 0})</div>
          <div>VRM: {error ? "error" : loadingPercent === null ? "loaded" : "loading"}</div>
          <div>Mixer: {debugState?.mixerActive ? "active" : "idle"}</div>
          <div>Loaded: {debugState?.loadedAnimations.join(", ") || "-"}</div>
          {debugState && debugState.failedAnimations.length > 0 && <div className="text-red-400">Failed: {debugState.failedAnimations.join(", ")}</div>}
          <div>
            Gaze: {liveDebug?.gazeState ?? "unavailable"}
            {liveDebug && liveDebug.gazeState !== "unavailable"
              ? ` (yaw ${liveDebug.gazeYawDeg.toFixed(1)}°, pitch ${liveDebug.gazePitchDeg.toFixed(1)}°, next in ${liveDebug.gazeNextEventInSeconds.toFixed(1)}s)`
              : ""}
          </div>
          <div>Blink: {liveDebug?.blinkStage ?? "idle"}</div>
          <div>Speaking: {liveDebug?.isSpeaking ? "yes" : "no"}</div>
          {liveDebug?.ikDebug && (
            <div>
              IK: hand-to-target dist {(liveDebug.ikDebug.handWorld.distanceTo(liveDebug.ikDebug.targetWorld) * 100).toFixed(1)}cm (spheres: red=target
              blue=pole green=hand)
            </div>
          )}
          <div className="pointer-events-auto mt-1 flex flex-wrap gap-1">
            {AVATAR_CLIP_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => controllerRef.current?.playAnimation(name)}
                className="rounded bg-white/10 px-2 py-1 text-white hover:bg-white/20"
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => controllerRef.current?.stopAnimation()}
              className="rounded bg-white/10 px-2 py-1 text-white hover:bg-white/20"
            >
              idle
            </button>
          </div>
          <div>
            Gesture: {gestureDebugState?.currentGesture ?? "idle"}
            {gestureDebugState?.stepPhase ? ` (${gestureDebugState.stepPhase})` : ""}
          </div>
          <div className="pointer-events-auto mt-1 flex flex-wrap gap-1">
            {GESTURE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => triggerGesture(name)}
                className="rounded bg-emerald-500/20 px-2 py-1 text-white hover:bg-emerald-500/30"
              >
                {name}
                {gestureOverrides?.[gestureOverrideSlug(name)] ? " *" : ""}
              </button>
            ))}
            <button
              type="button"
              onClick={() => stopTriggeredGesture()}
              className="rounded bg-emerald-500/20 px-2 py-1 text-white hover:bg-emerald-500/30"
            >
              idle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
