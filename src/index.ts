import "dotenv/config";

import crypto from "crypto";

import * as ngrok from "@ngrok/ngrok";
import express from "express";

import { processMessage, initAgent } from "./agent.js";
import { guddesk } from "./clients/guddesk.js";
import { config } from "./config.js";

let ngrokListener: ngrok.Listener | null = null;
/** Set when webhook is registered (from AGENT_URL or ngrok tunnel). Used for unregister on shutdown. */
let registeredWebhookUrl: string | null = null;

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
 * GudDesk sends: X-GudDesk-Signature: sha256=<hex>
 */
function verifySignature(
  req: express.Request & { rawBody?: Buffer },
): boolean {
  if (!webhookSigningSecret) return true; // No secret configured, skip

  const signature = req.headers["x-guddesk-signature"] as string | undefined;
  if (!signature) return false;

  const expectedHex = crypto
    .createHmac("sha256", webhookSigningSecret)
    .update(req.rawBody || "")
    .digest("hex");

  // GudDesk sends "sha256=<hex>", so compare with the same prefix
  const expected = `sha256=${expectedHex}`;

  if (signature.length !== expected.length) return false;

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

  const { conversationId, body, assigneeId } = data;

  if (!conversationId || !body) {
    res.status(400).json({ error: "Missing conversationId or body" });
    return;
  }

  // Respond immediately, process asynchronously
  res.json({ status: "processing" });

  // Fire-and-forget — process in the background
  processMessage(conversationId, body, { assigneeId }).catch((err) => {
    console.error(`Failed to process message for ${conversationId}:`, err);
  });
});

// ---------------------------------------------------------------------------
// Start server + auto-register webhook
// ---------------------------------------------------------------------------
const server = app.listen(config.port, async () => {
  let agentUrl: string | null = config.agentUrl;

  // Start ngrok tunnel if enabled (overrides AGENT_URL with tunnel URL)
  if (config.ngrokEnabled) {
    try {
      if (!process.env.NGROK_AUTHTOKEN) {
        console.error(
          "  ❌ NGROK_ENABLED is set but NGROK_AUTHTOKEN is missing. Get one at https://dashboard.ngrok.com/get-started/your-authtoken",
        );
      } else {
        ngrokListener = await ngrok.forward({
          addr: config.port,
          authtoken_from_env: true,
        });
        const tunnelUrl = ngrokListener.url();
        if (tunnelUrl) {
          agentUrl = tunnelUrl.replace(/\/$/, "");
          console.log(`  🌐 Ngrok tunnel: ${agentUrl}\n`);
        }
      }
    } catch (err) {
      console.error("  ❌ Ngrok failed to start:", err instanceof Error ? err.message : err);
    }
  }

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

  // Auto-register webhook if AGENT_URL is set (or from ngrok)
  if (agentUrl) {
    const webhookUrl = `${agentUrl.replace(/\/$/, "")}/webhook`;
    registeredWebhookUrl = webhookUrl;
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
      registeredWebhookUrl = null;
    }
  } else {
    console.log(`  ℹ  AGENT_URL not set — skipping webhook auto-registration`);
    console.log(`     Set AGENT_URL or NGROK_ENABLED=true (with NGROK_AUTHTOKEN) to enable auto-setup\n`);
  }

  // Load knowledge base from GudDesk API (or local fallback)
  await initAgent();
});

// ---------------------------------------------------------------------------
// Graceful shutdown — unregister webhook
// ---------------------------------------------------------------------------
async function shutdown() {
  console.log("\n  🛑 Shutting down...");

  if (ngrokListener) {
    try {
      await ngrokListener.close();
      console.log("  ✅ Ngrok tunnel closed");
    } catch {
      // best-effort
    }
    ngrokListener = null;
  }

  if (registeredWebhookUrl) {
    try {
      console.log(`  📡 Unregistering webhook → ${registeredWebhookUrl}`);
      await guddesk.unregisterWebhook(registeredWebhookUrl);
      console.log(`  ✅ Webhook removed`);
    } catch {
      // Best-effort — don't block shutdown
    }
    registeredWebhookUrl = null;
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
