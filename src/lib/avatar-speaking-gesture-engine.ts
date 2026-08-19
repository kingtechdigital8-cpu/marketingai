import * as THREE from "three";
import { createSpring, stepSpring, type Spring } from "@/lib/spring";

// ============================================================================
// "professional_presenter_hands" — a continuous, looping speaking-idle layer:
// REST -> TOGETHER -> hold -> OPEN -> hold -> RETURN -> REST, repeating for
// as long as the avatar is speaking, fading in/out (never snapping) via its
// own internal weight spring driven by the caller's `speaking` flag.
//
// Deliberately a SEPARATE engine from AvatarGestureEngine (one-shot,
// triggered-then-returns-to-null reaction gestures) and AvatarIdleEngine
// (always-on baseline sway/breathing) — this sits in between: only active
// while speaking, but continuous/looping rather than a single reaction.
//
// Output is intentionally in the SAME raw, uncalibrated space AvatarCanvas.tsx
// already uses for the older gesturePose system (raise deltas added inside
// the existing `armSign * (ARM_DOWN_Z + ...)` expressions, reach magnitude
// consumed through the existing armReach-axis placement) — this file never
// touches per-model calibration itself, the caller's existing ternary chain
// already does that correctly for every other system.
// ============================================================================

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randHold([min, max]: [number, number]): number {
  return randRange(min, max);
}

type Phase = "rest" | "together" | "holdTogether" | "open" | "holdOpen" | "return";

const PHASE_ORDER: Phase[] = ["rest", "together", "holdTogether", "open", "holdOpen", "return"];

// Duration ranges per phase, ms — rerolled every time that phase is entered
// (spec: vary timing across loops, not a metronomic fixed-length cycle).
const PHASE_DURATION_MS: Record<Phase, [number, number]> = {
  rest: [1400, 3200], // a beat of plain idle between cycles — not every moment of speech gets a gesture
  together: [500, 850],
  holdTogether: [350, 750],
  open: [450, 800],
  holdOpen: [600, 1300],
  return: [500, 900],
};

// Raise = how far UP from ARM_DOWN_Z rest the upper arm lifts (negative
// delta, added inside the existing `ARM_DOWN_Z + ...` expression — see
// AvatarCanvas.tsx). Originally matched palms_together's own magnitude
// (-0.75/0.55 reach) exactly, but audited live: the reach axis this
// project's per-model calibration (calibrateArmReachAxis) picks isn't
// guaranteed to read as "swing inward" at every model's proportions the
// same way it does for the older gesture's specific pose — on at least one
// avatar it visibly widened rather than narrowed the arms at that combined
// magnitude. Scaled back across the board (raise/reach/elbow together,
// not just reach in isolation, since the elbow fold is what actually
// carries most of "hands toward center" here) for a smaller, safer,
// genuinely subtle motion — matches the spec's own "harus subtle dan
// profesional" more literally too. Values here are the LOOP-CENTER a given
// cycle randomizes around (see AMPLITUDE_JITTER/asym below), not fixed.
const TOGETHER_RAISE = -0.55;
const OPEN_RAISE = -0.45;

// Reach = magnitude toward body-center on the calibrated reach axis (same
// semantic/scale as the existing gesturePose's leftUpperArmX/rightUpperArmX).
// Deliberately a smaller fraction of the total pose than palms_together
// uses — see TOGETHER_RAISE's comment — with the elbow fold below doing
// more of the actual "bring the hand to center" work instead. OPEN backs
// off further (hands separate a little) without ever going negative — the
// spec explicitly forbids swinging wide ("jangan membuka tangan terlalu lebar").
const TOGETHER_REACH = 0.3;
const OPEN_REACH_BASE = 0.12;

// Elbow fold — added inside `ELBOW_BEND_Z + ...`, same convention as
// idle's own armSecondary.lowerArm term.
const TOGETHER_ELBOW = -0.78;
const OPEN_ELBOW = -0.48;

