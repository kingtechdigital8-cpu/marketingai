import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { createSpring, stepSpring, type Spring } from "@/lib/spring";

// ============================================================================
// Realistic idle body motion — replaces the old flat sine-wave sway/breathing
// with layered, spring-damped procedural motion: pelvis-driven weight shift
// propagating up a spine chain, shoulder counterbalance, and arm/hand
// secondary motion with follow-through. See the calling site in
// AvatarCanvas.tsx for how gestures/speaking take priority over this.
//
// Explicitly OUT of scope here (untouched, owned by AvatarCanvas.tsx):
// lip-sync, facial expression, blinking, gestures, VRM loading.
// ============================================================================

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Sum of a few incommensurate-period sines with a random per-instance phase — cheap stand-in for Perlin/simplex noise, good enough at body-sway amplitudes and never exactly repeats within any realistic viewing window. */
function lowFreqNoise(t: number, phase: number): number {
  return (
    Math.sin((t / 7.3) * Math.PI * 2 + phase) * 0.5 +
    Math.sin((t / 11.7) * Math.PI * 2 + phase * 1.7) * 0.3 +
    Math.sin((t / 17.1) * Math.PI * 2 + phase * 0.6) * 0.2
  );
}

type WeightState = "CENTER" | "LEFT" | "RIGHT";

// Spine-chain propagation — a pelvis lean doesn't stay isolated to the
// pelvis, it diminishes as it travels up through each joint. Also used for
// breathing propagation (see BREATH_FACTORS) at different weights.
const CHAIN_FACTORS: Record<"spine" | "chest" | "upperChest" | "neck" | "head", number> = {
  spine: 0.6,
  chest: 0.35,
  upperChest: 0.2,
  neck: 0.1,
  head: 0.05,
};
// Each link is a little softer/slower than the one below it — that's what
// makes the lean read as travelling UP through the body over a few frames
// rather than every bone snapping to its share instantly.
const CHAIN_STIFFNESS: Record<keyof typeof CHAIN_FACTORS, number> = {
  spine: 90,
  chest: 60,
  upperChest: 45,
  neck: 34,
  head: 26,
};
const CHAIN_DAMPING = 12;

const BREATH_FACTORS = { chest: 1, shoulder: 0.35, upperArm: 0.12, neck: 0.05, head: 0.03 };

// Pelvis rotation ranges, per spec — kept at the conservative end (see
// KNEE_COMPENSATION_GAIN below for why going much bigger than this risks
// re-opening the "melayang" floating bug from earlier this project).
const PELVIS_YAW_MAX = THREE.MathUtils.degToRad(1.5);
const PELVIS_ROLL_MAX = THREE.MathUtils.degToRad(1.5);
const PELVIS_PITCH_MAX = THREE.MathUtils.degToRad(0.8);
const PELVIS_Y_MAX = 0.01; // meters — ~1cm bob
const PELVIS_X_MAX = 0.018; // meters — horizontal shift toward the weight-bearing leg
const PELVIS_STIFFNESS = 40;
const PELVIS_DAMPING = 11;
// The continuous low-freq noise portion of pelvis sway (as opposed to the
// discrete weight-shift/posture-correction events) — kept small on purpose.
// Direct feedback: idle should read as "mostly still, occasionally adjusts"
// (spec's explicit 80%-still/20%-adjustment principle), not as perpetually
// drifting even at low amplitude. The weight-shift state machine and
// posture-correction timer are what supply the noticeable "20%" moments;
// this constant noise layer is just enough to avoid a dead-frozen pelvis
// between those events, not a second independent sway on top of them.
const PELVIS_NOISE_WEIGHT = 0.15;

// A perfectly straight leg at rest reads as "locked knee" — real standing
// posture always carries a couple degrees of knee softness even with zero
// weight shift in progress. Added unconditionally on top of the existing
// weight-shift-driven knee compensation below. 4° (not 3°) — the knee
// spring is deliberately a little underdamped (see KNEE_STIFFNESS/DAMPING)
// so it can briefly dip a degree or so below target on a fast transition;
// the extra headroom keeps it from ever reading as fully locked even mid-dip.
const KNEE_IDLE_BASE_BEND = THREE.MathUtils.degToRad(4);
const KNEE_STIFFNESS = 40;
const KNEE_DAMPING = 12.5; // close to critical (2*sqrt(40)≈12.65) — minimal overshoot/undershoot

