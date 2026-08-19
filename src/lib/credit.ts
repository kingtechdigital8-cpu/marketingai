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

export async function completeGeneration({
  generationId,
  content,
  socialCaption,
}: {
  generationId: string;
  content: string;
  socialCaption?: string | null;
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      // Atomic guarded update — not a read-then-write — so two concurrent callers
      // (e.g. two browser tabs polling the same job) can't both pass a status
      // check taken from a stale snapshot. InnoDB re-evaluates this WHERE against
      // the latest committed row when the update executes, so only one write wins.
      await tx.generation.updateMany({
        where: { id: generationId, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "COMPLETED", content, ...(socialCaption !== undefined ? { socialCaption } : {}) },
      });
      return tx.generation.findUniqueOrThrow({ where: { id: generationId } });
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
 * been finalized, so a concurrent poll can't double-refund. Uses an atomic
 * guarded update (not read-then-write) — see completeGeneration() for why
 * that distinction matters under concurrent callers.
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
      const result = await tx.generation.updateMany({
        where: { id: generationId, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "FAILED", errorMessage },
      });

      const generation = await tx.generation.findUniqueOrThrow({ where: { id: generationId } });
      if (result.count === 0) return generation;

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
 * Charges the (transcription + moment-search) cost immediately when a video-clip
 * analysis batch is created — this work always happens regardless of how many
 * clips the user ends up selecting in the follow-up step, so it's fair to bill
 * it up front rather than reserving/refunding it the way per-clip generation does.
 */
export async function reserveCreditsForVideoClipBatch({
  userId,
  sourceLabel,
  sourceVideoKey,
  momentQuery,
  requestedCount,
  aspectRatio,
  headlineEnabled,
  headlineFont,
  headlineColor,
  headlineBackground,
  headlineAnimation,
  subtitleEnabled,
  subtitleFont,
  subtitleColor,
  subtitleBackground,
  subtitleAnimation,
  effectPreset,
  socialCaptionEnabled,
  brandKit,
  typography,
  captionStyle,
  durationSeconds,
  cost,
}: {
  userId: string;
  sourceLabel: string;
  sourceVideoKey: string | null;
  momentQuery: string;
  requestedCount: number;
  aspectRatio: string;
  headlineEnabled: boolean;
  headlineFont: string;
  headlineColor: string;
  headlineBackground: string;
  headlineAnimation: string;
  subtitleEnabled: boolean;
  subtitleFont: string;
  subtitleColor: string;
  subtitleBackground: string;
  subtitleAnimation: string;
  effectPreset: string | null;
  socialCaptionEnabled: boolean;
  brandKit: {
    fitMode: string;
    smartCropEnabled: boolean;
    overlayLogoKey: string | null;
    overlayLogoPosition: string;
    overlayCtaText: string | null;
    introKey: string | null;
    outroKey: string | null;
    musicKey: string | null;
    musicVolumePercent: number;
    removeFillerWords: boolean;
    removePauses: boolean;
    autoTransitions: boolean;
  };
  typography: {
    headlineBold: boolean;
    headlineItalic: boolean;
    headlineAlign: string;
    headlineFontScale: number;
    headlinePosition: string;
    headlinePositionX: number;
    headlinePositionY: number;
    subtitleBold: boolean;
    subtitleItalic: boolean;
    subtitleUnderline: boolean;
    subtitleAlign: string;
    subtitleFontScale: number;
  };
  captionStyle: {
    subtitleUppercase: boolean;
    subtitleHighlightColor: string;
    subtitleStrokeColor: string;
    subtitleStrokeWidth: number;
    subtitleShadowEnabled: boolean;
    subtitleShadowOffsetX: number;
    subtitleShadowOffsetY: number;
    subtitlePosition: string;
    subtitlePositionX: number;
    subtitlePositionY: number;
    subtitleLineMode: string;
  };
  durationSeconds: number;
  cost: number;
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.creditBalance < cost) {
        throw new InsufficientCreditError();
      }

      const batch = await tx.videoClipBatch.create({
        data: {
          userId,
          sourceLabel,
          sourceVideoKey,
          momentQuery,
          requestedCount,
          aspectRatio,
          headlineEnabled,
          headlineFont,
          headlineColor,
          headlineBackground,
          headlineAnimation,
          subtitleEnabled,
          subtitleFont,
          subtitleColor,
          subtitleBackground,
          subtitleAnimation,
          effectPreset,
          socialCaptionEnabled,
          ...brandKit,
          ...typography,
          ...captionStyle,
          durationSeconds,
          analysisCreditCost: cost,
          status: "PENDING",
        },
      });

      await tx.creditTransaction.create({
        data: { userId, amount: -cost, type: "USAGE", description: `Analisis video: ${sourceLabel}` },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { creditBalance: { decrement: cost } },
      });

      return { batch, creditBalance: updatedUser.creditBalance };
    })
  );
}

