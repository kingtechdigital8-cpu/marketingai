import { Prisma } from "@prisma/client";
import { resetPrismaClient } from "@/lib/prisma";

const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function errorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function isRetryable(err: unknown): boolean {
  const code = errorCode(err);
  return code !== undefined && RETRYABLE_CODES.has(code);
}

const BACKOFF_MS = [500, 1500, 3000, 5000];

export async function withDbRetry<T>(fn: () => Promise<T>, retries = BACKOFF_MS.length): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const code = errorCode(err);
      if (!isRetryable(err) || attempt === retries) {
        console.error(
          `[withDbRetry] giving up after attempt ${attempt + 1}/${retries + 1} (code: ${code ?? "unknown"})`
        );
        throw err;
      }
      const delay = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      console.warn(
        `[withDbRetry] attempt ${attempt + 1}/${retries + 1} failed (code: ${code}), replacing Prisma client and retrying in ${delay}ms...`
      );
      // A client stuck in a bad connection state won't heal via $disconnect()/$connect()
      // on itself — replace the client instance entirely before retrying.
      await resetPrismaClient();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Call this right after a slow external call (AI generation, future R2 upload, etc.)
 * and before the DB write that follows it. If the long external call left the
 * cached Prisma client's connection in a bad state, a plain $disconnect()/$connect()
 * on that same instance doesn't reliably recover it — so this replaces the client
 * outright, guaranteeing the write that follows starts from a clean instance.
 */
export async function ensureDbConnection(): Promise<void> {
  await resetPrismaClient();
}