// Weight-shift state machine — see computeIdlePose's transition logic.
const WEIGHT_HOLD_SECONDS: [number, number] = [2, 7];
const WEIGHT_COOLDOWN_SECONDS: [number, number] = [4, 15];
const WEIGHT_SKIP_PROBABILITY = 0.35; // "not every cycle shifts weight"

// Bending both knees slightly compensates for the pelvis's own vertical
// bob/roll/pitch so the feet don't lift off the ground the way a bare
// hip-only rotation did earlier this project (see AvatarCanvas.tsx's
// "melayang" history). This gain was tuned empirically against a live
// render — a real foot-world-Y measurement across a full weight-shift
// cycle, not derived analytically — and re-verified after any pelvis
// amplitude change above.
const KNEE_COMPENSATION_GAIN = 2.6;
const WEIGHTED_LEG_EXTRA_BEND = THREE.MathUtils.degToRad(1.2); // relaxed (unweighted) leg gets a touch more knee give

const SHOULDER_STIFFNESS = 55;
const SHOULDER_DAMPING = 13;
const SHOULDER_COUNTER_GAIN = 0.5; // how much a shoulder counter-rotates against pelvis roll

// Arm secondary motion — decreasing stiffness down the chain (shoulder →
// upper arm → forearm → hand) is what produces the 30-80ms-ish follow-
// through lag the spec asks for: a softer spring takes measurably longer to
// catch up to a moving target, without needing a literal delay buffer.
const UPPER_ARM_STIFFNESS = 50;
const LOWER_ARM_STIFFNESS = 34;
const HAND_STIFFNESS = 22;
const ARM_DAMPING = 9;
const ARM_FOLLOW_GAIN = 0.6; // how much of the torso's total lean an arm inherits
// Each arm ALSO gets its own small independent low-freq wobble (own phase,
// seeded once per side) on top of the shared torso-lean-driven component —
// without this, both arms track the identical torsoLean signal and only
// differ by a fixed static offset, which is asymmetric in POSE but not in
// TIMING. Spec explicitly calls for left/right phase to differ, not just amplitude.
const ARM_PHASE_NOISE_AMPLITUDE = 0.025;
// Elbow's own independent wobble, same idea as ARM_PHASE_NOISE_AMPLITUDE but
// applied to the forearm directly rather than only inherited by chasing the
// upper arm's sprung value — audited as too subtle to read as "alive" on a
// realistic-style VRM (the chase-only value stayed within a fraction of a
// degree of the upper arm). Own phase/period per side, uncorrelated with the
// upper-arm wobble's own phase so the elbow doesn't just look like a fixed
// fraction of the shoulder's motion.
const ELBOW_PHASE_NOISE_AMPLITUDE = THREE.MathUtils.degToRad(2.5);
// Wrist flexion/extension — a second, independent rotation axis from the
// existing rotation.z (read as pronation/supination-ish twist). Symmetric
// oscillation around rest, so — same reasoning as every other idle sway in
// this file — no per-model sign calibration needed. Raised from 3.5° — audited
// as reading "hampir tidak berubah" (barely changes) at that amplitude on a
// realistic-style VRM; a real relaxed wrist visibly drifts a few degrees.
const WRIST_FLEX_AMPLITUDE = THREE.MathUtils.degToRad(9);
// hand.rotation.z's OWN independent wobble — previously this axis only ever
// moved as a fraction (0.6x) of the already-tiny lowerArm chase value plus a
// static per-model offset, so audited as reading almost frozen. This adds a
// second, independent-period sine directly on top, same pattern as
// ARM_PHASE_NOISE_AMPLITUDE/ELBOW_PHASE_NOISE_AMPLITUDE one link further down the chain.
const HAND_TWIST_PHASE_NOISE_AMPLITUDE = THREE.MathUtils.degToRad(4);

