import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { loadFbxAsset } from "./avatar-animation-loader";
import { retargetMixamoClip } from "./avatar-animation-retarget";
import { AVATAR_CLIP_REGISTRY, AVATAR_CLIP_NAMES, type AvatarClipName } from "./avatar-animation-registry";

// ============================================================================
// How this coexists with idle (read this before touching anything below)
// ============================================================================
// Idle in this codebase is NOT a THREE.AnimationClip — there is no baked
// "idle.fbx" driving a real idleAction. It's AvatarIdleEngine, a procedural
// spring-physics system (breathing/sway/weight-shift/finger noise/etc — see
// avatar-idle-engine.ts) plus AvatarGazeEngine (eye lookAt/head-follow) and a
// handful of small `approach()`-eased writes in AvatarCanvas.tsx's useFrame,
// all recomputed from their OWN internal state every single frame and
// written straight onto the VRM's normalized humanoid bones. It never stops,
// never pauses, and is not "played" — a literal `idleAction` can't be
// created because there is no clip to back it.
//
// This matters because it rules out one otherwise-standard architecture:
// two THREE.AnimationAction's on one mixer (idleAction + interactionAction)
// crossfaded via native weight/fadeIn/fadeOut. That mechanism works by
// having the mixer blend each active action's contribution against the
// bone's REST/BIND pose for whatever weight isn't accounted for — it has no
// concept of "blend toward this other live, constantly-changing procedural
// transform." Wiring idle up as a second real action would mean either (a)
// baking a new idle animation clip (explicitly out of scope — "jangan
// mengganti file animation FBX yang sudah ada", and it would also mean
// throwing away the existing, already-tuned procedural idle system, which
// direct instruction says to keep if it's already good), or (b) accepting
// that unaccounted mixer weight snaps toward the T-pose-ish bind pose
// instead of toward idle — which is a worse version of the exact snapping
// bug this file exists to fix.
//
// So instead: every frame, idle/gaze code runs FIRST (unconditionally, in
// AvatarCanvas's useFrame, before this controller's update() is called) and
// writes its live output straight onto the bones. This controller then reads
// THAT as "idle's current weight-1.0 pose", lets the mixer overwrite the
// SAME bones with the interaction clip's pose, and manually slerps between
// the two using a frame-rate-independent damped weight — functionally
// identical to "idleAction weight = 1 - interactionWeight", just computed
// against a live procedural target instead of a second baked action. Idle is
// never stopped and never gets a hard cut; the blend is the crossfade.
//
// One real AnimationMixer, created once per mounted VRM and reused for
// every interaction clip's AnimationAction — never recreated per play().
// ============================================================================

/** Set to true to enable a throttled (NOT per-frame) console.log of state/weights — off by default. */
const DEBUG_ANIMATION = false;
const DEBUG_LOG_INTERVAL_SECONDS = 0.5;

// Fallback timing for any clip whose registry entry omits fadeInSeconds/
// fadeOutSeconds — every current entry in avatar-animation-registry.ts sets
// its own, so this is just a safety net.
const DEFAULT_FADE_IN_SECONDS = 0.3;
const DEFAULT_FADE_OUT_SECONDS = 0.5;

// Brief pause at the clip's clamped final frame before recovery begins, only
// on a NATURAL finish (mixer "finished" event) — gives the final pose a beat
// to read before it starts blending away, instead of recovery starting the
// instant playback reaches the last frame. Not applied when a new gesture
// interrupts a playing one (that's an immediate, user/AI-driven override —
// see playAnimation) or when stopAnimation() is called explicitly.
const FINISH_HOLD_SECONDS = 0.12;

// Layer priority, for reference/debugging only — these systems don't
// actually contend for the same channels at runtime (bones vs. blend-shape
// expressions are entirely separate GPU targets), so there is no runtime
// arbitration to implement; documented here so the ordering is explicit:
//   IDLE (0)          — procedural bones, runs first, every frame, never stops
//   INTERACTION (10)  — this class; blends ON TOP of idle's bone output
//   FACIAL (20)       — expressionManager blend shapes (emotion), independent channel
//   LIP_SYNC (30)     — expressionManager viseme blend shapes, independent channel
// Blink/eye-lookAt/lip-sync are all expression/lookAt-target driven, not
// humanoid-bone driven, so an interaction clip can never suppress them.
export const AVATAR_ANIMATION_LAYER_PRIORITY = { IDLE: 0, INTERACTION: 10, FACIAL: 20, LIP_SYNC: 30 } as const;

