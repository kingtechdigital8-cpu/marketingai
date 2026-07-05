import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError } from "@/lib/errors";

const SERPER_SLUG = "serper-search";

export interface Competitor {
  domain: string;
  title: string;
  link: string;
}

async function getSerperProvider() {
  const provider = await prisma.aiProvider.findUnique({ where: { slug: SERPER_SLUG } });
  if (!provider || !provider.enabled || !provider.apiKey) return null;
  return provider;
}

export async function isSerperConfigured(): Promise<boolean> {
  return (await getSerperProvider()) !== null;
}

async function runSerperSearch(query: string, extra: Record<string, unknown> = {}) {
  const provider = await getSerperProvider();
  if (!provider) {
    throw new ProviderNotConfiguredError(
      'Provider data kompetitor "Serper" belum dikonfigurasi atau nonaktif.'
    );
  }

  const baseUrl = provider.baseUrl || "https://google.serper.dev";
  const res = await fetch(`${baseUrl}/search`, {
    method: "POST",
    headers: {
      "X-API-KEY": provider.apiKey as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, ...extra }),
  });

  if (!res.ok) {
    throw new Error(`Serper request failed with status ${res.status}`);
  }

  return res.json();
}

export async function searchCompetitors(
  keyword: string,
  limit = 5,
  locale: { gl?: string; hl?: string } = {}
): Promise<Competitor[]> {
  const data = await runSerperSearch(keyword, {
    gl: locale.gl || "id",
    hl: locale.hl || "id",
    num: limit,
  });

  const organic: Array<{ link: string; title: string }> = data.organic ?? [];

  return organic.slice(0, limit).map((item) => {
    let domain = item.link;
    try {
      domain = new URL(item.link).hostname.replace(/^www\./, "");
    } catch {
      domain = item.link;
    }
    return { domain, title: item.title, link: item.link };
  });
}

export async function checkPhraseUniqueness(phrase: string): Promise<boolean> {
  const data = await runSerperSearch(`"${phrase}"`, { num: 5 });
  const organic: unknown[] = data.organic ?? [];
  return organic.length === 0;
}
