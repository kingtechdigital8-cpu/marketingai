import { randomUUID } from "crypto";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";
import { TikTokLive as TikToolLive } from "@tiktool/live";
import type { TiktokLiveConfig, TiktokLiveStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withDbRetry, ensureDbConnection } from "@/lib/with-db-retry";
import { getOpenAiClient } from "@/lib/ai-provider";
import { generateElevenLabsSpeech, generateElevenLabsSpeechWithTimestamps } from "@/lib/elevenlabs-tts";
import { generateGoogleTtsSpeech, generateGoogleTtsSpeechWithTimestamps } from "@/lib/google-tts";
import { getActiveTtsProvider } from "@/lib/tiktok-live-tts-provider";
import { extractVisemeIntervals, type VisemeInterval } from "@/lib/tiktok-live-viseme";
import {
  AVATAR_EMOTIONS,
  AVATAR_GESTURES,
  isAvatarEmotion,
  isAvatarGesture,
  type AvatarEmotion,
  type AvatarGesture,
} from "@/lib/tiktok-live-avatar-motion";
import type { AvatarClipName } from "@/lib/avatar/avatar-animation-registry";
import { uploadToR2 } from "@/lib/r2";
import { chargeCreditsForGeneration } from "@/lib/credit";
import { getProviderCost, roundCreditCost } from "@/lib/provider-cost";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { composePersona } from "@/lib/tiktok-live-persona";
import { resolveCurrentLiveRoom } from "@/lib/tiktok-live-room-lookup";

const RECONCILE_INTERVAL_MS = 60_000;

// How many recent comment+reply pairs (from anyone in the room, not just the
// current commenter) are replayed as conversation history for each new
// reply, so follow-up comments get answered with awareness of what was just
// discussed instead of from a blank slate every time.
const HISTORY_TURN_LIMIT = 6;

const REPLY_FORMAT_RULES =
  "Baca dan pahami dulu isi komentar penonton, lalu jawab isi/pertanyaannya secara spesifik dan nyambung — jangan " +
  "balasan generik. Balas singkat (maksimal 2-3 kalimat), dalam Bahasa Indonesia yang santai dan natural, seperti " +
  "obrolan asli, bukan template yang kaku dan berulang. Variasikan gaya kalimat dan kata pembuka setiap kali — " +
  "jangan selalu pakai pola atau susunan yang sama persis di tiap balasan.\n\n" +
  // Rewritten per direct feedback: the AI was almost NEVER using the
  // viewer's name across every interaction type (chat/join/like/gift/
  // follow all deferred to this same rule). Root cause was the old handle-
  // detection clause — real TikTok usernames routinely have dots/no spaces/
  // decorative Unicode as NORMAL self-expression on that platform, not a
  // sign of a fake/bot handle, but the old wording ("ada titik, gabungan
  // kata tanpa spasi... jangan dibaca apa adanya") effectively matched
  // almost every real username, so the name was skipped nearly 100% of the
  // time in practice. Narrowed to only skip genuinely bot-looking strings,
  // and replaced the vague "sesekali saja"/"kebanyakan JANGAN" framing
  // (which the model was over-applying toward "almost never") with a
  // concrete rough ratio instead.
  "Sebut nama/username penonton kira-kira 1 dari 3-4 balasan (jangan tiap balasan, tapi juga jangan nyaris tidak " +
  "pernah) — variasikan mana yang pakai nama dan mana yang tidak. Boleh diselipkan di mana saja dalam kalimat, " +
  "tidak wajib di awal. Username TikTok itu wajar kalau ada titik/underscore/gaya font unik/gabungan kata tanpa " +
  "spasi — itu bukan tanda handle palsu, tetap boleh dibaca apa adanya. Hanya hindari membaca literal kalau " +
  "usernamenya jelas-jelas terlihat acak/bot (contoh: cuma deretan angka panjang seperti \"user88274915\") — " +
  "untuk kasus itu saja, ganti dengan sapaan umum seperti \"kak\"/\"kamu\". Pesan-pesan sebelum ini adalah komentar " +
  "dan balasan terbaru di live yang sama — pakai itu sebagai konteks kalau komentar sekarang adalah lanjutan/" +
  "pertanyaan susulan dari topik yang baru dibahas, supaya nyambung dan tidak melenceng ke topik lain. JANGAN " +
  "meniru gaya pembuka balasan-balasan sebelumnya itu kalau gayanya berulang-ulang sama — variasikan.";

const NAME_USAGE_CROSSREF =
  "Menyebut nama/username penonton di sini ikut aturan yang sama seperti balasan komentar (lihat di atas) — " +
  "kira-kira 1 dari 3-4 balasan, dan username yang ada titik/gaya font unik itu tetap wajar dibaca, bukan tanda harus dihindari.";

const JOIN_FORMAT_RULES =
  "Ini BUKAN komentar — penonton baru saja bergabung ke live. Sambut dia secara singkat, hangat, dan natural " +
  "(maksimal 1-2 kalimat), dalam Bahasa Indonesia yang santai, sesuai peran/konteks di atas. Variasikan gaya " +
  `sapaan setiap kali, jangan selalu pakai kalimat pembuka yang sama. ${NAME_USAGE_CROSSREF}`;

const LIKE_FORMAT_RULES =
  "Ini BUKAN komentar — penonton baru saja nge-like live ini (bisa berkali-kali sekaligus). Balas dengan ucapan " +
  "terima kasih yang singkat, ringan, dan natural (maksimal 1 kalimat pendek), dalam Bahasa Indonesia yang santai, " +
  `sesuai peran/konteks di atas. Variasikan kalimatnya setiap kali. ${NAME_USAGE_CROSSREF}`;

const GIFT_FORMAT_RULES =
  "Ini BUKAN komentar — penonton baru saja mengirim gift (hadiah) di live ini. Ucapkan terima kasih yang tulus dan " +
  "antusias (maksimal 1-2 kalimat), sebut nama gift-nya secara natural kalau pas, dalam Bahasa Indonesia yang " +
  "santai, sesuai peran/konteks di atas. Variasikan gaya ucapan terima kasihnya setiap kali — jangan template yang " +
  `sama persis tiap kali. ${NAME_USAGE_CROSSREF}`;

const FOLLOW_FORMAT_RULES =
  "Ini BUKAN komentar — penonton baru saja follow akun ini. Ucapkan terima kasih yang hangat dan singkat (maksimal " +
  "1-2 kalimat), dalam Bahasa Indonesia yang santai, sesuai peran/konteks di atas. Variasikan gaya ucapannya setiap " +
  `kali. ${NAME_USAGE_CROSSREF}`;

// A hard, explicit override on top of the instructions above — the model
// has been observed NOT reliably self-regulating "sesekali saja" purely
// from that instruction: once the few-shot conversation history below
// contains several of its own recent replies that used a name, it tends to
// just imitate that pattern indefinitely (a self-reinforcing loop), which
// is exactly how this went from "occasionally" to "every single reply"
// despite the softer wording always having been there. Forcing a real
// cooldown, computed from actual recent output rather than left to chance,
// is what actually breaks the loop.
const FORBID_NAME_RULE =
  "PENTING: beberapa balasan terakhir di riwayat di atas sudah menyebut nama/username penonton — untuk balasan " +
  "kali ini, JANGAN sebut nama atau username penonton sama sekali, langsung jawab isi komentar/sapaannya.";