export type AvatarAnimationErrorReason = "load_failed" | "retarget_failed" | "not_registered";
export type AvatarAnimationState = "idle" | "interaction" | "recovering";

export interface AvatarAnimationDebugState {
  state: AvatarAnimationState;
  currentAnimation: AvatarClipName | null;
  /** 0 (pure idle) .. 1 (fully the interaction clip) — the interaction layer's own weight; idle's effective weight is always (1 - this). */
  interactionWeight: number;
  /** Legacy alias of interactionWeight, kept so existing debug-panel readers don't need to change. */
  blend: number;
  loadedAnimations: AvatarClipName[];
  failedAnimations: AvatarClipName[];
  mixerActive: boolean;
}

interface CachedClip {
  clip: THREE.AnimationClip;
  affectedBoneNames: string[];
  loop: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

interface CurrentEntry {
  name: AvatarClipName;
  action: THREE.AnimationAction;
  bones: THREE.Object3D[];
  hipsIndex: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

/** A frozen (non-advancing) snapshot of whatever `current` was showing at the instant a new gesture interrupted it — fades out from this fixed pose using the interrupted clip's own fadeOutSeconds, exactly mirroring how a naturally-finished clip fades out from its own clamped last frame. */
interface InterruptedSnapshot {
  bones: THREE.Object3D[];
  hipsIndex: number;
  quats: THREE.Quaternion[];
  hipsPos: THREE.Vector3;
  weight: number;
  weightStart: number;
  weightElapsed: number;
  weightDuration: number;
}

/**
 * Zero velocity at BOTH ends (t=0 and t=1) — critical for a weight that
 * starts a transition from a dead stop (holding at the clip's clamped final
 * pose) or ends one settling into a steady idle. `THREE.MathUtils.damp()`
 * was tried first (it's the frame-rate-independent primitive the spec asked
 * for) but was wrong for this specific job: damp() is exponential decay, so
 * its rate of change is LARGEST at the instant a transition starts and
 * smallest at the end — the opposite of what "ease in" means. Measured
 * directly against a real hold→recovery transition: weight sat frozen at
 * 1.0 for the entire ~2s hold, then the instant recovery began, damp()
 * yielded a 0.23 drop in a single ~40ms frame — a genuine velocity
 * discontinuity (a real jerk, not just a fast-but-smooth change), since nothing
 * eased it in from the hold's zero velocity. A smootherstep-shaped
 * time/duration curve has zero slope at both endpoints, so the transition
 * visibly accelerates smoothly away from stillness and decelerates smoothly
 * into the next stillness — no snap at either end. Still fully frame-rate
 * independent (driven by accumulated real seconds, not frame count).
 */
function smootherstep(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Owns the AnimationMixer for Mixamo-retargeted interaction clips (bow,
 * clapping, excited, greeting, salute, victory, waving) on top of a loaded
 * VRM. One instance per mounted VRM (created/disposed alongside it in
 * AvatarCanvas.tsx) — never shared across avatars, never recreated per
 * play(). Does NOT touch lip-sync, blink, expressions, or the existing
 * procedural idle/gaze systems; see the module comment above for how it
 * blends with them instead.
 */
export class AvatarAnimationController {
  private readonly vrm: VRM;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clipCache = new Map<AvatarClipName, CachedClip>();
  private readonly loadingPromises = new Map<AvatarClipName, Promise<CachedClip | null>>();
  private readonly failed = new Set<AvatarClipName>();

  private current: CurrentEntry | null = null;
  private state: AvatarAnimationState = "idle";
  /** Interaction layer's own weight, 0..1 — idle's effective weight is always (1 - this). Advanced via a smootherstep(elapsed/duration) curve, never `+= constant` and never raw exponential damp — see smootherstep()'s comment for why. Frame-rate independent: driven by accumulated real seconds, not frame count. */
  private weight = 0;
  private weightTarget = 0;
  /** Weight value at the moment the CURRENT transition (toward weightTarget) began — the curve's start point, not necessarily 0 or 1 if a new target was set mid-transition. */
  private weightStart = 0;
  private weightElapsed = 0;
  private weightDuration = DEFAULT_FADE_IN_SECONDS;
  /** >0 while holding the clamped final pose after a NATURAL finish, before recovery (weightTarget=0) actually begins — see FINISH_HOLD_SECONDS. */
  private holdTimer = 0;
  private interrupted: InterruptedSnapshot | null = null;
  private debugLogTimer = 0;

  // Quaternion/position scratch, keyed by the actual bone Object3D rather
  // than a fixed-size index pool — a fixed pool (an earlier design) needed
  // manual resizing every time the affected-bone count grew (it already bit
  // us once when finger bones were added) and silently truncated coverage if
  // ever undersized again. A per-bone Map has no such ceiling: bones are
  // stable references for the lifetime of the loaded VRM, so entries are
  // created lazily once and reused forever.
  private readonly idleQuatCache = new Map<THREE.Object3D, THREE.Quaternion>();
  private readonly idlePosCache = new Map<THREE.Object3D, THREE.Vector3>();
  // Two DISTINCT scratch quaternions, never aliased with each other or with
  // a bone's own live quaternion — see the bug note on clipPoseScratch below
  // for exactly why that distinction is load-bearing.
  private readonly baseBlendScratch = new THREE.Quaternion();
  // Captures the clip's raw pose (written by mixer.update()) into its OWN
  // object BEFORE bone.quaternion gets overwritten with the idle baseline.
  // Chaining `bone.quaternion.copy(base).slerp(bone.quaternion, weight)`
  // looks reasonable but is a real bug: by the time `bone.quaternion` is
  // read as the slerp *argument*, `.copy(base)` has already overwritten it,
  // so THREE.Quaternion.slerp ends up slerping the bone toward itself — a
  // mathematical no-op (confirmed against three.js's slerp implementation:
  // when the argument === `this`, cosHalfTheta is exactly 1 and the method
  // returns immediately without changing anything). The clip's pose was
  // silently discarded every frame regardless of weight, which is exactly
  // why interaction clips could never visibly take over the body — idle
  // always "won" because the interaction side of the blend never actually
  // applied. Capturing the clip pose into this separate, untouched object
  // first is what makes the final `.slerp(clipPoseScratch, weight)` correct.
  private readonly clipPoseScratch = new THREE.Quaternion();
  private readonly blendScratchPos = new THREE.Vector3();

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer.addEventListener("finished", (event) => {
      // Only a non-looping action reaches this. Don't start recovering
      // immediately — hold the clamped final pose for FINISH_HOLD_SECONDS
      // first (see update()), THEN fade back to idle.
      if (this.current && event.action === this.current.action) {
        this.holdTimer = FINISH_HOLD_SECONDS;
      }
    });
  }

  private async getOrLoadClip(name: AvatarClipName): Promise<CachedClip | null> {
    const cached = this.clipCache.get(name);
    if (cached) return cached;
    const inFlight = this.loadingPromises.get(name);
    if (inFlight) return inFlight;

    const def = AVATAR_CLIP_REGISTRY[name];
    if (!def) {
      console.warn(`[avatar-animation] "${name}" is not a registered animation.`);
      return null;
    }

    const promise = (async (): Promise<CachedClip | null> => {
      try {
        const asset = await loadFbxAsset(def.url);
        const result = retargetMixamoClip(asset, asset.animations, this.vrm);
        if (result.partial) {
          console.warn(`[avatar-animation] "${name}" retargeted partially — some bones on this VRM had no matching track.`);
        }
        const entry: CachedClip = {
          clip: result.clip,
          affectedBoneNames: result.affectedBoneNames,
          loop: def.loop,
          fadeInSeconds: def.fadeInSeconds ?? DEFAULT_FADE_IN_SECONDS,
          fadeOutSeconds: def.fadeOutSeconds ?? DEFAULT_FADE_OUT_SECONDS,
        };
        this.clipCache.set(name, entry);
        return entry;
      } catch (err) {
        // Exactly the required behavior: one bad FBX disables just that
        // animation — never crashes the overlay or blocks the others.
        console.warn(`[avatar-animation] failed to load/retarget "${name}":`, err instanceof Error ? err.message : err);
        this.failed.add(name);
        return null;
      } finally {
        this.loadingPromises.delete(name);
      }
    })();
    this.loadingPromises.set(name, promise);
    return promise;
  }

  async preloadAnimation(name: AvatarClipName): Promise<boolean> {
    const entry = await this.getOrLoadClip(name);
    return entry !== null;
  }

  /** Best-effort — every animation loads independently, one failure never blocks the rest. Prefer lazy (load-on-first-play) for initial page load weight; call this only when you deliberately want everything warm upfront (e.g. behind ?avatarDebug=1). */
  async preloadAll(): Promise<void> {
    await Promise.allSettled(AVATAR_CLIP_NAMES.map((name) => this.preloadAnimation(name)));
  }

  async playAnimation(name: AvatarClipName, options?: { fadeDuration?: number }): Promise<boolean> {
    if (this.current?.name === name) return true; // already playing — idempotent, not an error

    const entry = await this.getOrLoadClip(name);
    if (!entry) return false; // already warned inside getOrLoadClip

    // A different clip was already fading in/holding/fading out — snapshot
    // its LIVE pose right now (not stop-and-forget) so the new clip
    // crossfades from where it visually is, instead of leaving a one-frame
    // gap where that bone set silently reverts straight to idle before the
    // new clip's own fade-in has any influence. Snapshotting (rather than
    // keeping its action live on this same mixer) sidesteps a real Three.js
    // pitfall: two actions on one mixer targeting the same track don't
    // coexist as two independently-readable poses — the mixer auto-blends
    // them internally before we'd ever get to apply our OWN weighting on
    // top, corrupting the exact manual blend this class depends on. A
    // frozen snapshot avoids that entirely while still fading out smoothly
    // on its own timing (TEST 6: interaction → interaction, crossfade, no snap).
    if (this.current) {
      this.interrupted = {
        bones: this.current.bones,
        hipsIndex: this.current.hipsIndex,
        quats: this.current.bones.map((bone) => bone.quaternion.clone()),
        hipsPos: this.current.hipsIndex >= 0 ? this.current.bones[this.current.hipsIndex].position.clone() : new THREE.Vector3(),
        weight: this.weight,
        weightStart: this.weight,
        weightElapsed: 0,
        weightDuration: this.current.fadeOutSeconds,
      };
      this.current.action.stop();
    }

    const action = this.mixer.clipAction(entry.clip);
    action.reset();
    action.setEffectiveWeight(1); // blending against idle (and any interrupted snapshot) is done manually, not via mixer weight
    action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, entry.loop ? Infinity : 1);
    action.clampWhenFinished = !entry.loop;
    action.play();

    const bones: THREE.Object3D[] = [];
    let hipsIndex = -1;
    const hipsBoneName = this.vrm.humanoid?.getNormalizedBoneNode("hips")?.name;
    entry.affectedBoneNames.forEach((boneName) => {
      const node = this.vrm.scene.getObjectByName(boneName);
      if (node) {
        // Index into `bones` as actually pushed, NOT the source array's
        // index — those diverge whenever any earlier name in
        // affectedBoneNames fails to resolve (rare but possible on a
        // partial-match VRM), which would otherwise point hipsIndex at the
        // wrong bone entirely and corrupt the hips position blend.
        if (boneName === hipsBoneName) hipsIndex = bones.length;
        bones.push(node);
      }
    });

    this.current = { name, action, bones, hipsIndex, fadeInSeconds: entry.fadeInSeconds, fadeOutSeconds: entry.fadeOutSeconds };
    this.state = "interaction";
    this.holdTimer = 0;
    this.weight = 0; // the new clip always starts contributing from 0, even if it interrupted one mid-fade — see module comment
    this.weightTarget = 1;
    this.weightStart = 0;
    this.weightElapsed = 0;
    this.weightDuration = Math.max(0.05, options?.fadeDuration ?? entry.fadeInSeconds);
    return true;
  }

