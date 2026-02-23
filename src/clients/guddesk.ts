import { config } from "../config.js";

interface WebhookRegistrationResult {
  status: "created" | "exists";
  endpoint: {
    id: string;
    url: string;
    secret: string;
    isEnabled: boolean;
  };
}

export interface GudDeskArticle {
  id: string;
  title: string;
  slug: string;
  body?: string;
  excerpt: string | null;
  isPublished: boolean;
  collection: { id: string; name: string; slug: string } | null;
}

interface ArticleListResponse {
  data: GudDeskArticle[];
  meta: { total: number; limit: number; cursor: string | null };
}

/**
 * Extract a human-readable error message from a GudDesk API error response.
 * GudDesk errors use the shape: { error: { code, message } }
 */
async function extractErrorMessage(
  res: Response,
  fallbackPrefix: string,
): Promise<string> {
  try {
    const body = await res.json();
    // Standard GudDesk error shape: { error: { code, message } }
    if (body?.error?.message) return `${fallbackPrefix} (${res.status}): ${body.error.message}`;
    // Legacy shape: { error: "string" }
    if (typeof body?.error === "string") return `${fallbackPrefix} (${res.status}): ${body.error}`;
    // Anything else
    if (typeof body?.message === "string") return `${fallbackPrefix} (${res.status}): ${body.message}`;
    return `${fallbackPrefix} (${res.status}): ${JSON.stringify(body)}`;
  } catch {
    return `${fallbackPrefix} (${res.status})`;
  }
}

export interface ReplyResult {
  messageId?: string;
  conversationId: string;
  skipped?: boolean;
  reason?: "conversation_assigned" | "conversation_closed";
}

export const guddesk = {
  /**
   * Send a BOT reply to a GudDesk conversation.
   *
   * Returns `{ skipped: true, reason }` if the conversation is assigned
   * to a human agent or is closed — the bot should back off.
   */
  async reply(
    conversationId: string,
    body: string,
    senderName = "AI Agent",
  ): Promise<ReplyResult> {
    const res = await fetch(`${config.guddesk.url}/api/agent/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.guddesk.apiKey,
      },
      body: JSON.stringify({ conversationId, body, senderName }),
    });

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "GudDesk reply failed"));
    }

    // GudDesk API wraps responses in { data: ... }
    const json = await res.json();
    return json.data ?? json;
  },

  /**
   * Send a typing indicator to the widget for a conversation.
   * Call with typing=true before processing, typing=false after replying.
   */
  async sendTyping(
    conversationId: string,
    typing: boolean,
  ): Promise<void> {
    try {
      await fetch(`${config.guddesk.url}/api/agent/typing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.guddesk.apiKey,
        },
        body: JSON.stringify({ conversationId, typing }),
      });
    } catch {
      // Best-effort — don't fail message processing if typing fails
    }
  },

  /**
   * Register (or re-use) a webhook endpoint on GudDesk so this agent
   * receives real-time events without any manual dashboard setup.
   *
   * Requires FULL_ACCESS API key permission.
   * Returns the signing secret so we can verify incoming payloads.
   */
  async registerWebhook(
    webhookUrl: string,
  ): Promise<WebhookRegistrationResult> {
    const res = await fetch(`${config.guddesk.url}/api/agent/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.guddesk.apiKey,
      },
      body: JSON.stringify({
        url: webhookUrl,
        description: "gud-agent (auto-registered)",
        events: {
          onMessageCreated: true,
          onConversationCreated: true,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(
        await extractErrorMessage(res, "Webhook registration failed"),
      );
    }

    // GudDesk API wraps responses in { data: ... }
    const json = await res.json();
    return json.data ?? json;
  },

  /**
   * Remove this agent's webhook endpoint during graceful shutdown.
   * Requires FULL_ACCESS API key permission.
   */
  async unregisterWebhook(webhookUrl: string): Promise<void> {
    const res = await fetch(`${config.guddesk.url}/api/agent/webhooks`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.guddesk.apiKey,
      },
      body: JSON.stringify({ url: webhookUrl }),
    });

    if (!res.ok) {
      console.warn(`Webhook unregistration failed (${res.status})`);
    }
  },

  // ── Knowledge Base / Articles API ─────────────────────
  // Articles require READ_ONLY (list/get) or READ_WRITE (create/update).

  /**
   * List published articles from the GudDesk knowledge base.
   * Fetches all articles using cursor pagination.
   * Requires READ_ONLY or higher.
   */
  async listArticles(opts?: {
    published?: boolean;
    limit?: number;
  }): Promise<GudDeskArticle[]> {
    const articles: GudDeskArticle[] = [];
    let cursor: string | null = null;
    const limit = opts?.limit ?? 100;
    const published = opts?.published ?? true;

    do {
      const params = new URLSearchParams();
      params.set("published", String(published));
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `${config.guddesk.url}/api/v1/articles?${params}`,
        {
          headers: { "x-api-key": config.guddesk.apiKey },
        },
      );

      if (!res.ok) {
        throw new Error(
          await extractErrorMessage(res, "List articles failed"),
        );
      }

      const data: ArticleListResponse = await res.json();
      articles.push(...data.data);
      cursor = data.meta.cursor;
    } while (cursor);

    return articles;
  },

  /**
   * Get a single article by ID (includes full body).
   * Requires READ_ONLY or higher.
   */
  async getArticle(articleId: string): Promise<GudDeskArticle> {
    const res = await fetch(
      `${config.guddesk.url}/api/v1/articles/${articleId}`,
      {
        headers: { "x-api-key": config.guddesk.apiKey },
      },
    );

    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Get article failed"));
    }

    const data = await res.json();
    return data.data;
  },

  /**
   * Create a new article in the GudDesk knowledge base.
   * Requires READ_WRITE or higher.
   */
  async createArticle(article: {
    title: string;
    slug?: string;
    body: string;
    excerpt?: string;
    isPublished?: boolean;
  }): Promise<GudDeskArticle> {
    const res = await fetch(`${config.guddesk.url}/api/v1/articles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.guddesk.apiKey,
      },
      body: JSON.stringify(article),
    });

    if (!res.ok) {
      throw new Error(
        await extractErrorMessage(res, "Create article failed"),
      );
    }

    const data = await res.json();
    return data.data;
  },

  /**
   * Update an existing article.
   * Requires READ_WRITE or higher.
   */
  async updateArticle(
    articleId: string,
    update: {
      title?: string;
      body?: string;
      excerpt?: string;
      isPublished?: boolean;
    },
  ): Promise<GudDeskArticle> {
    const res = await fetch(
      `${config.guddesk.url}/api/v1/articles/${articleId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.guddesk.apiKey,
        },
        body: JSON.stringify(update),
      },
    );

    if (!res.ok) {
      throw new Error(
        await extractErrorMessage(res, "Update article failed"),
      );
    }

    const data = await res.json();
    return data.data;
  },
};
