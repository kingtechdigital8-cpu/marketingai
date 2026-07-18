import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ProviderNotConfiguredError } from "@/lib/errors";

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new ProviderNotConfiguredError(
      "Penyimpanan Cloudflare R2 belum dikonfigurasi di server."
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

let cachedClient: { client: S3Client; accountId: string } | null = null;

function getR2Client(accountId: string, accessKeyId: string, secretAccessKey: string) {
  if (cachedClient && cachedClient.accountId === accountId) return cachedClient.client;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  cachedClient = { client, accountId };
  return client;
}

export async function uploadToR2(buffer: Buffer, key: string, contentType: string): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = getR2Config();
  const client = getR2Client(accountId, accessKeyId, secretAccessKey);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}

/**
 * Fetches a (possibly time-limited) file from an external URL and re-uploads
 * it to our own R2 bucket, so generated assets don't depend on a third-party
 * provider's URL staying valid indefinitely.
 */
export async function downloadAndUploadToR2(sourceUrl: string, key: string, contentType: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Gagal mengunduh aset dari ${sourceUrl} (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadToR2(buffer, key, contentType);
}
