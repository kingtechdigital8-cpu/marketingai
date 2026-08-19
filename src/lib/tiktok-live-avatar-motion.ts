// Pure, framework-free — shared between the AI reply classifier
// (tiktok-live-manager.ts, server-side) and the VRM avatar's expression/
// gesture renderer (AvatarCanvas.tsx, client-side), same pattern as
// tiktok-live-viseme.ts's Vowel/VisemeInterval types.

// The 6 with a direct standard VRM expression preset (happy/angry/sad/
// relaxed/surprised/neutral) map straight across. "excited" and "thinking"/
// "confused" have no dedicated VRM preset — approximated in AvatarCanvas
// (see EMOTION_TO_EXPRESSION) rather than invented as fake preset names,
// since a model's own expressionMap is the source of truth for what
// actually exists on it.
export type AvatarEmotion = "neutral" | "happy" | "sad" | "angry" | "surprised" | "excited" | "thinking" | "confused";

export const AVATAR_EMOTIONS: AvatarEmotion[] = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "excited",
  "thinking",
  "confused",
];

// "none" is a real, expected value — not every reply should trigger a
// gesture, forcing one every time would read as fidgety/robotic. "nod" and
// "shake" drive the HEAD bone, not the arms, unlike the rest. "scratch_head",
// "salute", and "cover_mouth" reach the hand toward the head/face;
// "palms_together" brings both hands together in front of the chest — all
// four need the arm's reach axis (see calibrateArmReachSign in
// AvatarCanvas.tsx), not just the up/down swing the earlier gestures use.
export type AvatarGesture =
  | "none"
  | "wave"
  | "point"
  | "nod"
  | "shake"
  | "thumbs_up"
  | "open_hand"
  | "thinking"
  | "excited"
  | "welcome"
  | "scratch_head"
  | "salute"
  | "cover_mouth"
  | "palms_together";

export const AVATAR_GESTURES: AvatarGesture[] = [
  "none",
  "wave",
  "point",
  "nod",
  "shake",
  "thumbs_up",
  "open_hand",
  "thinking",
  "excited",
  "welcome",
  "scratch_head",
  "salute",
  "cover_mouth",
  "palms_together",
];

export function isAvatarEmotion(value: unknown): value is AvatarEmotion {
  return typeof value === "string" && (AVATAR_EMOTIONS as string[]).includes(value);
}

export function isAvatarGesture(value: unknown): value is AvatarGesture {
  return typeof value === "string" && (AVATAR_GESTURES as string[]).includes(value);
}

// A SEPARATE, newer, richer procedural gesture vocabulary (20 names) driven
// by AvatarGestureEngine (avatar-gesture-engine.ts, client-only — Three.js-
// dependent, deliberately NOT imported here) rather than the small hand-
// tuned AvatarGesture pose function above. Kept in this framework-free file
// (not the engine file) specifically so server-side code — the AI reply
// classifier in tiktok-live-manager.ts — CAN safely import and validate
// against it without pulling Three.js into a server bundle, exactly the same
// reasoning AvatarGesture/isAvatarGesture above already follows. Extending
// tiktok-live-manager.ts's own classification prompt/parsing to actually ask
// the AI for one of these 20 names is explicitly a separate, later task —
// not done here.
export type GestureNameV2 =
  | "wave"
  | "greeting"
  | "salute"
  | "point_camera"
  | "no_no"
  | "heart_hands"
  | "thank_you"
  | "shh"
  | "stop"
  | "point_left"
  | "point_right"
  | "thumbs_up"
  | "thinking"
  | "cute"
  | "excited"
  | "happy"
  | "laugh"
  | "sad"
  | "angry_hands_on_hips"
  | "welcome";

export const GESTURE_NAMES_V2: GestureNameV2[] = [
  "wave",
  "greeting",
  "salute",
  "point_camera",
  "no_no",
  "heart_hands",
  "thank_you",
  "shh",
  "stop",
  "point_left",
  "point_right",
  "thumbs_up",
  "thinking",
  "cute",
  "excited",
  "happy",
  "laugh",
  "sad",
  "angry_hands_on_hips",
  "welcome",
];

export function isGestureNameV2(value: unknown): value is GestureNameV2 {
  return typeof value === "string" && (GESTURE_NAMES_V2 as string[]).includes(value);
}

/**
 * The Animation Library slug a saved "Edit Gesture" override for this
 * built-in gesture would have (see avatar-animation-slug.ts's own slugify()
 * on the server, and slugifyLikeServer() in the Studio page). A snake_case
 * gesture name is already lowercase/alnum-plus-underscore, so slugifying it
 * directly and slugifying its Title Case pretty label (what the Studio
 * actually saves as the animation's `name`) produce the identical string —
 * confirmed directly (both give e.g. "point-camera"). Kept here, not
 * duplicated a third time, since both a server route (overlay data,
 * filtering which Library rows to fetch) and the client runtime
 * (AvatarCanvas, resolving which gesture name to look up) need the exact
 * same mapping.
 */
export function gestureOverrideSlug(name: GestureNameV2): string {
  return name.replace(/_/g, "-");
}
