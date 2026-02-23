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

export const guddesk = {
  /**
   * Send a BOT reply to a GudDesk conversation.
   * The message appears in the widget and the agent dashboard.
   */
  async reply(
    conversationId: string,
    body: string,
    senderName = "AI Agent",
  ): Promise<{ messageId: string; conversationId: string }> {
    const res = await fetch(`${config.guddesk.url}/api/agent/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.guddesk.apiKey,
      },
      body: JSON.stringify({ conversationId, body, senderName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `GudDesk reply failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    return res.json();
  },

  /**
   * Register (or re-use) a webhook endpoint on GudDesk so this agent
   * receives real-time events without any manual dashboard setup.
   *
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
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Webhook registration failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    return res.json();
  },

  /**
   * Remove this agent's webhook endpoint during graceful shutdown.
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

  /**
   * List published articles from the GudDesk knowledge base.
   * Fetches all articles using cursor pagination.
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
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(
          `List articles failed (${res.status}): ${err.error || "Unknown error"}`,
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
   */
  async getArticle(articleId: string): Promise<GudDeskArticle> {
    const res = await fetch(
      `${config.guddesk.url}/api/v1/articles/${articleId}`,
      {
        headers: { "x-api-key": config.guddesk.apiKey },
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Get article failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    const data = await res.json();
    return data.data;
  },

  /**
   * Create a new article in the GudDesk knowledge base.
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
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Create article failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    const data = await res.json();
    return data.data;
  },

  /**
   * Update an existing article.
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
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Update article failed (${res.status}): ${err.error || "Unknown error"}`,
      );
    }

    const data = await res.json();
    return data.data;
  },
};