// Finger micro-adjustment — a small continuous noise layer (so a resting
// hand is never perfectly frozen between events) PLUS an occasional bigger
// resettle on its own randomized timer, same layering pattern as the
// pelvis's PELVIS_NOISE_WEIGHT + weight-shift state machine above. Amount/
// interval raised from the original 2°/6-15s — audited as too small and too
// rare to read as a living hand on a realistic-style VRM.
// Toggles between -AMOUNT and +AMOUNT (not 0/+AMOUNT) — direct feedback on a
// real render: a one-directional "adds curl, never subtracts" adjustment is
// exactly what made fingers read as "never straight." Alternating relaxes
// the hand toward straighter just as often as it tightens it.
const FINGER_ADJUST_INTERVAL: [number, number] = [3, 8];
const FINGER_ADJUST_AMOUNT = THREE.MathUtils.degToRad(3.5);
const FINGER_CONTINUOUS_NOISE_AMOUNT = THREE.MathUtils.degToRad(1.5);
const FINGER_STIFFNESS = 8;
const FINGER_DAMPING = 6;
// Spread (finger abduction, rotation.y) — same layering as curl above, on
// its own independent timer, same +/- alternation as curl. Unlike curl
// (verified against a real render), this axis assumption is a best-effort
// guess not empirically confirmed against a live model — harmless if a
// given rig's Y axis doesn't correspond to spread (it'll just do nothing
// visible), never breaks anything.
const FINGER_SPREAD_INTERVAL: [number, number] = [4, 10];
const FINGER_SPREAD_AMOUNT = THREE.MathUtils.degToRad(2);

// Posture correction — a rare, brief, small resettle so idle never reads as
// a perfectly held pose for too long.
const POSTURE_CORRECTION_INTERVAL: [number, number] = [8, 20];
const POSTURE_CORRECTION_DURATION: [number, number] = [0.8, 2.0];
const POSTURE_CORRECTION_AMOUNT = THREE.MathUtils.degToRad(1.2);

export interface IdleEngineOptions {
  /** Reduces idle sway/weight-shift amplitude while speaking/gesturing — never fully zero, per spec §21 ("audio beat → whole body moves" is explicitly what NOT to do, but breathing/sway must stay alive). */
  activityLevel: number; // 0 (full idle) .. 1 (speaking/gesture in progress)
}

interface ChainSpringSet {
  spine: Spring;
  chest: Spring;
  upperChest: Spring;
  neck: Spring;
  head: Spring;
}

function createChainSprings(): ChainSpringSet {
  return { spine: createSpring(), chest: createSpring(), upperChest: createSpring(), neck: createSpring(), head: createSpring() };
}

/** One idle engine instance per mounted avatar — created once at VRM-load time, `update()` called every frame from AvatarCanvas's useFrame. All internal state lives in plain cached objects; no allocation inside update(). */
export class AvatarIdleEngine {
  private t = 0;

  // Micro-asymmetry — randomized once per model load, held stable for the
  // whole session (spec §15: "jangan randomize setiap frame").
  private readonly asym = {
    shoulderL: randRange(-0.015, 0.015),
    shoulderR: randRange(-0.015, 0.015),
    upperArmL: randRange(-0.03, 0.03),
    upperArmR: randRange(-0.03, 0.03),
    handL: randRange(-0.04, 0.04),
    handR: randRange(-0.04, 0.04),
    dominantSide: Math.random() < 0.5 ? -1 : 1, // one side of the body sits a hair more "settled" than the other
    noisePhaseYaw: randRange(0, Math.PI * 2),
    noisePhaseRoll: randRange(0, Math.PI * 2),
    noisePhasePitch: randRange(0, Math.PI * 2),
    // Independent per-arm timing (not just static offset) — deliberately
    // uncorrelated phase/period pairs so left and right never drift back
    // into sync with each other over a long session.
    armPhaseL: randRange(0, Math.PI * 2),
    armPhaseR: randRange(0, Math.PI * 2),
    armPeriodL: randRange(5.5, 7.5),
    armPeriodR: randRange(6.5, 8.5),
    wristFlexPhaseL: randRange(0, Math.PI * 2),
    wristFlexPhaseR: randRange(0, Math.PI * 2),
    // Elbow's own independent wobble (see ELBOW_PHASE_NOISE_AMPLITUDE) — own
    // phase/period pair, uncorrelated with the upper-arm wobble above.
    elbowPhaseL: randRange(0, Math.PI * 2),
    elbowPhaseR: randRange(0, Math.PI * 2),
    elbowPeriodL: randRange(4, 6),
    elbowPeriodR: randRange(4.5, 6.5),
    // hand.rotation.z's own independent wobble (see HAND_TWIST_PHASE_NOISE_AMPLITUDE).
    handTwistPhaseL: randRange(0, Math.PI * 2),
    handTwistPhaseR: randRange(0, Math.PI * 2),
    handTwistPeriodL: randRange(4.5, 6.5),
    handTwistPeriodR: randRange(5, 7),
    // Continuous low-amplitude finger noise phases — independent from the
    // periodic bigger fingerAdjust/fingerSpread targets below.
    fingerNoisePhaseL: randRange(0, Math.PI * 2),
    fingerNoisePhaseR: randRange(0, Math.PI * 2),
  };

