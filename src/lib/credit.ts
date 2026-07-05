import type { GenerationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/with-db-retry";

export class InsufficientCreditError extends Error {
  constructor() {
    super("Kredit Anda tidak cukup untuk menjalankan aksi ini.");
  }
}

export async function chargeCreditsForGeneration({
  userId,
  type,
  title,
  input,
  content,
  cost,
}: {
  userId: string;
  type: GenerationType;
  title: string;
  input: Prisma.InputJsonValue;
  content: string;
  cost: number;
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.creditBalance < cost) {
        throw new InsufficientCreditError();
      }

      const generation = await tx.generation.create({
        data: { userId, type, status: "COMPLETED", title, input, content, creditCost: cost },
      });

      await tx.creditTransaction.create({
        data: { userId, amount: -cost, type: "USAGE", description: title, generationId: generation.id },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { creditBalance: { decrement: cost } },
      });

      return { generation, creditBalance: updatedUser.creditBalance };
    })
  );
}
