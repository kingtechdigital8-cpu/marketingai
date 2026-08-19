"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radio,
  Info,
  Save,
  MessageCircle,
  Sparkles,
  RefreshCw,
  Play,
  Volume2,
  Eye,
  EyeOff,
  UserRound,
  Trash2,
  Link as LinkIcon,
  Plus,
  Check,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { Switch } from "@/components/ui/Switch";
import { usePagination } from "@/lib/use-pagination";
import { AI_PURPOSES, AI_TONES } from "@/lib/tiktok-live-persona";
import { ELEVENLABS_LANGUAGES } from "@/lib/elevenlabs-languages";
import { GOOGLE_TTS_LANGUAGES } from "@/lib/google-tts-languages";
import { cn } from "@/lib/utils";
import AvatarOverlayPlayer from "@/components/avatar/AvatarOverlayPlayer";

type LiveStatus = "STOPPED" | "CONNECTING" | "LIVE" | "ERROR";
type ReplyStatus = "NONE" | "GENERATING" | "GENERATED" | "FAILED";

interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  gender: string | null;
  accent: string | null;
  previewUrl: string | null;
  isPremium: boolean;
}

interface GoogleTtsVoice {
  voiceId: string;
  name: string;
  gender: string | null;
}

interface TiktokLiveConfig {
  tiktokUsername: string;
  enabled: boolean;
  autoReply: boolean;
  autoGreetJoins: boolean;
  autoReplyLikes: boolean;
  autoReplyGifts: boolean;
  autoReplyFollows: boolean;
  aiPurpose: string | null;
  businessName: string | null;
  businessInfo: string | null;
  aiTone: string | null;
  callToAction: string | null;
  avoidTopics: string | null;
  aiContext: string | null;
  voice: string;
  // Read-only — set platform-wide by the admin, not by this user (see admin
  // Pengaturan → Live TikTok → Provider Suara).
  activeTtsProvider: "elevenlabs" | "google-tts";
  virtualHostEnabled: boolean;
  virtualHostVrmUrl: string | null;
  virtualHostTemplateId: string | null;
  virtualHostGender: "male" | "female";
  overlayUrl: string | null;
  overlayToken: string | null;
  status: LiveStatus;
  lastError: string | null;
}

interface AvatarTemplate {
  id: string;
  label: string;
  thumbnailUrl: string;
  credit: string;
  gender: "male" | "female";
}

interface TiktokLiveComment {
  id: string;
  commenterName: string;
  commentText: string;
  suggestedReply: string | null;
  replyAudioUrl: string | null;
  replyStatus: ReplyStatus;
  replyError: string | null;
  creditCost: number | null;
  createdAt: string;
}

const STATUS_BADGE: Record<LiveStatus, { label: string; variant: "neutral" | "success" | "danger" | "warning" }> = {
  STOPPED: { label: "Berhenti", variant: "neutral" },
  CONNECTING: { label: "Menghubungkan...", variant: "warning" },
  LIVE: { label: "Live - Terhubung", variant: "success" },
  ERROR: { label: "Error", variant: "danger" },
};

