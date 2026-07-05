import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getOpenAiClient } from "@/lib/ai-provider";
import { isSerperConfigured, searchCompetitors, type Competitor } from "@/lib/serper";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { chargeCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { getCountry } from "@/lib/countries";
import { getLanguageLabel } from "@/lib/languages";
import { computeUniquenessScore } from "@/lib/uniqueness";
import { ensureDbConnection } from "@/lib/with-db-retry";

interface KeywordIdea {
  keyword: string;
  intent: string;
  difficulty: string;
}

const LENGTH_LABEL: Record<string, string> = {
  pendek: "sekitar 300-400 kata",
  sedang: "sekitar 600-800 kata",
  panjang: "sekitar 1000-1200 kata",
};

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const tool = body?.tool as string | undefined;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";

  if (!topic) {
    return NextResponse.json({ error: "Topik wajib diisi." }, { status: 400 });
  }

  try {
    if (tool === "keywords") {
      return await handleKeywords(session.user.id, topic, body?.businessDescription, body?.country);
    }
    if (tool === "meta") {
      return await handleMeta(session.user.id, topic, body?.targetKeyword, body?.language);
    }
    if (tool === "article") {
      return await handleArticle(
        session.user.id,
        topic,
        body?.targetKeyword,
        body?.tone,
        body?.length,
        body?.language
      );
    }
    return NextResponse.json({ error: "Tool tidak dikenal." }, { status: 400 });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsufficientCreditError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("SEO generation failed:", err);
    return NextResponse.json({ error: "Gagal menghasilkan konten. Coba lagi." }, { status: 502 });
  }
}

async function handleKeywords(
  userId: string,
  topic: string,
  businessDescription?: unknown,
  countryCode?: unknown
) {
  const { client, model } = await getOpenAiClient("openai-text");
  const context = typeof businessDescription === "string" && businessDescription.trim() ? businessDescription.trim() : null;
  const country = getCountry(typeof countryCode === "string" ? countryCode : undefined);

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Anda adalah pakar riset kata kunci SEO. Selalu jawab dengan JSON valid saja, tanpa teks tambahan.",
      },
      {
        role: "user",
        content: `Berikan ide kata kunci SEO untuk topik/bisnis berikut: "${topic}", dengan target pasar negara ${country.label}.${
          context ? `di Tahun 2026 ini dengan Konteks bisnis: ${context}.` : ""
        } Entri pertama dalam daftar WAJIB kata kunci utama itu sendiri persis "${topic}" apa adanya (short-tail, jangan diubah/ditambah kata lain). Setelah itu tambahkan 9 variasi kata kunci turunan lainnya (long-tail, pertanyaan, transactional, dll). Untuk tiap kata kunci sertakan "keyword", "intent" (informational/transactional/navigational/commercial), dan "difficulty" (rendah/sedang/tinggi). Format: {"keywords": [{"keyword": "...", "intent": "...", "difficulty": "..."}]}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  const ideas: KeywordIdea[] = parsed.keywords ?? [];

  const hasExactTopic = ideas.some((idea) => idea.keyword.trim().toLowerCase() === topic.trim().toLowerCase());
  if (!hasExactTopic) {
    ideas.unshift({ keyword: topic, intent: "informational", difficulty: "sedang" });
  }

  const competitorsEnabled = await isSerperConfigured();
  const keywords = await Promise.all(
    ideas.map(async (idea) => {
      if (!competitorsEnabled) return { ...idea, competitors: [] as Competitor[] };
      try {
        const competitors = await searchCompetitors(idea.keyword, 10, { gl: country.gl, hl: country.hl });
        return { ...idea, competitors };
      } catch {
        return { ...idea, competitors: [] as Competitor[] };
      }
    })
  );

  await ensureDbConnection();
  const result = await chargeCreditsForGeneration({
    userId,
    type: "SEO_KEYWORDS",
    title: `Riset kata kunci: ${topic} (${country.label})`,
    input: { topic, businessDescription: context, country: country.code },
    content: JSON.stringify({ keywords }),
    cost: CREDIT_COSTS.SEO_KEYWORDS,
  });

  return NextResponse.json({
    keywords,
    competitorsEnabled,
    creditBalance: result.creditBalance,
    generationId: result.generation.id,
  });
}

async function handleMeta(userId: string, topic: string, targetKeyword?: unknown, languageCode?: unknown) {
  const { client, model } = await getOpenAiClient("openai-text");
  const keyword = typeof targetKeyword === "string" && targetKeyword.trim() ? targetKeyword.trim() : null;
  const languageLabel = getLanguageLabel(typeof languageCode === "string" ? languageCode : undefined);

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Anda adalah pakar SEO on-page multibahasa. Selalu jawab dengan JSON valid saja, tanpa teks tambahan.",
      },
      {
        role: "user",
        content: `Buatkan SEO meta title (maksimal 60 karakter) dan meta description (maksimal 160 karakter) dalam bahasa ${languageLabel} untuk halaman dengan topik: "${topic}".${
          keyword ? ` Kata kunci utama: "${keyword}".` : ""
        } Format: {"metaTitle": "...", "metaDescription": "..."}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  await ensureDbConnection();
  const result = await chargeCreditsForGeneration({
    userId,
    type: "SEO_META",
    title: `Meta description: ${topic} (${languageLabel})`,
    input: { topic, targetKeyword: keyword, language: languageCode ?? "id" },
    content: raw,
    cost: CREDIT_COSTS.SEO_META,
  });

  return NextResponse.json({
    metaTitle: parsed.metaTitle ?? "",
    metaDescription: parsed.metaDescription ?? "",
    creditBalance: result.creditBalance,
    generationId: result.generation.id,
  });
}

async function handleArticle(
  userId: string,
  topic: string,
  targetKeyword?: unknown,
  tone?: unknown,
  length?: unknown,
  languageCode?: unknown
) {
  const { client, model } = await getOpenAiClient("openai-text");
  const keyword = typeof targetKeyword === "string" && targetKeyword.trim() ? targetKeyword.trim() : null;
  const toneLabel = typeof tone === "string" && tone.trim() ? tone.trim() : "profesional dan mudah dipahami";
  const lengthKey = typeof length === "string" && LENGTH_LABEL[length] ? length : "sedang";
  const languageLabel = getLanguageLabel(typeof languageCode === "string" ? languageCode : undefined);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "Anda adalah penulis konten SEO profesional multibahasa.",
      },
      {
        role: "user",
        content: `Tulis artikel SEO dalam bahasa ${languageLabel} tentang "${topic}".${
          keyword ? ` Optimalkan untuk kata kunci utama: "${keyword}".` : ""
        } Gaya penulisan: ${toneLabel}. Panjang artikel: ${LENGTH_LABEL[lengthKey]}. Gunakan format Markdown dengan judul, sub-judul, dan paragraf yang terstruktur rapi.`,
      },
    ],
  });

  const article = completion.choices[0]?.message?.content ?? "";
  const uniquenessScore = await computeUniquenessScore(article);

  await ensureDbConnection();
  const result = await chargeCreditsForGeneration({
    userId,
    type: "SEO_ARTICLE",
    title: `Artikel SEO: ${topic} (${languageLabel})`,
    input: { topic, targetKeyword: keyword, tone: toneLabel, length: lengthKey, language: languageCode ?? "id" },
    content: JSON.stringify({ article, uniquenessScore }),
    cost: CREDIT_COSTS.SEO_ARTICLE,
  });

  return NextResponse.json({
    article,
    uniquenessScore,
    creditBalance: result.creditBalance,
    generationId: result.generation.id,
  });
}
