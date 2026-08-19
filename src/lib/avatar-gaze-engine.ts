import * as THREE from "three";
import { createSpring, stepSpring, type Spring } from "@/lib/spring";

// ============================================================================
// Eye-gaze micro-behavior — layered on top of the existing vrm.lookAt system
// (not a replacement for it): the caller points vrm.lookAt.target at an
// object this engine repositions every frame. Gaze stays dominantly on that
// target (direct "eye contact" with the camera/viewer) and only occasionally
// breaks away for a brief, subtle glance before easing back — never a
// continuous sinusoidal drift, purely event-driven + spring easing, same
// technique family as AvatarIdleEngine but intentionally its own class:
// gaze is a discrete state machine (camera / glance), idle body motion is
// continuous noise — different enough shapes to not share one engine.
//
// Explicitly OUT of scope here (untouched, owned by AvatarCanvas.tsx):
// lip-sync, blink, breathing, gestures, VRM loading.
// ============================================================================

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** A random value in [-max, -max*MIN_GLANCE_MAGNITUDE_FRACTION] ∪ [max*MIN_GLANCE_MAGNITUDE_FRACTION, max] — see MIN_GLANCE_MAGNITUDE_FRACTION's comment for why a bare -1..1 draw isn't used here. */
function signedMagnitude(max: number): number {
  const fraction = randRange(MIN_GLANCE_MAGNITUDE_FRACTION, 1);
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * fraction * max;
}

// How often gaze breaks away from the camera for a brief glance — per spec,
// 5-15s. The MAJORITY of time is spent in the "camera" state (this is the
// interval BETWEEN glances), which is what keeps gaze dominant rather than
// evenly split — a glance itself only lasts GLANCE_HOLD_SECONDS.
const GLANCE_INTERVAL_SECONDS: [number, number] = [5, 15];
// How long a glance is held before easing back to the camera. Raised from
// 0.5-1.1s — audited live: a 0.5s hold only gives the gaze spring ~0.35s to
// actually rise (the rest is polling/render overhead in practice), visibly
// undershooting the intended angle before it has to ease back out again.
const GLANCE_HOLD_SECONDS: [number, number] = [0.65, 1.3];
// These represent the DESIRED REAL/VISIBLE eye rotation at FULL random
// magnitude — subtle by spec, a few degrees, not a dramatic look-away.
// Vertical kept a touch smaller than horizontal (real glances read as more
// often side-to-side). Confirmed empirically these are NOT what actually
// reaches the eye bone raw, though — see inputCompensationScale below.
// Raised from 4.5°/2.5° — audited live over ~70s of real playback: even
// with compensation applied, the OBSERVED max across several glances was
// only ~2.2°/1.6°, well under target. Two compounding causes, both
// addressed here: (1) MIN_GLANCE_MAGNITUDE_FRACTION below (a uniform
// -1..1 draw allows a near-zero glance — not a bug, just unlucky RNG, but
// worth guarding against so no single glance reads as "nothing happened"),
// (2) the short hold above not leaving quite enough time for the spring to
// finish rising. Raising the target compensates for whatever a real glance
// still doesn't fully reach in a short hold.
const GLANCE_YAW_MAX_DEG = 7;
const GLANCE_PITCH_MAX_DEG = 4;
// Every glance's magnitude is drawn from [MIN, 1] of the max above (times a
// random sign) rather than a bare -1..1 — a pure uniform draw allows a
// glance so small it reads as "eyes didn't move at all," which is exactly
// what direct feedback on a real render flagged. This guarantees a glance
// is always at least half its max amplitude, while still varying event to
// event (real glances aren't all identical either).
const MIN_GLANCE_MAGNITUDE_FRACTION = 0.5;
// Raised from 34 — audited live: the eyes' own spring needs to rise fast
// enough to be clearly past its midpoint well within the (now slightly
// longer) hold above. Damping kept just under critical (2*sqrt(45)≈13.4)
// for a smooth ease with only a hint of overshoot, same reasoning as before.
const GAZE_STIFFNESS = 45;
const GAZE_DAMPING = 13;
// Head follows a FRACTION of the eyes' own REAL/VISIBLE movement, per spec 10-15%.
const HEAD_FOLLOW_FRACTION = 0.13;
// Deliberately softer/slower than the eyes' own spring — chasing the eyes'
// already-eased value (not the raw glance target) through a second, weaker
// spring is what produces the "head follows a beat later" lag, same
// chain-lag technique already used for forearm-chases-upper-arm in
// AvatarIdleEngine, rather than a literal delay buffer.
const HEAD_FOLLOW_STIFFNESS = 14;
const HEAD_FOLLOW_DAMPING = 7;

type GazeState = "camera" | "glance";