// Only appended when the config's host is actually in "avatar3d" mode — no
// point spending output tokens/complexity classifying emotion+gesture for a
// user who never sees the 3D avatar render them. Requested via OpenAI's
// json_object response_format (same pattern as the SEO generation routes),
// not a separate classification call — one request, one bill.
//
// TWO motion fields, not merged into one enum: "gesture" is a small,
// arm/head-only procedural motion. "customAnimationId" is an admin-authored
// entry from the shared, global Animation Library (AvatarAnimation in
// schema.prisma — built/edited via the VRM Animation Studio's "Edit
// Gesture"/keyframe editor), offered by fetching the CURRENT list fresh on
// every call (see buildAvatarMotionRule's caller) so a just-saved edit or a
// brand-new entry is usable by the very next reply with no deploy. Mutually
// exclusive, enforced defensively in code too — not just by prompt wording —
// see the parsing code below, which forces gesture to null whenever
// customAnimationId is set, in case the model doesn't follow the instruction.
//
// The old third option — "animation", AvatarAnimationController's canned
// Mixamo-retargeted FBX clips (bow/clapping/excited/greeting/salute/
// victory/waving, see avatar-animation-registry.ts) — is deliberately no
// longer offered to the model at all, by explicit request: it was marked
// "CEK INI DULU" (check this first) and sat ahead of both gesture and the
// Animation Library in priority, so it kept winning classification for any
// reply loosely matching one of its 7 broad categories, crowding out the
// admin's own edited gestures/library entries almost entirely. The FBX
// clip system itself (AvatarAnimationController, playAnimation,
// AvatarClipName) is untouched and still plays back correctly for any
// ALREADY-generated reply that has one saved from before this change —
// only future classification is affected.
// `recentMotions` — the last few actually-used gesture/customAnimationId
// labels (most recent first, resolved to human-readable names), passed in
// by the caller — see its own fetch site for why this can't be read from
// `historyMessages` (that only carries reply TEXT, never the classification
// fields). Purely a variety nudge: explicit per-request instruction, not a
// hard block, so a genuinely repeated theme (several gift comments in a
// row, say) can still reuse the same motion if nothing else fits better.
function buildAvatarMotionRule(customAnimations: { id: string; name: string }[], recentMotions: string[]): string {
  const hasCustomAnimations = customAnimations.length > 0;
  // Omitted entirely (not even mentioned) when the library is empty — no
  // point asking the model to consider an option that doesn't exist yet,
  // and no room for it to hallucinate an id from thin air.
  const customAnimationField = hasCustomAnimations ? `, "customAnimationId": "salah satu id di bawah, atau null"` : "";
  const customAnimationBlock = hasCustomAnimations
    ? `\n\n"customAnimationId" (animasi kustom dari Animation Library — CEK INI DULU, sebelum "gesture" di bawah): ` +
      `UTAMAKAN pilih salah satu id di bawah kalau temanya masuk akal untuk balasan ini — TIDAK PERLU cocok persis ` +
      `kata-per-kata, cukup nada/konteksnya nyambung secara umum. null HANYA kalau benar-benar tidak ada satupun ` +
      `yang berhubungan sama sekali. Kalau salah satu id ini dipilih, "gesture" di bawah WAJIB "none". Daftar ` +
      `tersedia (id: nama): ${customAnimations.map((a) => `${a.id}: ${a.name}`).join(", ")}.`
    : "";
  const varietyRule =
    recentMotions.length > 0
      ? `\n\nGestur/animasi yang baru saja dipakai berturut-turut (dari yang paling baru): ${recentMotions.join(", ")}. ` +
        "Utamakan pilih yang BERBEDA dari daftar itu kalau ada opsi lain yang sama masuk akalnya, supaya avatar " +
        "tidak terlihat mengulang gerakan yang sama terus-menerus — tapi kalau memang tidak ada pilihan lain yang " +
        "cocok, boleh saja mengulang."
      : "";
  return (
    // Leads with a reminder rather than diving straight into the JSON spec —
    // this block is appended AFTER the reply-writing rules above, and without
    // an explicit "those still apply" nudge, a long, detailed classification
    // instruction (multiple fields, several worked examples each) risks
    // becoming the MORE RECENT/PROMINENT instruction the model optimizes
    // for, at the cost of the earlier "vary your phrasing, mention names
    // only sometimes" rule.
    "Aturan gaya balasan di atas (variasikan kalimat, sebut nama SESEKALI SAJA) tetap berlaku penuh — bagian di bawah " +
    "ini HANYA menambahkan klasifikasi gerakan, tidak mengubah cara kamu menulis balasannya.\n\n" +
    "Tentukan juga SATU emosi, dan SATU gestur kecil yang paling pas. Jawab HANYA JSON valid (tanpa " +
    `markdown), persis: {"reply": "teks balasan", "emotion": "salah satu dari [${AVATAR_EMOTIONS.join(", ")}]", ` +
    `"gesture": "salah satu dari [${AVATAR_GESTURES.join(", ")}]"${customAnimationField}}. "emotion" boleh "neutral" ` +
    `kalau memang netral.` +
    customAnimationBlock +
    `\n\n"gesture" (gestur kecil${hasCustomAnimations ? ', HANYA kalau "customAnimationId" di atas "none"' : ""}): ` +
    "PILIH salah satu untuk SEBAGIAN BESAR balasan (jangan buru-buru \"none\") — cocokkan ke NADA/EMOSI balasan " +
    'secara umum, bukan hanya kalau ada kata kunci yang cocok persis: ' +
    'nod/shake=anggukan/gelengan kepala, point=menjelaskan, thinking=mikir/ragu, scratch_head=bingung/salah tingkah, ' +
    'cover_mouth=kaget-geli, palms_together=terima kasih sopan. "none" HANYA untuk balasan yang benar-benar netral ' +
    "tanpa nada emosi apapun." +
    varietyRule
  );
}

type ReplyKind = "chat" | "join" | "like" | "gift" | "follow";

const FORMAT_RULES_BY_KIND: Record<Exclude<ReplyKind, "chat">, string> = {
  join: JOIN_FORMAT_RULES,
  like: LIKE_FORMAT_RULES,
  gift: GIFT_FORMAT_RULES,
  follow: FOLLOW_FORMAT_RULES,
};

function buildReplySystemPrompt(
  config: TiktokLiveConfig,
  mode: {
    kind: ReplyKind;
    isReturningCommenter: boolean;
    forbidName: boolean;
    wantsAvatarMotion: boolean;
    customAnimations: { id: string; name: string }[];
    recentMotions: string[];
  }
): string {
  const persona = composePersona(config);
  const forbidNameRule = mode.forbidName ? `\n\n${FORBID_NAME_RULE}` : "";
  const motionRule = mode.wantsAvatarMotion ? `\n\n${buildAvatarMotionRule(mode.customAnimations, mode.recentMotions)}` : "";
  if (mode.kind !== "chat") {
    return `${persona}\n\n${FORMAT_RULES_BY_KIND[mode.kind]}${forbidNameRule}${motionRule}`;
  }
  const greetingRule = mode.isReturningCommenter
    ? 'Penonton ini sudah pernah berkomentar sebelumnya di live ini — hindari menyapa seolah baru pertama kali ketemu.'
    : "";
  return `${persona}\n\n${REPLY_FORMAT_RULES}${greetingRule ? `\n\n${greetingRule}` : ""}${forbidNameRule}${motionRule}`;
}

