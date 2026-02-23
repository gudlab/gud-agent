import type { CrawledPage } from "./index.js";

/**
 * Convert crawled pages into a structured Markdown knowledge base.
 *
 * The output is organized by page, with each page becoming a section.
 * Pages are sorted by URL depth (homepage first, then shallow pages).
 */
export function generateMarkdown(pages: CrawledPage[], sourceUrl: string): string {
  if (pages.length === 0) {
    return "# Knowledge Base\n\nNo content was found during crawling.\n";
  }

  // Sort: homepage first, then by URL depth (fewer slashes = higher priority)
  const sorted = [...pages].sort((a, b) => {
    const depthA = new URL(a.url).pathname.split("/").filter(Boolean).length;
    const depthB = new URL(b.url).pathname.split("/").filter(Boolean).length;
    return depthA - depthB;
  });

  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    "# Knowledge Base",
    "",
    `> Auto-generated from ${sourceUrl} on ${date}`,
    `> ${pages.length} pages crawled`,
    "",
  ];

  // Deduplicate: track content fingerprints to skip repeated text
  const seenContent = new Set<string>();

  for (const page of sorted) {
    // Create a simple fingerprint from the first 200 chars
    const fingerprint = page.content.slice(0, 200).toLowerCase().replace(/\s+/g, " ");
    if (seenContent.has(fingerprint)) continue;
    seenContent.add(fingerprint);

    // Section heading from page title
    const title = cleanTitle(page.title, sourceUrl);
    lines.push(`## ${title}`);
    lines.push("");
    lines.push(`<!-- Source: ${page.url} -->`);
    lines.push("");

    // Limit content per section to keep KB manageable
    const content = truncateContent(page.content, 2000);
    lines.push(content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Clean up a page title:
 * - Remove common suffix patterns (e.g., "| Company Name", "- Company")
 * - Trim whitespace
 */
function cleanTitle(title: string, sourceUrl: string): string {
  let cleaned = title;

  // Try to extract domain name for suffix removal
  try {
    const hostname = new URL(sourceUrl).hostname.replace("www.", "");
    const domainName = hostname.split(".")[0];

    // Remove common title suffixes
    const suffixPatterns = [
      new RegExp(`\\s*[|\\-\\u2013\\u2014]\\s*${escapeRegex(domainName)}.*$`, "i"),
      /\s*[|\-\u2013\u2014]\s*Home$/i,
    ];

    for (const pattern of suffixPatterns) {
      cleaned = cleaned.replace(pattern, "");
    }
  } catch {
    // Ignore URL parsing errors
  }

  return cleaned.trim() || "Untitled";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Truncate content to a maximum character count, breaking at sentence boundaries.
 */
function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Try to break at a sentence boundary
  const truncated = content.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(". ");
  const lastNewline = truncated.lastIndexOf("\n");

  const breakPoint = Math.max(lastPeriod, lastNewline);
  if (breakPoint > maxChars * 0.5) {
    return truncated.slice(0, breakPoint + 1).trim();
  }

  return truncated.trim() + "...";
}
