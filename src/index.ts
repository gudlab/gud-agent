import crypto from "crypto";

import express from "express";

import { processMessage, initAgent } from "./agent.js";
import { guddesk } from "./clients/guddesk.js";
import { config } from "./config.js";

const app = express();

// We need the raw body for HMAC signature verification
app.use(
  express.json({
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Track the webhook signing secret (set during self-registration)
let webhookSigningSecret: string = config.webhookSecret;

/**
 * Verify the HMAC signature sent by GudDesk in the X-GudDesk-Signature header.
 */
function verifySignature(
  req: express.Request & { rawBody?: Buffer },
): boolean {
  if (!webhookSigningSecret) return true; // No secret configured, skip

  const signature = req.headers["x-guddesk-signature"] as string | undefined;
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", webhookSigningSecret)
    .update(req.rawBody || "")
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

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
app.post("/webhook", (req: express.Request & { rawBody?: Buffer }, res) => {
  // Verify HMAC signature
  if (!verifySignature(req)) {
    console.warn("⚠ Webhook received with invalid signature — rejected");
    res.status(401).json({ error: "Invalid signature" });
    return;
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

// ---------------------------------------------------------------------------
// Start server + auto-register webhook
// ---------------------------------------------------------------------------
const server = app.listen(config.port, async () => {
  const agentUrl = config.agentUrl;

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

  // Auto-register webhook if AGENT_URL is set
  if (agentUrl) {
    const webhookUrl = `${agentUrl.replace(/\/$/, "")}/webhook`;
    try {
      console.log(`  📡 Registering webhook → ${webhookUrl}`);
      const result = await guddesk.registerWebhook(webhookUrl);

      webhookSigningSecret = result.endpoint.secret;

      if (result.status === "created") {
        console.log(`  ✅ Webhook registered (id: ${result.endpoint.id})`);
      } else {
        console.log(`  ✅ Webhook already exists (id: ${result.endpoint.id})`);
      }
      console.log(`  🔐 Signing secret set automatically\n`);
    } catch (err) {
      console.error(`  ❌ Webhook registration failed:`, err);
      console.log(`  ⚠  You'll need to add the webhook manually in GudDesk settings\n`);
    }
  } else {
    console.log(`  ℹ  AGENT_URL not set — skipping webhook auto-registration`);
    console.log(`     Set AGENT_URL to your public URL to enable auto-setup\n`);
  }

  // Load knowledge base from GudDesk API (or local fallback)
  await initAgent();
});

// ---------------------------------------------------------------------------
// Graceful shutdown — unregister webhook
// ---------------------------------------------------------------------------
async function shutdown() {
  console.log("\n  🛑 Shutting down...");

  const agentUrl = config.agentUrl;
  if (agentUrl) {
    const webhookUrl = `${agentUrl.replace(/\/$/, "")}/webhook`;
    try {
      console.log(`  📡 Unregistering webhook → ${webhookUrl}`);
      await guddesk.unregisterWebhook(webhookUrl);
      console.log(`  ✅ Webhook removed`);
    } catch {
      // Best-effort — don't block shutdown
    }
  }

  server.close(() => {
    console.log("  👋 Goodbye!\n");
    process.exit(0);
  });

  // Force exit after 5s if server won't close
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
