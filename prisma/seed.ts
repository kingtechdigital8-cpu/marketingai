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

  const defaultProviders = [
    {
      name: "OpenAI (Teks & SEO)",
      slug: "openai-text",
      category: "text",
      model: "gpt-4o-mini",
      baseCost: 1,
      markupPercent: 20,
    },
    {
      name: "OpenAI (Gambar)",
      slug: "openai-image",
      category: "image",
      model: "gpt-image-1",
      baseCost: 10,
      markupPercent: 20,
    },
    {
      name: "fal.ai (Video)",
      slug: "falai-video",
      category: "video",
      model: "fal-ai/kling-video/v3/standard/image-to-video",
      baseCost: 45,
      markupPercent: 20,
    },
    {
      name: "fal.ai (Voice Changer)",
      slug: "falai-lipsync",
      category: "video",
      model: "fal-ai/sync-lipsync/v2",
      baseCost: 15,
      markupPercent: 20,
    },
    {
      name: "OpenAI (Text-to-Speech)",
      slug: "openai-tts",
      category: "audio",
      model: "gpt-4o-mini-tts",
      baseCost: 3,
      markupPercent: 20,
    },
    {
      name: "Serper (Data Kompetitor)",
      slug: "serper-search",
      category: "search",
      model: null,
      baseUrl: "https://google.serper.dev",
      baseCost: 0.3,
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
