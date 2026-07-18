import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@marketingai.test";
  const adminPassword = "Admin123!";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "Admin Utama",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        creditBalance: 0,
      },
    });
    console.log(`Admin dibuat: ${adminEmail} / ${adminPassword}`);
  }

  const defaultSettings: Record<string, string> = {
    "site.title": "MarketingAI",
    "site.description":
      "Buat konten SEO, iklan gambar & video, banner, logo, dan foto produk secara instan dengan bantuan AI.",
    "site.contactEmail": "support@marketingai.test",
    "site.maintenanceMode": "false",
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // baseCost values are researched real provider prices converted to credits at
  // 1 credit = $0.05. falai-video and falai-lipsync are billed per second by their
  // providers, so their baseCost is per-second (the route multiplies by duration);
  // all others are a flat per-call estimate. Admin can tune these + markupPercent
  // from /admin/ai-providers as real usage/pricing data comes in.
  const defaultProviders = [
    {
      name: "OpenAI (Teks & SEO)",
      slug: "openai-text",
      category: "text",
      model: "gpt-4o-mini",
      // $0.15/1M input + $0.60/1M output tokens; ~$0.001/call blended across keywords/meta/article
      baseCost: 0.02,
      markupPercent: 20,
    },
    {
      name: "OpenAI (Gambar)",
      slug: "openai-image",
      category: "image",
      model: "gpt-image-1",
      // ~$0.04/image at medium quality, 1024x1024
      baseCost: 0.8,
      markupPercent: 20,
    },
    {
      name: "fal.ai (Video)",
      slug: "falai-video",
      category: "video",
      model: "fal-ai/kling-video/v3/standard/image-to-video",
      // $0.126/second with audio on (per-second — multiplied by chosen duration)
      baseCost: 2.52,
      markupPercent: 20,
    },
    {
      name: "fal.ai (Voice Changer)",
      slug: "falai-lipsync",
      category: "video",
      model: "fal-ai/sync-lipsync/v2",
      // $3/minute = $0.05/second (per-second — multiplied by source video duration)
      baseCost: 1,
      markupPercent: 20,
    },
    {
      name: "OpenAI (Text-to-Speech)",
      slug: "openai-tts",
      category: "audio",
      model: "gpt-4o-mini-tts",
      // ~$0.015/minute of audio; ~9s typical dialogue clip
      baseCost: 0.045,
      markupPercent: 20,
    },
    {
      name: "Serper (Data Kompetitor)",
      slug: "serper-search",
      category: "search",
      model: null,
      baseUrl: "https://google.serper.dev",
      // $1/1,000 queries at the starter tier
      baseCost: 0.02,
      markupPercent: 20,
    },
  ];

  for (const provider of defaultProviders) {
    await prisma.aiProvider.upsert({
      where: { slug: provider.slug },
      update: {},
      create: { ...provider, enabled: false },
    });
  }

  console.log("Seed selesai.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
