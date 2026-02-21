function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  // LLM
  llmProvider: optional("LLM_PROVIDER", "openai") as "openai" | "anthropic",
  llmModel: optional("LLM_MODEL", "gpt-4o-mini"),

  // GudDesk
  guddesk: {
    url: required("GUDDESK_URL"),
    apiKey: required("GUDDESK_API_KEY"),
  },

  // GudCal
  gudcal: {
    url: required("GUDCAL_URL"),
    username: required("GUDCAL_USERNAME"),
    eventSlug: required("GUDCAL_EVENT_SLUG"),
    eventTypeId: required("GUDCAL_EVENT_TYPE_ID"),
  },

  // GudForm
  gudform: {
    url: required("GUDFORM_URL"),
    formId: required("GUDFORM_FORM_ID"),
    fields: {
      name: optional("GUDFORM_FIELD_NAME", ""),
      email: optional("GUDFORM_FIELD_EMAIL", ""),
      company: optional("GUDFORM_FIELD_COMPANY", ""),
      phone: optional("GUDFORM_FIELD_PHONE", ""),
    },
  },

  // Server
  port: parseInt(optional("PORT", "3001"), 10),
  webhookSecret: optional("WEBHOOK_SECRET", ""),
} as const;
