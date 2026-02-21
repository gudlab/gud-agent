import { config } from "../config.js";

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
};