  // Weight shift state.
  private weightState: WeightState = "CENTER";
  private weightTimer = randRange(...WEIGHT_COOLDOWN_SECONDS);
  private readonly weightSpring = createSpring();

  // Pelvis springs (yaw=y, roll=z, pitch=x, vertical=position.y delta, horizontal=position.x delta).
  private readonly pelvisYaw = createSpring();
  private readonly pelvisRoll = createSpring();
  private readonly pelvisPitch = createSpring();
  private readonly pelvisY = createSpring();
  private readonly pelvisX = createSpring();

  private readonly chainX = createChainSprings(); // pitch / breathing
  private readonly chainZ = createChainSprings(); // roll (pelvis lean propagation)

  private readonly shoulderL = createSpring();
  private readonly shoulderR = createSpring();

  private readonly upperArmL = createSpring();
  private readonly upperArmR = createSpring();
  private readonly lowerArmL = createSpring();
  private readonly lowerArmR = createSpring();
  private readonly handL = createSpring();
  private readonly handR = createSpring();

  private readonly kneeL = createSpring();
  private readonly kneeR = createSpring();

  private fingerAdjustTimerL = randRange(...FINGER_ADJUST_INTERVAL);
  private fingerAdjustTimerR = randRange(...FINGER_ADJUST_INTERVAL);
  private fingerAdjustTargetL = 0;
  private fingerAdjustTargetR = 0;
  private readonly fingerAdjustL = createSpring();
  private readonly fingerAdjustR = createSpring();
  private fingerSpreadTimerL = randRange(...FINGER_SPREAD_INTERVAL);
  private fingerSpreadTimerR = randRange(...FINGER_SPREAD_INTERVAL);
  private fingerSpreadTargetL = 0;
  private fingerSpreadTargetR = 0;
  private readonly fingerSpreadL = createSpring();
  private readonly fingerSpreadR = createSpring();

  private postureTimer = randRange(...POSTURE_CORRECTION_INTERVAL);
  private postureActive = 0; // seconds remaining in the current correction, 0 = inactive
  private postureDuration = 1;
  private readonly postureEnvelope = { roll: randRange(-1, 1), yaw: randRange(-1, 1) };

  // The normalized hips bone's rest-pose local Y is NOT 0 — it encodes the
  // hip's actual height above its parent in this model's skeleton. Captured
  // once on the first update() call and added back every frame; overwriting
  // position.y outright (an earlier version of this file did) discards that
  // rest height entirely and sinks the whole body — everything is a child
  // of hips — down by the hip's own rest height. Confirmed for real: the
  // avatar rendered sunk into the ground past the waist before this fix.
  private restHipsY: number | null = null;
  // Same rest-offset-capture treatment as restHipsY, for the new horizontal
  // weight-shift translation — see its comment for why this must be added
  // to the rest value rather than overwriting position.x outright.
  private restHipsX: number | null = null;

  private tickWeightState(delta: number) {
    this.weightTimer -= delta;
    if (this.weightTimer > 0) return;

    if (this.weightState === "CENTER") {
      if (Math.random() < WEIGHT_SKIP_PROBABILITY) {
        // Stay centered a while longer rather than always shifting — avoids a metronomic left/right/left/right loop.
        this.weightTimer = randRange(...WEIGHT_COOLDOWN_SECONDS);
        return;
      }
      this.weightState = Math.random() < 0.5 ? "LEFT" : "RIGHT";
      this.weightTimer = randRange(...WEIGHT_HOLD_SECONDS);
    } else {
      this.weightState = "CENTER";
      this.weightTimer = randRange(...WEIGHT_COOLDOWN_SECONDS);
    }
  }

  private tickPostureCorrection(delta: number) {
    if (this.postureActive > 0) {
      this.postureActive -= delta;
      if (this.postureActive <= 0) {
        this.postureTimer = randRange(...POSTURE_CORRECTION_INTERVAL);
        this.postureEnvelope.roll = randRange(-1, 1);
        this.postureEnvelope.yaw = randRange(-1, 1);
      }
      return;
    }
    this.postureTimer -= delta;
    if (this.postureTimer <= 0) {
      this.postureDuration = randRange(...POSTURE_CORRECTION_DURATION);
      this.postureActive = this.postureDuration;
    }
  }

