import { checkPhraseUniqueness, isSerperConfigured } from "@/lib/serper";

function extractSamplePhrases(article: string, count = 5): string[] {
  const sentences = article
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim())
    .filter((s) => s.length >= 40 && s.length <= 180);

  if (sentences.length === 0) return [];

  const step = Math.max(1, Math.floor(sentences.length / count));
  const picked: string[] = [];
  for (let i = 0; i < sentences.length && picked.length < count; i += step) {
    picked.push(sentences[i]);
  }
  return picked;
}

export async function computeUniquenessScore(article: string): Promise<number | null> {
  if (!(await isSerperConfigured())) return null;

  const phrases = extractSamplePhrases(article);
  if (phrases.length === 0) return null;

  const results = await Promise.all(
    phrases.map(async (phrase) => {
      try {
        return await checkPhraseUniqueness(phrase);
      } catch {
        return null;
      }
    })
  );

  const checked = results.filter((r): r is boolean => r !== null);
  if (checked.length === 0) return null;

  const uniqueCount = checked.filter(Boolean).length;
  return Math.round((uniqueCount / checked.length) * 100);
}
