import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const generations = await prisma.generation.findMany({
    where: {
      userId: session.user.id,
      type: { in: ["SEO_KEYWORDS", "SEO_META", "SEO_ARTICLE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      creditCost: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ generations });
}