  /** Explicitly fades the current clip back to idle (skips the natural-finish hold — this is an immediate, caller-driven stop request). Does not stop the mixer instantly (see update()) so the transition stays smooth. */
  stopAnimation(fadeDuration?: number) {
    if (!this.current) return;
    this.holdTimer = 0;
    this.state = "recovering";
    this.weightTarget = 0;
    this.weightStart = this.weight;
    this.weightElapsed = 0;
    this.weightDuration = Math.max(0.05, fadeDuration ?? this.current.fadeOutSeconds);
  }

  /** Alias of playAnimation with an explicit duration — kept as its own method to match the requested API; behaves identically otherwise (see module comment on why a literal native mixer crossfade isn't used against idle). */
  crossFadeTo(name: AvatarClipName, duration?: number): Promise<boolean> {
    return this.playAnimation(name, { fadeDuration: duration });
  }

  isPlaying(name?: AvatarClipName): boolean {
    if (!this.current || this.weight <= 0.01) return false;
    return name === undefined || this.current.name === name;
  }

  getState(): AvatarAnimationState {
    return this.state;
  }

  getCurrentAnimation(): AvatarClipName | null {
    return this.weight > 0.01 ? (this.current?.name ?? null) : null;
  }

  getDebugState(): AvatarAnimationDebugState {
    const weight = Number(this.weight.toFixed(2));
    return {
      state: this.state,
      currentAnimation: this.getCurrentAnimation(),
      interactionWeight: weight,
      blend: weight,
      loadedAnimations: Array.from(this.clipCache.keys()),
      failedAnimations: Array.from(this.failed),
      mixerActive: this.weight > 0.01 || this.interrupted !== null,
    };
  }