  /** Smootherstep-shaped envelope: 0 → 1 → 0 across the correction's duration, so it eases in and out instead of snapping. */
  private postureEnvelopeWeight(): number {
    if (this.postureActive <= 0) return 0;
    const elapsed = this.postureDuration - this.postureActive;
    const t = THREE.MathUtils.clamp(elapsed / this.postureDuration, 0, 1);
    const rise = t < 0.5 ? t / 0.5 : (1 - t) / 0.5;
    return rise * rise * (3 - 2 * rise);
  }

  update(vrm: VRM, delta: number, options: IdleEngineOptions) {
    this.t += delta;
    const activity = THREE.MathUtils.clamp(options.activityLevel, 0, 1);
    // Idle amplitude never fully bottoms out while speaking/gesturing — a
    // living body doesn't freeze the instant it starts talking — just
    // dialed back so it doesn't fight whatever's overriding arms/head.
    const amp = 0.35 + 0.65 * (1 - activity);

    this.tickWeightState(delta);
    this.tickPostureCorrection(delta);
    const postureWeight = this.postureEnvelopeWeight() * POSTURE_CORRECTION_AMOUNT;

    const weightTarget = this.weightState === "LEFT" ? -1 : this.weightState === "RIGHT" ? 1 : 0;
    const weight = stepSpring(this.weightSpring, weightTarget, delta, 6, 4.5); // slow, deliberate shift, not instant

    const noiseYaw = lowFreqNoise(this.t, this.asym.noisePhaseYaw);
    const noiseRoll = lowFreqNoise(this.t, this.asym.noisePhaseRoll);
    const noisePitch = lowFreqNoise(this.t, this.asym.noisePhasePitch);

    const pelvisYawTarget = (noiseYaw * PELVIS_YAW_MAX + postureWeight * this.postureEnvelope.yaw) * amp;
    // Roll's noise contribution is deliberately small (PELVIS_NOISE_WEIGHT)
    // — the weight-shift state machine already supplies roll's main signal,
    // so a full-strength noise layer on top of that reads as restless
    // wandering rather than "mostly still, occasionally shifts." Direct
    // feedback: idle shouldn't be perpetually drifting even at low amplitude.
    const pelvisRollTarget =
      (weight * PELVIS_ROLL_MAX + noiseRoll * PELVIS_ROLL_MAX * PELVIS_NOISE_WEIGHT + postureWeight * this.postureEnvelope.roll) * amp;
    const pelvisPitchTarget = noisePitch * PELVIS_PITCH_MAX * amp;
    const pelvisYTarget = -Math.abs(weight) * PELVIS_Y_MAX * amp;
    // Horizontal shift toward the weight-bearing leg — a real weight shift
    // moves the pelvis sideways over the stance leg, not just tilts it.
    const pelvisXTarget = weight * PELVIS_X_MAX * amp;

    const pelvisYaw = stepSpring(this.pelvisYaw, pelvisYawTarget, delta, PELVIS_STIFFNESS, PELVIS_DAMPING);
    const pelvisRoll = stepSpring(this.pelvisRoll, pelvisRollTarget, delta, PELVIS_STIFFNESS, PELVIS_DAMPING);
    const pelvisPitch = stepSpring(this.pelvisPitch, pelvisPitchTarget, delta, PELVIS_STIFFNESS, PELVIS_DAMPING);
    const pelvisY = stepSpring(this.pelvisY, pelvisYTarget, delta, PELVIS_STIFFNESS, PELVIS_DAMPING);
    const pelvisX = stepSpring(this.pelvisX, pelvisXTarget, delta, PELVIS_STIFFNESS, PELVIS_DAMPING);

    const hips = vrm.humanoid?.getNormalizedBoneNode("hips");
    if (hips) {
      // Rest-pose local position is NOT (0,0,Z) on every model — captured
      // once and added to, never overwritten (see restHipsY's comment; the
      // same bug class would sink/shift the whole body if repeated here).
      if (this.restHipsY === null) {
        this.restHipsY = hips.position.y;
        // Start the knee springs AT their idle baseline instead of ramping
        // up from 0 — otherwise the first second or so after load shows a
        // briefly dead-straight knee while the spring catches up, exactly
        // the "locked knee" look this baseline exists to avoid.
        this.kneeL.value = KNEE_IDLE_BASE_BEND;
        this.kneeR.value = KNEE_IDLE_BASE_BEND;
      }
      if (this.restHipsX === null) this.restHipsX = hips.position.x;
      hips.rotation.y = pelvisYaw;
      hips.rotation.z = pelvisRoll;
      hips.rotation.x = pelvisPitch;
      hips.position.y = this.restHipsY + pelvisY;
      hips.position.x = this.restHipsX + pelvisX;
    }

    // Breathing — a single periodic source (real breathing IS periodic),
    // but propagated through the same chain with per-bone amplitude so it
    // never reads as "just the chest inflating."
    const breath = Math.sin((this.t / 4.2) * Math.PI * 2) * 0.028 * amp;

    (Object.keys(CHAIN_FACTORS) as (keyof typeof CHAIN_FACTORS)[]).forEach((key) => {
      const factor = CHAIN_FACTORS[key];
      const stiffness = CHAIN_STIFFNESS[key];
      const bone = vrm.humanoid?.getNormalizedBoneNode(key as VRMHumanBoneName);
      if (!bone) return;
      const targetZ = pelvisRoll * factor + pelvisYaw * factor * 0.3;
      const targetX = pelvisPitch * factor + breath * (BREATH_FACTORS[key as keyof typeof BREATH_FACTORS] ?? factor);
      bone.rotation.z = stepSpring(this.chainZ[key], targetZ, delta, stiffness, CHAIN_DAMPING);
      bone.rotation.x = stepSpring(this.chainX[key], targetX, delta, stiffness, CHAIN_DAMPING);
    });

    // Shoulders — independent counterbalance against pelvis roll, plus
    // breathing, plus a stable per-side asymmetry offset.
    const leftShoulder = vrm.humanoid?.getNormalizedBoneNode("leftShoulder");
    const rightShoulder = vrm.humanoid?.getNormalizedBoneNode("rightShoulder");
    const shoulderBreath = breath * BREATH_FACTORS.shoulder;
    if (leftShoulder) {
      const target = -pelvisRoll * SHOULDER_COUNTER_GAIN + shoulderBreath + this.asym.shoulderL;
      leftShoulder.rotation.z = stepSpring(this.shoulderL, target, delta, SHOULDER_STIFFNESS, SHOULDER_DAMPING);
    }
    if (rightShoulder) {
      const target = -pelvisRoll * SHOULDER_COUNTER_GAIN + shoulderBreath + this.asym.shoulderR;
      rightShoulder.rotation.z = stepSpring(this.shoulderR, target, delta, SHOULDER_STIFFNESS, SHOULDER_DAMPING);
    }

    // Legs — knee compensation for the pelvis's own vertical/roll/pitch
    // motion, plus a small asymmetric extra bend on whichever leg is
    // currently NOT weight-bearing (spec §4). Never touches hips/knee by
    // more than a couple of degrees — see KNEE_COMPENSATION_GAIN's comment.
    const leftUpperLeg = vrm.humanoid?.getNormalizedBoneNode("leftUpperLeg");
    const rightUpperLeg = vrm.humanoid?.getNormalizedBoneNode("rightUpperLeg");
    const leftLowerLeg = vrm.humanoid?.getNormalizedBoneNode("leftLowerLeg");
    const rightLowerLeg = vrm.humanoid?.getNormalizedBoneNode("rightLowerLeg");
    const pelvisDrop = Math.abs(pelvisY) + Math.abs(pelvisRoll) * 0.4 + Math.abs(pelvisPitch) * 0.4;
    // KNEE_IDLE_BASE_BEND is unconditional (even at perfect rest, weight=0)
    // — a dead-straight knee is what "locked knee" looks like; real relaxed
    // standing never fully extends it.
    const baseKneeBend = KNEE_IDLE_BASE_BEND + pelvisDrop * KNEE_COMPENSATION_GAIN;
    // weight > 0 → leaning right → right leg bears weight (straighter), left leg relaxes (more bend).
    const leftExtra = weight > 0 ? WEIGHTED_LEG_EXTRA_BEND * weight : 0;
    const rightExtra = weight < 0 ? WEIGHTED_LEG_EXTRA_BEND * -weight : 0;
    if (leftLowerLeg) leftLowerLeg.rotation.x = stepSpring(this.kneeL, baseKneeBend + leftExtra, delta, KNEE_STIFFNESS, KNEE_DAMPING);
    if (rightLowerLeg) rightLowerLeg.rotation.x = stepSpring(this.kneeR, baseKneeBend + rightExtra, delta, KNEE_STIFFNESS, KNEE_DAMPING);
    // Upper leg takes half the compensation so the bend reads as coming from the whole leg, not just a hinge at the knee.
    if (leftUpperLeg) leftUpperLeg.rotation.x = (baseKneeBend + leftExtra) * 0.4;
    if (rightUpperLeg) rightUpperLeg.rotation.x = (baseKneeBend + rightExtra) * 0.4;

    // Finger micro-adjustment — a small continuous noise layer (so a resting
    // hand never reads as perfectly frozen between events — audited as
    // reading too static with only the discrete event below) PLUS an
    // occasional bigger resettle on its own randomized timer, same layering
    // pattern as the pelvis's PELVIS_NOISE_WEIGHT + weight-shift state
    // machine above. Independent per side (own phase for the noise, own
    // timer for the discrete event) — a real left and right hand don't
    // idle in lockstep any more than the arms do (see asym.upperArmL/R).
    const fingerNoiseL = lowFreqNoise(this.t, this.asym.fingerNoisePhaseL) * FINGER_CONTINUOUS_NOISE_AMOUNT;
    const fingerNoiseR = lowFreqNoise(this.t, this.asym.fingerNoisePhaseR) * FINGER_CONTINUOUS_NOISE_AMOUNT;

    this.fingerAdjustTimerL -= delta;
    if (this.fingerAdjustTimerL <= 0) {
      this.fingerAdjustTimerL = randRange(...FINGER_ADJUST_INTERVAL);
      this.fingerAdjustTargetL = this.fingerAdjustTargetL > 0 ? -FINGER_ADJUST_AMOUNT : FINGER_ADJUST_AMOUNT;
    }
    this.fingerAdjustTimerR -= delta;
    if (this.fingerAdjustTimerR <= 0) {
      this.fingerAdjustTimerR = randRange(...FINGER_ADJUST_INTERVAL);
      this.fingerAdjustTargetR = this.fingerAdjustTargetR > 0 ? -FINGER_ADJUST_AMOUNT : FINGER_ADJUST_AMOUNT;
    }
    stepSpring(this.fingerAdjustL, this.fingerAdjustTargetL + fingerNoiseL, delta, FINGER_STIFFNESS, FINGER_DAMPING);
    stepSpring(this.fingerAdjustR, this.fingerAdjustTargetR + fingerNoiseR, delta, FINGER_STIFFNESS, FINGER_DAMPING);

    // Finger spread — independent timer/target from curl above, same layering pattern, also per side.
    this.fingerSpreadTimerL -= delta;
    if (this.fingerSpreadTimerL <= 0) {
      this.fingerSpreadTimerL = randRange(...FINGER_SPREAD_INTERVAL);
      this.fingerSpreadTargetL = this.fingerSpreadTargetL > 0 ? -FINGER_SPREAD_AMOUNT : FINGER_SPREAD_AMOUNT;
    }
    this.fingerSpreadTimerR -= delta;
    if (this.fingerSpreadTimerR <= 0) {
      this.fingerSpreadTimerR = randRange(...FINGER_SPREAD_INTERVAL);
      this.fingerSpreadTargetR = this.fingerSpreadTargetR > 0 ? -FINGER_SPREAD_AMOUNT : FINGER_SPREAD_AMOUNT;
    }
    stepSpring(this.fingerSpreadL, this.fingerSpreadTargetL, delta, FINGER_STIFFNESS, FINGER_DAMPING);
    stepSpring(this.fingerSpreadR, this.fingerSpreadTargetR, delta, FINGER_STIFFNESS, FINGER_DAMPING);

    return {
      /** Total lean (roll+yaw combined) an arm should inherit for secondary motion — see applyArmSecondaryMotion. */
      torsoLean: pelvisRoll + pelvisYaw * 0.5,
      breath,
      fingerAdjustL: this.fingerAdjustL.value,
      fingerAdjustR: this.fingerAdjustR.value,
      fingerSpreadL: this.fingerSpreadL.value,
      fingerSpreadR: this.fingerSpreadR.value,
    };
  }

