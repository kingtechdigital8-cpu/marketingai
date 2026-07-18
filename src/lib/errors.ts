export class ProviderNotConfiguredError extends Error {}

export class ContentPolicyViolationError extends Error {}

/** The AI provider account itself is out of quota/balance (not a config or app bug). */
export class ProviderBillingError extends Error {}
