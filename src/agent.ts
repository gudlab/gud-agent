import { generateText, type LanguageModel, type CoreTool } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "./config.js";
import { guddesk } from "./clients/guddesk.js";
import { searchKb, refreshKnowledgeBase } from "./tools/search-kb.js";
import { collectInfo } from "./tools/collect-info.js";
import { checkSlots } from "./tools/check-slots.js";
import { bookMeeting } from "./tools/book-meeting.js";

/**
 * Build system prompt dynamically based on which plugins are enabled.
 */
function buildSystemPrompt(): string {
  const capabilities: string[] = [
    "1. **Answer questions** - Use the search_kb tool to find information from the knowledge base before answering factual questions about the company, products, pricing, or features.",
  ];

  if (config.gudform.enabled) {
    capabilities.push(
      "2. **Collect lead information** - When a visitor is interested and shares their name, email, or company, use the collect_info tool to capture their details as a lead.",
    );
  }

  if (config.gudcal.enabled) {
    capabilities.push(
      `${config.gudform.enabled ? "3" : "2"}. **Check meeting availability** - Use the check_slots tool when someone wants to schedule a demo or meeting.`,
    );
    capabilities.push(
      `${config.gudform.enabled ? "4" : "3"}. **Book meetings** - Use the book_meeting tool to confirm a booking once you have their name, email, and preferred time.`,
    );
  }

  let bookingGuideline = "";
  if (config.gudcal.enabled) {
    bookingGuideline =
      "\n- When someone wants to book a demo: first collect their name and email, then check available slots, let them pick a time, then book it.";
  }

  return `You are a friendly and helpful AI customer agent. Your job is to assist website visitors with their questions and requests.

You have these capabilities:
${capabilities.join("\n")}

Guidelines:
- Be concise but helpful. Keep responses under 3 sentences unless the visitor needs more detail.${bookingGuideline}
- If you don't know something and the knowledge base doesn't have the answer, say so honestly and offer to connect them with a human agent.
- Always use the knowledge base tool before claiming something is or isn't a feature.
- Don't repeat yourself. If you already have the visitor's info, don't ask for it again.
- Be conversational and natural — you're chatting, not writing an essay.`;
}

/**
 * Build tools object based on which plugins are enabled.
 */
function buildTools(): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {
    search_kb: searchKb,
  };

  if (config.gudform.enabled) {
    tools.collect_info = collectInfo;
  }

  if (config.gudcal.enabled) {
    tools.check_slots = checkSlots;
    tools.book_meeting = bookMeeting;
  }

  return tools;
}

const SYSTEM_PROMPT = buildSystemPrompt();
const TOOLS = buildTools();

// Log active capabilities on startup
const activePlugins = [
  "Knowledge Base (search_kb)",
  ...(config.gudform.enabled ? ["Lead Capture (collect_info)"] : []),
  ...(config.gudcal.enabled
    ? ["Scheduling (check_slots, book_meeting)"]
    : []),
];
console.log(`Active tools: ${activePlugins.join(", ")}`);

/**
 * Initialize the agent: refresh KB from GudDesk API (or local fallback).
 * Call this once during server startup before processing messages.
 */
export async function initAgent(): Promise<void> {
  console.log("Initializing knowledge base...");
  try {
    const result = await refreshKnowledgeBase();
    console.log(
      `Knowledge base loaded: ${result.count} sections from ${result.source}`,
    );
  } catch (err) {
    console.warn(
      "KB initialization failed (will retry on first search):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * In-memory conversation history per conversation.
 * In production you'd want Redis or similar, but this works for demos.
 */
const conversationHistory = new Map<
  string,
  { role: "user" | "assistant"; content: string }[]
>();

function getModel(): LanguageModel {
  if (config.llmProvider === "anthropic") {
    return anthropic(config.llmModel);
  }
  return openai(config.llmModel);
}

/**
 * Process an incoming visitor message and send a reply.
 *
 * Skips processing when a human agent is assigned (assigneeId present
 * in the webhook payload) — the human handles the conversation.
 */
export async function processMessage(
  conversationId: string,
  message: string,
  opts?: { visitorEmail?: string; assigneeId?: string | null },
): Promise<void> {
  // Skip if a human agent is assigned to this conversation
  if (opts?.assigneeId) {
    console.log(
      `[${conversationId}] Skipping — human agent assigned (${opts.assigneeId})`,
    );
    return;
  }

  // Show typing indicator in the widget
  await guddesk.sendTyping(conversationId, true);

  // Get or create conversation history
  const history = conversationHistory.get(conversationId) ?? [];
  history.push({ role: "user", content: message });

  try {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: history,
      tools: TOOLS,
      maxSteps: 5,
    });

    // Store assistant response in history
    history.push({ role: "assistant", content: text });
    conversationHistory.set(conversationId, history);

    // Cap history length to prevent unbounded memory growth
    if (history.length > 50) {
      conversationHistory.set(conversationId, history.slice(-30));
    }

    // Send reply back to GudDesk (also stops typing indicator server-side)
    const result = await guddesk.reply(conversationId, text);

    if (result.skipped) {
      console.log(
        `[${conversationId}] Reply skipped by server: ${result.reason}`,
      );
      // Stop typing since the reply was skipped
      await guddesk.sendTyping(conversationId, false);
      return;
    }

    console.log(`[${conversationId}] Replied: ${text.slice(0, 100)}...`);
  } catch (error) {
    console.error(`[${conversationId}] Error processing message:`, error);

    // Stop typing on error
    await guddesk.sendTyping(conversationId, false);

    // Try to send a fallback message
    try {
      await guddesk.reply(
        conversationId,
        "I'm sorry, I ran into an issue processing your request. Let me connect you with a human agent who can help.",
      );
    } catch {
      console.error(`[${conversationId}] Failed to send fallback reply`);
    }
  }
}
