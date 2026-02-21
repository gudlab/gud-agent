import express from "express";
import { config } from "./config.js";
import { processMessage } from "./agent.js";

const app = express();
app.use(express.json());

/**
 * Health check endpoint
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: "gud-agent" });
});

/**
 * Webhook endpoint — receives events from GudDesk.
 *
 * GudDesk sends a POST request whenever a new visitor message is created.
 * The agent processes the message and replies via the GudDesk API.
 */
app.post("/webhook", (req, res) => {
  // Validate webhook secret if configured
  if (config.webhookSecret) {
    const secret = req.headers["x-webhook-secret"];
    if (secret !== config.webhookSecret) {
      console.warn("Webhook received with invalid secret");
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }
  }

  const { event, data } = req.body;

  // Only process new visitor messages
  if (event !== "message.created" || data?.type !== "VISITOR") {
    res.json({ status: "ignored" });
    return;
  }

  const { conversationId, body, visitorEmail } = data;

  if (!conversationId || !body) {
    res.status(400).json({ error: "Missing conversationId or body" });
    return;
  }

  // Respond immediately, process asynchronously
  res.json({ status: "processing" });

  // Fire-and-forget — process in the background
  processMessage(conversationId, body, visitorEmail).catch((err) => {
    console.error(`Failed to process message for ${conversationId}:`, err);
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │                                         │
  │   🤖 gud-agent is running!              │
  │                                         │
  │   Port: ${String(config.port).padEnd(33)}│
  │   Provider: ${config.llmProvider.padEnd(29)}│
  │   Model: ${config.llmModel.padEnd(32)}│
  │                                         │
  │   Webhook: POST http://localhost:${String(config.port).padEnd(7)}│
  │            /webhook                     │
  │                                         │
  └─────────────────────────────────────────┘
  `);
});