// Per-cycle random jitter ranges — this is the "don't repeat identically"
// requirement: amplitude, hand separation, and left/right asymmetry are
// re-rolled every time a fresh TOGETHER phase starts, held for that whole
// cycle (not re-rolled every frame — a real gesture doesn't wobble in
// amplitude mid-motion).
const AMPLITUDE_JITTER: [number, number] = [0.85, 1.15];
const OPEN_REACH_JITTER: [number, number] = [0.7, 1.3]; // multiplies OPEN_REACH_BASE — "hand separation" variety
const SIDE_ASYMMETRY_MAX = 0.08; // one arm opens/raises a hair more than the other, per cycle

const WRIST_ROTATION_MAX = 0.12; // subtle — spec explicitly warns against extreme wrist rotation
const ELBOW_POSITION_JITTER_MAX = 0.06; // small per-cycle elbow-fold variance on top of the phase target

// Weight (0..1, "is this engine currently contributing at all") fades via a
// spring rather than an exponential lerp — matches this project's own
// established smoothing primitive (spring.ts) and gives the fade a touch of
// natural ease rather than a flat exponential curve. Slow enough that
// starting/stopping speaking never reads as a pose "snapping" in or out.
const WEIGHT_STIFFNESS = 12;
const WEIGHT_DAMPING = 7;

// Body/hand output channels chase their phase target through a spring —
// same role as AvatarGestureEngine's bodySprings. Originally tuned softer
// (stiffness 26) for a gentler feel, but audited against a live render:
// TOGETHER+holdTogether's combined ~0.85-1.6s window wasn't consistently
// enough time for a 26-stiffness spring to actually reach its target before
// the next phase pulled it toward a different one — the pose never fully
// arrived, which read as arms vaguely raised/spread rather than hands
// recognizably meeting at the center. Raised to actually settle within a
// typical hold, still smooth (damping ratio ~0.92, same as before).
const CHANNEL_STIFFNESS = 55;
const CHANNEL_DAMPING = 13;

// Voice-amplitude intensity scaling — continuous, not the spec's three
// discrete tiers taken literally (a hard low/medium/high switch would pop
// visibly every time loudness crosses a threshold); this spectrum still
// satisfies "speaking low: very small, speaking high: bigger" while staying
// smooth. Floor keeps a bare-minimum motion alive even during a quiet
// syllable — a presenter's hands don't freeze between words.
const INTENSITY_FLOOR = 0.45;
const INTENSITY_CEIL = 1.15;
const INTENSITY_APPROACH_RATE = 6; // per second, exponential — smooths frame-to-frame amplitude noise

export interface SpeakingGestureFrame {
  /** Added inside `armSign * (ARM_DOWN_Z + ...)`. */
  leftRaiseDelta: number;
  rightRaiseDelta: number;
  /** Raw magnitude toward body-center — caller applies armReach.sign/axis, same as gesturePose's leftUpperArmX/rightUpperArmX. */
  leftReach: number;
  rightReach: number;
  /** Added inside `armSign * (ELBOW_BEND_Z + ...)`. */
  leftElbowDelta: number;
  rightElbowDelta: number;
  /** Small additive wrist rotation (hand.rotation.z), NOT sign-multiplied by the caller (matches wristFlex's existing convention). */
  leftWristDelta: number;
  rightWristDelta: number;
  /** Additive on chest/spine .rotation.x and head .rotation.x/.rotation.y — same "+=" pattern the new gesture engine already uses for these bones. */
  chestLeanDelta: number;
  headOffsetXDelta: number;
  headOffsetYDelta: number;
}