export async function markVideoClipBatchStatus(
  batchId: string,
  status: "TRANSCRIBING" | "FINDING_MOMENTS"
) {
  return withDbRetry(() =>
    prisma.videoClipBatch.updateMany({
      where: { id: batchId, status: { in: ["PENDING", "TRANSCRIBING", "FINDING_MOMENTS"] } },
      data: { status },
    })
  );
}

export async function completeVideoClipAnalysis({
  batchId,
  moments,
  transcript,
}: {
  batchId: string;
  moments: Prisma.InputJsonValue;
  transcript: Prisma.InputJsonValue;
}) {
  return withDbRetry(() =>
    prisma.videoClipBatch.updateMany({
      where: { id: batchId, status: { in: ["PENDING", "TRANSCRIBING", "FINDING_MOMENTS"] } },
      data: { status: "MOMENTS_FOUND", moments, transcript },
    })
  );
}

/**
 * Idempotent, same atomic-guard reasoning as refundFailedGeneration — a batch's
 * analysis charge isn't a Generation row, so it needs its own refund path.
 */
export async function refundVideoClipBatch({ batchId, errorMessage }: { batchId: string; errorMessage: string }) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const result = await tx.videoClipBatch.updateMany({
        where: { id: batchId, status: { in: ["PENDING", "TRANSCRIBING", "FINDING_MOMENTS"] } },
        data: { status: "FAILED", errorMessage },
      });

      const batch = await tx.videoClipBatch.findUniqueOrThrow({ where: { id: batchId } });
      if (result.count === 0) return batch;

      await tx.creditTransaction.create({
        data: {
          userId: batch.userId,
          amount: batch.analysisCreditCost,
          type: "REFUND",
          description: `Refund: Analisis video ${batch.sourceLabel}`,
        },
      });

      await tx.user.update({
        where: { id: batch.userId },
        data: { creditBalance: { increment: batch.analysisCreditCost } },
      });

      return batch;
    })
  );
}

export const TOPUP_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Flips a single PENDING topup to EXPIRED if it's older than the payment
 * window. No-op (count: 0) if it's already been finalized or isn't stale yet.
 * Callers must verify with Tokopay first (checkOrderStatus) and only call
 * this if that check didn't find a success — otherwise a late webhook or a
 * payment made right at the edge of the window gets discarded for good.
 */
export async function expireStaleTopup(refId: string) {
  return withDbRetry(() =>
    prisma.topupTransaction.updateMany({
      where: {
        refId,
        status: "PENDING",
        createdAt: { lt: new Date(Date.now() - TOPUP_EXPIRY_MS) },
      },
      data: { status: "EXPIRED" },
    })
  );
}

/** refIds of a user's PENDING topups old enough to be expiry candidates — read-only, no mutation. */
export async function findStaleTopupRefIds(userId: string): Promise<string[]> {
  const rows = await prisma.topupTransaction.findMany({
    where: {
      userId,
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - TOPUP_EXPIRY_MS) },
    },
    select: { refId: true },
  });
  return rows.map((r) => r.refId);
}

/**
 * Idempotent: only grants credit if the topup hasn't already been finalized,
 * since Tokopay retries its webhook up to 3x and this must never double-credit.
 * Uses an atomic guarded update (not read-then-write) — a plain SELECT-then-
 * check under Prisma's default transaction isolation doesn't lock the row,
 * so two concurrent callers (webhook retry racing a frontend poll) could
 * otherwise both pass the status check and both grant credit.
 */
export async function completeTopup(refId: string) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const result = await tx.topupTransaction.updateMany({
        where: { refId, status: "PENDING" },
        data: { status: "SUCCESS" },
      });

      const topup = await tx.topupTransaction.findUniqueOrThrow({ where: { refId } });
      if (result.count === 0) return topup;

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

      return topup;
    })
  );
}
