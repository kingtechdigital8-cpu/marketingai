// Shared between the Live TikTok config UI (dropdowns) and the reply-
// generation prompt builder, so labels/values always stay in sync.

export const AI_PURPOSES = [
  { value: "selling", label: "Jualan Produk (Live Selling)" },
  { value: "education", label: "Edukasi & Berbagi Info" },
  { value: "entertainment", label: "Hiburan & Ngobrol Santai" },
  { value: "customer_service", label: "Layanan Pelanggan / Tanya-Jawab" },
  { value: "other", label: "Lainnya" },
] as const;

export type AiPurpose = (typeof AI_PURPOSES)[number]["value"];

export const AI_TONES = [
  { value: "santai", label: "Santai & Gaul" },
  { value: "hangat", label: "Ramah & Hangat" },
  { value: "formal", label: "Formal & Sopan" },
  { value: "energik", label: "Energik & Heboh" },
  { value: "lucu", label: "Lucu & Kocak" },
] as const;

export type AiTone = (typeof AI_TONES)[number]["value"];

export interface PersonaFields {
  aiPurpose: string | null;
  businessName: string | null;
  businessInfo: string | null;
  aiTone: string | null;
  callToAction: string | null;
  avoidTopics: string | null;
  aiContext: string | null;
}

const DEFAULT_PERSONA =
  "Anda adalah asisten host live TikTok yang ramah, dan membantu penonton dengan baik.";

/**
 * Composes the structured settings (purpose, business info, tone, CTA,
 * avoid-list) plus any freeform extra instructions into one persona
 * description for the reply-generation system prompt. Falls back to a
 * generic default only when literally nothing has been filled in.
 */
export function composePersona(fields: PersonaFields): string {
  const purposeLabel = AI_PURPOSES.find((p) => p.value === fields.aiPurpose)?.label;
  const toneLabel = AI_TONES.find((t) => t.value === fields.aiTone)?.label;

  const parts: string[] = [];
  if (purposeLabel) parts.push(`Tujuan live ini: ${purposeLabel}.`);
  if (fields.businessName?.trim()) parts.push(`Nama bisnis/produk: ${fields.businessName.trim()}.`);
  if (fields.businessInfo?.trim()) parts.push(`Info produk/bisnis: ${fields.businessInfo.trim()}`);
  if (toneLabel) parts.push(`Gaya bicara: ${toneLabel}.`);
  if (fields.callToAction?.trim()) {
    parts.push(
      `Kalau relevan (jangan dipaksakan di setiap balasan), arahkan penonton untuk: ${fields.callToAction.trim()}`
    );
  }
  if (fields.avoidTopics?.trim()) parts.push(`Hindari membahas: ${fields.avoidTopics.trim()}.`);
  if (fields.aiContext?.trim()) parts.push(fields.aiContext.trim());

  return parts.length > 0 ? parts.join("\n") : DEFAULT_PERSONA;
}
