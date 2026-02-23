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

function optionalOrNull(name: string): string | null {
  return process.env[name] || null;
}

// GudCal is enabled only when all required vars are set
const gudcalUrl = optionalOrNull("GUDCAL_URL");
const gudcalUsername = optionalOrNull("GUDCAL_USERNAME");
const gudcalEventSlug = optionalOrNull("GUDCAL_EVENT_SLUG");
const gudcalEventTypeId = optionalOrNull("GUDCAL_EVENT_TYPE_ID");
const gudcalEnabled = !!(gudcalUrl && gudcalUsername && gudcalEventSlug && gudcalEventTypeId);

// GudForm is enabled only when URL and form ID are set
const gudformUrl = optionalOrNull("GUDFORM_URL");
const gudformFormId = optionalOrNull("GUDFORM_FORM_ID");
const gudformEnabled = !!(gudformUrl && gudformFormId);

const port = parseInt(optional("PORT", "3001"), 10);

export const config = {
  // LLM
  llmProvider: optional("LLM_PROVIDER", "openai") as "openai" | "anthropic",
  llmModel: optional("LLM_MODEL", "gpt-4o-mini"),

  // GudDesk (API key required, URL defaults to hosted platform)
  // Self-hosted users can override with GUDDESK_URL
  guddesk: {
    url: optional("GUDDESK_URL", "https://guddesk.com"),
    apiKey: required("GUDDESK_API_KEY"),
  },

  // GudCal (optional — scheduling plugin)
  gudcal: {
    enabled: gudcalEnabled,
    url: gudcalUrl ?? "",
    username: gudcalUsername ?? "",
    eventSlug: gudcalEventSlug ?? "",
    eventTypeId: gudcalEventTypeId ?? "",
  },

  // GudForm (optional — lead capture plugin)
  gudform: {
    enabled: gudformEnabled,
    url: gudformUrl ?? "",
    formId: gudformFormId ?? "",
    fields: {
      name: optional("GUDFORM_FIELD_NAME", ""),
      email: optional("GUDFORM_FIELD_EMAIL", ""),
      company: optional("GUDFORM_FIELD_COMPANY", ""),
      phone: optional("GUDFORM_FIELD_PHONE", ""),
    },
  },

  // Server
  port,
  webhookSecret: optional("WEBHOOK_SECRET", ""),

  // Public URL of this agent (for webhook auto-registration)
  agentUrl: optionalOrNull("AGENT_URL"),
} as const;
