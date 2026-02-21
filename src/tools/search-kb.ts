import { tool } from "ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load knowledge base once at startup
let knowledgeBase = "";
try {
  knowledgeBase = readFileSync(
    join(__dirname, "../../knowledge/base.md"),
    "utf-8",
  );
} catch {
  console.warn("Warning: knowledge/base.md not found. KB search will return no results.");
}

/**
 * Split the knowledge base into sections by headings.
 * Each section includes its heading hierarchy for context.
 */
function getSections(): { heading: string; content: string }[] {
  if (!knowledgeBase) return [];

  const sections: { heading: string; content: string }[] = [];
  const lines = knowledgeBase.split("\n");
  let currentHeading = "General";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content) {
          sections.push({ heading: currentHeading, content });
        }
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    const content = currentContent.join("\n").trim();
    if (content) {
      sections.push({ heading: currentHeading, content });
    }
  }

  return sections;
}

/**
 * Simple keyword-based relevance scoring.
 * Scores each section based on how many query terms appear in it.
 */
function scoreSection(
  section: { heading: string; content: string },
  query: string,
): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const text = `${section.heading} ${section.content}`.toLowerCase();

  let score = 0;
  for (const term of terms) {
    // Heading matches count double
    if (section.heading.toLowerCase().includes(term)) score += 2;
    // Count occurrences in content
    const matches = text.split(term).length - 1;
    score += matches;
  }

  return score;
}

export const searchKb = tool({
  description:
    "Search the knowledge base for information to answer customer questions. Use this when the customer asks about the company, products, pricing, features, or anything that might be documented.",
  parameters: z.object({
    query: z
      .string()
      .describe("The search query — what the customer is asking about"),
  }),
  execute: async ({ query }) => {
    const sections = getSections();

    if (sections.length === 0) {
      return {
        found: false,
        message: "Knowledge base is empty. No information available.",
      };
    }

    // Score and rank sections
    const scored = sections
      .map((section) => ({
        ...section,
        score: scoreSection(section, query),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // Top 3 results

    if (scored.length === 0) {
      return {
        found: false,
        message: `No relevant information found for: "${query}"`,
      };
    }

    return {
      found: true,
      results: scored.map((s) => ({
        heading: s.heading,
        content: s.content,
        relevance: s.score,
      })),
    };
  },
});
