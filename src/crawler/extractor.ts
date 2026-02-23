import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface ExtractedContent {
  title: string;
  content: string;
}

/**
 * Extract readable text content from raw HTML using Mozilla Readability.
 * Falls back to basic text extraction if Readability can't parse the page.
 */
export function extractContent(html: string, url: string): ExtractedContent | null {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Try Readability first — it does an excellent job of extracting article content
    const reader = new Readability(doc);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 50) {
      return {
        title: article.title || getTitleFromDom(doc),
        content: cleanText(article.textContent),
      };
    }

    // Fallback: extract from main content areas manually
    return extractFallback(doc, url);
  } catch {
    return null;
  }
}

/**
 * Fallback extraction when Readability fails.
 * Targets common content areas and strips navigation/boilerplate.
 */
function extractFallback(doc: Document, _url: string): ExtractedContent | null {
  // Remove non-content elements
  const removeSelectors = [
    "script", "style", "nav", "footer", "header",
    ".nav", ".navbar", ".footer", ".sidebar", ".menu",
    ".cookie-banner", ".popup", ".modal", ".ad",
    "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  ];

  for (const selector of removeSelectors) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }

  // Try common content selectors
  const contentSelectors = [
    "main", "article", "[role='main']",
    ".content", ".page-content", ".main-content",
    "#content", "#main", "#main-content",
  ];

  for (const selector of contentSelectors) {
    const el = doc.querySelector(selector);
    if (el && el.textContent && el.textContent.trim().length > 50) {
      return {
        title: getTitleFromDom(doc),
        content: cleanText(el.textContent),
      };
    }
  }

  // Last resort: use body text
  const bodyText = doc.body?.textContent?.trim();
  if (bodyText && bodyText.length > 100) {
    return {
      title: getTitleFromDom(doc),
      content: cleanText(bodyText),
    };
  }

  return null;
}

function getTitleFromDom(doc: Document): string {
  // Try og:title, then <title>, then first h1
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  if (ogTitle) return ogTitle.trim();

  const titleEl = doc.querySelector("title");
  if (titleEl?.textContent) return titleEl.textContent.trim();

  const h1 = doc.querySelector("h1");
  if (h1?.textContent) return h1.textContent.trim();

  return "Untitled";
}

/**
 * Clean up extracted text:
 * - Collapse multiple blank lines
 * - Trim whitespace
 * - Remove excessive spaces within lines
 */
function cleanText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
