"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { OrbitControls } from "@react-three/drei";
import {
  Loader2,
  Sparkles,
  RotateCcw,
  Hand,
  Play,
  Pause,
  Square,
  Repeat,
  Plus,
  Trash2,
  Copy,
  Save,
  Pencil,
  Eye,
  Check,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { IkHandControls } from "@/components/avatar/IkHandControls";
import type { AvatarCanvasHandle } from "@/components/avatar/AvatarCanvas";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { FingerPose, FingerBoneSuffix } from "@/lib/avatar-gesture-engine";
import { FINGER_PRESETS, FINGER_PRESET_LABELS, FINGER_JOINT_GROUPS, type FingerPresetName } from "@/lib/avatar-finger-presets";
import { applyKeyframePoseAtTime, type Keyframe, type KeyframePose, type InterpolationType } from "@/lib/avatar-keyframe-playback";
// Deliberately imported from a framework-free file (zero imports of its
// own — confirmed) rather than avatar-gesture-engine.ts itself, so this
// static import can't drag three.js into this admin page's initial bundle
// the way the dynamic() import of AvatarCanvas below is specifically
// avoiding. Only the 20 procedural gestures are editable this way — see
// EDITION NOTE at openGesture's own comment for why the 7 Mixamo clips
// (avatar-animation-registry.ts) are deliberately excluded.
import { GESTURE_NAMES_V2, type GestureNameV2 } from "@/lib/tiktok-live-avatar-motion";
import { cn } from "@/lib/utils";

// Same reasoning as AvatarOverlayPlayer's own dynamic import: AvatarCanvas
// bundles three.js/@react-three/fiber/three-vrm, a large chunk not worth
// pulling into this admin page's initial JS until it's actually opened.
const AvatarCanvas = dynamic(() => import("@/components/avatar/AvatarCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  ),
});

interface AvatarTemplateOption {
  id: string;
  label: string;
  vrmUrl: string;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Shape returned by /api/admin/avatar-animations — `data` is stored opaque
// JSON server-side (see schema.prisma's own comment on AvatarAnimation.data)
// so it comes back typed as `unknown` here and gets narrowed at the one
// place it's actually read (loadAnimationIntoStudio).
interface SavedAnimation {
  id: string;
  name: string;
  slug: string;
  duration: number;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

// Human-friendly labels — the raw VRM bone names are fine for a developer
// but not self-explanatory to a non-technical admin.
const BONE_LABELS: Partial<Record<VRMHumanBoneName, string>> = {
  hips: "Pinggul (Hips)",
  spine: "Tulang Belakang (Spine)",
  chest: "Dada (Chest)",
  upperChest: "Dada Atas (Upper Chest)",
  neck: "Leher (Neck)",
  head: "Kepala (Head)",
  leftShoulder: "Bahu Kiri",
  leftUpperArm: "Lengan Atas Kiri",
  leftLowerArm: "Lengan Bawah Kiri",
  leftHand: "Tangan Kiri",
  rightShoulder: "Bahu Kanan",
  rightUpperArm: "Lengan Atas Kanan",
  rightLowerArm: "Lengan Bawah Kanan",
  rightHand: "Tangan Kanan",
  leftUpperLeg: "Paha Kiri",
  leftLowerLeg: "Betis Kiri",
  leftFoot: "Kaki Kiri",
  rightUpperLeg: "Paha Kanan",
  rightLowerLeg: "Betis Kanan",
  rightFoot: "Kaki Kanan",
  leftEye: "Bola Mata Kiri",
  rightEye: "Bola Mata Kanan",
};

// Bones IK now owns while active for that side — greyed out / non-clickable
// in Body Controls so there's never a question of which system currently
// controls them (see setHandIkTarget's own comment on why the two can't
// both drive the same bones at once).
const IK_OWNED_BONES: Record<"left" | "right", VRMHumanBoneName[]> = {
  left: ["leftUpperArm", "leftLowerArm"],
  right: ["rightUpperArm", "rightLowerArm"],
};

// Mirrors AvatarCanvas.tsx's own exported EXPRESSION_PRESET_NAMES exactly
// (kept as a small local literal, not a static import of that value, so this
// admin page never pulls the three.js-bundling AvatarCanvas module into its
// initial JS — see the dynamic() import below for why that matters). Every
// one of these always resolves to something on any model (see that file's
// EXPRESSION_FALLBACKS), so they're always safe to offer as fixed presets.
const FACE_EXPRESSION_PRESETS = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"] as const;
type FaceExpressionPreset = (typeof FACE_EXPRESSION_PRESETS)[number];
const FACE_EXPRESSION_LABELS: Record<FaceExpressionPreset, string> = {
  neutral: "Neutral",
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  surprised: "Surprised",
  relaxed: "Relaxed",
};

// Every blend-shape name the loaded model actually has (see
// getAvailableFaceExpressions) gets sorted into one of these for the Face
// panel — a model's own custom names (eyebrows, eye squint, etc.) can't be
// known ahead of time, so this is a heuristic on the name itself rather
// than a fixed list. "lainnya" is the deliberate catch-all: full control
// per the admin's own request means nothing discovered gets hidden, even
// names this heuristic doesn't recognize.
type FaceCategory = "ekspresi" | "mata" | "alis" | "bibir" | "lainnya";
const FACE_CATEGORY_LABELS: Record<FaceCategory, string> = {
  ekspresi: "Ekspresi",
  mata: "Mata",
  alis: "Alis",
  bibir: "Bibir & Mulut",
  lainnya: "Lainnya",
};
const FACE_CATEGORY_ORDER: FaceCategory[] = ["ekspresi", "mata", "alis", "bibir", "lainnya"];
function categorizeFaceExpression(name: string): FaceCategory {
  const lower = name.toLowerCase();
  if ((FACE_EXPRESSION_PRESETS as readonly string[]).includes(lower)) return "ekspresi";
  if (lower.includes("brow")) return "alis";
  if (lower.includes("blink") || lower.includes("wink") || lower.includes("eye") || lower.startsWith("look")) return "mata";
  if (lower.includes("mouth") || lower.includes("lip") || lower.includes("tongue") || ["aa", "ih", "ou", "ee", "oh"].includes(lower))
    return "bibir";
  return "lainnya";
}
// Readable label for a raw expression/blend-shape name — known VRM standard
// names get a curated label, anything model-specific (custom names this
// heuristic can't have anticipated) falls back to splitting camelCase into
// Title Case words, so it's always at least readable rather than a bare
// technical string.
const KNOWN_FACE_EXPRESSION_LABELS: Record<string, string> = {
  neutral: "Neutral",
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  surprised: "Surprised",
  relaxed: "Relaxed",
  blink: "Kedip (Kedua Mata)",
  blinkLeft: "Kedip Kiri",
  blinkRight: "Kedip Kanan",
  aa: "AA (Buka Lebar)",
  ih: "IH (Senyum Tipis)",
  ou: "OU (Bulat Kecil)",
  ee: "EE (Melebar)",
  oh: "OH (Bulat Besar)",
  lookUp: "Lihat Atas",
  lookDown: "Lihat Bawah",
  lookLeft: "Lihat Kiri",
  lookRight: "Lihat Kanan",
};
function faceExpressionLabel(name: string): string {
  if (KNOWN_FACE_EXPRESSION_LABELS[name]) return KNOWN_FACE_EXPRESSION_LABELS[name];
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const BONE_GROUPS: { label: string; bones: VRMHumanBoneName[] }[] = [
  { label: "Torso", bones: ["hips", "spine", "chest", "upperChest"] },
  { label: "Kepala & Leher", bones: ["neck", "head"] },
  // Bola mata — see AvatarCanvas.tsx's own comment (right after vrm.update())
  // for why these two specifically need special handling to actually work;
  // most VRM models don't have separate eye bones at all (many drive gaze
  // via blend shapes instead, or not at all), hence a dedicated group rather
  // than lumping them into "Kepala & Leher" — getAvailableBones() already
  // filters this whole list down to whatever the loaded model actually has.
  { label: "Bola Mata", bones: ["leftEye", "rightEye"] },
  { label: "Lengan Kiri", bones: ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"] },
  { label: "Lengan Kanan", bones: ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"] },
  { label: "Kaki", bones: ["leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"] },
];

// Edit Gesture (see buildGestureSeedKeyframes) only ever samples arms/
// shoulders/torso-lean/head — the 20 procedural gestures never drive legs
// (see GesturePose's own field list in avatar-gesture-engine.ts) — sampling
// "Kaki" would just capture idle's own incidental leg sway as if it were
// deliberately posed, which is exactly what capturing only the DELIBERATELY
// posed bone set (see KeyframePose's own doc comment) is meant to avoid.
// Same reasoning excludes "Bola Mata" — procedural gestures never drive
// eyes either (that's the automatic gaze engine's job, running independent
// of any gesture), so sampling them here would bake in whatever gaze
// happened to be looking at that instant as if it were a deliberate pose.
const GESTURE_EDIT_BONES = BONE_GROUPS.filter((g) => g.label !== "Kaki" && g.label !== "Bola Mata").flatMap((g) => g.bones);

// Mirrors avatar-animation-slug.ts's own slugify() exactly — duplicated as
// a small pure function rather than imported, since that file also imports
// the server-only Prisma client at module scope, and importing anything
// from it here would try to bundle Prisma into this client page. Used to
// predict, client-side, what slug the server produced for a given display
// name — see openGesture's own comment for why that's how "does this
// gesture already have a saved edit?" is determined, with zero new API
// surface needed.
function slugifyLikeServer(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "animasi";
}

// Upgrades a keyframe's face pose from the older single `{preset, weight}`
// shape (animations saved before the multi-blend-shape Face panel existed)
// into the new `Record<string, number>` map — the preset name IS a valid
// expression name either way, so this is lossless. Already-new-format data
// (or null) passes through unchanged. Applied once, right when a saved
// animation is loaded into the Studio — nothing downstream (playback,
// capture, save) needs to know the old shape ever existed.
function normalizeFacePose(face: unknown): Record<string, number> | null {
  if (!face || typeof face !== "object") return null;
  if ("preset" in face && "weight" in face) {
    const { preset, weight } = face as { preset: unknown; weight: unknown };
    return typeof preset === "string" && typeof weight === "number" ? { [preset]: weight } : null;
  }
  return face as Record<string, number>;
}
function normalizeKeyframes(list: Keyframe[]): Keyframe[] {
  return list.map((kf) => ({ ...kf, pose: { ...kf.pose, face: normalizeFacePose(kf.pose.face) } }));
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function AxisSlider({ label, valueDeg, onChange }: { label: string; valueDeg: number; onChange: (deg: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            step={1}
            value={Math.round(valueDeg)}
            // Only forwards genuinely-finite typed values — a mid-typing
            // state like a bare "-" (about to become "-15") parses to NaN;
            // skipping the callback for those leaves this render's `value`
            // prop unchanged, so React never fights the character the
            // admin just typed, without needing separate local text state.
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(Math.min(180, Math.max(-180, v)));
            }}
            className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs tabular-nums text-foreground outline-none hover:border-border focus:border-brand focus:bg-surface"
          />
          <span>°</span>
        </div>
      </div>
      <input
        type="range"
        min={-180}
        max={180}
        step={1}
        value={valueDeg}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-brand"
      />
    </div>
  );
}

// Generic labeled numeric range slider — used for finger curl/spread (raw
// radian values, not degrees, matching AvatarCanvas's own FINGER_CURL_JOINTS/
// avatar-gesture-engine.ts presets — see avatar-finger-presets.ts) and for
// the Face panel's expression weight (0-1). Shown as a plain number rather
// than converted to degrees/percent so the value on screen always matches
// what a preset object (and, later, a saved animation's JSON) actually
// contains.
function RangeSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <input
          type="number"
          step={0.01}
          min={min}
          max={max}
          value={Number(value.toFixed(2))}
          // Same "skip invalid intermediate values" reasoning as AxisSlider
          // above — lets the admin type a bare "-" or "0." mid-entry without
          // React snapping the field back on every keystroke.
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs tabular-nums text-foreground outline-none hover:border-border focus:border-brand focus:bg-surface"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-brand"
      />
    </div>
  );
}

/**
 * VRM Animation Studio — full pose editor (bones/Phase B, hand IK/Phase C,
 * fingers/Phase D, face expression) on top of a timeline/keyframe system
 * (Phase F/G, 5-curve interpolation) with database persistence and a
 * saved-animation library (Phase H/I) and runtime playback (Phase J, see
 * AvatarCanvas.tsx's playCustomAnimation). A keyframe is a snapshot of
 * whatever's DELIBERATELY posed at capture time (captureCurrentPose) —
 * bones, fingers, and expression the admin explicitly touched via the
 * panels above, not every bone's incidental idle value. Playback
 * (applyPoseAtTime/applyInterpolatedPose, from avatar-keyframe-playback.ts)
 * drives the SAME imperative override APIs (setBoneOverride/setFingerPose/
 * setFaceOverrides) the manual panels already call — untouched bones stay
 * under idle's control throughout, exactly like manual editing.
 *
 * Edit Gesture (openGesture) lets an admin open one of the 20 built-in
 * procedural gestures (avatar-gesture-engine.ts's GESTURE_DEFINITIONS)
 * directly into this SAME keyframes state — not a disconnected imported
 * copy. Identity is tracked purely via the GLOBAL slug an AvatarAnimation
 * row would get from being saved under the gesture's own name; no separate
 * "this is a gesture override" flag or storage system. "Simpan Perubahan"
 * updates that row in place (or creates it, on the very first save);
 * "Simpan Sebagai" always branches to an independent new row via a name
 * prompt, never silently. Every AvatarAnimation is a shared, global library
 * entry (see schema.prisma's own comment) — usable by any live avatar via
 * TiktokLiveComment.customAnimationId, not scoped to one admin or one VRM
 * model. The 7 Mixamo clips are deliberately NOT offered
 * here — they're FBX-backed, and editing gestures already-in-the-system was
 * explicitly scoped to exclude any FBX-import path.
 */
export default function AvatarAnimationStudioPage() {
  const [templates, setTemplates] = useState<AvatarTemplateOption[] | null>(null);
  const [selectedVrmUrl, setSelectedVrmUrl] = useState<string>("");
  const [availableBones, setAvailableBones] = useState<VRMHumanBoneName[]>([]);
  const [selectedBone, setSelectedBone] = useState<VRMHumanBoneName | null>(null);
  const [rotationDeg, setRotationDeg] = useState({ x: 0, y: 0, z: 0 });
  const [overriddenBones, setOverriddenBones] = useState<Set<VRMHumanBoneName>>(new Set());
  // Phase C: which hand(s) currently have an active, draggable IK target,
  // and the WORLD-space starting position the gizmo pair spawns at (only
  // read once, at the moment IK is switched on for that side — the gizmo
  // itself owns live position after that via its own drag state).
  const [ikSides, setIkSides] = useState<Record<"left" | "right", { target: Vec3; pole: Vec3 } | null>>({ left: null, right: null });
  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);
  // True whenever the admin has posed something (bone/finger/face/IK) since
  // the last time it was captured into a keyframe — surfaces as the
  // "Terapkan ke Keyframe" button below. Without this, a slider edit that's
  // never followed by clicking "Tambah Keyframe" is silently lost the
  // moment the timeline is scrubbed elsewhere (applyPoseAtTime overwrites
  // it) — confirmed as the exact cause of a real report ("kalau saya tidak
  // klik tambah keyframe, animasi bones-nya tidak berubah"). This doesn't
  // change that underlying mechanic (an edit genuinely does need to be
  // captured into a keyframe to matter) — it makes the "you have an
  // uncaptured edit" state impossible to miss.
  const [isDirty, setIsDirty] = useState(false);
  // Where AvatarCanvas's own one-time "medium shot" auto-framing pointed the
  // camera (see AvatarCanvas's onCameraFramed) — handed to OrbitControls as
  // its target below. Without this, OrbitControls' default target of
  // (0,0,0) wins on first orbit and reframes the shot down at the model's
  // feet, which is exactly what made the hand IK gizmos invisible before
  // this was wired up.
  const [cameraTarget, setCameraTarget] = useState<Vec3 | null>(null);
  // Phase D: which hand's finger controls are currently shown/edited, the
  // current (possibly hand-tuned-past-a-preset) pose per side, whether an
  // override is active per side (drives the "Reset Jari" button + Body
  // Controls-style active indicator), and which finger's joints are
  // expanded in the right sidebar's slider panel.
  const [fingerSide, setFingerSide] = useState<"left" | "right">("right");
  const [fingerPoseState, setFingerPoseState] = useState<Record<"left" | "right", FingerPose>>({ left: {}, right: {} });
  const [fingerActive, setFingerActive] = useState<Record<"left" | "right", boolean>>({ left: false, right: false });
  const [selectedFingerGroup, setSelectedFingerGroup] = useState<string | null>(null);
  // Phase Face: every blend-shape name currently posed, mapped to its
  // weight (0-1) — eyebrows/eyes/mouth/emotion all independently active at
  // once, replacing the older "one preset at a time" model. Empty object =
  // no override active (falls back to the AI-emotion system on the live
  // runtime; nothing on the Studio's own preview, which has no such
  // system). `availableFaceExpressions` is every blend-shape name the
  // loaded VRM actually has — populated by the same polling pattern as
  // `availableBones` below, since AvatarCanvas has no onReady callback to
  // hook into directly.
  const [faceOverrides, setFaceOverrides] = useState<Record<string, number>>({});
  const [availableFaceExpressions, setAvailableFaceExpressions] = useState<string[]>([]);
  // Phase F/G: the in-memory keyframe list (no persistence yet — Phase E/H
  // were explicitly skipped for this pass), always kept sorted by time, plus
  // the transport state (current playhead, playing, looping) and which
  // animation this clip is currently named.
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [animationName, setAnimationName] = useState("Animasi Baru");
  // Phase H/I: the shared, global Animation Library — every admin sees and
  // can manage every entry (see schema.prisma's own comment on
  // AvatarAnimation). Null while the first fetch is still in flight
  // (distinct from an empty array, same "null = loading" convention as
  // `templates` above). `currentAnimationId` is null for a not-yet-saved
  // clip (Save creates a new row) and set once
  // saved or once an existing one is loaded for editing (Save then updates
  // that same row instead of creating a duplicate).
  const [savedAnimations, setSavedAnimations] = useState<SavedAnimation[] | null>(null);
  const [currentAnimationId, setCurrentAnimationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTargetAnimation, setDeleteTargetAnimation] = useState<{ id: string; name: string } | null>(null);
  // Edit Gesture — which of the 20 built-in gestures is picked in the
  // dropdown, whether "Buka Gesture" is currently seeding fresh keyframes
  // (disables the button/shows a spinner — this genuinely takes a real
  // second or two the first time, it plays the gesture out and samples it
  // live at each step boundary), and a pending confirmation when there's
  // unsaved keyframe work opening a different gesture would discard.
  const [editGestureName, setEditGestureName] = useState<GestureNameV2>(GESTURE_NAMES_V2[0]);
  const [isImporting, setIsImporting] = useState(false);
  const [openGestureConfirmName, setOpenGestureConfirmName] = useState<GestureNameV2 | null>(null);
  // "Simpan Sebagai" name prompt (see openSaveAsModal/confirmSaveAs).
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const avatarRef = useRef<AvatarCanvasHandle>(null);

  useEffect(() => {
    fetch("/api/admin/avatar-templates")
      .then((res) => res.json())
      .then((data: { templates?: AvatarTemplateOption[] }) => {
        const list = data.templates ?? [];
        setTemplates(list);
        if (list.length > 0) setSelectedVrmUrl(list[0].vrmUrl);
      })
      .catch(() => setTemplates([]));
  }, []);

  const refreshAnimationList = useCallback(() => {
    fetch("/api/admin/avatar-animations")
      .then((res) => res.json())
      .then((data: { animations?: SavedAnimation[] }) => setSavedAnimations(data.animations ?? []))
      .catch(() => setSavedAnimations([]));
  }, []);

  useEffect(() => {
    refreshAnimationList();
  }, [refreshAnimationList]);

  // React's own documented pattern for "reset state when a prop changes"
  // (react.dev "You Might Not Need An Effect") — adjusting state directly
  // during render by comparing against a tracked previous value, rather
  // than a synchronous setState at the top of a useEffect body (which
  // triggers an extra cascading render and is what the project's lint
  // config flags as an error).
  const [prevVrmUrl, setPrevVrmUrl] = useState(selectedVrmUrl);
  if (selectedVrmUrl !== prevVrmUrl) {
    setPrevVrmUrl(selectedVrmUrl);
    setAvailableBones([]);
    setSelectedBone(null);
    setOverriddenBones(new Set());
    setIkSides({ left: null, right: null });
    setCameraTarget(null);
    setFingerPoseState({ left: {}, right: {} });
    setFingerActive({ left: false, right: false });
    setSelectedFingerGroup(null);
    setFaceOverrides({});
    setAvailableFaceExpressions([]);
    setKeyframes([]);
    setSelectedKeyframeId(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setAnimationName("Animasi Baru");
    setCurrentAnimationId(null);
    setSaveError(null);
    setIsDirty(false);
  }

  // Every blend-shape name the loaded model has, grouped for the Face
  // panel — recomputed on render (cheap: a filter over at most a few dozen
  // short strings), not memoized.
  const faceExpressionsByCategory = FACE_CATEGORY_ORDER.map((category) => ({
    category,
    names: availableFaceExpressions.filter((name) => categorizeFaceExpression(name) === category),
  })).filter((group) => group.names.length > 0);

  const duration = keyframes.length > 0 ? keyframes[keyframes.length - 1].time : 0;
  const selectedKeyframe = keyframes.find((k) => k.id === selectedKeyframeId) ?? null;
  // The scrubber/scrubTo's own range — deliberately NOT just `duration`.
  // `duration` is derived from the LAST keyframe's own time, so bounding the
  // scrubber to it would make it impossible to ever seek PAST the last
  // keyframe to place a new one further out — a chicken-and-egg lockout
  // (add a keyframe at t=0 and duration becomes 0, capping the scrubber at
  // 0 forever). Always keeps at least a few seconds of headroom past
  // whichever is furthest, duration or the current playhead.
  const timelineMax = Math.max(duration, currentTime, 1) + 2;

  // AvatarCanvas doesn't expose an "onReady" callback publicly (it's
  // internal to AvatarModel) — polling getAvailableBones() every 500ms
  // until it returns a non-empty list is the same "don't touch the render
  // loop, use an interval for UI-facing polling" pattern already
  // established elsewhere in this codebase (e.g. the debug panel's own
  // setInterval poll in AvatarCanvas.tsx itself) rather than a per-frame
  // check.
  useEffect(() => {
    if (!selectedVrmUrl) return;
    const id = setInterval(() => {
      const bones = avatarRef.current?.getAvailableBones() ?? [];
      if (bones.length > 0) {
        setAvailableBones(bones);
        clearInterval(id);
      }
    }, 500);
    return () => clearInterval(id);
  }, [selectedVrmUrl]);

  // Same polling pattern as availableBones above, for the Face panel's own
  // per-model blend-shape list.
  useEffect(() => {
    if (!selectedVrmUrl) return;
    const id = setInterval(() => {
      const names = avatarRef.current?.getAvailableFaceExpressions() ?? [];
      if (names.length > 0) {
        setAvailableFaceExpressions(names);
        clearInterval(id);
      }
    }, 500);
    return () => clearInterval(id);
  }, [selectedVrmUrl]);

  const selectBone = useCallback(
    (bone: VRMHumanBoneName) => {
      // IK currently owns this bone (see IK_OWNED_BONES) — editing it
      // manually here would just get immediately overwritten every frame,
      // confusing rather than useful.
      if ((ikSides.left && IK_OWNED_BONES.left.includes(bone)) || (ikSides.right && IK_OWNED_BONES.right.includes(bone))) return;
      setSelectedBone(bone);
      const current = avatarRef.current?.getBoneRotation(bone);
      setRotationDeg(
        current
          ? { x: current.x * RAD_TO_DEG, y: current.y * RAD_TO_DEG, z: current.z * RAD_TO_DEG }
          : { x: 0, y: 0, z: 0 }
      );
    },
    [ikSides]
  );

  function applyRotation(next: { x: number; y: number; z: number }) {
    if (!selectedBone) return;
    setRotationDeg(next);
    avatarRef.current?.setBoneOverride(selectedBone, next.x * DEG_TO_RAD, next.y * DEG_TO_RAD, next.z * DEG_TO_RAD);
    setOverriddenBones((prev) => new Set(prev).add(selectedBone));
    setIsDirty(true);
  }

  function resetSelectedBone() {
    if (!selectedBone) return;
    avatarRef.current?.clearBoneOverride(selectedBone);
    setOverriddenBones((prev) => {
      const next = new Set(prev);
      next.delete(selectedBone);
      return next;
    });
    const current = avatarRef.current?.getBoneRotation(selectedBone);
    setRotationDeg(
      current
        ? { x: current.x * RAD_TO_DEG, y: current.y * RAD_TO_DEG, z: current.z * RAD_TO_DEG }
        : { x: 0, y: 0, z: 0 }
    );
  }

  function resetAllBones() {
    avatarRef.current?.clearAllBoneOverrides();
    setOverriddenBones(new Set());
    if (selectedBone) {
      const current = avatarRef.current?.getBoneRotation(selectedBone);
      setRotationDeg(
        current
          ? { x: current.x * RAD_TO_DEG, y: current.y * RAD_TO_DEG, z: current.z * RAD_TO_DEG }
          : { x: 0, y: 0, z: 0 }
      );
    }
  }

  // The IK gizmo (IkHandControls/DraggableTarget, inside the 3D viewport)
  // calls setHandIkTarget directly on every pointer move during a drag —
  // bypassing every page-level "edit" function above — so dragging needs
  // its own hook into the dirty flag, via the same onDraggingChange prop
  // already threaded through for orbit-vs-gizmo mouse ownership.
  function handleGizmoDraggingChange(dragging: boolean) {
    setIsDraggingGizmo(dragging);
    if (dragging) setIsDirty(true);
  }

  function toggleHandIk(side: "left" | "right") {
    if (ikSides[side]) {
      avatarRef.current?.clearHandIkTarget(side);
      setIkSides((prev) => ({ ...prev, [side]: null }));
      return;
    }
    const handBone: VRMHumanBoneName = side === "left" ? "leftHand" : "rightHand";
    const elbowBone: VRMHumanBoneName = side === "left" ? "leftLowerArm" : "rightLowerArm";
    const handPos = avatarRef.current?.getBoneWorldPosition(handBone);
    const elbowPos = avatarRef.current?.getBoneWorldPosition(elbowBone);
    if (!handPos) return;
    const target = handPos;
    // A reasonable starting point for the elbow pole — below and slightly
    // outward from the current elbow. Not anatomically derived (there's no
    // per-model calibration for this, unlike the raise/reach axes
    // elsewhere in this project) — just a sane spawn point the admin drags
    // into place by eye, exactly as the spec asks for.
    const pole = elbowPos
      ? { x: elbowPos.x + (side === "right" ? 0.15 : -0.15), y: elbowPos.y - 0.3, z: elbowPos.z + 0.15 }
      : { x: target.x + (side === "right" ? 0.15 : -0.15), y: target.y - 0.3, z: target.z + 0.15 };
    // Also clear any Phase B override on this arm — setHandIkTarget does
    // this too on the FIRST frame it runs, but doing it here as well keeps
    // the "overridden" dot indicator in Body Controls accurate immediately,
    // not one poll-interval late.
    for (const bone of IK_OWNED_BONES[side]) {
      avatarRef.current?.clearBoneOverride(bone);
      setOverriddenBones((prev) => {
        const next = new Set(prev);
        next.delete(bone);
        return next;
      });
    }
    if (selectedBone && IK_OWNED_BONES[side].includes(selectedBone)) setSelectedBone(null);
    avatarRef.current?.setHandIkTarget(side, target, pole);
    setIkSides((prev) => ({ ...prev, [side]: { target, pole } }));
    setIsDirty(true);
  }

  function applyFingerPreset(name: FingerPresetName) {
    if (name === "relaxed") {
      // "Relaxed" clears the override entirely rather than forcing every
      // joint to 0 — see avatar-finger-presets.ts's own comment on why
      // that's distinct from "palm".
      avatarRef.current?.clearFingerPose(fingerSide);
      setFingerActive((prev) => ({ ...prev, [fingerSide]: false }));
      setFingerPoseState((prev) => ({ ...prev, [fingerSide]: {} }));
      return;
    }
    const pose = FINGER_PRESETS[name];
    avatarRef.current?.setFingerPose(fingerSide, pose);
    setFingerActive((prev) => ({ ...prev, [fingerSide]: true }));
    setFingerPoseState((prev) => ({ ...prev, [fingerSide]: pose }));
    setIsDirty(true);
  }

  function resetFingerSide(side: "left" | "right") {
    avatarRef.current?.clearFingerPose(side);
    setFingerActive((prev) => ({ ...prev, [side]: false }));
    setFingerPoseState((prev) => ({ ...prev, [side]: {} }));
  }

  // Presets are editable starting points, not fixed shapes — nudging a
  // single joint's slider builds an override on top of whatever the current
  // pose already has (starting from `{}` if no preset was picked yet),
  // rather than requiring a preset first.
  function updateFingerJoint(joint: FingerBoneSuffix, axis: "curl" | "spread", value: number) {
    setFingerPoseState((prev) => {
      const currentPose = prev[fingerSide];
      const nextPose: FingerPose = { ...currentPose, [joint]: { ...currentPose[joint], [axis]: value } };
      avatarRef.current?.setFingerPose(fingerSide, nextPose);
      return { ...prev, [fingerSide]: nextPose };
    });
    setFingerActive((prev) => ({ ...prev, [fingerSide]: true }));
    setIsDirty(true);
  }

  // Sets ONE blend-shape name's weight, leaving every other currently-posed
  // name untouched — eyebrows/eyes/mouth/an emotion preset can all be
  // dialed in independently this way, unlike the old single-slot model.
  function setFaceExpressionValue(name: string, weight: number) {
    setFaceOverrides((prev) => {
      const next = { ...prev, [name]: weight };
      avatarRef.current?.setFaceOverrides(next);
      return next;
    });
    setIsDirty(true);
  }

  // Quick one-click switch for the Ekspresi category's preset buttons —
  // sets ONE emotion name to full weight and zeroes every OTHER emotion
  // name (mirroring the old "one preset at a time" convenience), while
  // leaving eyes/brows/mouth sliders elsewhere completely alone. The
  // resulting weight is still just a normal entry in the map afterward —
  // fine-tunable via that same expression's own slider.
  function applyEmotionPreset(preset: FaceExpressionPreset) {
    setFaceOverrides((prev) => {
      const next = { ...prev };
      FACE_EXPRESSION_PRESETS.forEach((p) => {
        if (p === preset) next[p] = 1;
        else delete next[p];
      });
      avatarRef.current?.setFaceOverrides(next);
      return next;
    });
    setIsDirty(true);
  }

  function resetFace() {
    avatarRef.current?.setFaceOverrides(null);
    setFaceOverrides({});
  }

  // Reads whatever the admin has DELIBERATELY posed right now — the union of
  // manually-overridden bones (Body Controls) and IK-owned arm bones (their
  // live resulting rotation, via getBoneRotation, since IK writes the same
  // bone.rotation Phase B's override does — baking IK's result into a plain
  // rotation keyframe means playback never needs to re-run the IK solver),
  // plus any active finger/face overrides. Untouched bones are simply
  // omitted, not captured at whatever value idle's breathing happened to be
  // at this instant — see KeyframePose's own comment.
  // `existing` — the keyframe ALREADY at this time, if any — is merged
  // into the result rather than discarded. Without this, re-capturing at
  // an existing keyframe's time (the normal "touch up one bone, click
  // Tambah Keyframe again" workflow) would silently DROP every bone/
  // finger/face value that keyframe already had but the admin didn't
  // happen to re-touch THIS time (overriddenBones/fingerActive/faceActive
  // only ever reflect what's been touched in the CURRENT session, not
  // what a previously-captured keyframe contains) — confirmed as a real,
  // severe bug: a saved gesture's chest/spine/neck/hips progressively
  // disappearing from later keyframes as the admin touched up head, then
  // spine, etc. one at a time, each save silently erasing the others.
  // Bones/fingers/face the admin IS currently driving still take priority
  // (an explicit edit always wins over the old stored value).
  function captureCurrentPose(existing: KeyframePose | null): KeyframePose {
    const bones: KeyframePose["bones"] = { ...(existing?.bones ?? {}) };
    const posedBones = new Set<VRMHumanBoneName>(overriddenBones);
    if (ikSides.left) IK_OWNED_BONES.left.forEach((b) => posedBones.add(b));
    if (ikSides.right) IK_OWNED_BONES.right.forEach((b) => posedBones.add(b));
    posedBones.forEach((bone) => {
      const rot = avatarRef.current?.getBoneRotation(bone);
      if (rot) bones[bone] = rot;
    });
    return {
      bones,
      leftFingers: fingerActive.left ? fingerPoseState.left : (existing?.leftFingers ?? null),
      rightFingers: fingerActive.right ? fingerPoseState.right : (existing?.rightFingers ?? null),
      face: Object.keys(faceOverrides).length > 0 ? faceOverrides : (existing?.face ?? null),
    };
  }

  function addKeyframe() {
    // Reusing an existing keyframe's id/interpolation (rather than always
    // minting a new id and resetting to the "easeInOut" default) when
    // updating one already at this time — a deliberate re-save shouldn't
    // reset a curve the admin already chose, or lose timeline-selection
    // continuity.
    const existing = keyframes.find((k) => Math.abs(k.time - currentTime) <= 0.001);
    const pose = captureCurrentPose(existing?.pose ?? null);
    const id = existing?.id ?? `kf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newKeyframe: Keyframe = { id, time: currentTime, interpolation: existing?.interpolation ?? "easeInOut", pose };
    setKeyframes((prev) => {
      // Re-capturing at (essentially) the same time replaces that keyframe
      // rather than stacking a near-duplicate the admin would have to
      // notice and clean up manually.
      const filtered = prev.filter((k) => Math.abs(k.time - currentTime) > 0.001);
      return [...filtered, newKeyframe].sort((a, b) => a.time - b.time);
    });
    setSelectedKeyframeId(id);
    setIsDirty(false);
  }

  function deleteKeyframe(id: string) {
    setKeyframes((prev) => prev.filter((k) => k.id !== id));
    if (selectedKeyframeId === id) setSelectedKeyframeId(null);
  }

  function duplicateKeyframe(id: string) {
    const source = keyframes.find((k) => k.id === id);
    if (!source) return;
    const newId = `kf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Half a second later by default — a reasonable starting point the
    // admin retimes via the Keyframe Properties time field, same spirit as
    // the IK pole's own "sane spawn point, drag it into place" default.
    const duplicate: Keyframe = { ...source, id: newId, time: source.time + 0.5 };
    setKeyframes((prev) => [...prev, duplicate].sort((a, b) => a.time - b.time));
    setSelectedKeyframeId(newId);
  }

  function updateKeyframeTime(id: string, time: number) {
    setKeyframes((prev) => prev.map((k) => (k.id === id ? { ...k, time } : k)).sort((a, b) => a.time - b.time));
  }

  function updateKeyframeInterpolation(id: string, interpolation: InterpolationType) {
    setKeyframes((prev) => prev.map((k) => (k.id === id ? { ...k, interpolation } : k)));
  }

  // Jumps + selects the previous/next keyframe relative to whichever is
  // currently selected — `keyframes` is always kept time-sorted (every
  // mutation above re-sorts), so array order IS timeline order. Falls back
  // to the first/last keyframe when nothing's selected (e.g. right after
  // scrubbing to an arbitrary time with the number field), so the buttons
  // always do something sensible rather than silently no-op.
  function seekToKeyframe(direction: "prev" | "next") {
    if (keyframes.length === 0) return;
    const idx = keyframes.findIndex((k) => k.id === selectedKeyframeId);
    const targetIdx =
      direction === "next"
        ? idx === -1
          ? 0
          : Math.min(keyframes.length - 1, idx + 1)
        : idx === -1
          ? keyframes.length - 1
          : Math.max(0, idx - 1);
    const target = keyframes[targetIdx];
    setSelectedKeyframeId(target.id);
    scrubTo(target.time);
  }

  // Both the interpolation math and the "hold at an edge keyframe" logic
  // live in avatar-keyframe-playback.ts now, shared with AvatarCanvas.tsx's
  // own runtime playCustomAnimation (Phase J) — avatarRef.current already
  // structurally satisfies KeyframePoseApplier (same setBoneOverride/
  // setFingerPose/clearFingerPose/setFaceOverrides signatures), so no
  // adapter object is needed here.
  //
  // Takes an explicit keyframe list rather than always reading the
  // `keyframes` state directly — needed by loadAnimationIntoStudio, which
  // calls this in the SAME tick as setKeyframes(loadedKeyframes) and would
  // otherwise apply the pose from the stale pre-load `keyframes` closure
  // (React state updates aren't synchronous). Every other caller just wants
  // "apply at time t using whatever's currently loaded," so applyPoseAtTime
  // below is a thin wrapper over this using the live `keyframes` state.
  function applyPoseAtTimeUsing(kfList: Keyframe[], t: number) {
    if (avatarRef.current) applyKeyframePoseAtTime(avatarRef.current, kfList, t);
  }

  function applyPoseAtTime(t: number) {
    applyPoseAtTimeUsing(keyframes, t);
  }

  function scrubTo(t: number) {
    const clamped = Math.min(Math.max(t, 0), timelineMax);
    setCurrentTime(clamped);
    applyPoseAtTime(clamped);
    // Moving the playhead re-applies whatever's actually stored at the new
    // time, discarding any not-yet-captured edit — so the dirty flag
    // should follow: an edit the admin never applied really is gone the
    // moment they scrub away, this just keeps the indicator honest about it.
    setIsDirty(false);
  }

  function togglePlay() {
    if (keyframes.length < 2) return;
    setIsPlaying((p) => !p);
  }

  function stopPlayback() {
    setIsPlaying(false);
    scrubTo(0);
  }

  // Clears every manual pose override across all the editing panels (Body
  // Controls, Hand IK, Finger Controls, Face) and their UI state — used
  // before loading a saved animation into the studio so nothing left over
  // from a previous editing session bleeds into the loaded clip's pose
  // (applyInterpolatedPose only ever touches bones/joints the CURRENT
  // keyframe pair defines, so a stale override on a bone neither keyframe
  // mentions would otherwise sit there untouched, contradicting what the
  // saved animation actually contains).
  function clearAllPoseOverrides() {
    avatarRef.current?.clearAllBoneOverrides();
    avatarRef.current?.clearFingerPose("left");
    avatarRef.current?.clearFingerPose("right");
    avatarRef.current?.setFaceOverrides(null);
    avatarRef.current?.clearHandIkTarget("left");
    avatarRef.current?.clearHandIkTarget("right");
    setSelectedBone(null);
    setOverriddenBones(new Set());
    setFingerActive({ left: false, right: false });
    setFingerPoseState({ left: {}, right: {} });
    setSelectedFingerGroup(null);
    setFaceOverrides({});
    setIkSides({ left: null, right: null });
    setIsDirty(false);
  }

  function prettyGestureLabel(name: string) {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function requestOpenGesture(name: GestureNameV2) {
    if (keyframes.length > 0) {
      setOpenGestureConfirmName(name);
      return;
    }
    void openGesture(name);
  }

  // Records a gesture's REAL step sequence into keyframes by playing it
  // live and sampling bone rotations synchronized to actual step
  // transitions (via the engine's own getGestureDebugState/stepIndex) —
  // deliberately NOT arbitrary fixed-time-interval sampling. This is the
  // "use the existing data structure" approach per explicit instruction:
  // the resulting keyframe COUNT and TIMING come directly from the
  // gesture's own `steps` array (avatar-gesture-engine.ts's
  // GESTURE_DEFINITIONS — a handful of named phases like prepare/action/
  // hold/return, not a dense sampled blob), while the NUMERIC bone values
  // come from the same live, per-model-calibrated engine that already
  // resolves armSign/reach-axis/IK/idle-fallback correctly — reproducing
  // that resolution by hand here would mean duplicating a large, fragile
  // chunk of AvatarCanvas.tsx's useFrame logic. No FBX file is ever
  // involved: the 20 procedural gestures have none (confirmed — pure
  // TypeScript pose math), which is also why the 7 Mixamo clips are
  // deliberately NOT offered in this dropdown.
  async function buildGestureSeedKeyframes(name: GestureNameV2): Promise<Keyframe[]> {
    const api = avatarRef.current;
    if (!api) return [];
    const captured: Keyframe[] = [];
    const start = performance.now();
    const MAX_SECONDS = 6;
    const POLL_MS = 50;
    let lastStepIndex = -1;

    function captureSample() {
      const elapsedSeconds = (performance.now() - start) / 1000;
      const bonesPose: KeyframePose["bones"] = {};
      GESTURE_EDIT_BONES.forEach((bone) => {
        const rot = api!.getBoneRotation(bone);
        if (rot) bonesPose[bone] = rot;
      });
      captured.push({
        id: `kf_${captured.length}`,
        time: Number(elapsedSeconds.toFixed(2)),
        // "linear", not the manual-add default of "easeInOut" — these
        // keyframes are already densely spaced (one per real step
        // transition, ~0.2-0.4s apart) samples of an inherently smooth
        // spring curve. Chaining easeInOut across many closely-spaced
        // keyframes makes velocity peak ~10x higher mid-segment than at
        // each keyframe boundary (every segment decelerates into its
        // endpoint and re-accelerates out — confirmed numerically), which
        // reads as a repeated stutter/pulse with keyframes this close
        // together. Densely-spaced linear segments approximating an
        // already-smooth curve look smooth on their own — no per-segment
        // easing needed on top. Keyframes the admin adds by hand (see
        // addKeyframe) are typically much sparser, where easeInOut's
        // deceleration-into-a-deliberate-pose reads as intentional rather
        // than as a stutter — that default is unchanged.
        interpolation: "linear",
        pose: { bones: bonesPose, leftFingers: null, rightFingers: null, face: null },
      });
    }

    api.playGesture(name);
    captureSample(); // starting pose, right as the gesture begins

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const elapsedSeconds = (performance.now() - start) / 1000;
      const stillPlaying = api.isPlayingGesture(name);
      if (!stillPlaying || elapsedSeconds >= MAX_SECONDS) {
        captureSample(); // final settled/returned-to-idle pose
        break;
      }
      const debugState = api.getGestureDebugState();
      if (debugState && debugState.stepIndex !== lastStepIndex) {
        // A step transition just fired, meaning the PREVIOUS step held its
        // target for its full duration — capture right here, at the tail
        // end of that settled pose, rather than right after entering the
        // new step (whose spring has barely started moving toward it yet).
        lastStepIndex = debugState.stepIndex;
        captureSample();
      }
    }

    api.stopGesture();
    return captured;
  }

  // Opens a gesture into the Studio for direct editing — the core fix for
  // "editing an imported copy never affects the original gesture." Identity
  // is tracked via the SAME global slug an animation would get from being
  // saved with the gesture's own pretty label as its name (see
  // slugifyLikeServer) — no new storage system, no separate "this is a
  // gesture override" flag anywhere: a saved AvatarAnimation row whose slug
  // matches a gesture name IS that gesture's edited version, found via the
  // SAME Animation Library list already fetched for Phase I. First open ever
  // (no such row yet) seeds fresh keyframes from the live gesture via
  // buildGestureSeedKeyframes; every open after that (this session or a
  // future one, post-reload) loads the persisted edit through the exact
  // same loadAnimationIntoStudio Phase I's "Edit" button already uses.
  async function openGesture(name: GestureNameV2) {
    const api = avatarRef.current;
    if (!api || isImporting) return;

    const targetSlug = slugifyLikeServer(prettyGestureLabel(name));
    const existing = savedAnimations?.find((a) => a.slug === targetSlug);
    if (existing) {
      loadAnimationIntoStudio(existing);
      return;
    }

    setIsImporting(true);
    try {
      clearAllPoseOverrides();
      setSelectedKeyframeId(null);
      setCurrentTime(0);
      setIsPlaying(false);
      setCurrentAnimationId(null);
      setSaveError(null);

      const seedKeyframes = await buildGestureSeedKeyframes(name);
      setKeyframes(seedKeyframes);
      // Exactly the pretty label, no suffix — so the FIRST "Simpan
      // Perubahan" (a POST, since currentAnimationId is still null) slugs
      // to targetSlug above, letting the next openGesture("name") find it.
      setAnimationName(prettyGestureLabel(name));
      applyPoseAtTimeUsing(seedKeyframes, 0);
    } finally {
      setIsImporting(false);
    }
  }

  // Loads a saved clip's keyframes into the studio for further editing
  // (Phase I "Edit") — this is the capability the user explicitly asked
  // for: being able to open and continue working on an animation created in
  // an earlier session. `autoPlay` additionally starts playback immediately
  // (used by the library's "Preview" action) once at least 2 keyframes
  // exist to actually play a transition.
  function loadAnimationIntoStudio(animation: SavedAnimation, autoPlay = false) {
    clearAllPoseOverrides();
    const loadedKeyframes = normalizeKeyframes((animation.data as { keyframes?: Keyframe[] } | null)?.keyframes ?? []);
    setKeyframes(loadedKeyframes);
    setAnimationName(animation.name);
    setCurrentAnimationId(animation.id);
    setSelectedKeyframeId(null);
    setCurrentTime(0);
    setSaveError(null);
    applyPoseAtTimeUsing(loadedKeyframes, 0);
    setIsPlaying(autoPlay && loadedKeyframes.length >= 2);
  }

  // Creates a new row (POST) when editing a not-yet-saved clip, or
  // overwrites the currently-loaded one (PUT) otherwise — `asNew` forces a
  // POST even when a clip is currently loaded, for "Save As New" (e.g.
  // branching off a loaded animation without overwriting the original).
  // "Simpan Perubahan" (asNew=false) updates the SAME row currentAnimationId
  // already points at — or, if this is the first save of a freshly-opened
  // gesture/new animation (currentAnimationId still null), creates it,
  // which is exactly the auto-create-on-first-save behavior openGesture's
  // slug-matching relies on. "Simpan Sebagai" (asNew=true) always creates a
  // NEW row via nameOverride (see confirmSaveAs) and switches editing focus
  // to it, leaving whatever was previously being edited completely
  // untouched — never a silent, automatic copy.
  async function saveAnimation(options: { asNew: boolean; nameOverride?: string }) {
    const { asNew, nameOverride } = options;
    const name = nameOverride ?? animationName;
    if (keyframes.length === 0) {
      setSaveError("Tambahkan minimal satu keyframe sebelum menyimpan.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const targetId = asNew ? null : currentAnimationId;
      const res = await fetch(targetId ? `/api/admin/avatar-animations/${targetId}` : "/api/admin/avatar-animations", {
        method: targetId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, duration, data: { keyframes } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(json?.error ?? "Gagal menyimpan animasi.");
        return;
      }
      setCurrentAnimationId(json.animation.id);
      setAnimationName(json.animation.name);
      refreshAnimationList();
    } finally {
      setIsSaving(false);
    }
  }

  function openSaveAsModal() {
    setSaveAsName(`${animationName} (Copy)`);
    setSaveAsOpen(true);
  }

  function confirmSaveAs() {
    const name = saveAsName.trim();
    if (!name) return;
    setSaveAsOpen(false);
    void saveAnimation({ asNew: true, nameOverride: name });
  }

  async function duplicateSavedAnimation(animation: SavedAnimation) {
    await fetch("/api/admin/avatar-animations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${animation.name} (Copy)`, duration: animation.duration, data: animation.data }),
    }).catch(() => null);
    refreshAnimationList();
  }

  async function confirmDeleteAnimation() {
    if (!deleteTargetAnimation) return;
    const { id } = deleteTargetAnimation;
    await fetch(`/api/admin/avatar-animations/${id}`, { method: "DELETE" }).catch(() => null);
    if (currentAnimationId === id) setCurrentAnimationId(null);
    setDeleteTargetAnimation(null);
    refreshAnimationList();
  }

  // Page-level rAF loop (not AvatarCanvas's own useFrame — this only ever
  // runs in the Studio, driving the SAME imperative override APIs the
  // manual panels above already call, so it needs no access to
  // AvatarCanvas's internals). Intentionally does NOT depend on
  // `currentTime` (that would restart the loop, and its own `t` local, every
  // single frame) — `t` is seeded once from `currentTime` at the moment
  // Play starts and then advances independently for the lifetime of this
  // effect, exactly the same "ref/local across frames, not a dependency"
  // discipline AvatarCanvas.tsx's own per-frame state (e.g.
  // idleApproachStateRef) already follows.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last: number | null = null;
    let t = currentTime;
    // applyPoseAtTime (imperative, ref-based — no re-render) runs every
    // single frame, same as always. setCurrentTime is THROTTLED to ~12
    // updates/sec instead — this component's render tree is large (bone
    // lists, keyframe markers, sliders, the Animation Library list, several
    // sidebars), and calling setCurrentTime on every animation frame was
    // forcing React to re-render ALL of that 60 times/second during
    // playback, which is genuinely expensive main-thread work competing
    // with the browser's own WebGL frame budget for AvatarCanvas — the
    // real cause of visible stutter reported on subtle head/torso motion
    // (a large arm swing hides the same dropped-frame hitch far better
    // than a small rotation does). 12Hz is still imperceptibly smooth for
    // a scrubber/time-readout UI element, which is all setCurrentTime
    // actually drives — the avatar's own motion no longer depends on it.
    let lastUiUpdateMs = 0;
    const UI_UPDATE_INTERVAL_MS = 80;
    function tick(timestamp: number) {
      if (last === null) last = timestamp;
      const dt = (timestamp - last) / 1000;
      last = timestamp;
      t += dt;
      if (duration <= 0) {
        setIsPlaying(false);
        return;
      }
      if (t >= duration) {
        if (isLooping) {
          t = t % duration;
        } else {
          applyPoseAtTime(duration);
          setCurrentTime(duration);
          setIsPlaying(false);
          return;
        }
      }
      applyPoseAtTime(t);
      if (timestamp - lastUiUpdateMs >= UI_UPDATE_INTERVAL_MS) {
        lastUiUpdateMs = timestamp;
        setCurrentTime(t);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTime/applyPoseAtTime/duration deliberately excluded, see comment above
  }, [isPlaying, isLooping, keyframes]);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">VRM Animation Studio</h1>
          <p className="text-sm text-muted">
            Pose tubuh/tangan/jari/ekspresi, lalu klik &quot;Terapkan ke Keyframe&quot; untuk merekamnya — pindah
            waktu/keyframe tanpa menerapkan akan membuang perubahan yang belum direkam.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              variant="primary"
              size="sm"
              onClick={addKeyframe}
              className="animate-pulse"
              title="Ada perubahan pose yang belum direkam ke keyframe — klik untuk menerapkannya sebelum berpindah waktu/keyframe, atau perubahan ini akan hilang"
            >
              <Check className="h-3.5 w-3.5" />
              Terapkan ke Keyframe
            </Button>
          )}
          {overriddenBones.size > 0 && (
            <Button variant="outline" size="sm" onClick={resetAllBones}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Semua Pose ({overriddenBones.size})
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_260px] gap-4">
        {/* LEFT SIDEBAR */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Avatar</CardTitle>
            </CardHeader>
            <CardContent>
              {templates === null ? (
                <p className="text-xs text-muted">Memuat daftar avatar...</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-muted">
                  Belum ada avatar template. Tambahkan lewat halaman{" "}
                  <a href="/admin/avatar-templates" className="text-brand underline">
                    Avatar Template
                  </a>
                  .
                </p>
              ) : (
                <SearchableSelect
                  options={templates.map((t) => ({ value: t.vrmUrl, label: t.label }))}
                  value={selectedVrmUrl}
                  onChange={setSelectedVrmUrl}
                  placeholder="Cari avatar..."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Edit Gesture</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <SearchableSelect
                options={GESTURE_NAMES_V2.map((n) => ({ value: n, label: prettyGestureLabel(n) }))}
                value={editGestureName}
                onChange={(v) => setEditGestureName(v as GestureNameV2)}
                placeholder="Cari gesture..."
              />
              <Button
                variant="outline"
                size="sm"
                disabled={availableBones.length === 0 || isImporting}
                isLoading={isImporting}
                onClick={() => requestOpenGesture(editGestureName)}
              >
                Buka Gesture
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Hand Controls (IK)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                variant={ikSides.right ? "primary" : "outline"}
                size="sm"
                disabled={availableBones.length === 0}
                onClick={() => toggleHandIk("right")}
              >
                <Hand className="h-3.5 w-3.5" />
                Right Hand IK {ikSides.right ? "(Aktif)" : ""}
              </Button>
              <Button
                variant={ikSides.left ? "primary" : "outline"}
                size="sm"
                disabled={availableBones.length === 0}
                onClick={() => toggleHandIk("left")}
              >
                <Hand className="h-3.5 w-3.5" />
                Left Hand IK {ikSides.left ? "(Aktif)" : ""}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Body Controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {availableBones.length === 0 ? (
                <p className="text-xs text-muted">Memuat daftar bone dari avatar...</p>
              ) : (
                BONE_GROUPS.map((group) => {
                  const bonesInGroup = group.bones.filter((b) => availableBones.includes(b));
                  if (bonesInGroup.length === 0) return null;
                  return (
                    <div key={group.label} className="flex flex-col gap-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{group.label}</p>
                      <div className="flex flex-col gap-0.5">
                        {bonesInGroup.map((bone) => {
                          const ikOwned = (ikSides.left && IK_OWNED_BONES.left.includes(bone)) || (ikSides.right && IK_OWNED_BONES.right.includes(bone));
                          return (
                            <button
                              key={bone}
                              onClick={() => selectBone(bone)}
                              disabled={Boolean(ikOwned)}
                              title={ikOwned ? "Dikontrol oleh IK — matikan Hand IK untuk edit manual" : undefined}
                              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                ikOwned
                                  ? "cursor-not-allowed text-muted opacity-50"
                                  : selectedBone === bone
                                    ? "bg-brand text-white"
                                    : "text-foreground hover:bg-white/[.06]"
                              }`}
                            >
                              <span>
                                {BONE_LABELS[bone] ?? bone}
                                {ikOwned ? " (IK)" : ""}
                              </span>
                              {overriddenBones.has(bone) && (
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedBone === bone ? "bg-white" : "bg-brand"}`} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Finger Controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex gap-1">
                {/* Labeled "Jari ..." rather than "Tangan ..." specifically to avoid colliding with Body Controls' own leftHand/rightHand bone button just below, which already reads "Tangan Kiri"/"Tangan Kanan" (see BONE_LABELS) — two differently-scoped controls with an identical label would be genuinely ambiguous to click, not just a test artifact. */}
                <Button variant={fingerSide === "right" ? "primary" : "outline"} size="sm" className="flex-1" onClick={() => setFingerSide("right")}>
                  Jari Kanan
                </Button>
                <Button variant={fingerSide === "left" ? "primary" : "outline"} size="sm" className="flex-1" onClick={() => setFingerSide("left")}>
                  Jari Kiri
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(FINGER_PRESET_LABELS) as FingerPresetName[]).map((name) => (
                  <Button key={name} variant="outline" size="sm" disabled={availableBones.length === 0} onClick={() => applyFingerPreset(name)}>
                    {FINGER_PRESET_LABELS[name]}
                  </Button>
                ))}
              </div>
              {fingerActive[fingerSide] && (
                <Button variant="outline" size="sm" onClick={() => resetFingerSide(fingerSide)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Jari ({fingerSide === "right" ? "Kanan" : "Kiri"})
                </Button>
              )}
              <div className="flex flex-col gap-0.5 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Atur Per Ruas</p>
                {FINGER_JOINT_GROUPS.map((group) => (
                  <button
                    key={group.label}
                    onClick={() => setSelectedFingerGroup(group.label)}
                    disabled={availableBones.length === 0}
                    className={`rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedFingerGroup === group.label ? "bg-brand text-white" : "text-foreground hover:bg-white/[.06]"
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Face</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {availableFaceExpressions.length === 0 ? (
                <p className="text-xs text-muted">Memuat daftar ekspresi model...</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1">
                    {FACE_EXPRESSION_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        variant={(faceOverrides[preset] ?? 0) > 0 ? "primary" : "outline"}
                        size="sm"
                        onClick={() => applyEmotionPreset(preset)}
                      >
                        {FACE_EXPRESSION_LABELS[preset]}
                      </Button>
                    ))}
                  </div>

                  {faceExpressionsByCategory.map(({ category, names }) => (
                    <div key={category} className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">{FACE_CATEGORY_LABELS[category]}</p>
                      {names.map((name) => (
                        <RangeSlider
                          key={name}
                          label={faceExpressionLabel(name)}
                          value={faceOverrides[name] ?? 0}
                          min={0}
                          max={1}
                          onChange={(v) => setFaceExpressionValue(name, v)}
                        />
                      ))}
                    </div>
                  ))}

                  {Object.keys(faceOverrides).length > 0 && (
                    <Button variant="outline" size="sm" onClick={resetFace}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset Wajah
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Animation Properties</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Nama Animasi</label>
                <input
                  type="text"
                  value={animationName}
                  onChange={(e) => setAnimationName(e.target.value)}
                  className="rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none focus:border-border-strong"
                />
              </div>
              <p className="text-xs text-muted">
                Durasi: {duration.toFixed(2)}s · {keyframes.length} keyframe
              </p>
              {currentAnimationId && <p className="text-xs text-brand">Mengedit animasi tersimpan</p>}
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              <div className="flex gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  isLoading={isSaving}
                  disabled={keyframes.length === 0}
                  onClick={() => saveAnimation({ asNew: false })}
                  title="Menimpa/update animasi ini langsung — kalau ini gesture bawaan yang sedang diedit, ini yang mengubah gesture aslinya, bukan membuat salinan"
                >
                  <Save className="h-3.5 w-3.5" />
                  Simpan Perubahan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={isSaving || keyframes.length === 0}
                  onClick={openSaveAsModal}
                  title="Simpan sebagai animasi baru dengan nama berbeda, tanpa mengubah animasi yang sedang diedit"
                >
                  Simpan Sebagai
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Animation Library</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {savedAnimations === null ? (
                <p className="text-xs text-muted">Memuat daftar animasi...</p>
              ) : savedAnimations.length === 0 ? (
                <p className="text-xs text-muted">Belum ada animasi tersimpan.</p>
              ) : (
                savedAnimations.map((animation) => (
                  <div
                    key={animation.id}
                    className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs ${
                      currentAnimationId === animation.id ? "border-brand bg-brand/10" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium text-foreground" title={animation.name}>
                        {animation.name}
                      </span>
                      <span className="shrink-0 text-muted">{animation.duration.toFixed(1)}s</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="flex-1 px-1.5" onClick={() => loadAnimationIntoStudio(animation)} title="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 px-1.5" onClick={() => loadAnimationIntoStudio(animation, true)} title="Preview">
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 px-1.5" onClick={() => duplicateSavedAnimation(animation)} title="Duplikat">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 px-1.5"
                        onClick={() => setDeleteTargetAnimation({ id: animation.id, name: animation.name })}
                        title="Hapus"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* CENTER — real VRM preview, now with orbit camera + IK gizmos */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardContent className="relative flex-1 p-0">
            {selectedVrmUrl ? (
              <AvatarCanvas
                key={selectedVrmUrl}
                ref={avatarRef}
                vrmUrl={selectedVrmUrl}
                audioRef={audioRef}
                visemeData={null}
                className="h-full w-full"
                onCameraFramed={(target) => setCameraTarget(target)}
              >
                {/* makeDefault registers this as the R3F default controls instance; disabled while dragging a gizmo so orbiting the camera and dragging a target never fight over the same mouse-move. target matches AvatarCanvas's own auto-framing (see cameraTarget above) so orbiting never reframes the shot down at the model's feet. */}
                <OrbitControls
                  makeDefault
                  enabled={!isDraggingGizmo}
                  enablePan
                  enableZoom
                  enableRotate
                  target={cameraTarget ? [cameraTarget.x, cameraTarget.y, cameraTarget.z] : undefined}
                />
                {ikSides.right && (
                  <IkHandControls
                    side="right"
                    avatarRef={avatarRef}
                    initialTarget={ikSides.right.target}
                    initialPole={ikSides.right.pole}
                    onDraggingChange={handleGizmoDraggingChange}
                  />
                )}
                {ikSides.left && (
                  <IkHandControls
                    side="left"
                    avatarRef={avatarRef}
                    initialTarget={ikSides.left.target}
                    initialPole={ikSides.left.pole}
                    onDraggingChange={handleGizmoDraggingChange}
                  />
                )}
              </AvatarCanvas>
            ) : (
              <EmptyState icon={Sparkles} title="Pilih avatar untuk memulai" />
            )}
            <audio ref={audioRef} className="hidden" />
          </CardContent>
        </Card>

        {/* RIGHT SIDEBAR */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Selected Bone</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedBone ? (
                <p className="text-sm font-medium text-foreground">{BONE_LABELS[selectedBone] ?? selectedBone}</p>
              ) : (
                <p className="text-xs text-muted">Pilih bone di panel Body Controls.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Transform Values</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selectedBone ? (
                <>
                  <AxisSlider label="Rotation X" valueDeg={rotationDeg.x} onChange={(v) => applyRotation({ ...rotationDeg, x: v })} />
                  <AxisSlider label="Rotation Y" valueDeg={rotationDeg.y} onChange={(v) => applyRotation({ ...rotationDeg, y: v })} />
                  <AxisSlider label="Rotation Z" valueDeg={rotationDeg.z} onChange={(v) => applyRotation({ ...rotationDeg, z: v })} />
                  <Button variant="outline" size="sm" onClick={resetSelectedBone}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset Bone Ini
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted">—</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Finger Joint Values ({fingerSide === "right" ? "Kanan" : "Kiri"})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selectedFingerGroup ? (
                FINGER_JOINT_GROUPS.find((g) => g.label === selectedFingerGroup)?.joints.map((joint) => {
                  const current = fingerPoseState[fingerSide][joint] ?? {};
                  return (
                    <div key={joint} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{joint.replace(selectedFingerGroup, "")}</p>
                      <RangeSlider label="Curl" value={current.curl ?? 0} min={-0.3} max={1.6} onChange={(v) => updateFingerJoint(joint, "curl", v)} />
                      <RangeSlider label="Spread" value={current.spread ?? 0} min={-0.3} max={0.3} onChange={(v) => updateFingerJoint(joint, "spread", v)} />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted">Pilih jari di panel Finger Controls.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Keyframe Properties</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {selectedKeyframe ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Waktu (detik)</label>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      value={selectedKeyframe.time}
                      onChange={(e) => updateKeyframeTime(selectedKeyframe.id, Math.max(0, Number(e.target.value)))}
                      className="rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none focus:border-border-strong"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Interpolasi</label>
                    <select
                      value={selectedKeyframe.interpolation}
                      onChange={(e) => updateKeyframeInterpolation(selectedKeyframe.id, e.target.value as InterpolationType)}
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-border-strong"
                    >
                      <option value="linear">Linear</option>
                      <option value="easeIn">Ease In</option>
                      <option value="easeOut">Ease Out</option>
                      <option value="easeInOut">Ease In Out</option>
                      <option value="smooth">Smooth</option>
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => duplicateKeyframe(selectedKeyframe.id)}>
                      <Copy className="h-3.5 w-3.5" />
                      Duplikat
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => deleteKeyframe(selectedKeyframe.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted">Pilih keyframe di timeline.</p>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* BOTTOM — timeline */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isDirty ? "primary" : "outline"}
              size="sm"
              onClick={addKeyframe}
              disabled={availableBones.length === 0 || isPlaying}
              className={isDirty ? "animate-pulse" : undefined}
              title={isDirty ? "Ada perubahan pose yang belum direkam ke keyframe" : undefined}
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Keyframe
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => seekToKeyframe("prev")}
              disabled={keyframes.length === 0 || isPlaying}
              title="Keyframe sebelumnya"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={togglePlay} disabled={keyframes.length < 2} title={isPlaying ? "Jeda" : "Putar"}>
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={stopPlayback} disabled={keyframes.length === 0} title="Berhenti">
              <Square className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seekToKeyframe("next")}
              disabled={keyframes.length === 0 || isPlaying}
              title="Keyframe berikutnya"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
            <Button variant={isLooping ? "primary" : "outline"} size="sm" onClick={() => setIsLooping((v) => !v)} title="Loop">
              <Repeat className="h-3.5 w-3.5" />
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step={0.1}
                min={0}
                value={currentTime}
                onChange={(e) => scrubTo(Number(e.target.value))}
                title="Ketik waktu untuk lompat langsung — berguna untuk menempatkan keyframe baru setelah keyframe terakhir"
                className="w-20 rounded-md border border-border bg-transparent px-2 py-1 text-xs tabular-nums text-foreground outline-none focus:border-border-strong"
              />
              <span className="text-xs tabular-nums text-muted">/ {duration.toFixed(2)}s</span>
            </div>
            {keyframes.length > 0 && (
              <span className="ml-auto text-xs text-muted">
                Keyframe{" "}
                <span className="font-medium text-foreground">
                  {Math.max(1, keyframes.findIndex((k) => k.id === selectedKeyframeId) + 1)}
                </span>{" "}
                / {keyframes.length}
              </span>
            )}
          </div>

          {/* Track: two-tone base (durasi animasi vs. ruang tambahan di belakangnya), progress fill,
              keyframe markers (belah ketupat) di baris tengah, dan playhead (segitiga) di baris atas —
              dipisah baris supaya keduanya tidak pernah bertumpuk jadi satu bentuk yang rusak seperti
              sebelumnya (thumb bawaan browser + marker keyframe di titik yang sama). Input range aslinya
              tetap ada untuk drag/klik-langsung/keyboard, hanya thumb bawaannya yang disembunyikan. */}
          <div className="relative h-9 select-none">
            <div className="absolute inset-x-0 top-4 h-1.5 rounded-full bg-border" />
            {duration > 0 && (
              <div
                className="absolute top-4 h-1.5 rounded-full bg-white/[.08]"
                style={{ width: `${Math.min(100, (duration / timelineMax) * 100)}%` }}
                title={`Rentang animasi: 0–${duration.toFixed(2)}s`}
              />
            )}
            <div
              className="pointer-events-none absolute top-4 h-1.5 rounded-full bg-brand/70"
              style={{ width: `${Math.min(100, (currentTime / timelineMax) * 100)}%` }}
            />
            {duration > 0 && duration < timelineMax && (
              <div
                className="pointer-events-none absolute top-2 h-5 w-px bg-border-strong"
                style={{ left: `${(duration / timelineMax) * 100}%` }}
              />
            )}

            <input
              type="range"
              min={0}
              max={timelineMax}
              step={0.01}
              value={currentTime}
              onChange={(e) => scrubTo(Number(e.target.value))}
              title={`${currentTime.toFixed(2)}s`}
              className="absolute inset-x-0 top-3 h-4 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:opacity-0 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:opacity-0"
            />

            {keyframes.map((kf, i) => (
              <button
                key={kf.id}
                onClick={() => {
                  setSelectedKeyframeId(kf.id);
                  scrubTo(kf.time);
                }}
                title={`Keyframe ${i + 1} — ${kf.time.toFixed(2)}s · ${kf.interpolation}`}
                style={{ left: `${(kf.time / timelineMax) * 100}%` }}
                className={cn(
                  "absolute top-[15px] z-10 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-2 transition-all",
                  selectedKeyframeId === kf.id
                    ? "scale-125 border-brand bg-brand shadow-[0_0_8px_var(--brand-glow)]"
                    : "border-border-strong bg-surface hover:scale-110 hover:border-brand"
                )}
              />
            ))}

            {/* Playhead — segitiga di baris paling atas, tidak pernah setinggi marker keyframe di atas. */}
            <div
              className="pointer-events-none absolute top-0 z-20 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-foreground"
              style={{ left: `${(currentTime / timelineMax) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>0s</span>
            {duration > 0 && duration < timelineMax && <span>Durasi {duration.toFixed(2)}s</span>}
            <span>{timelineMax.toFixed(2)}s</span>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTargetAnimation !== null}
        onClose={() => setDeleteTargetAnimation(null)}
        onConfirm={confirmDeleteAnimation}
        title="Hapus Animasi"
        description={`Animasi "${deleteTargetAnimation?.name}" akan dihapus permanen.`}
        confirmLabel="Hapus"
        variant="danger"
      />

      <ConfirmDialog
        open={openGestureConfirmName !== null}
        onClose={() => setOpenGestureConfirmName(null)}
        onConfirm={() => {
          const name = openGestureConfirmName;
          setOpenGestureConfirmName(null);
          if (name) void openGesture(name);
        }}
        title="Buka Gesture"
        description={`Keyframe yang belum disimpan saat ini akan digantikan oleh "${openGestureConfirmName ? prettyGestureLabel(openGestureConfirmName) : ""}". Lanjutkan?`}
        confirmLabel="Buka"
      />

      <Modal
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        title="Simpan Sebagai"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
              Batal
            </Button>
            <Button onClick={confirmSaveAs} isLoading={isSaving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Nama Animasi Baru</label>
          <input
            type="text"
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            autoFocus
            className="rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus:border-border-strong"
          />
          <p className="text-xs text-muted">
            Dibuat sebagai animasi baru dan terpisah — animasi yang sedang diedit sekarang tidak akan berubah.
          </p>
        </div>
      </Modal>
    </div>
  );
}
