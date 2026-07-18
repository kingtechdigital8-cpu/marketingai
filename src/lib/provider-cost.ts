import { prisma } from "@/lib/prisma";

/**
 * Credits charged for one call to a provider = its admin-configured base
 * cost plus markup%. Kept as a float internally so per-call costs can be
 * summed precisely across multiple provider calls before rounding once at
 * the end (see roundCreditCost).
 */
export async function getProviderCost(slug: string): Promise<number> {
  const provider = await prisma.aiProvider.findUnique({
    where: { slug },
    select: { baseCost: true, markupPercent: true },
  });
  if (!provider) return 0;
  return provider.baseCost * (1 + provider.markupPercent / 100);
}

export async function getProviderCosts(slugs: string[]): Promise<Record<string, number>> {
  const providers = await prisma.aiProvider.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, baseCost: true, markupPercent: true },
  });

  const costs: Record<string, number> = {};
  for (const slug of slugs) costs[slug] = 0;
  for (const provider of providers) {
    costs[provider.slug] = provider.baseCost * (1 + provider.markupPercent / 100);
  }
  return costs;
}

/** Credits must be a whole number for the ledger; round up so a provider call is never undercharged. */
export function roundCreditCost(cost: number): number {
  return Math.ceil(cost);
}
