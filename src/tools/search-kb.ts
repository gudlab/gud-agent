import { tool } from "ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { guddesk, type GudDeskArticle } from "../clients/guddesk.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Knowledge sections cache ──────────────────────────
interface KBSection {
  heading: string;
  content: string;
  source: "api" | "local";
}

let sections: KBSection[] = [];
let lastRefresh = 0;

/**
 * Refresh the knowledge base from GudDesk API.
 * Falls back to the local markdown file if the API is unreachable.
 */
export async function refreshKnowledgeBase(): Promise<{
  source: "api" | "local";
  count: number;
}> {
  try {
    const articles = await guddesk.listArticles({ published: true });

    if (articles.length > 0) {
      sections = articlesToSections(articles);
      lastRefresh = Date.now();
      return { source: "api", count: sections.length };
    }
  } catch (err) {
    console.warn(
      "KB refresh from API failed, falling back to local file:",
      err instanceof Error ? err.message : err,
    );
  }

  // Fallback: load from local markdown file
  const localSections = loadLocalKnowledgeBase();
  if (localSections.length > 0) {
    sections = localSections;
    lastRefresh = Date.now();
    return { source: "local", count: sections.length };
  }

  return { source: "local", count: 0 };
}

/**
 * Convert GudDesk articles into searchable KB sections.
 * Each article becomes one section; long articles are split by headings.
 */
function articlesToSections(articles: GudDeskArticle[]): KBSection[] {
  const result: KBSection[] = [];

  for (const article of articles) {
    const body = article.body ?? "";

    if (!body.trim()) {
      // Article with no body — just use excerpt
      if (article.excerpt) {
        result.push({
          heading: article.title,
          content: article.excerpt,
          source: "api",
        });
      }
      continue;
    }

    // Split article body by headings (##, ###)
    const lines = body.split("\n");
    let currentHeading = article.title;
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)/);
      if (headingMatch) {
        // Save previous section
        if (currentContent.length > 0) {
          const content = currentContent.join("\n").trim();
          if (content) {
            result.push({
              heading: currentHeading,
              content,
              source: "api",
            });
          }
        }
        currentHeading = `${article.title} > ${headingMatch[1]}`;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentContent.length > 0) {
      const content = currentContent.join("\n").trim();
      if (content) {
        result.push({
          heading: currentHeading,
          content,
          source: "api",
        });
      }
    }
  }

  return result;
}

/**
 * Load knowledge base from local markdown file (fallback).
 */
function loadLocalKnowledgeBase(): KBSection[] {
  try {
    const markdown = readFileSync(
      join(__dirname, "../../knowledge/base.md"),
      "utf-8",
    );
    return parseMarkdownSections(markdown);
  } catch {
    return [];
  }
}

/**
 * Split markdown content into sections by headings.
 */
function parseMarkdownSections(markdown: string): KBSection[] {
  if (!markdown) return [];

  const result: KBSection[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "General";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content) {
          result.push({ heading: currentHeading, content, source: "local" });
        }
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    const content = currentContent.join("\n").trim();
    if (content) {
      result.push({ heading: currentHeading, content, source: "local" });
    }
  }

  return result;
}

/**
 * Simple keyword-based relevance scoring.
 * Scores each section based on how many query terms appear in it.
 */
function scoreSection(section: KBSection, query: string): number {
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

// ── Refresh interval: auto-refresh every 5 minutes ────
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const searchKb = tool({
  description:
    "Search the knowledge base for information to answer customer questions. Use this when the customer asks about the company, products, pricing, features, or anything that might be documented.",
  parameters: z.object({
    query: z
      .string()
      .describe("The search query — what the customer is asking about"),
  }),
  execute: async ({ query }) => {
    // Auto-refresh if stale (>5min since last refresh)
    if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
      try {
        await refreshKnowledgeBase();
      } catch {
        // Non-fatal — use whatever sections we have cached
      }
    }

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
