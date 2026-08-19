// Registry of Mixamo FBX "interaction" animations retargeted onto the VRM
// avatar — separate from (and layered on top of) the existing procedural
// idle motion (AvatarIdleEngine) and the existing per-reply AI gesture
// system (AvatarGesture/computeGesturePose in AvatarCanvas.tsx). Deliberately
// its own type/naming, not merged into AvatarGesture — that type already has
// its own "excited"/"salute" values for the small procedural arm gestures,
// which are a different mechanism (a few hand-tuned bone targets) from a
// full-body authored Mixamo clip. Both can coexist; see AvatarAnimationController.
export type AvatarClipName = "bow" | "clapping" | "excited" | "greeting" | "salute" | "victory" | "waving";

export interface AvatarClipDefinition {
  url: string;
  loop: boolean;
  /**
   * Per-clip crossfade timing (seconds) — how long AvatarAnimationController
   * takes to blend this clip in on top of idle, and back out to idle when it
   * finishes/is interrupted. Deliberately per-gesture rather than one global
   * constant: a slow, deliberate motion (bow, greeting) reads wrong snapping
   * in/out at the same speed a punchy one (excited, victory) wants. Falls
   * back to DEFAULT_FADE_IN_SECONDS/DEFAULT_FADE_OUT_SECONDS in
   * avatar-animation-controller.ts if omitted.
   */
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

// Files live in public/animations/ — served as static assets at
// /animations/<Name>.fbx, no API route involved. (idle-male.fbx/idle-
// female.fbx also live in that folder but belong to an earlier, unused
// lower-body-only retarget prototype — see mixamo-vrm-retarget.ts's own
// comment — not part of this registry or the live rendering pipeline.)
export const AVATAR_CLIP_REGISTRY: Record<AvatarClipName, AvatarClipDefinition> = {
  bow: { url: "/animations/Bow.fbx", loop: false, fadeInSeconds: 0.35, fadeOutSeconds: 0.7 },
  clapping: { url: "/animations/Clapping.fbx", loop: false, fadeInSeconds: 0.3, fadeOutSeconds: 0.5 },
  excited: { url: "/animations/Excited.fbx", loop: false, fadeInSeconds: 0.35, fadeOutSeconds: 0.6 },
  greeting: { url: "/animations/Greeting.fbx", loop: false, fadeInSeconds: 0.35, fadeOutSeconds: 0.5 },
  salute: { url: "/animations/Salute.fbx", loop: false, fadeInSeconds: 0.3, fadeOutSeconds: 0.55 },
  victory: { url: "/animations/Victory.fbx", loop: false, fadeInSeconds: 0.35, fadeOutSeconds: 0.6 },
  // Was loop:true (per the user's own original example) — but a looping
  // clip never fires the mixer's "finished" event, so nothing ever told the
  // controller to fade back to idle: it waved forever until stopAnimation()
  // was called explicitly, which nothing currently does. Direct feedback
  // confirmed this read as broken ("tidak berhenti-berhenti"), not intended
  // — switched to one-shot like every other clip, so it now auto-returns to
  // idle via the same "finished" → fade-out path the rest already use.
  waving: { url: "/animations/Waving.fbx", loop: false, fadeInSeconds: 0.3, fadeOutSeconds: 0.5 },
};

export const AVATAR_CLIP_NAMES = Object.keys(AVATAR_CLIP_REGISTRY) as AvatarClipName[];

export function isAvatarClipName(value: unknown): value is AvatarClipName {
  return typeof value === "string" && (AVATAR_CLIP_NAMES as string[]).includes(value);
}
