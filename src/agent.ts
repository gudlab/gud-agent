import { generateText, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "./config.js";
import { guddesk } from "./clients/guddesk.js";
import { searchKb } from "./tools/search-kb.js";
import { collectInfo } from "./tools/collect-info.js";
import { checkSlots } from "./tools/check-slots.js";
import { bookMeeting } from "./tools/book-meeting.js";

const SYSTEM_PROMPT = `You are a friendly and helpful AI customer agent. Your job is to assist website visitors with their questions and requests.

You have these capabilities:
1. **Answer questions** — Use the search_kb tool to find information from the knowledge base before answering factual questions about the company, products, pricing, or features.
2. **Collect lead information** — When a visitor is interested and shares their name, email, or company, use the collect_info tool to capture their details as a lead.
3. **Check meeting availability** — Use the check_slots tool when someone wants to schedule a demo or meeting.
4. **Book meetings** — Use the book_meeting tool to confirm a booking once you have their name, email, and preferred time.

Guidelines:
- Be concise but helpful. Keep responses under 3 sentences unless the visitor needs more detail.
- When someone wants to book a demo: first collect their name and email, then check available slots, let them pick a time, then book it.
- If you don't know something and the knowledge base doesn't have the answer, say so honestly and offer to connect them with a human agent.
- Always use the knowledge base tool before claiming something is or isn't a feature.
- Don't repeat yourself. If you already have the visitor's info, don't ask for it again.
- Be conversational and natural — you're chatting, not writing an essay.`;

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
 */
export async function processMessage(
  conversationId: string,
  message: string,
  _visitorEmail?: string,
): Promise<void> {
  // Get or create conversation history
  const history = conversationHistory.get(conversationId) ?? [];
  history.push({ role: "user", content: message });

  try {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: history,
      tools: {
        search_kb: searchKb,
        collect_info: collectInfo,
        check_slots: checkSlots,
        book_meeting: bookMeeting,
      },
      maxSteps: 5,
    });

    // Store assistant response in history
    history.push({ role: "assistant", content: text });
    conversationHistory.set(conversationId, history);

    // Cap history length to prevent unbounded memory growth
    if (history.length > 50) {
      conversationHistory.set(conversationId, history.slice(-30));
    }

    // Send reply back to GudDesk
    await guddesk.reply(conversationId, text);

    console.log(`[${conversationId}] Replied: ${text.slice(0, 100)}...`);
  } catch (error) {
    console.error(`[${conversationId}] Error processing message:`, error);

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