const ZERO_FRAME: SpeakingGestureFrame = {
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

interface PhaseTargets {
  raise: number;
  reachL: number;
  reachR: number;
  elbow: number;
  wristL: number;
  wristR: number;
  chestLean: number;
  headOffsetX: number;
  headOffsetY: number;
}

/** One instance per mounted avatar — created once at VRM-load time alongside AvatarIdleEngine/AvatarGestureEngine, `update()` called every frame. */
export class AvatarSpeakingGestureEngine {
  private phase: Phase = "rest";
  private phaseElapsedMs = 0;
  private phaseHoldMs = randHold(PHASE_DURATION_MS.rest);

  // Re-rolled once per TOGETHER->...->RETURN cycle (see enterPhase), held
  // stable for that whole cycle — spec: vary between loops, not within one.
  private cycleAmplitude = randRange(...AMPLITUDE_JITTER);
  private cycleOpenReachScale = randRange(...OPEN_REACH_JITTER);
  private cycleAsymL = randRange(-SIDE_ASYMMETRY_MAX, SIDE_ASYMMETRY_MAX);
  private cycleAsymR = randRange(-SIDE_ASYMMETRY_MAX, SIDE_ASYMMETRY_MAX);
  private cycleWristL = randRange(-WRIST_ROTATION_MAX, WRIST_ROTATION_MAX);
  private cycleWristR = randRange(-WRIST_ROTATION_MAX, WRIST_ROTATION_MAX);
  private cycleElbowJitter = randRange(-ELBOW_POSITION_JITTER_MAX, ELBOW_POSITION_JITTER_MAX);
  private cycleHeadTiltSign = Math.random() < 0.5 ? -1 : 1;

  private readonly weight = createSpring();

  private readonly channels: Record<keyof PhaseTargets, Spring> = {
    raise: createSpring(),
    reachL: createSpring(),
    reachR: createSpring(),
    elbow: createSpring(),
    wristL: createSpring(),
    wristR: createSpring(),
    chestLean: createSpring(),
    headOffsetX: createSpring(),
    headOffsetY: createSpring(),
  };

  private readonly intensity = { current: INTENSITY_FLOOR };

  private enterPhase(phase: Phase) {
    this.phase = phase;
    this.phaseElapsedMs = 0;
    this.phaseHoldMs = randHold(PHASE_DURATION_MS[phase]);
    // Fresh per-cycle variety, rolled at the natural "start of a new
    // gesture" point rather than mid-motion — see field comments above.
    if (phase === "together") {
      this.cycleAmplitude = randRange(...AMPLITUDE_JITTER);
      this.cycleOpenReachScale = randRange(...OPEN_REACH_JITTER);
      this.cycleAsymL = randRange(-SIDE_ASYMMETRY_MAX, SIDE_ASYMMETRY_MAX);
      this.cycleAsymR = randRange(-SIDE_ASYMMETRY_MAX, SIDE_ASYMMETRY_MAX);
      this.cycleWristL = randRange(-WRIST_ROTATION_MAX, WRIST_ROTATION_MAX);
      this.cycleWristR = randRange(-WRIST_ROTATION_MAX, WRIST_ROTATION_MAX);
      this.cycleElbowJitter = randRange(-ELBOW_POSITION_JITTER_MAX, ELBOW_POSITION_JITTER_MAX);
      this.cycleHeadTiltSign = Math.random() < 0.5 ? -1 : 1;
    }
  }

  private targetsForPhase(): PhaseTargets {
    switch (this.phase) {
      case "rest":
      case "return":
        return { raise: 0, reachL: 0, reachR: 0, elbow: 0, wristL: 0, wristR: 0, chestLean: 0, headOffsetX: 0, headOffsetY: 0 };
      case "together":
      case "holdTogether":
        return {
          raise: TOGETHER_RAISE * this.cycleAmplitude,
          reachL: (TOGETHER_REACH + this.cycleAsymL) * this.cycleAmplitude,
          reachR: (TOGETHER_REACH + this.cycleAsymR) * this.cycleAmplitude,
          elbow: (TOGETHER_ELBOW + this.cycleElbowJitter) * this.cycleAmplitude,
          wristL: this.cycleWristL * 0.4,
          wristR: this.cycleWristR * 0.4,
          chestLean: 0.015 * this.cycleAmplitude,
          headOffsetX: 0,
          headOffsetY: 0.01 * this.cycleAmplitude,
        };
      case "open":
      case "holdOpen":
        return {
          raise: OPEN_RAISE * this.cycleAmplitude,
          reachL: OPEN_REACH_BASE * this.cycleOpenReachScale * this.cycleAmplitude + this.cycleAsymL,
          reachR: OPEN_REACH_BASE * this.cycleOpenReachScale * this.cycleAmplitude + this.cycleAsymR,
          elbow: (OPEN_ELBOW + this.cycleElbowJitter) * this.cycleAmplitude,
          wristL: this.cycleWristL,
          wristR: this.cycleWristR,
          chestLean: 0.025 * this.cycleAmplitude,
          headOffsetX: this.cycleHeadTiltSign * 0.018 * this.cycleAmplitude,
          headOffsetY: -0.008 * this.cycleAmplitude,
        };
    }
  }

  /**
   * @param speaking Whether the avatar is currently audible (same signal as isAudibleRef in AvatarCanvas.tsx) — drives the weight fade in/out.
   * @param voiceAmplitude 0..1 real loudness for the current instant (see avatar-audio-amplitude.ts's sampleAmplitude), or 0/omitted outside of speech. Only scales intensity, never gates the fade itself — that's `speaking`'s job.
   */
  update(delta: number, speaking: boolean, voiceAmplitude = 0): SpeakingGestureFrame {
    // Phase timer keeps advancing regardless of weight — deliberately, so
    // resuming speech mid-fade-out picks up an already-warm cycle instead of
    // restarting from a cold REST every time (reads as more continuously
    // "alive"), and so weight fading to 0 is a pure amplitude scale, never a
    // pose reset (spec: "jangan hard reset bone rotation").
    this.phaseElapsedMs += delta * 1000;
    if (this.phaseElapsedMs >= this.phaseHoldMs) {
      const nextIndex = (PHASE_ORDER.indexOf(this.phase) + 1) % PHASE_ORDER.length;
      this.enterPhase(PHASE_ORDER[nextIndex]);
    }

    const weightTarget = speaking ? 1 : 0;
    const weight = stepSpring(this.weight, weightTarget, delta, WEIGHT_STIFFNESS, WEIGHT_DAMPING);

    // Nothing left to compute or write once both the target and the spring
    // itself have settled at 0 — cheap early-out for the overwhelmingly
    // common "not speaking" case.
    if (weight < 0.001 && weightTarget === 0) return ZERO_FRAME;

    const targetIntensity = THREE.MathUtils.clamp(
      INTENSITY_FLOOR + (INTENSITY_CEIL - INTENSITY_FLOOR) * THREE.MathUtils.clamp(voiceAmplitude, 0, 1),
      INTENSITY_FLOOR,
      INTENSITY_CEIL
    );
    this.intensity.current += (targetIntensity - this.intensity.current) * Math.min(1, INTENSITY_APPROACH_RATE * delta);

    const targets = this.targetsForPhase();
    const scale = weight * this.intensity.current;

    const raise = stepSpring(this.channels.raise, targets.raise, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const reachL = stepSpring(this.channels.reachL, targets.reachL, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const reachR = stepSpring(this.channels.reachR, targets.reachR, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const elbow = stepSpring(this.channels.elbow, targets.elbow, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const wristL = stepSpring(this.channels.wristL, targets.wristL, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const wristR = stepSpring(this.channels.wristR, targets.wristR, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const chestLean = stepSpring(this.channels.chestLean, targets.chestLean, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const headOffsetX = stepSpring(this.channels.headOffsetX, targets.headOffsetX, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);
    const headOffsetY = stepSpring(this.channels.headOffsetY, targets.headOffsetY, delta, CHANNEL_STIFFNESS, CHANNEL_DAMPING);

    return {
      leftRaiseDelta: raise * scale,
      rightRaiseDelta: raise * scale,
      leftReach: reachL * scale,
      rightReach: reachR * scale,
      leftElbowDelta: elbow * scale,
      rightElbowDelta: elbow * scale,
      leftWristDelta: wristL * scale,
      rightWristDelta: wristR * scale,
      chestLeanDelta: chestLean * scale,
      headOffsetXDelta: headOffsetX * scale,
      headOffsetYDelta: headOffsetY * scale,
    };
  }
}