type SignProvider = "EULERSTREAM" | "TIKTOOL";

/**
 * Normalizes the two very different underlying libraries (tiktok-live-connector
 * for Euler Stream, @tiktool/live for TikTool) behind one shape the rest of
 * this class can drive uniformly. Read-only by design — neither integration
 * posts back into the live chat, only the AI voice reply is "spoken" (played
 * back client-side), so there's nothing provider-specific to branch on there.
 */
interface ActiveConnection {
  provider: SignProvider;
  roomId: string;
  disconnect: () => Promise<void> | void;
}

async function getSignProviderConfig(): Promise<{ provider: SignProvider; apiKey: string }> {
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: ["tiktok.euler_api_key", "tiktok.tiktool_api_key", "tiktok.sign_provider", "tiktok.enabled"] },
    },
  });
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const enabled = settings["tiktok.enabled"] === "true";
  const provider: SignProvider = settings["tiktok.sign_provider"] === "TIKTOOL" ? "TIKTOOL" : "EULERSTREAM";
  const apiKey = provider === "TIKTOOL" ? settings["tiktok.tiktool_api_key"] : settings["tiktok.euler_api_key"];

  if (!enabled || !apiKey) {
    throw new ProviderNotConfiguredError(
      "Fitur Live TikTok belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Pengaturan."
    );
  }
  return { provider, apiKey };
}

/**
 * Owns every active TikTok LIVE websocket connection (one per user with the
 * feature enabled) for the lifetime of the Node process. Runs in-process
 * (started from instrumentation.ts) rather than as a separate worker, so it
 * lives and dies with the Next.js server itself — no extra deployment unit.
 *
 * Uses an unofficial, reverse-engineered protocol. TikTok can change it at
 * any time, and reading this way is against TikTok's ToS — connections are
 * expected to occasionally fail; every path here degrades to an ERROR status
 * rather than crashing the server.
 */
class TiktokLiveManager {
  private connections = new Map<string, ActiveConnection>();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private booted = false;

  // Identifies which connect attempt is "current" for a user. A connection's
  // own event handlers (disconnected/error/chat) fire asynchronously and are
  // NOT covered by withLock — without this, a late event from an old, already
  // -superseded socket could delete/overwrite the newer live connection's map
  // entry (or double-process a chat event), reintroducing duplicate replies.
  private connectionTokens = new Map<string, object>();

  // Serializes connect/disconnect for a given user so a slow connect() (a
  // multi-second, multi-request handshake with the sign server) can never
  // overlap with another start/stop for the same user — the exact overlap
  // that previously left two live sockets open and duplicated every event.
  private locks = new Map<string, Promise<unknown>>();