// The less-frequently-touched config fields collapse into a menu (mirrors
// the Layout/Headline/Caption/... pattern on the Auto Clip page) — only
// username + the core on/off toggles stay always visible. Reduces the wall
// of always-expanded fields down to one line per group.
type LiveTiktokSectionId = "persona" | "voice" | "virtualHost";
const SECTIONS: { id: LiveTiktokSectionId; label: string; icon: typeof Sparkles }[] = [
  { id: "persona", label: "Peran & Bisnis", icon: Briefcase },
  { id: "voice", label: "Suara Balasan", icon: Volume2 },
  { id: "virtualHost", label: "Host Virtual", icon: UserRound },
];

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}d lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours}j lalu`;
}

export default function LiveTiktokPage() {
  const [config, setConfig] = useState<TiktokLiveConfig | null>(null);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [autoReply, setAutoReply] = useState(false);
  const [autoGreetJoins, setAutoGreetJoins] = useState(false);
  const [autoReplyLikes, setAutoReplyLikes] = useState(false);
  const [autoReplyGifts, setAutoReplyGifts] = useState(false);
  const [autoReplyFollows, setAutoReplyFollows] = useState(false);
  const [aiPurpose, setAiPurpose] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [avoidTopics, setAvoidTopics] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [voice, setVoice] = useState("");
  const [virtualHostEnabled, setVirtualHostEnabled] = useState(false);
  // Which Mixamo idle clip (see mixamo-vrm-retarget.ts) drives the avatar's
  // hips/legs. Auto-set from a template's own gender the moment it's picked
  // (see handleApplyTemplate below); this toggle exists mainly for a
  // self-uploaded VRM, where there's no template to infer it from, but stays
  // editable either way in case a user wants the other idle on a template too.
  const [virtualHostGender, setVirtualHostGender] = useState<"male" | "female">("female");
  const [isUploadingHostVrm, setIsUploadingHostVrm] = useState(false);
  const [hostVrmError, setHostVrmError] = useState<string | null>(null);
  const hostVrmInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarTemplates, setAvatarTemplates] = useState<AvatarTemplate[] | null>(null);
  // Clicking a gallery card applies it immediately — this only tracks which
  // card's own request is in flight, so just that one card shows a spinner.
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[] | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  // "" = the account's own "My Voices"; otherwise an ELEVENLABS_LANGUAGES code
  // browsing the full shared Voice Library for that language.
  const [voiceLanguage, setVoiceLanguage] = useState("");
  // Every voice id ever fetched (across every language browsed this session),
  // so switching the browse filter never mistakes an already-saved voice for
  // a stale one just because it isn't in the CURRENTLY displayed list.
  const [knownVoiceIds, setKnownVoiceIds] = useState<Set<string>>(new Set());
  const [googleTtsVoices, setGoogleTtsVoices] = useState<GoogleTtsVoice[] | null>(null);
  const [googleVoicesError, setGoogleVoicesError] = useState<string | null>(null);
  const [knownGoogleVoiceIds, setKnownGoogleVoiceIds] = useState<Set<string>>(new Set());
  // Which GOOGLE_TTS_LANGUAGES code the voice list below is filtered to —
  // own state, independent of ElevenLabs' voiceLanguage above.
  const [googleVoiceLanguage, setGoogleVoiceLanguage] = useState("id-ID");
  const [isGooglePreviewLoading, setIsGooglePreviewLoading] = useState(false);
  const [googlePreviewError, setGooglePreviewError] = useState<string | null>(null);
  // Revoked on the next preview click / unmount so object URLs don't leak.
  const googlePreviewUrlRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<LiveTiktokSectionId | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(true);

  const [comments, setComments] = useState<TiktokLiveComment[] | null>(null);
  const { page, setPage, pageCount, pageItems: commentPage } = usePagination(comments ?? [], 5);
  // Opt-in set (not opt-out) — every AI reply starts hidden by default, and
  // only shows once the user explicitly reveals that specific comment.
  const [visibleReplyIds, setVisibleReplyIds] = useState<Set<string>>(new Set());

  function toggleReplyVisibility(id: string) {
    setVisibleReplyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [autoplay, setAutoplay] = useState(true);
  const autoplayRef = useRef(autoplay);
  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const playedAudioIdsRef = useRef<Set<string>>(new Set());
  const isFirstCommentsLoadRef = useRef(true);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  function playNextInQueue() {
    const audio = audioRef.current;
    const next = audioQueueRef.current.shift();
    if (!audio || !next) return;
    audio.src = next;
    audio.play().catch(() => {});
  }

  // Full load — populates both the status display AND the form fields.
  // Only safe to call when the form isn't mid-edit (mount, or right after a
  // successful save), otherwise it clobbers whatever the user is typing.
  function loadConfig() {
    fetch("/api/tiktok-live/config")
      .then((res) => res.json())
      .then((data) => {
        const c: TiktokLiveConfig | null = data.config;
        setConfig(c);
        setTiktokUsername(c?.tiktokUsername ?? "");
        setEnabled(c?.enabled ?? false);
        setAutoReply(c?.autoReply ?? false);
        setAutoGreetJoins(c?.autoGreetJoins ?? false);
        setAutoReplyLikes(c?.autoReplyLikes ?? false);
        setAutoReplyGifts(c?.autoReplyGifts ?? false);
        setAutoReplyFollows(c?.autoReplyFollows ?? false);
        setAiPurpose(c?.aiPurpose ?? "");
        setBusinessName(c?.businessName ?? "");
        setBusinessInfo(c?.businessInfo ?? "");
        setAiTone(c?.aiTone ?? "");
        setCallToAction(c?.callToAction ?? "");
        setAvoidTopics(c?.avoidTopics ?? "");
        setAiContext(c?.aiContext ?? "");
        setVoice(c?.voice ?? "");
        setVirtualHostEnabled(c?.virtualHostEnabled ?? false);
        setVirtualHostGender(c?.virtualHostGender === "male" ? "male" : "female");
      })
      .catch(() => {});
  }

  function loadAvatarTemplates() {
    fetch("/api/tiktok-live/avatar-templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAvatarTemplates(data?.templates ?? []))
      .catch(() => setAvatarTemplates([]));
  }

  // Status-only refresh for the periodic poller — updates the connection
  // status badge/error without touching the form fields the user may be
  // actively editing.
  function loadConfigStatus() {
    fetch("/api/tiktok-live/config")
      .then((res) => res.json())
      .then((data) => setConfig(data.config))
      .catch(() => {});
  }

  function loadComments() {
    fetch("/api/tiktok-live/comments")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const list: TiktokLiveComment[] = data.comments ?? [];

        // First load after opening the page — treat existing audio as already
        // "heard" so we don't blast through old history on mount.
        if (isFirstCommentsLoadRef.current) {
          isFirstCommentsLoadRef.current = false;
          list.forEach((c) => {
            if (c.replyAudioUrl) playedAudioIdsRef.current.add(c.id);
          });
        } else if (autoplayRef.current) {
          let queued = false;
          list.forEach((c) => {
            if (c.replyAudioUrl && !playedAudioIdsRef.current.has(c.id)) {
              playedAudioIdsRef.current.add(c.id);
              audioQueueRef.current.push(c.replyAudioUrl);
              queued = true;
            }
          });
          if (queued && audioRef.current?.paused) playNextInQueue();
        } else {
          list.forEach((c) => {
            if (c.replyAudioUrl) playedAudioIdsRef.current.add(c.id);
          });
        }

        setComments(list);
      })
      .catch(() => {});
  }

  function fetchVoices(language: string) {
    const qs = language ? `?language=${encodeURIComponent(language)}` : "";
    fetch(`/api/tiktok-live/elevenlabs-voices${qs}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setVoicesError(data?.error ?? "Gagal memuat daftar suara.");
          return;
        }
        const voices: ElevenLabsVoice[] = data.voices ?? [];
        setElevenLabsVoices(voices);
        setKnownVoiceIds((prev) => {
          const next = new Set(prev);
          voices.forEach((v) => next.add(v.voiceId));
          return next;
        });
      })
      .catch(() => setVoicesError("Gagal terhubung ke server."));
  }

  function handleVoiceLanguageChange(language: string) {
    setVoiceLanguage(language);
    setElevenLabsVoices(null);
    setVoicesError(null);
    fetchVoices(language);
  }

  function fetchGoogleVoices(language: string) {
    fetch(`/api/tiktok-live/google-tts-voices?language=${encodeURIComponent(language)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setGoogleVoicesError(data?.error ?? "Gagal memuat daftar suara.");
          return;
        }
        const voices: GoogleTtsVoice[] = data.voices ?? [];
        setGoogleTtsVoices(voices);
        setKnownGoogleVoiceIds((prev) => {
          const next = new Set(prev);
          voices.forEach((v) => next.add(v.voiceId));
          return next;
        });
      })
      .catch(() => setGoogleVoicesError("Gagal terhubung ke server."));
  }

  function handleGoogleVoiceLanguageChange(language: string) {
    setGoogleVoiceLanguage(language);
    setGoogleTtsVoices(null);
    setGoogleVoicesError(null);
    fetchGoogleVoices(language);
  }

  useEffect(() => {
    loadConfig();
    loadComments();
    fetchVoices("");
    // Fetched unconditionally alongside ElevenLabs' — cheap, and keeps the
    // fallback-to-first-known-voice logic below correct immediately the
    // moment someone switches provider, no loading flicker either way.
    fetchGoogleVoices("id-ID");
    loadAvatarTemplates();
  }, []);

  // Derived rather than synced via an effect. Falls back to the first
  // available voice whenever the saved value doesn't match any voice ever
  // seen this session (empty, or a stale non-ElevenLabs id like the old
  // "alloy" default) — not just when it's empty, otherwise a controlled
  // <select> silently keeps the stale id selected with nothing visibly
  // wrong, and it gets saved right back unchanged. Checked against
  // knownVoiceIds (cumulative across every language browsed), not just the
  // currently displayed list, so switching the browse filter never mistakes
  // an already-saved voice for stale just because it's a different language.
  const effectiveVoice = knownVoiceIds.has(voice)
    ? voice
    : elevenLabsVoices?.[0]?.voiceId || voice || "";

  // Same fallback logic, own known-id set — kept fully independent of
  // effectiveVoice above so switching provider never mistakes one provider's
  // saved voice id for "stale" just because it isn't in the OTHER provider's
  // catalog.
  const effectiveGoogleVoice = knownGoogleVoiceIds.has(voice)
    ? voice
    : googleTtsVoices?.[0]?.voiceId || voice || "";

  // Read-only, set by the admin — not user-editable (see admin Pengaturan →
  // Live TikTok → Provider Suara).
  const activeTtsProvider = config?.activeTtsProvider === "google-tts" ? "google-tts" : "elevenlabs";

  const selectedVoicePreviewUrl =
    elevenLabsVoices?.find((v) => v.voiceId === effectiveVoice)?.previewUrl ?? null;

  function handlePreviewVoice() {
    const audio = previewAudioRef.current;
    if (!audio || !selectedVoicePreviewUrl) return;
    audio.src = selectedVoicePreviewUrl;
    audio.play().catch(() => {});
  }

  // Google's voices.list has no pre-made sample audio (unlike ElevenLabs'
  // previewUrl) — this actually calls the provider to synthesize a short
  // greeting on demand, so it needs its own loading/error state.
  function handlePreviewGoogleVoice() {
    if (!effectiveGoogleVoice || isGooglePreviewLoading) return;
    setIsGooglePreviewLoading(true);
    setGooglePreviewError(null);
    fetch("/api/tiktok-live/google-tts-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceName: effectiveGoogleVoice }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Gagal membuat contoh suara.");
        }
        return res.blob();
      })
      .then((blob) => {
        const audio = previewAudioRef.current;
        if (!audio) return;
        if (googlePreviewUrlRef.current) URL.revokeObjectURL(googlePreviewUrlRef.current);
        const url = URL.createObjectURL(blob);
        googlePreviewUrlRef.current = url;
        audio.src = url;
        audio.play().catch(() => {});
      })
      .catch((err) => setGooglePreviewError(err.message ?? "Gagal terhubung ke server."))
      .finally(() => setIsGooglePreviewLoading(false));
  }

  useEffect(() => {
    const id = setInterval(() => {
      loadConfigStatus();
      loadComments();
    }, 4000);
    return () => clearInterval(id);
  }, []);

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/tiktok-live/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tiktokUsername,
          enabled,
          autoReply,
          autoGreetJoins,
          autoReplyLikes,
          autoReplyGifts,
          autoReplyFollows,
          aiPurpose,
          businessName,
          businessInfo,
          aiTone,
          callToAction,
          avoidTopics,
          aiContext,
          voice: activeTtsProvider === "google-tts" ? effectiveGoogleVoice : effectiveVoice,
          virtualHostEnabled,
          virtualHostGender,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error ?? "Gagal menyimpan konfigurasi.");
        return;
      }
      setConfig(data.config);
    } catch {
      setSaveError("Gagal terhubung ke server.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadHostVrm(file: File) {
    setHostVrmError(null);
    setIsUploadingHostVrm(true);
    try {
      const formData = new FormData();
      formData.set("vrm", file);
      const res = await fetch("/api/tiktok-live/host-vrm", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setHostVrmError(data?.error ?? "Gagal mengunggah file VRM.");
        return;
      }
      setConfig(data.config);
    } catch {
      setHostVrmError("Gagal terhubung ke server.");
    } finally {
      setIsUploadingHostVrm(false);
      if (hostVrmInputRef.current) hostVrmInputRef.current.value = "";
    }
  }

  async function handleRemoveHostVrm() {
    setHostVrmError(null);
    setIsUploadingHostVrm(true);
    try {
      const res = await fetch("/api/tiktok-live/host-vrm", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setHostVrmError(data?.error ?? "Gagal menghapus file VRM.");
        return;
      }
      setConfig(data.config);
      setVirtualHostEnabled(false);
    } catch {
      setHostVrmError("Gagal terhubung ke server.");
    } finally {
      setIsUploadingHostVrm(false);
    }
  }

  /** Applies a gallery template immediately on click — no separate confirm step. */
  async function handleApplyTemplate(templateId: string) {
    setTemplateError(null);
    setApplyingTemplateId(templateId);
    try {
      const res = await fetch("/api/tiktok-live/host-vrm/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTemplateError(data?.error ?? "Gagal menerapkan avatar.");
        return;
      }
      setConfig(data.config);
      setVirtualHostGender(data.config?.virtualHostGender === "male" ? "male" : "female");
    } catch {
      setTemplateError("Gagal terhubung ke server.");
    } finally {
      setApplyingTemplateId(null);
    }
  }

  async function handleConnectNow() {
    setConnectError(null);
    setIsConnecting(true);
    try {
      const res = await fetch("/api/tiktok-live/connect", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setConnectError(data?.error ?? "Gagal menghubungkan.");
        return;
      }
      if (data?.config) setConfig(data.config);
    } catch {
      setConnectError("Gagal terhubung ke server.");
    } finally {
      setIsConnecting(false);
    }
  }

  function playAudio(url: string) {
    new Audio(url).play().catch(() => {});
  }

  const statusInfo = STATUS_BADGE[config?.status ?? "STOPPED"];

  function sectionSummary(id: LiveTiktokSectionId): string | undefined {
    switch (id) {
      case "persona":
        return AI_PURPOSES.find((p) => p.value === aiPurpose)?.label || businessName || undefined;
      case "voice":
        return activeTtsProvider === "google-tts"
          ? googleTtsVoices?.find((v) => v.voiceId === effectiveGoogleVoice)?.name
          : elevenLabsVoices?.find((v) => v.voiceId === effectiveVoice)?.name;
      case "virtualHost":
        return virtualHostEnabled ? "Aktif" : undefined;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Live TikTok AI"
        description="Baca komentar live TikTok secara real-time dan buatkan balasan AI untuk host."
        icon={Radio}
        actions={<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
      />

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Info className="h-4 w-4 text-brand" />
          Cara pakai
        </p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Mulai live TikTok kamu seperti biasa dari HP atau OBS.</li>
          <li>
            Isi <strong className="text-foreground">Username TikTok</strong> di form Konfigurasi, centang{" "}
            <strong className="text-foreground">Aktifkan pembacaan komentar live</strong>, lalu klik{" "}
            <strong className="text-foreground">Simpan</strong>.
          </li>
          <li>
            Klik <strong className="text-foreground">Cek &amp; Hubungkan Sekarang</strong> untuk mulai membaca
            komentar. Koneksi tidak dibuat otomatis — klik lagi kapan pun kamu mau cek ulang statusnya.
          </li>
          <li>Komentar yang masuk akan muncul di panel Komentar Live di sebelah kanan.</li>
          <li>
            Centang <strong className="text-foreground">Auto-generate balasan AI</strong> kalau mau AI langsung
            membuatkan balasan teks + suara untuk tiap komentar (kena kredit per balasan).
          </li>
          <li>Isi Peran &amp; Konteks AI supaya gaya balasannya sesuai bisnismu.</li>
          <li>
            Suara balasan otomatis diputar di perangkat ini — arahkan output audio ke mic yang dipakai untuk live
            (mis. lewat virtual audio cable atau speaker dekat mic) supaya penonton ikut dengar.
          </li>
        </ol>
      </div>

      <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Card>
          <CardHeader
            role="button"
            tabIndex={0}
            onClick={() => setIsConfigOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsConfigOpen((v) => !v);
              }
            }}
            className="cursor-pointer select-none"
          >
            <CardTitle>Konfigurasi</CardTitle>
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition-transform", isConfigOpen && "rotate-180")} />
          </CardHeader>
          {isConfigOpen && (
          <CardContent className="flex flex-col gap-4">
            <Input
              label="Username TikTok (tanpa @)"
              value={tiktokUsername}
              onChange={(e) => setTiktokUsername(e.target.value)}
              placeholder="mis. tokoanda"
            />
            <Switch checked={enabled} onChange={setEnabled} label="Aktifkan pembacaan komentar live" />
            <Switch checked={autoReply} onChange={setAutoReply} label="Auto-generate balasan AI" />
            <Switch checked={autoGreetJoins} onChange={setAutoGreetJoins} label="Sambut penonton baru otomatis" />
            <Switch checked={autoReplyLikes} onChange={setAutoReplyLikes} label="Balas otomatis saat ada yang like" />
            <Switch
              checked={autoReplyGifts}
              onChange={setAutoReplyGifts}
              label="Ucapkan terima kasih otomatis saat ada yang kirim gift"
            />
            <Switch
              checked={autoReplyFollows}
              onChange={setAutoReplyFollows}
              label="Ucapkan terima kasih otomatis saat ada yang follow"
            />

            {activeSection === null ? (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-1">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const summary = sectionSummary(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSection(s.id)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white/[.04]"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-brand" />
                      <span className="flex-1 truncate text-sm text-foreground">{s.label}</span>
                      {summary && <span className="shrink-0 truncate text-xs text-muted">{summary}</span>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <button
                  type="button"
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {SECTIONS.find((s) => s.id === activeSection)?.label}
                </button>

                {activeSection === "persona" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">Tujuan Live (opsional)</label>
                      <select
                        value={aiPurpose}
                        onChange={(e) => setAiPurpose(e.target.value)}
                        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                      >
                        <option value="">Tidak ditentukan</option>
                        {AI_PURPOSES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      label="Nama Bisnis/Produk (opsional)"
                      placeholder='mis. "SneakerHub"'
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value.slice(0, 100))}
                    />

                    <Textarea
                      label="Info Produk/Bisnis (opsional)"
                      placeholder="mis. Jual sepatu sneakers original, harga mulai 300rb, gratis ongkir se-Indonesia, ready stock semua ukuran."
                      value={businessInfo}
                      onChange={(e) => setBusinessInfo(e.target.value.slice(0, 1000))}
                      rows={3}
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">Gaya Bicara AI (opsional)</label>
                      <select
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value)}
                        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                      >
                        <option value="">Tidak ditentukan</option>
                        {AI_TONES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Textarea
                      label="Ajakan/CTA (opsional)"
                      placeholder='mis. "Ajak penonton follow akun dan checkout keranjang kuning"'
                      value={callToAction}
                      onChange={(e) => setCallToAction(e.target.value.slice(0, 300))}
                      rows={2}
                    />
                    <p className="-mt-2 text-xs text-muted">
                      Diselipkan sewajarnya kalau relevan, tidak dipaksakan di setiap balasan.
                    </p>

                    <Textarea
                      label="Hal yang Dihindari (opsional)"
                      placeholder='mis. "Jangan bahas harga kompetitor, jangan janji diskon"'
                      value={avoidTopics}
                      onChange={(e) => setAvoidTopics(e.target.value.slice(0, 300))}
                      rows={2}
                    />

                    <Textarea
                      label="Instruksi Tambahan (opsional)"
                      placeholder="Tambahan lain di luar kolom-kolom di atas, mis. gaya bahasa spesifik atau aturan khusus lainnya."
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value.slice(0, 1000))}
                      rows={3}
                    />
                    <p className="-mt-2 text-xs text-muted">
                      Semua kolom di atas digabung otomatis jadi instruksi dasar untuk tiap balasan AI. Kosongkan
                      semua untuk pakai gaya default (host live yang ramah).
                    </p>
                  </>
                )}

                {activeSection === "voice" && (
                  <>
                    {activeTtsProvider === "elevenlabs" ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <select
                            value={voiceLanguage}
                            onChange={(e) => handleVoiceLanguageChange(e.target.value)}
                            className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                          >
                            <option value="">Suara Saya (My Voices)</option>
                            {ELEVENLABS_LANGUAGES.map((l) => (
                              <option key={l.code} value={l.code}>
                                Jelajahi: {l.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted">
                            Pilih negara/bahasa untuk menjelajahi Voice Library — lebih banyak pilihan suara di luar
                            akunmu sendiri.
                          </p>
                        </div>

                        {voicesError ? (
                          <ErrorNotice message={voicesError} />
                        ) : !elevenLabsVoices ? (
                          <div className="h-10 animate-pulse rounded-lg bg-white/[.06]" />
                        ) : elevenLabsVoices.length === 0 ? (
                          <p className="text-xs text-muted">
                            {voiceLanguage
                              ? "Tidak ada suara ditemukan untuk bahasa ini."
                              : "Belum ada suara tersimpan di akunmu. Tambahkan suara lewat Voice Library terlebih dahulu."}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={effectiveVoice}
                              onChange={(e) => setVoice(e.target.value)}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                            >
                              {!elevenLabsVoices.some((v) => v.voiceId === effectiveVoice) && effectiveVoice && (
                                <option value={effectiveVoice}>Suara tersimpan (di luar filter ini)</option>
                              )}
                              {elevenLabsVoices.map((v) => (
                                <option key={v.voiceId} value={v.voiceId}>
                                  {v.name}
                                  {v.gender ? ` (${v.gender})` : ""}
                                  {v.isPremium ? " — Premium" : ""}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handlePreviewVoice}
                              disabled={!selectedVoicePreviewUrl || isPreviewPlaying}
                              title="Dengarkan contoh suara ini"
                            >
                              {isPreviewPlaying ? (
                                <Volume2 className="h-4 w-4 animate-pulse" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              Dengarkan
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <select
                            value={googleVoiceLanguage}
                            onChange={(e) => handleGoogleVoiceLanguageChange(e.target.value)}
                            className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                          >
                            {GOOGLE_TTS_LANGUAGES.map((l) => (
                              <option key={l.code} value={l.code}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted">Pilih bahasa untuk memfilter daftar suara Chirp3 HD.</p>
                        </div>

                        {googleVoicesError ? (
                          <ErrorNotice message={googleVoicesError} />
                        ) : !googleTtsVoices ? (
                          <div className="h-10 animate-pulse rounded-lg bg-white/[.06]" />
                        ) : googleTtsVoices.length === 0 ? (
                          <p className="text-xs text-muted">
                            Tidak ada suara Chirp3 HD untuk bahasa ini — pastikan juga admin sudah mengaktifkan
                            provider Google Cloud TTS di Provider AI.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={effectiveGoogleVoice}
                              onChange={(e) => setVoice(e.target.value)}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                            >
                              {!googleTtsVoices.some((v) => v.voiceId === effectiveGoogleVoice) &&
                                effectiveGoogleVoice && (
                                  <option value={effectiveGoogleVoice}>Suara tersimpan (di luar filter ini)</option>
                                )}
                              {googleTtsVoices.map((v) => (
                                <option key={v.voiceId} value={v.voiceId}>
                                  {v.name}
                                  {v.gender ? ` (${v.gender})` : ""}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handlePreviewGoogleVoice}
                              disabled={!effectiveGoogleVoice || isGooglePreviewLoading}
                              title="Buat & dengarkan contoh suara ini"
                            >
                              {isGooglePreviewLoading || isPreviewPlaying ? (
                                <Volume2 className="h-4 w-4 animate-pulse" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              Dengarkan
                            </Button>
                          </div>
                        )}
                        {googlePreviewError && <ErrorNotice message={googlePreviewError} />}
                      </>
                    )}
                  </>
                )}

                {activeSection === "virtualHost" && (
                  <>
                    <Switch checked={virtualHostEnabled} onChange={setVirtualHostEnabled} label="Aktifkan Host Virtual" />
                    <p className="-mt-2 text-xs text-muted">
                      Tiap balasan otomatis juga ditampilkan sebagai host yang &quot;bicara&quot; lewat overlay di
                      software live streaming.
                    </p>

                    {virtualHostEnabled && (
                      <div className="flex flex-col gap-3 border-t border-border pt-3">
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-foreground">Pilih Avatar</label>
                            <input
                              ref={hostVrmInputRef}
                              type="file"
                              accept=".vrm,.glb"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadHostVrm(file);
                              }}
                            />
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {!avatarTemplates ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                  <div key={i} className="aspect-square animate-pulse rounded-lg bg-white/[.06]" />
                                ))
                              ) : (
                                <>
                                  {avatarTemplates.map((template) => (
                                    <button
                                      key={template.id}
                                      type="button"
                                      title={template.credit}
                                      onClick={() => handleApplyTemplate(template.id)}
                                      disabled={applyingTemplateId !== null}
                                      className={cn(
                                        "group relative flex aspect-square flex-col items-center justify-end overflow-hidden rounded-lg border transition-colors disabled:opacity-60",
                                        config?.virtualHostTemplateId === template.id
                                          ? "border-brand ring-2 ring-brand/40"
                                          : "border-border hover:border-border-strong"
                                      )}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element -- R2-hosted external image, not a static local asset */}
                                      <img
                                        src={template.thumbnailUrl}
                                        alt={template.label}
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                      {applyingTemplateId === template.id ? (
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                                          <RefreshCw className="h-4 w-4 animate-spin text-white" />
                                        </span>
                                      ) : (
                                        config?.virtualHostTemplateId === template.id && (
                                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-background">
                                            <Check className="h-2.5 w-2.5" />
                                          </span>
                                        )
                                      )}
                                      <span className="relative w-full bg-black/60 px-1.5 py-1 text-[11px] font-medium text-white">
                                        {template.label}
                                      </span>
                                    </button>
                                  ))}
                                  {/* The user's own uploaded file, shown as a gallery card like any
                                      template instead of a separate status line — it's only ever
                                      "active" when shown, since there's a single VRM slot per account. */}
                                  {config?.virtualHostVrmUrl && !config.virtualHostTemplateId && (
                                    <div className="relative flex aspect-square flex-col items-center justify-end overflow-hidden rounded-lg border border-brand ring-2 ring-brand/40">
                                      <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-muted">
                                        <UserRound className="h-7 w-7" />
                                      </div>
                                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-background">
                                        <Check className="h-2.5 w-2.5" />
                                      </span>
                                      <button
                                        type="button"
                                        onClick={handleRemoveHostVrm}
                                        disabled={isUploadingHostVrm}
                                        title="Hapus file VRM kustom"
                                        className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-danger disabled:opacity-60"
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                      <span className="relative w-full bg-black/60 px-1.5 py-1 text-[11px] font-medium text-white">
                                        VRM Kamu
                                      </span>
                                    </div>
                                  )}
                                  {Array.from({
                                    length: Math.max(
                                      0,
                                      3 -
                                        avatarTemplates.length -
                                        (config?.virtualHostVrmUrl && !config.virtualHostTemplateId ? 1 : 0)
                                    ),
                                  }).map((_, i) => (
                                    <div
                                      key={`soon-${i}`}
                                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted"
                                    >
                                      <UserRound className="h-5 w-5" />
                                      <span className="text-[11px]">Segera Hadir</span>
                                    </div>
                                  ))}
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => hostVrmInputRef.current?.click()}
                                disabled={isUploadingHostVrm}
                                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-60"
                              >
                                {isUploadingHostVrm ? (
                                  <RefreshCw className="h-5 w-5 animate-spin" />
                                ) : (
                                  <Plus className="h-5 w-5" />
                                )}
                                <span className="text-[11px]">Create Avatar</span>
                              </button>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm font-medium text-foreground">Animasi Idle</label>
                              <div className="flex gap-2">
                                <ToggleChip
                                  label="Wanita"
                                  active={virtualHostGender === "female"}
                                  onClick={() => setVirtualHostGender("female")}
                                />
                                <ToggleChip
                                  label="Pria"
                                  active={virtualHostGender === "male"}
                                  onClick={() => setVirtualHostGender("male")}
                                />
                              </div>
                              <p className="text-xs text-muted">
                                Otomatis terisi sesuai avatar galeri yang dipilih — ubah manual kalau kamu upload
                                avatar sendiri atau ingin gaya gerak idle yang lain.
                              </p>
                            </div>

                            {templateError && <ErrorNotice message={templateError} />}
                          </div>
                        {hostVrmError && <ErrorNotice message={hostVrmError} />}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {saveError && <ErrorNotice message={saveError} />}
            {connectError && <ErrorNotice message={connectError} />}
            {config?.status === "ERROR" && config.lastError && <ErrorNotice message={config.lastError} />}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} isLoading={isSaving}>
                <Save className="h-4 w-4" />
                Simpan
              </Button>
              <Button variant="outline" onClick={handleConnectNow} isLoading={isConnecting} disabled={!enabled}>
                <Radio className="h-4 w-4" />
                Cek &amp; Hubungkan Sekarang
              </Button>
            </div>
          </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LinkIcon className="h-4 w-4 text-brand" />
              Overlay Live Avatar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {config?.overlayUrl && config.overlayToken ? (
              <>
                {/* Same live data OBS shows, previewed here — muted so a reply
                    doesn't play out loud twice while you're also monitoring
                    the real stream audio. Idle breathing/blink is visible as
                    soon as an avatar's set, not just while a reply plays. */}
                <AvatarOverlayPlayer
                  token={config.overlayToken}
                  muted
                  className="border border-border bg-surface"
                  emptyFallback={
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted">
                      Preview muncul begitu avatar tersimpan &amp; Host Virtual aktif.
                    </div>
                  }
                />
                <code className="block truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                  {config.overlayUrl}
                </code>
                <div className="self-start">
                  <CopyButton text={config.overlayUrl} />
                </div>
                <p className="text-xs text-muted">
                  Tempel URL ini sebagai Browser Source di OBS/software live streaming untuk menampilkan host
                  virtualnya di layar.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Aktifkan Host Virtual dan pilih/unggah avatar dulu di bagian Konfigurasi — URL overlay muncul di
                sini otomatis begitu avatar pertama tersimpan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-brand" />
              Komentar Live
            </CardTitle>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border"
                checked={autoplay}
                onChange={(e) => setAutoplay(e.target.checked)}
              />
              <Volume2 className="h-3.5 w-3.5" />
              Putar otomatis
            </label>
          </CardHeader>
          <audio ref={audioRef} className="hidden" onEnded={playNextInQueue} />
          <audio
            ref={previewAudioRef}
            className="hidden"
            onPlay={() => setIsPreviewPlaying(true)}
            onEnded={() => setIsPreviewPlaying(false)}
            onPause={() => setIsPreviewPlaying(false)}
          />
          <CardContent className="p-0">
            {!comments ? (
              <div className="flex flex-col gap-2 p-5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/[.06]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/[.06]" />
              </div>
            ) : comments.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={MessageCircle} title="Belum ada komentar masuk" />
              </div>
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-border">
                  {commentPage.map((comment) => (
                    <li key={comment.id} className="flex flex-col gap-2 px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{comment.commenterName}</p>
                        <span className="text-xs text-muted">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground">{comment.commentText}</p>

                      {comment.suggestedReply &&
                        (!visibleReplyIds.has(comment.id) ? (
                          <div className="flex items-center gap-2 self-start">
                            <button
                              type="button"
                              onClick={() => toggleReplyVisibility(comment.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-white/[.06] hover:text-foreground"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Tampilkan balasan AI
                            </button>
                            {comment.creditCost !== null && (
                              <Badge variant="neutral">-{comment.creditCost} kredit</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand-soft px-3 py-2">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                            <p className="flex-1 text-sm text-foreground">{comment.suggestedReply}</p>
                            {comment.creditCost !== null && (
                              <Badge variant="neutral" className="shrink-0">
                                -{comment.creditCost} kredit
                              </Badge>
                            )}
                            {comment.replyAudioUrl && (
                              <button
                                type="button"
                                onClick={() => playAudio(comment.replyAudioUrl!)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-white/[.06] hover:text-foreground"
                              >
                                <Play className="h-3.5 w-3.5" />
                                Putar
                              </button>
                            )}
                            <CopyButton text={comment.suggestedReply} />
                            <button
                              type="button"
                              onClick={() => toggleReplyVisibility(comment.id)}
                              title="Sembunyikan balasan AI"
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-white/[.06] hover:text-foreground"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}

                      {comment.replyStatus === "GENERATING" ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Membuat balasan...
                        </span>
                      ) : comment.replyStatus === "FAILED" ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="danger">Gagal membuat balasan</Badge>
                          {comment.replyError && <p className="text-xs text-danger/80">{comment.replyError}</p>}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