  private idleQuatFor(bone: THREE.Object3D): THREE.Quaternion {
    let q = this.idleQuatCache.get(bone);
    if (!q) {
      q = new THREE.Quaternion();
      this.idleQuatCache.set(bone, q);
    }
    return q;
  }

  private idlePosFor(bone: THREE.Object3D): THREE.Vector3 {
    let v = this.idlePosCache.get(bone);
    if (!v) {
      v = new THREE.Vector3();
      this.idlePosCache.set(bone, v);
    }
    return v;
  }

  /**
   * Called once per frame from AvatarCanvas's useFrame, AFTER the idle
   * engine and any existing procedural gaze/gesture code have already
   * written this frame's idle pose to the humanoid bones, and BEFORE
   * vrm.update(). No-op (cheap early return) whenever nothing is playing and
   * nothing is mid-fade — the common case.
   */
  update(delta: number) {
    if (!this.current && !this.interrupted) return;

    // Natural-finish hold: the clip is clamped at its final frame, but
    // recovery (weightTarget -> 0) doesn't start until this brief pause
    // elapses — see FINISH_HOLD_SECONDS.
    if (this.current && this.holdTimer > 0) {
      this.holdTimer -= delta;
      if (this.holdTimer <= 0) {
        this.holdTimer = 0;
        this.state = "recovering";
        this.weightTarget = 0;
        this.weightStart = this.weight;
        this.weightElapsed = 0;
        this.weightDuration = this.current.fadeOutSeconds;
      }
    }

    // Union of every bone either the live `current` clip or the frozen
    // `interrupted` snapshot touches. Captured FRESH every frame for every
    // bone in the union (never reused from a previous frame) — idle's own
    // output keeps evolving (breathing/gaze/sway never stop), so the
    // baseline these blends fade toward must track that, not freeze at
    // whatever it was the first frame a bone appeared in a layer. Harmless
    // if a bone is in both `current` and `interrupted` — both reads happen
    // before mixer.update() touches anything, so they'd just capture the
    // same live value twice. This is also what guarantees no bone is ever
    // left un-blended for even one frame during a gesture-to-gesture
    // handoff (a bone only the interrupted clip touched still gets a valid
    // idle baseline to fade back to, even though the new clip never mentions it).
    if (this.current) {
      for (const bone of this.current.bones) this.idleQuatFor(bone).copy(bone.quaternion);
      if (this.current.hipsIndex >= 0) this.idlePosFor(this.current.bones[this.current.hipsIndex]).copy(this.current.bones[this.current.hipsIndex].position);
    }
    if (this.interrupted) {
      for (const bone of this.interrupted.bones) this.idleQuatFor(bone).copy(bone.quaternion);
      if (this.interrupted.hipsIndex >= 0) {
        const hipsBone = this.interrupted.bones[this.interrupted.hipsIndex];
        this.idlePosFor(hipsBone).copy(hipsBone.position);
      }
    }

    if (this.current) this.mixer.update(delta);

    // this.weight/interrupted.weight are already frame-rate-independent
    // damped curves (see the advance step below), so they're used directly
    // as the slerp factor — no extra easing function layered on top.
    const currentWeight = this.current ? this.weight : 0;
    const interruptedWeight = this.interrupted ? this.interrupted.weight : 0;

    if (this.current) {
      for (let i = 0; i < this.current.bones.length; i++) {
        const bone = this.current.bones[i];
        // Capture the clip's raw pose BEFORE bone.quaternion gets touched —
        // see clipPoseScratch's field comment for why this order matters.
        this.clipPoseScratch.copy(bone.quaternion);
        const idleQ = this.idleQuatFor(bone);
        // If this same bone is ALSO still fading out from an interrupted
        // clip, blend idle→interrupted first, THEN idle→current on top of
        // that result — a continuous nested crossfade rather than either
        // snapshot silently winning outright.
        const base =
          this.interrupted && this.interrupted.bones.includes(bone)
            ? this.baseBlendScratch.copy(idleQ).slerp(this.interrupted.quats[this.interrupted.bones.indexOf(bone)], interruptedWeight)
            : idleQ;
        bone.quaternion.copy(base).slerp(this.clipPoseScratch, currentWeight);
      }
      if (this.current.hipsIndex >= 0) {
        const hipsBone = this.current.bones[this.current.hipsIndex];
        const idlePos = this.idlePosFor(hipsBone);
        this.blendScratchPos.copy(idlePos).lerp(hipsBone.position, currentWeight);
        hipsBone.position.copy(this.blendScratchPos);
      }
    }

    // Bones the interrupted snapshot touches but the new current clip does
    // NOT (no overlap) — still fade those independently back to idle using
    // the interrupted clip's own fade-out duration, so nothing gets abandoned.
    if (this.interrupted) {
      for (let i = 0; i < this.interrupted.bones.length; i++) {
        const bone = this.interrupted.bones[i];
        if (this.current?.bones.includes(bone)) continue; // already handled above
        const idleQ = this.idleQuatFor(bone);
        bone.quaternion.copy(idleQ).slerp(this.interrupted.quats[i], interruptedWeight);
      }
      if (this.interrupted.hipsIndex >= 0 && !this.current?.bones.includes(this.interrupted.bones[this.interrupted.hipsIndex])) {
        const hipsBone = this.interrupted.bones[this.interrupted.hipsIndex];
        const idlePos = this.idlePosFor(hipsBone);
        this.blendScratchPos.copy(idlePos).lerp(this.interrupted.hipsPos, interruptedWeight);
        hipsBone.position.copy(this.blendScratchPos);
      }
    }

    // Frame-rate-independent weight advance — elapsed-seconds/duration fed
    // through smootherstep(), never a flat `+= constant` and never raw
    // exponential damp (see smootherstep()'s comment for why damp() caused a
    // real velocity discontinuity at the hold→recovery boundary). Reaches
    // weightTarget EXACTLY once elapsed >= duration — no asymptotic tail, so
    // no epsilon-snap hack is needed to finalize a transition.
    if (this.current) {
      this.weightElapsed += delta;
      const t = this.weightDuration > 0 ? this.weightElapsed / this.weightDuration : 1;
      this.weight = this.weightStart + (this.weightTarget - this.weightStart) * smootherstep(t);
      if (t >= 1 && this.weightTarget === 0) {
        this.current.action.stop();
        this.current = null;
        this.state = this.interrupted ? "recovering" : "idle";
      }
    }

    if (this.interrupted) {
      this.interrupted.weightElapsed += delta;
      const t = this.interrupted.weightDuration > 0 ? this.interrupted.weightElapsed / this.interrupted.weightDuration : 1;
      this.interrupted.weight = this.interrupted.weightStart * (1 - smootherstep(t));
      if (t >= 1) this.interrupted = null;
      if (!this.current && !this.interrupted) this.state = "idle";
    }

    if (DEBUG_ANIMATION) {
      this.debugLogTimer += delta;
      if (this.debugLogTimer >= DEBUG_LOG_INTERVAL_SECONDS) {
        this.debugLogTimer = 0;
        console.log(
          `[avatar-animation] state=${this.state} action=${this.current?.name ?? "-"} ` +
            `interactionWeight=${this.weight.toFixed(2)} idleWeight=${(1 - this.weight).toFixed(2)} ` +
            `interruptedWeight=${this.interrupted ? this.interrupted.weight.toFixed(2) : "-"} ` +
            `phase=${this.holdTimer > 0 ? "hold" : this.state}`
        );
      }
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.current = null;
    this.interrupted = null;
    this.weight = 0;
    this.state = "idle";
    this.idleQuatCache.clear();
    this.idlePosCache.clear();
  }
}
