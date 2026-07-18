"use client";

import { useEffect, useState } from "react";

export interface CreditCosts {
  SEO_KEYWORDS: number;
  SEO_META: number;
  SEO_ARTICLE: number;
  IMAGE_GENERATION: number;
  VIDEO_GENERATION: number;
  VOICE_DUB: number;
}

const FALLBACK: CreditCosts = {
  SEO_KEYWORDS: 0,
  SEO_META: 0,
  SEO_ARTICLE: 0,
  IMAGE_GENERATION: 0,
  VIDEO_GENERATION: 0,
  VOICE_DUB: 0,
};

/**
 * Fetches the current admin-configured credit costs (provider base cost +
 * markup%) for the pre-submit cost badge / balance check. This is a display
 * estimate for variable-provider-count types (e.g. SEO tools that call
 * Serper a variable number of times) — the exact amount charged is always
 * computed server-side from the calls actually made.
 */
export function useCreditCosts(): CreditCosts {
  const [costs, setCosts] = useState<CreditCosts>(FALLBACK);

  useEffect(() => {
    fetch("/api/credit-costs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCosts(data);
      })
      .catch(() => {});
  }, []);

  return costs;
}
