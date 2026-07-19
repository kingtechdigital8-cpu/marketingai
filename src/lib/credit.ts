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

/**
 * For long-running async jobs (video): charges credits immediately when the
 * job is accepted, before the result is known. Pair with completeGeneration()
 * or refundFailedGeneration() once the job resolves.
 */
export async function reserveCreditsForGeneration({
  userId,
  type,
  title,
  input,
  cost,
}: {
  userId: string;
  type: GenerationType;
  title: string;
  input: Prisma.InputJsonValue;
  cost: number;
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.creditBalance < cost) {
        throw new InsufficientCreditError();
      }

      const generation = await tx.generation.create({
        data: { userId, type, status: "PENDING", title, input, creditCost: cost },
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

export async function completeGeneration({ generationId, content }: { generationId: string; content: string }) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const generation = await tx.generation.findUniqueOrThrow({ where: { id: generationId } });
      if (generation.status !== "PENDING" && generation.status !== "PROCESSING") return generation;

      return tx.generation.update({
        where: { id: generationId },
        data: { status: "COMPLETED", content },
      });
    })
  );
}

export async function markGenerationProcessing(generationId: string) {
  return withDbRetry(() =>
    prisma.generation.updateMany({
      where: { id: generationId, status: "PENDING" },
      data: { status: "PROCESSING" },
    })
  );
}

/**
 * Idempotent: only refunds/marks-failed if the generation hasn't already
 * been finalized, so a concurrent poll can't double-refund.
 */
export async function refundFailedGeneration({
  generationId,
  errorMessage,
}: {
  generationId: string;
  errorMessage: string;
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const generation = await tx.generation.findUniqueOrThrow({ where: { id: generationId } });
      if (generation.status !== "PENDING" && generation.status !== "PROCESSING") return generation;

      await tx.generation.update({
        where: { id: generationId },
        data: { status: "FAILED", errorMessage },
      });

      await tx.creditTransaction.create({
        data: {
          userId: generation.userId,
          amount: generation.creditCost,
          type: "REFUND",
          description: `Refund: ${generation.title}`,
          generationId,
        },
      });

      await tx.user.update({
        where: { id: generation.userId },
        data: { creditBalance: { increment: generation.creditCost } },
      });

      return generation;
    })
  );
}

/**
 * Idempotent: only grants credit if the topup hasn't already been finalized,
 * since Tokopay retries its webhook up to 3x and this must never double-credit.
 */
export async function completeTopup(refId: string) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const topup = await tx.topupTransaction.findUniqueOrThrow({ where: { refId } });
      if (topup.status !== "PENDING") return topup;

      const updated = await tx.topupTransaction.update({
        where: { refId },
        data: { status: "SUCCESS" },
      });

      await tx.creditTransaction.create({
        data: {
          userId: topup.userId,
          amount: topup.credits,
          type: "TOPUP",
          description: `Top up Rp${topup.amountIdr.toLocaleString("id-ID")}`,
        },
      });

      await tx.user.update({
        where: { id: topup.userId },
        data: { creditBalance: { increment: topup.credits } },
      });

      return updated;
    })
  );
}
