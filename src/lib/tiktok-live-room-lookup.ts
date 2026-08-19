const TIKTOK_LIVE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface TiktokLiveRoomInfo {
  roomId: string;
  isLive: boolean;
  /**
   * A fresh `ttwid` session cookie captured from the same anonymous request
   * — no login required, TikTok hands one out on any page load. Paired with
   * `roomId`, this lets a caller skip a sign provider's own room-credential
   * endpoint entirely (see tiktok-live-manager.ts's connectViaTikTool): that
   * endpoint has been observed rejecting/mis-signing an externally-supplied
   * room_id it doesn't already have cached (403 on the actual WS handshake),
   * whereas a generic "sign this URL" endpoint that doesn't look up room
   * state by uniqueId works fine with our own resolved room_id + ttwid.
   * Null if the cookie wasn't present in the response for any reason.
   */
  sessionId: string | null;
}

/**
 * Resolves a TikTok account's CURRENT live room directly from TikTok's own
 * page — bypasses the sign provider's own uniqueId→roomId lookup, which has
 * been observed (TikTool) serving a stale/cached room for an account whose
 * live session had already rolled over to a new one: the connection
 * "succeeds" against a room that's genuinely dead, no real events ever
 * arrive, and nothing about the connection itself looks wrong.
 *
 * Best-effort and read-only: returns null on any failure (network hiccup,
 * TikTok changing the page's internal JSON structure — this reads an
 * undocumented embedded state blob, not a stable public API) so callers can
 * fall back to their own existing resolution path rather than hard-failing
 * a connect attempt over a scraping break.
 */
export async function resolveCurrentLiveRoom(uniqueId: string): Promise<TiktokLiveRoomInfo | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(uniqueId)}/live`, {
      headers: { "User-Agent": TIKTOK_LIVE_UA },
    });
    if (!res.ok) return null;

    let sessionId: string | null = null;
    const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const cookie of cookies) {
      if (cookie.startsWith("ttwid=")) {
        sessionId = cookie.split(";")[0].slice("ttwid=".length);
        break;
      }
    }

    const html = await res.text();
    const match = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;

    const state = JSON.parse(match[1]);
    const user = state?.LiveRoom?.liveRoomUserInfo?.user;
    const roomId = typeof user?.roomId === "string" && user.roomId ? user.roomId : null;
    if (!roomId) return null;

    // TikTok's live status enum on this payload: 2 = currently live, 4 = ended.
    const status = user?.status ?? state?.LiveRoom?.liveRoomUserInfo?.liveRoom?.status;
    return { roomId, isLive: status === 2, sessionId };
  } catch {
    return null;
  }
}
