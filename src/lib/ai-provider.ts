import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError } from "@/lib/errors";

export { ProviderNotConfiguredError };

export async function getOpenAiClient(slug: string) {
  const provider = await prisma.aiProvider.findUnique({ where: { slug } });

  if (!provider || !provider.enabled || !provider.apiKey) {
    throw new ProviderNotConfiguredError(
      `Provider AI "${slug}" belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Provider AI.`
    );
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl || undefined,
  });

  return { client, model: provider.model ?? "gpt-4o-mini" };
}