  /**
   * Arm/hand secondary motion — called separately from update() (per side)
   * so AvatarCanvas can skip it entirely on a side currently held by an
   * active gesture, same pattern as the existing gesture-pose ternaries.
   * Returns rotation deltas to ADD on top of the arm's normal rest pose.
   */
  applyArmSecondaryMotion(
    side: "left" | "right",
    torsoLean: number,
    breath: number,
    delta: number
  ): { upperArm: number; lowerArm: number; hand: number; wristFlex: number } {
    const asymUpper = side === "left" ? this.asym.upperArmL : this.asym.upperArmR;
    const asymHand = side === "left" ? this.asym.handL : this.asym.handR;
    const upperArmSpring = side === "left" ? this.upperArmL : this.upperArmR;
    const lowerArmSpring = side === "left" ? this.lowerArmL : this.lowerArmR;
    const handSpring = side === "left" ? this.handL : this.handR;
    const armPhase = side === "left" ? this.asym.armPhaseL : this.asym.armPhaseR;
    const armPeriod = side === "left" ? this.asym.armPeriodL : this.asym.armPeriodR;
    const wristFlexPhase = side === "left" ? this.asym.wristFlexPhaseL : this.asym.wristFlexPhaseR;
    const elbowPhase = side === "left" ? this.asym.elbowPhaseL : this.asym.elbowPhaseR;
    const elbowPeriod = side === "left" ? this.asym.elbowPeriodL : this.asym.elbowPeriodR;
    const handTwistPhase = side === "left" ? this.asym.handTwistPhaseL : this.asym.handTwistPhaseR;
    const handTwistPeriod = side === "left" ? this.asym.handTwistPeriodL : this.asym.handTwistPeriodR;

    // Each arm's own independent wobble — different period AND phase per
    // side (see asym.armPeriodL/R, armPhaseL/R), on top of the SHARED
    // torso-lean-driven component. This is what decouples left/right
    // TIMING, not just their static pose offset.
    const independentWobble = Math.sin((this.t / armPeriod) * Math.PI * 2 + armPhase) * ARM_PHASE_NOISE_AMPLITUDE;

    const upperTarget = torsoLean * ARM_FOLLOW_GAIN + breath * BREATH_FACTORS.upperArm + asymUpper + independentWobble;
    const upperArm = stepSpring(upperArmSpring, upperTarget, delta, UPPER_ARM_STIFFNESS, ARM_DAMPING);
    // Forearm/hand chase the UPPER ARM's already-sprung value (not the raw
    // torso target) — that's what makes them lag one link further behind
    // instead of all three converging on the same instant — PLUS the elbow's
    // own independent wobble (own phase/period, see ELBOW_PHASE_NOISE_AMPLITUDE)
    // so it doesn't read as a fixed fraction of the shoulder's motion. Audited
    // as too subtle without this: chasing the upper arm alone kept the elbow
    // within a fraction of a degree of it.
    const elbowWobble = Math.sin((this.t / elbowPeriod) * Math.PI * 2 + elbowPhase) * ELBOW_PHASE_NOISE_AMPLITUDE;
    const lowerArm = stepSpring(lowerArmSpring, upperArm + elbowWobble, delta, LOWER_ARM_STIFFNESS, ARM_DAMPING);
    // Wrist twist — own independent wobble (own phase/period, see
    // HAND_TWIST_PHASE_NOISE_AMPLITUDE) layered on top of the existing
    // lowerArm-chase + static per-model offset. Audited as too subtle
    // without this: the chase-only value stayed within a fraction of a
    // degree of the already-tiny lowerArm value.
    const handTwistWobble = Math.sin((this.t / handTwistPeriod) * Math.PI * 2 + handTwistPhase) * HAND_TWIST_PHASE_NOISE_AMPLITUDE;
    const hand = stepSpring(handSpring, lowerArm * 0.6 + asymHand + handTwistWobble, delta, HAND_STIFFNESS, ARM_DAMPING);
    // Wrist flexion/extension — a SECOND, independent wrist axis from `hand`
    // above (that one reads as pronation/supination-ish twist). Not run
    // through a spring of its own since it's already a smooth bounded sine
    // — the amplitude is small enough that adding spring lag on top would
    // only mute it further with no visible benefit.
    const wristFlex = Math.sin((this.t / (armPeriod * 0.8)) * Math.PI * 2 + wristFlexPhase) * WRIST_FLEX_AMPLITUDE;

    return { upperArm, lowerArm, hand, wristFlex };
  }
}
