import type { CharacterTiming } from "@/lib/elevenlabs-tts";

// Pure, framework-free — shared between the server (extracting timing from a
// generated reply) and the client (the overlay page, animating the mouth
// shape in sync with audio playback). Indonesian spelling is close enough to
// phonetic that matching the literal vowel letters is a reasonable
// approximation of the actual vowel sound, unlike English orthography.
export type Vowel = "a" | "i" | "u" | "e" | "o";

/**
 * "closed": lips genuinely shut during natural speech — bilabial/labiodental
 * consonants (m/b/p/f/v) where the mouth can't stay open regardless of what
 * vowel comes next.
 * "neutral": every other consonant — real speech never fully closes the
 * mouth between vowels except at those specific closures, so this holds a
 * subtle, reduced-intensity mouth-open shape instead of snapping shut,
 * which is what made the old vowel-only/closed-gap model read as chattery.
 */
export type VisemeShape = Vowel | "closed" | "neutral";

export interface VisemeInterval {
  shape: VisemeShape;
  /** Multiplies the caller's base mouth-open intensity — full strength (1) for vowels, reduced for neutral consonants and anticipatory pre-shaping. */
  intensityScale: number;
  /** Seconds, relative to the reply audio's own start. */
  start: number;
  end: number;
}

const VOWELS = new Set<string>(["a", "i", "u", "e", "o"]);
const CLOSED_CONSONANTS = new Set<string>(["m", "b", "p", "f", "v"]);
const LETTER = /[a-z]/;

// A consonant immediately preceding a vowel with no meaningful gap gets
// pre-shaped toward that vowel instead of its own neutral shape — real
// speech starts forming the next vowel's mouth position before the
// consonant is even finished (coarticulation). Only "neutral" consonants
// anticipate; "closed" ones (m/b/p/f/v) physically can't pre-open regardless
// of what follows.
const ANTICIPATION_MAX_GAP_SECONDS = 0.05;
const ANTICIPATION_INTENSITY_SCALE = 0.55;
const NEUTRAL_INTENSITY_SCALE = 0.4;

/** Deterministic per-interval variation (not per-frame — would read as noise instead of natural inconsistency) so repeated vowels don't all hit the exact same intensity. */
function intensityJitter(seed: number): number {
  const fractional = Math.sin(seed * 12.9898) * 43758.5453;
  return 0.85 + (fractional - Math.floor(fractional)) * 0.3;
}

export function extractVisemeIntervals(characters: CharacterTiming[]): VisemeInterval[] {
  const intervals: VisemeInterval[] = [];
  for (const c of characters) {
    const lower = c.character.toLowerCase();
    if (VOWELS.has(lower)) {
      intervals.push({
        shape: lower as Vowel,
        intensityScale: intensityJitter(c.start),
        start: c.start,
        end: c.end,
      });
    } else if (LETTER.test(lower)) {
      const shape: VisemeShape = CLOSED_CONSONANTS.has(lower) ? "closed" : "neutral";
      intervals.push({
        shape,
        intensityScale: shape === "neutral" ? NEUTRAL_INTENSITY_SCALE : 0,
        start: c.start,
        end: c.end,
      });
    }
    // Non-letters (spaces, punctuation) intentionally produce no interval —
    // the resulting gap reads as the mouth easing toward rest, same as a
    // natural pause between words.
  }

  for (let i = 0; i < intervals.length - 1; i++) {
    const current = intervals[i];
    const next = intervals[i + 1];
    if (current.shape !== "neutral") continue;
    if (!VOWELS.has(next.shape)) continue;
    if (next.start - current.end > ANTICIPATION_MAX_GAP_SECONDS) continue;
    current.shape = next.shape;
    current.intensityScale = ANTICIPATION_INTENSITY_SCALE;
  }

  return intervals;
}

/** Which interval (if any) is "speaking" at a given playback time — null between vowels (closed mouth). */
export function findActiveViseme(intervals: VisemeInterval[], atSeconds: number): VisemeInterval | null {
  // A closed/consonant gap right after a vowel should still read as "mouth
  // closing", not hold the vowel shape open until the next one arrives —
  // this small trailing pad is how far past a vowel's own end the shape
  // still counts as active, purely to smooth out clipped-short timings.
  const HOLD_PAD_SECONDS = 0.03;
  for (const interval of intervals) {
    if (atSeconds >= interval.start && atSeconds <= interval.end + HOLD_PAD_SECONDS) return interval;
  }
  return null;
}