export interface GazeEngineOptions {
  /**
   * VRMLookAtBoneApplier scales its input yaw/pitch down before applying it
   * to the eye bone — `outputScale * saturate(input / inputMaxValue)`
   * (confirmed directly against a real loaded VRM: 90°in → only 10°out max,
   * meaning a "subtle" 9° glance request was landing as ~1° of ACTUAL eye
   * rotation — invisible in practice, which is exactly the bug this option
   * exists to fix). Pass `inputMaxValue / outputScale` from the VRM's own
   * applier (see AvatarCanvas.tsx) so this engine's internally-generated
   * target gets pre-inflated by the same ratio the model will scale back
   * down — the net result lands at the intended REAL angle regardless of
   * how aggressively any given VRM's own calibration compresses it.
   * Defaults to 1 (no compensation) for a model whose applier type this
   * can't introspect (e.g. an expression-based applier) — degrades to
   * "whatever the model does with the raw angle" rather than crashing.
   */
  inputCompensationScale?: number;
}

export interface GazePose {
  /** Radians — INFLATED by inputCompensationScale, meant only for feeding the gazeTarget-position geometry (see AvatarCanvas.tsx). Not a real/visible angle by itself. */
  eyeYaw: number;
  /** Radians — INFLATED, see eyeYaw. */
  eyePitch: number;
  /** Radians, small delayed fraction of the REAL (non-inflated) eye yaw — see HEAD_FOLLOW_FRACTION. */
  headFollowYaw: number;
  /** Radians, small delayed fraction of the REAL (non-inflated) eye pitch. */
  headFollowPitch: number;
}

export interface GazeDebugState {
  state: GazeState;
  nextEventInSeconds: number;
  /** REAL/visible angle (already compensated back down), not the inflated geometry-facing value. */
  yawDeg: number;
  pitchDeg: number;
}

/** One instance per mounted avatar — created once at VRM-load time (only when vrm.lookAt is actually available, see AvatarCanvas.tsx), `update()` called every frame from useFrame. All state lives in plain fields; no allocation inside update(). */
export class AvatarGazeEngine {
  private readonly inputCompensationScale: number;

  private state: GazeState = "camera";
  private timer = randRange(...GLANCE_INTERVAL_SECONDS);
  private yawTarget = 0;
  private pitchTarget = 0;

  private readonly yawSpring: Spring = createSpring();
  private readonly pitchSpring: Spring = createSpring();
  private readonly headFollowYawSpring: Spring = createSpring();
  private readonly headFollowPitchSpring: Spring = createSpring();

  constructor(options: GazeEngineOptions = {}) {
    this.inputCompensationScale = options.inputCompensationScale && options.inputCompensationScale > 0 ? options.inputCompensationScale : 1;
  }

  update(delta: number): GazePose {
    this.timer -= delta;
    if (this.timer <= 0) {
      if (this.state === "camera") {
        this.state = "glance";
        this.timer = randRange(...GLANCE_HOLD_SECONDS);
        this.yawTarget = signedMagnitude(THREE.MathUtils.degToRad(GLANCE_YAW_MAX_DEG)) * this.inputCompensationScale;
        this.pitchTarget = signedMagnitude(THREE.MathUtils.degToRad(GLANCE_PITCH_MAX_DEG)) * this.inputCompensationScale;
      } else {
        this.state = "camera";
        this.timer = randRange(...GLANCE_INTERVAL_SECONDS);
        this.yawTarget = 0;
        this.pitchTarget = 0;
      }
    }

    const eyeYaw = stepSpring(this.yawSpring, this.yawTarget, delta, GAZE_STIFFNESS, GAZE_DAMPING);
    const eyePitch = stepSpring(this.pitchSpring, this.pitchTarget, delta, GAZE_STIFFNESS, GAZE_DAMPING);
    // Head-follow is based on the REAL angle (inflated value divided back
    // down), never the inflated one — the head bone has no equivalent
    // range-map compensation, so feeding it the inflated value would turn a
    // subtle glance into a visibly large head turn.
    const eyeYawReal = eyeYaw / this.inputCompensationScale;
    const eyePitchReal = eyePitch / this.inputCompensationScale;
    // Chases the EYES' already-sprung (real) value (not yawTarget/pitchTarget
    // directly) through its own softer spring — same "chase the previous
    // link's sprung output, not the raw target" pattern used for
    // forearm-chases-upper-arm in AvatarIdleEngine, which is what produces
    // the lag without a literal delay buffer.
    const headFollowYaw = stepSpring(
      this.headFollowYawSpring,
      eyeYawReal * HEAD_FOLLOW_FRACTION,
      delta,
      HEAD_FOLLOW_STIFFNESS,
      HEAD_FOLLOW_DAMPING
    );
    const headFollowPitch = stepSpring(
      this.headFollowPitchSpring,
      eyePitchReal * HEAD_FOLLOW_FRACTION,
      delta,
      HEAD_FOLLOW_STIFFNESS,
      HEAD_FOLLOW_DAMPING
    );

    return { eyeYaw, eyePitch, headFollowYaw, headFollowPitch };
  }

  getDebugState(): GazeDebugState {
    return {
      state: this.state,
      nextEventInSeconds: Math.max(0, this.timer),
      yawDeg: THREE.MathUtils.radToDeg(this.yawSpring.value / this.inputCompensationScale),
      pitchDeg: THREE.MathUtils.radToDeg(this.pitchSpring.value / this.inputCompensationScale),
    };
  }
}