  private withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(fn);
    this.locks.set(
      userId,
      run.catch(() => {})
    );
    return run;
  }

  // When TikTok's edge silently stops pushing data to a stale/ended room
  // (observed: no close frame, no error — the socket just goes quiet), the
  // underlying libraries' own reconnect logic never fires, since that only
  // triggers on an actual detected disconnect. Without this, `status` stays
  // "LIVE" forever even though nothing is coming in — exactly the bug users
  // hit after a dev-server restart when the DB status outlives the real
  // connection, but also happens on a genuinely-stale-but-open socket. Set
  // on connect (as a grace-period baseline) and on every inbound event, incl.
  // low-signal ones (viewer-count pings) that arrive far more often than
  // chat, so a real live with an idle chat isn't mistaken for a dead one.
  private lastActivityAt = new Map<string, number>();
  private static readonly STALE_CONNECTION_MS = 5 * 60_000;

  async bootstrap() {
    if (this.booted) return;
    this.booted = true;

    try {
      await this.reconcile();
    } catch (err) {
      console.error("[tiktok-live] initial reconcile failed:", err);
    }

    this.reconcileTimer = setInterval(() => {
      this.reconcile().catch((err) => console.error("[tiktok-live] reconcile failed:", err));
    }, RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref?.();
  }

  /**
   * Safety-net cleanup only — never starts new connections. Connecting always
   * costs the sign provider (Euler Stream/TikTool) a request, and those have
   * daily quotas, so it must only ever happen from an explicit user action
   * (the "Hubungkan Sekarang" button / connectNow()), not on a timer.
   */
  private async reconcile() {
    await ensureDbConnection();

    let enabledUserIds: Set<string>;
    try {
      await getSignProviderConfig();
      const configs = await prisma.tiktokLiveConfig.findMany({ where: { enabled: true }, select: { userId: true } });
      enabledUserIds = new Set(configs.map((c) => c.userId));
    } catch (err) {
      // Feature disabled or unconfigured at the admin level — tear down every active connection.
      const message = err instanceof Error ? err.message : "Fitur Live TikTok nonaktif.";
      for (const userId of Array.from(this.connections.keys())) {
        await this.withLock(userId, () => this.stopFor(userId));
        await this.setStatus(userId, "ERROR", message);
      }
      return;
    }

    for (const userId of Array.from(this.connections.keys())) {
      if (!enabledUserIds.has(userId)) {
        await this.withLock(userId, () => this.stopFor(userId));
        continue;
      }

      // Doesn't reconnect (see the docstring above) — only tells the truth
      // about a connection that's gone silent, so status stops lying "LIVE"
      // and the user knows to click reconnect instead of wondering why
      // nothing is coming in.
      const lastActivity = this.lastActivityAt.get(userId) ?? 0;
      if (Date.now() - lastActivity > TiktokLiveManager.STALE_CONNECTION_MS) {
        console.error(`[tiktok-live] connection for user ${userId} went silent — tearing down as stale.`);
        await this.withLock(userId, () => this.stopFor(userId));
        await this.setStatus(
          userId,
          "ERROR",
          "Koneksi live terputus diam-diam (tidak ada aktivitas beberapa menit) — live mungkin sudah berakhir. Klik \"Cek & Hubungkan Sekarang\" untuk mencoba lagi."
        );
      }
    }
  }

  /**
   * Call right after a user saves their config. Only tears down any existing
   * connection (settings may have changed, e.g. a different username) — it
   * never reconnects automatically. The user must click "Hubungkan Sekarang"
   * (connectNow) afterward to actually (re)connect.
   */
  async applyConfig(userId: string) {
    await this.withLock(userId, () => this.stopFor(userId));
  }

  /** Explicit, user-triggered connect — the only path that ever opens a new connection. */
  async connectNow(userId: string) {
    await this.withLock(userId, async () => {
      await this.stopFor(userId);
      const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId } });
      if (config?.enabled) await this.startFor(config);
    });
  }

  private async startFor(config: TiktokLiveConfig) {
    let providerConfig: { provider: SignProvider; apiKey: string };
    try {
      providerConfig = await getSignProviderConfig();
    } catch (err) {
      await this.setStatus(config.userId, "ERROR", err instanceof Error ? err.message : "Konfigurasi tidak lengkap.");
      return;
    }

    await this.setStatus(config.userId, "CONNECTING", null);

    const token = {};
    this.connectionTokens.set(config.userId, token);

    try {
      const active =
        providerConfig.provider === "TIKTOOL"
          ? await this.connectViaTikTool(config, providerConfig.apiKey, token)
          : await this.connectViaEulerStream(config, providerConfig.apiKey, token);

      this.connections.set(config.userId, active);
      // Seed the grace-period baseline now, not on the first real event — a
      // freshly-connected room with a genuinely quiet chat shouldn't get
      // flagged stale before it ever had a chance to receive anything.
      this.lastActivityAt.set(config.userId, Date.now());
      await withDbRetry(() =>
        prisma.tiktokLiveConfig.updateMany({
          where: { userId: config.userId },
          data: { status: "LIVE", lastError: null, roomId: active.roomId || null },
        })
      );
    } catch (err) {
      this.connections.delete(config.userId);
      const message = err instanceof Error ? err.message : "Gagal terhubung ke live TikTok.";
      console.error(`[tiktok-live] connect failed for user ${config.userId}:`, message);
      await this.setStatus(config.userId, "ERROR", message);
    }
  }

  private async connectViaEulerStream(
    config: TiktokLiveConfig,
    apiKey: string,
    token: object
  ): Promise<ActiveConnection> {
    const isCurrent = () => this.connectionTokens.get(config.userId) === token;

    const connection = new TikTokLiveConnection(config.tiktokUsername, { signApiKey: apiKey });

    connection.on(WebcastEvent.CHAT, (data: unknown) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onChat(config.userId, data).catch((err) => console.error("[tiktok-live] onChat failed:", err));
    });
    connection.on(WebcastEvent.MEMBER, (data: unknown) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onMemberJoin(config.userId, data).catch((err) => console.error("[tiktok-live] onMemberJoin failed:", err));
    });
    connection.on(WebcastEvent.LIKE, (data: unknown) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onLike(config.userId, data).catch((err) => console.error("[tiktok-live] onLike failed:", err));
    });
    connection.on(WebcastEvent.GIFT, (data: unknown) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onGift(config.userId, data).catch((err) => console.error("[tiktok-live] onGift failed:", err));
    });
    connection.on(WebcastEvent.SOCIAL, (data: unknown) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onFollow(config.userId, data).catch((err) => console.error("[tiktok-live] onFollow failed:", err));
    });
    // Viewer-count pings arrive far more often than chat and carry nothing
    // we need to store — used purely as a liveness heartbeat, so a real live
    // with a quiet chat isn't mistaken for a dead connection by the
    // staleness check in reconcile().
    connection.on(WebcastEvent.ROOM_USER, () => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
    });
    // A direct "the broadcaster ended their live" signal — without this the
    // status stayed "LIVE" indefinitely after a stream ended, since nothing
    // else would ever tell us. Falls back to the staleness watchdog for
    // cases where TikTok never sends this (silent drops, not a real end).
    connection.on(WebcastEvent.STREAM_END, () => {
      if (!isCurrent()) return;
      this.connections.delete(config.userId);
      this.lastActivityAt.delete(config.userId);
      this.setStatus(config.userId, "STOPPED", "Live sudah berakhir.").catch(() => {});
    });
    connection.on(ControlEvent.DISCONNECTED, () => {
      if (!isCurrent()) return;
      this.connections.delete(config.userId);
      this.lastActivityAt.delete(config.userId);
      this.setStatus(config.userId, "STOPPED", null).catch(() => {});
    });
    connection.on(ControlEvent.ERROR, (err: unknown) => {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tiktok-live] connection error for user ${config.userId}:`, message);
      this.setStatus(config.userId, "ERROR", message).catch(() => {});
    });

    await connection.connect();

    return {
      provider: "EULERSTREAM",
      roomId: connection.roomId,
      disconnect: () => connection.disconnect(),
    };
  }

  private async connectViaTikTool(
    config: TiktokLiveConfig,
    apiKey: string,
    token: object
  ): Promise<ActiveConnection> {
    const isCurrent = () => this.connectionTokens.get(config.userId) === token;

    // Resolve the account's CURRENT room directly from TikTok first — proven
    // more authoritative than TikTool's own uniqueId→roomId lookup, which
    // was observed returning the SAME stale room_id across repeated connect
    // attempts for an account that had genuinely rolled over to a new live
    // session: TikTool's `alive`/`streamUrls` both looked "healthy" for that
    // stale room, the connection "succeeded", and zero real events ever
    // arrived.
    const freshRoom = await resolveCurrentLiveRoom(config.tiktokUsername);
    let roomIdOverride: string | undefined;
    let sessionIdOverride: string | undefined;

    if (freshRoom) {
      if (!freshRoom.isLive) {
        throw new Error(`Akun TikTok "${config.tiktokUsername}" sedang tidak live saat ini.`);
      }
      // Only override when BOTH roomId and a fresh session cookie are
      // available — that combination makes TikTool's client skip its own
      // `ws_credentials` room-lookup entirely (see tiktok-live-room-lookup.ts).
      // Supplying roomId alone still routes through `ws_credentials`, which
      // was observed rejecting our independently-resolved room with a 403 on
      // the actual WebSocket handshake — apparently it can't produce valid
      // signed credentials for a room outside its own cache, a different
      // flavor of the same staleness problem. Without a session cookie, fall
      // through to TikTool's own default resolution below instead of
      // risking that failure mode again.
      if (freshRoom.sessionId) {
        roomIdOverride = freshRoom.roomId;
        sessionIdOverride = freshRoom.sessionId;
      }
    } else {
      // Best-effort scrape failed (network hiccup, TikTok changed their page
      // structure) — fall back to the original TikTool-only liveness check.
      //
      // `alive` alone isn't reliable: observed cases where TikTool returns
      // `alive: false` while still handing back a freshly-signed,
      // currently-valid pull URL for the stream — a real live session, just
      // resolved against a stale cached room_id on their end. A working pull
      // URL is strong independent evidence the room is actually live, so
      // treat either signal as enough.
      //
      // `flvPullUrl`/`hlsPullUrl` are meant to be a "best available" shortcut
      // into `streamUrls`, but observed NOT populated even when `streamUrls`
      // clearly has a valid signed URL — confirmed live via a real account
      // where the only populated keys were lowercase ("hd"/"ao"), which the
      // library's own shortcut-picking logic didn't recognize. Scanning every
      // entry in `streamUrls` directly is what actually finds it either way.
      const stream = await TikToolLive.getStreamUrl({ uniqueId: config.tiktokUsername, apiKey });
      const hasStreamUrl =
        Boolean(stream.flvPullUrl || stream.hlsPullUrl) ||
        Object.values(stream.streamUrls ?? {}).some((q) => q?.flv || q?.hls);
      if (!stream.alive && !hasStreamUrl) {
        throw new Error(`Akun TikTok "${config.tiktokUsername}" sedang tidak live saat ini.`);
      }
    }

    const connection = new TikToolLive({
      uniqueId: config.tiktokUsername,
      apiKey,
      mode: "direct",
      ...(roomIdOverride && sessionIdOverride ? { roomId: roomIdOverride, sessionId: sessionIdOverride } : {}),
    });

    connection.on("chat", (event) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onChat(config.userId, event).catch((err) => console.error("[tiktok-live] onChat failed:", err));
    });
    connection.on("member", (event) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onMemberJoin(config.userId, event).catch((err) => console.error("[tiktok-live] onMemberJoin failed:", err));
    });
    connection.on("like", (event) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onLike(config.userId, event).catch((err) => console.error("[tiktok-live] onLike failed:", err));
    });
    connection.on("gift", (event) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onGift(config.userId, event).catch((err) => console.error("[tiktok-live] onGift failed:", err));
    });
    connection.on("social", (event) => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
      this.onFollow(config.userId, event).catch((err) => console.error("[tiktok-live] onFollow failed:", err));
    });
    // Viewer-count sequence updates — same heartbeat role as ROOM_USER on
    // the Euler Stream path, see connectViaEulerStream.
    connection.on("roomUserSeq", () => {
      if (!isCurrent()) return;
      this.lastActivityAt.set(config.userId, Date.now());
    });
    connection.on("disconnected", () => {
      if (!isCurrent()) return;
      this.connections.delete(config.userId);
      this.lastActivityAt.delete(config.userId);
      this.setStatus(config.userId, "STOPPED", null).catch(() => {});
    });
    connection.on("error", (err: unknown) => {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tiktok-live] connection error for user ${config.userId}:`, message);
      this.setStatus(config.userId, "ERROR", message).catch(() => {});
    });

    await connection.connect();

    return {
      provider: "TIKTOOL",
      roomId: connection.roomId,
      disconnect: () => connection.disconnect(),
    };
  }

  private async stopFor(userId: string) {
    const connection = this.connections.get(userId);
    if (!connection) return;
    this.connections.delete(userId);
    this.lastActivityAt.delete(userId);
    try {
      await connection.disconnect();
    } catch {
      // already torn down
    }
    await this.setStatus(userId, "STOPPED", null);
  }

  private async setStatus(userId: string, status: TiktokLiveStatus, lastError: string | null) {
    await withDbRetry(() => prisma.tiktokLiveConfig.updateMany({ where: { userId }, data: { status, lastError } }));
  }

  // Tracked so join-greetings can back off while real comments are coming in
  // — greetings are meant to fill quiet moments, not compete with replying
  // to actual engagement.
  private lastCommentAt = new Map<string, number>();

  private async onChat(userId: string, raw: unknown) {
    const data = raw as { content?: string; comment?: string; user?: { nickname?: string; uniqueId?: string } };
    const commentText = (data?.content ?? data?.comment ?? "").toString().trim();
    if (!commentText) {
      // A silent no-op here (no log at all) is indistinguishable from "no
      // one commented" — TikTool's actual event shape has already been
      // observed diverging from its own declared types once (see the
      // streamUrls-casing fix in connectViaTikTool), so if a live comment
      // genuinely arrives but its text field isn't named "content"/"comment"
      // in practice, this is the only trace that a chat event fired at all.
      console.error(`[tiktok-live] onChat received an event with no readable comment text for user ${userId}:`, raw);
      return;
    }
    const commenterName = cleanNameForSpeech(data?.user?.nickname || data?.user?.uniqueId || "Penonton");
    this.lastCommentAt.set(userId, Date.now());

    // Both sign providers have been observed replaying a batch of recent
    // chat right after (re)connecting — without deduping by the event's own
    // id, a replay creates duplicate comment rows and, worse, re-runs (and
    // re-charges credits for) an AI reply that was already generated for
    // the exact same message moments earlier.
    const msgId = extractMsgId(raw);

    await ensureDbConnection();
    const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId } });
    if (!config) return;

    if (msgId) {
      const existing = await prisma.tiktokLiveComment.findUnique({ where: { tiktokMsgId: msgId } });
      if (existing) return;
    }

    let comment;
    try {
      comment = await prisma.tiktokLiveComment.create({
        data: { configId: config.id, userId, commenterName, commentText, tiktokMsgId: msgId },
      });
    } catch (err) {
      // A concurrent duplicate that slipped past the check above (race
      // between the findUnique and this create) hits the same unique
      // constraint — that's the dedup working, not a real failure.
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    if (config.autoReply) {
      try {
        await this.generateReply(config, comment.id, commentText, commenterName, { kind: "chat" });
      } catch (err) {
        console.error(`[tiktok-live] auto-reply failed for user ${userId}:`, err);
      }
    }
  }

  // Caps how often a "someone joined" greeting can fire per user — TikTok can
  // emit a join event per viewer entering the room, which for anything but a
  // tiny stream can be many per second. Without this, auto-greeting would
  // burn through credits and provider rate limits almost immediately. Kept
  // deliberately low ("a few per minute") — this is filler for quiet
  // moments, not meant to fire constantly.
  private static readonly MIN_GREET_INTERVAL_MS = 20_000; // max ~3/minute
  // Also back off entirely while real comments are actively coming in —
  // greeting shouldn't compete with replying to actual engagement.
  private static readonly QUIET_WINDOW_MS = 12_000;
  private lastGreetAt = new Map<string, number>();

  private async onMemberJoin(userId: string, raw: unknown) {
    const data = raw as { user?: { nickname?: string; uniqueId?: string } };
    const rawJoinerName = data?.user?.nickname || data?.user?.uniqueId;
    const joinerName = rawJoinerName ? cleanNameForSpeech(rawJoinerName) : rawJoinerName;
    if (!joinerName) {
      console.error(`[tiktok-live] onMemberJoin received an event with no readable user for user ${userId}:`, raw);
      return;
    }

    const lastGreet = this.lastGreetAt.get(userId) ?? 0;
    if (Date.now() - lastGreet < TiktokLiveManager.MIN_GREET_INTERVAL_MS) return;

    const lastComment = this.lastCommentAt.get(userId) ?? 0;
    if (Date.now() - lastComment < TiktokLiveManager.QUIET_WINDOW_MS) return;

    // Same replay hazard as onChat — a join event from well outside the
    // throttle window above can still be a repeat from a previous
    // connection, not a new arrival.
    const msgId = extractMsgId(raw);

    await ensureDbConnection();
    const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId } });
    if (!config || !config.autoGreetJoins) return;

    if (msgId) {
      const existing = await prisma.tiktokLiveComment.findUnique({ where: { tiktokMsgId: msgId } });
      if (existing) return;
    }

    this.lastGreetAt.set(userId, Date.now());

    const commentText = "(baru saja bergabung ke live)";
    let comment;
    try {
      comment = await prisma.tiktokLiveComment.create({
        data: { configId: config.id, userId, commenterName: joinerName, commentText, tiktokMsgId: msgId },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    try {
      await this.generateReply(config, comment.id, commentText, joinerName, { kind: "join" });
    } catch (err) {
      console.error(`[tiktok-live] auto-greet failed for user ${userId}:`, err);
    }
  }

  // Likes fire far more often than joins — TikTok emits a "like" event
  // continuously while a viewer holds the like button, easily many per
  // second. This is the most aggressively throttled of the three, and — like
  // greet — backs off entirely during active comment traffic so it never
  // competes with replying to what people actually said.
  private static readonly MIN_LIKE_REPLY_INTERVAL_MS = 45_000;
  private lastLikeReplyAt = new Map<string, number>();

  private async onLike(userId: string, raw: unknown) {
    const likerName = extractEventUserName(raw);
    if (!likerName) {
      console.error(`[tiktok-live] onLike received an event with no readable user for user ${userId}:`, raw);
      return;
    }

    const lastLikeReply = this.lastLikeReplyAt.get(userId) ?? 0;
    if (Date.now() - lastLikeReply < TiktokLiveManager.MIN_LIKE_REPLY_INTERVAL_MS) return;

    const lastComment = this.lastCommentAt.get(userId) ?? 0;
    if (Date.now() - lastComment < TiktokLiveManager.QUIET_WINDOW_MS) return;

    const msgId = extractMsgId(raw);

    await ensureDbConnection();
    const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId } });
    if (!config || !config.autoReplyLikes) return;

    if (msgId) {
      const existing = await prisma.tiktokLiveComment.findUnique({ where: { tiktokMsgId: msgId } });
      if (existing) return;
    }

    this.lastLikeReplyAt.set(userId, Date.now());

    const likeCount = extractLikeCount(raw);
    const commentText = `(like sebanyak ${likeCount}x)`;
    let comment;
    try {
      comment = await prisma.tiktokLiveComment.create({
        data: { configId: config.id, userId, commenterName: likerName, commentText, tiktokMsgId: msgId },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    try {
      await this.generateReply(config, comment.id, commentText, likerName, { kind: "like", likeCount });
    } catch (err) {
      console.error(`[tiktok-live] auto-reply-like failed for user ${userId}:`, err);
    }
  }

  private async onGift(userId: string, raw: unknown) {
    // A gift with a combo/streak (holding down a repeatable gift) fires one
    // event per tick — only the tick where the streak actually ends (or a
    // non-repeatable gift, which has no streak at all) should trigger a
    // reply, otherwise the same gift would get acknowledged dozens of times.
    if (!isGiftComboFinished(raw)) return;

    const gifterName = extractEventUserName(raw);
    if (!gifterName) {
      console.error(`[tiktok-live] onGift received an event with no readable user for user ${userId}:`, raw);
      return;
    }

    const msgId = extractMsgId(raw);

    await ensureDbConnection();
    const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId } });
    if (!config || !config.autoReplyGifts) return;

    if (msgId) {
      const existing = await prisma.tiktokLiveComment.findUnique({ where: { tiktokMsgId: msgId } });
      if (existing) return;
    }

    const { name: giftName, count: giftCount } = extractGiftInfo(raw);
    const commentText = `(mengirim gift "${giftName}" x${giftCount})`;
    let comment;
    try {
      comment = await prisma.tiktokLiveComment.create({
        data: { configId: config.id, userId, commenterName: gifterName, commentText, tiktokMsgId: msgId },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    try {
      await this.generateReply(config, comment.id, commentText, gifterName, { kind: "gift", giftName, giftCount });
    } catch (err) {
      console.error(`[tiktok-live] auto-reply-gift failed for user ${userId}:`, err);
    }
  }

  // Follows are rarer and more individually meaningful than likes, so a
  // shorter cooldown than MIN_LIKE_REPLY_INTERVAL_MS — but a "follow train"
  // during a raid can still burst many per second, so still throttled, not
  // fired on every single one.
  private static readonly MIN_FOLLOW_REPLY_INTERVAL_MS = 15_000;
  private lastFollowReplyAt = new Map<string, number>();

  private async onFollow(userId: string, raw: unknown) {
    // The underlying event also carries "share" under the same shape —
    // only "follow" is handled here, share isn't part of what was asked for.
    if (!isFollowAction(raw)) return;

    const followerName = extractEventUserName(raw);
    if (!followerName) {
      console.error(`[tiktok-live] onFollow received an event with no readable user for user ${userId}:`, raw);
      return;
    }

    const lastFollowReply = this.lastFollowReplyAt.get(userId) ?? 0;
    if (Date.now() - lastFollowReply < TiktokLiveManager.MIN_FOLLOW_REPLY_INTERVAL_MS) return;

    const msgId = extractMsgId(raw);

    await ensureDbConnection();
    const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId } });
    if (!config || !config.autoReplyFollows) return;

    if (msgId) {
      const existing = await prisma.tiktokLiveComment.findUnique({ where: { tiktokMsgId: msgId } });
      if (existing) return;
    }

    this.lastFollowReplyAt.set(userId, Date.now());

    const commentText = "(baru saja follow akun ini)";
    let comment;
    try {
      comment = await prisma.tiktokLiveComment.create({
        data: { configId: config.id, userId, commenterName: followerName, commentText, tiktokMsgId: msgId },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    try {
      await this.generateReply(config, comment.id, commentText, followerName, { kind: "follow" });
    } catch (err) {
      console.error(`[tiktok-live] auto-reply-follow failed for user ${userId}:`, err);
    }
  }

  /** Generates (and charges credits for) an AI suggested reply, as both text and spoken audio. */
  private async generateReply(
    config: TiktokLiveConfig,
    commentId: string,
    commentText: string,
    commenterName: string,
    mode: { kind: ReplyKind; giftName?: string; giftCount?: number; likeCount?: number }
  ): Promise<{ reply: string; audioUrl: string; creditBalance: number }> {
    await withDbRetry(() =>
      prisma.tiktokLiveComment.update({ where: { id: commentId }, data: { replyStatus: "GENERATING" } })
    );

    try {
      // "Returning commenter" context only makes sense for actual chat
      // replies (see REPLY_FORMAT_RULES's greetingRule) — skipped for every
      // other kind, same as the original join-only skip.
      const priorReplyCount =
        mode.kind !== "chat"
          ? 0
          : await prisma.tiktokLiveComment.count({
              where: {
                configId: config.id,
                commenterName,
                id: { not: commentId },
                replyStatus: "GENERATED",
              },
            });
      const isReturningCommenter = priorReplyCount > 0;

      // Host virtual needs per-character timing to drive the VRM's lip-sync,
      // at the exact same per-character price as the plain call — requesting
      // it up front here means the reply is ready to show a talking host
      // immediately, with no separate async render step. Same condition
      // gates asking for emotion+gesture classification too — no point
      // paying for it when there's no avatar to render it on. Moved ahead of
      // recentTurns/historyMessages below (previously came after) since
      // resolving recentMotionLabels needs `customAnimations` already loaded.
      const wantsVisemeTiming = config.virtualHostEnabled;
      const wantsAvatarMotion = wantsVisemeTiming;

      // Fetched fresh every reply, never cached — a "Simpan Perubahan" or a
      // brand-new "Simpan Sebagai" entry in the Animation Library is
      // usable by the very next reply this way, with zero deploy. Global
      // (no userId filter — see schema.prisma's own comment on
      // AvatarAnimation), same shared-library reasoning as AvatarTemplate.
      // Capped at a sane count purely to bound prompt size; realistically
      // nowhere near this many hand-authored entries exist yet.
      const customAnimations = wantsAvatarMotion
        ? await withDbRetry(() =>
            prisma.avatarAnimation.findMany({
              select: { id: true, name: true },
              orderBy: { updatedAt: "desc" },
              take: 40,
            })
          )
        : [];

      // Short-term memory: without this, every reply was generated from a
      // blank slate — the AI had no idea what was just discussed, so
      // follow-up comments could get answered as if out of nowhere. Also
      // doubles as the source for recentMotionLabels below — gesture/
      // customAnimationId aren't otherwise visible to the model anywhere
      // (historyMessages, built further down, only ever carries the reply
      // TEXT, never the classification fields from past turns).
      const recentTurns = await prisma.tiktokLiveComment.findMany({
        where: {
          configId: config.id,
          id: { not: commentId },
          replyStatus: "GENERATED",
          suggestedReply: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: HISTORY_TURN_LIMIT,
        select: { commenterName: true, commentText: true, suggestedReply: true, gesture: true, customAnimationId: true },
      });
      // Deterministic cooldown, not left to the model's own judgment — see
      // FORBID_NAME_RULE for why "sesekali saja" alone isn't reliable once
      // the history below is full of the model's own name-using replies.
      const recentNameUsageCount = recentTurns.filter(
        (t) => t.suggestedReply && t.commenterName && t.suggestedReply.toLowerCase().includes(t.commenterName.toLowerCase())
      ).length;
      const forbidName = recentNameUsageCount >= 2;

      // Most-recent-first at this point (recentTurns' own query orders
      // desc) — MUST be read before historyMessages below, which reverses
      // recentTurns in place (Array.prototype.reverse() mutates) to build
      // chronological chat history. Resolves a customAnimationId to its
      // saved name for readability; a plain gesture value is already a
      // short readable word. Capped at 3 — enough to catch "the last couple
      // replies used the same thing" without bloating the prompt.
      const RECENT_MOTION_LOOKBACK = 3;
      const customAnimationNameById = new Map(customAnimations.map((a) => [a.id, a.name]));
      const recentMotions = wantsAvatarMotion
        ? recentTurns
            .slice(0, RECENT_MOTION_LOOKBACK)
            .map((t) =>
              t.customAnimationId
                ? (customAnimationNameById.get(t.customAnimationId) ?? null)
                : t.gesture && t.gesture !== "none"
                  ? t.gesture
                  : null
            )
            .filter((v): v is string => Boolean(v))
        : [];

      const historyMessages: { role: "user" | "assistant"; content: string }[] = recentTurns
        .reverse()
        .flatMap((t) => [
          { role: "user" as const, content: `Komentar dari penonton "${t.commenterName}": "${t.commentText}"` },
          { role: "assistant" as const, content: t.suggestedReply! },
        ]);

      const { client, model } = await getOpenAiClient("openai-text");
      const completion = await client.chat.completions.create({
        model,
        // json_object forces the WHOLE completion to be a JSON blob (the
        // reply text lives inside it, at .reply) — same response_format
        // pattern already used for SEO generation elsewhere in this codebase.
        ...(wantsAvatarMotion ? { response_format: { type: "json_object" as const } } : {}),
        messages: [
          {
            role: "system",
            content: buildReplySystemPrompt(config, {
              kind: mode.kind,
              isReturningCommenter,
              forbidName,
              wantsAvatarMotion,
              customAnimations,
              recentMotions,
            }),
          },
          ...historyMessages,
          {
            role: "user",
            content:
              mode.kind === "join"
                ? `Penonton "${commenterName}" baru saja bergabung ke live.`
                : mode.kind === "like"
                  ? `Penonton "${commenterName}" baru saja like sebanyak ${mode.likeCount ?? 1}x.`
                  : mode.kind === "gift"
                    ? `Penonton "${commenterName}" baru saja mengirim gift "${mode.giftName ?? "hadiah"}" sebanyak ${mode.giftCount ?? 1}x.`
                    : mode.kind === "follow"
                      ? `Penonton "${commenterName}" baru saja follow akun ini.`
                      : `Komentar dari penonton "${commenterName}": "${commentText}"`,
          },
        ],
      });
      const rawContent = completion.choices[0]?.message?.content?.trim();
      if (!rawContent) throw new Error("AI tidak menghasilkan balasan.");

      let reply: string;
      let emotion: AvatarEmotion | null = null;
      let gesture: AvatarGesture | null = null;
      // Deliberately never classified anymore — see buildAvatarMotionRule's
      // own comment for why the old FBX/Mixamo clip option was dropped from
      // the AI's choices entirely. Always null going forward; kept as a
      // variable (rather than removed outright) only so the write below
      // stays explicit about that, and so any comment row with one saved
      // from BEFORE this change keeps whatever it already has untouched
      // (this only ever overwrites it with the same null on regeneration,
      // never resurrects a value).
      const avatarClip: AvatarClipName | null = null;
      let customAnimationId: string | null = null;
      if (wantsAvatarMotion) {
        // Malformed JSON degrades to "use the raw text as the reply, no
        // motion this time" rather than failing the whole reply — a classifier
        // hiccup should never block the actual answer from going out.
        try {
          const parsed = JSON.parse(rawContent) as {
            reply?: unknown;
            emotion?: unknown;
            gesture?: unknown;
            customAnimationId?: unknown;
          };
          reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : rawContent;
          emotion = isAvatarEmotion(parsed.emotion) ? parsed.emotion : null;
          gesture = isAvatarGesture(parsed.gesture) ? parsed.gesture : null;
          // Never trust a raw id string blindly — only accept one that was
          // actually offered in THIS call's own prompt (see customAnimations
          // above), so a hallucinated or stale/since-deleted id can never
          // slip through to the live avatar.
          const offeredCustomAnimationIds = new Set(customAnimations.map((a) => a.id));
          customAnimationId =
            typeof parsed.customAnimationId === "string" && offeredCustomAnimationIds.has(parsed.customAnimationId)
              ? parsed.customAnimationId
              : null;
          // Defensive, not just prompt wording — a custom Animation Library
          // entry and the small procedural gesture would fight over the
          // same bones if both landed on the same reply (see
          // buildAvatarMotionRule's own comment). customAnimationId wins
          // whenever both come back set, matching the prompt's own priority.
          if (customAnimationId) {
            gesture = null;
          }
        } catch {
          reply = rawContent;
        }
      } else {
        reply = rawContent;
      }
      if (!reply) throw new Error("AI tidak menghasilkan balasan.");

      if (!config.voice) {
        throw new Error("Pilih suara balasan dulu di form Konfigurasi sebelum mengaktifkan balasan otomatis.");
      }
      // "google-tts" is a cheaper alternative to ElevenLabs (see google-tts.ts
      // for why it's ~6-7x less expensive) — same `voice` column holds either
      // provider's opaque voice identifier, the admin-wide setting (see
      // getActiveTtsProvider) says which one to interpret it against.
      // Google's timing data is a word-level approximation rather than
      // ElevenLabs' true per-character alignment (see buildMarkedSsml's
      // comment there), but produces the exact same CharacterTiming[] shape,
      // so extractVisemeIntervals() below needs no branching of its own either way.
      const useGoogleTts = (await getActiveTtsProvider()) === "google-tts";
      const ttsProviderSlug = useGoogleTts ? "google-tts-chirp3" : "elevenlabs-tts";

      let audioBuffer: Buffer;
      let visemeData: VisemeInterval[] | null = null;
      if (wantsVisemeTiming) {
        const withTimestamps = useGoogleTts
          ? await generateGoogleTtsSpeechWithTimestamps({ text: reply, voiceName: config.voice })
          : await generateElevenLabsSpeechWithTimestamps({ text: reply, voiceId: config.voice });
        audioBuffer = withTimestamps.audioBuffer;
        visemeData = extractVisemeIntervals(withTimestamps.characters);
      } else {
        audioBuffer = useGoogleTts
          ? await generateGoogleTtsSpeech({ text: reply, voiceName: config.voice })
          : await generateElevenLabsSpeech({ text: reply, voiceId: config.voice });
      }
      const audioKey = `tiktok-live/${config.userId}/${randomUUID()}.mp3`;
      const audioUrl = await uploadToR2(audioBuffer, audioKey, "audio/mpeg");

      // Both TTS providers bill per character (matches how each provider
      // itself bills) — scale by the actual generated reply length so a long
      // reply is never undercharged relative to its real cost.
      const ttsCost = (await getProviderCost(ttsProviderSlug)) * reply.length;
      const cost = roundCreditCost((await getProviderCost("openai-text")) + ttsCost);

      await ensureDbConnection();
      const result = await chargeCreditsForGeneration({
        userId: config.userId,
        type: "TIKTOK_LIVE_REPLY",
        title:
          mode.kind === "join"
            ? `Sapaan live TikTok untuk ${commenterName}`
            : mode.kind === "like"
              ? `Balasan like live TikTok untuk ${commenterName}`
              : mode.kind === "gift"
                ? `Balasan gift live TikTok untuk ${commenterName}`
                : mode.kind === "follow"
                  ? `Balasan follow live TikTok untuk ${commenterName}`
                  : `Balasan live TikTok untuk ${commenterName}`,
        input: { commentText, commenterName },
        content: reply,
        cost,
      });

      await withDbRetry(() =>
        prisma.tiktokLiveComment.update({
          where: { id: commentId },
          data: {
            suggestedReply: reply,
            replyAudioUrl: audioUrl,
            replyStatus: "GENERATED",
            creditCost: cost,
            visemeData: visemeData as unknown as Prisma.InputJsonValue | undefined,
            emotion,
            gesture,
            avatarClip,
            customAnimationId,
          },
        })
      );

      return { reply, audioUrl, creditBalance: result.creditBalance };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await withDbRetry(() =>
        prisma.tiktokLiveComment.update({
          where: { id: commentId },
          data: { replyStatus: "FAILED", replyError: sanitizeErrorMessage(message).slice(0, 500) },
        })
      );
      throw err;
    }
  }
}

/**
 * Pulls the underlying platform's own event id out of a chat/member event,
 * regardless of which sign provider produced it — TikTool's SDK puts it at
 * the top level (`msgId`), tiktok-live-connector nests it inside the raw
 * protobuf-derived payload (`common.msgId`). Returns null (never throws) if
 * neither shape matches, so a caller can still process the event, just
 * without dedup protection for that one message.
 */
function extractMsgId(raw: unknown): string | null {
  const data = raw as { msgId?: unknown; common?: { msgId?: unknown } };
  const candidate = data?.msgId ?? data?.common?.msgId;
  return typeof candidate === "string" && candidate ? candidate : null;
}

/** Same cross-provider shape difference as extractMsgId, applied to the event's user — both providers nest it at `user.nickname`/`user.uniqueId`. */
function extractEventUserName(raw: unknown): string | null {
  const data = raw as { user?: { nickname?: string; uniqueId?: string } };
  const name = data?.user?.nickname || data?.user?.uniqueId || null;
  return name ? cleanNameForSpeech(name) : null;
}

/**
 * A raw TikTok nickname/uniqueId can contain dots, underscores, or other
 * symbols ("budi.official_92") that read badly spoken aloud by TTS — per
 * explicit instruction, only the part before the FIRST such symbol is ever
 * used for greeting/addressing a commenter (here and in every other name
 * this manager derives), keeping letters/digits/spaces intact. Falls back to
 * the original name if it starts with a symbol (nothing left to keep).
 */
function cleanNameForSpeech(name: string): string {
  const cleaned = name.match(/^[\p{L}\p{N}\s]+/u)?.[0]?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : name;
}

/** EulerStream's WebcastLikeMessage uses `count`, TikTool's LikeEvent uses `likeCount` — same "how many likes this event represents" value either way. */
function extractLikeCount(raw: unknown): number {
  const data = raw as { count?: number; likeCount?: number };
  return data?.count ?? data?.likeCount ?? 1;
}

/**
 * A repeatable ("combo") gift streams one event per tick while the sender
 * holds it down — only the tick where the streak ends (or a gift that was
 * never repeatable to begin with) should count as "this gift was sent".
 * EulerStream nests the repeatability flag under `gift.combo`; TikTool
 * exposes it flat as `combo`. `repeatEnd` marks the terminal tick either way
 * (EulerStream types it as `number` — a protobuf-style 0/1 flag — TikTool as
 * a real `boolean`; both are truthy/falsy-compatible).
 */
function isGiftComboFinished(raw: unknown): boolean {
  const data = raw as { gift?: { combo?: boolean }; combo?: boolean; repeatEnd?: number | boolean };
  const isCombo = data?.gift?.combo ?? data?.combo ?? false;
  if (!isCombo) return true;
  return Boolean(data?.repeatEnd);
}

/** EulerStream nests the gift's display name/diamond-adjacent repeat count under `gift.name`; TikTool exposes it flat as `giftName`. `repeatCount` (both providers) is how many of this gift were sent in the finished streak. */
function extractGiftInfo(raw: unknown): { name: string; count: number } {
  const data = raw as { gift?: { name?: string }; giftName?: string; repeatCount?: number };
  const name = data?.gift?.name || data?.giftName || "hadiah";
  const count = data?.repeatCount ?? 1;
  return { name, count };
}

/** WebcastSocialMessage/SocialEvent covers both "follow" and "share" under the same event — only follow is what onFollow acts on. */
function isFollowAction(raw: unknown): boolean {
  const data = raw as { action?: string };
  return data?.action === "follow";
}

/** Prisma's unique-constraint violation code (P2002) — used to treat a raced duplicate insert as "already handled" rather than a real error. */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

/** Strips internal provider/vendor names out of error text shown to end users. */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\bElevenLabs\b\s*/gi, "")
    .replace(/\bOpenAI\b\s*/gi, "")
    .replace(/\bfal\.ai\b\s*/gi, "")
    .replace(/\bTikTool\b\s*/gi, "")
    .replace(/\bEuler\s*Stream\b\s*/gi, "")
    .trim();
}

const globalForTiktokLive = globalThis as unknown as { tiktokLiveManager?: TiktokLiveManager };

export const tiktokLiveManager = globalForTiktokLive.tiktokLiveManager ?? new TiktokLiveManager();

if (process.env.NODE_ENV !== "production") {
  globalForTiktokLive.tiktokLiveManager = tiktokLiveManager;
}
