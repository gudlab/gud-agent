import * as cheerio from "cheerio";
import { extractContent, type ExtractedContent } from "./extractor.js";

export interface CrawlOptions {
  maxPages: number;
  exclude: string[];
  delayMs: number;
}

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
}

const DEFAULT_OPTIONS: CrawlOptions = {
  maxPages: 20,
  exclude: [],
  delayMs: 200,
};

// Paths to always skip
const SKIP_PATHS = [
  "/api", "/admin", "/login", "/signin", "/signup", "/register",
  "/static", "/assets", "/_next", "/.well-known",
  "/cdn-cgi", "/wp-admin", "/wp-json",
];

// File extensions to skip
const SKIP_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
  ".pdf", ".zip", ".tar", ".gz",
  ".css", ".js", ".map",
  ".xml", ".json", ".rss", ".atom",
  ".mp3", ".mp4", ".wav", ".avi", ".mov",
  ".woff", ".woff2", ".ttf", ".eot",
];

/**
 * Crawl a website starting from the given URL.
 * Uses BFS to discover internal pages, extracts readable content from each.
 */
export async function crawlSite(
  startUrl: string,
  options: Partial<CrawlOptions> = {},
): Promise<CrawledPage[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const baseUrl = new URL(startUrl);
  const origin = baseUrl.origin;

  const visited = new Set<string>();
  const queue: string[] = [normalizeUrl(startUrl)];
  const pages: CrawledPage[] = [];

  console.log(`\nCrawling ${origin}...`);
  console.log(`Max pages: ${opts.maxPages}`);
  if (opts.exclude.length > 0) {
    console.log(`Excluding: ${opts.exclude.join(", ")}`);
  }
  console.log("");

  while (queue.length > 0 && pages.length < opts.maxPages) {
    const url = queue.shift()!;
    const normalized = normalizeUrl(url);

    if (visited.has(normalized)) continue;
    visited.add(normalized);

    // Check skip rules
    if (shouldSkipUrl(normalized, origin, opts.exclude)) continue;

    try {
      // Polite delay between requests
      if (pages.length > 0) {
        await sleep(opts.delayMs);
      }

      const result = await fetchPage(normalized);
      if (!result) continue;

      const { html, contentType } = result;

      // Only process HTML pages
      if (!contentType.includes("text/html")) continue;

      // Extract readable content
      const extracted = extractContent(html, normalized);
      if (!extracted || extracted.content.length < 50) {
        console.log(`  Skip (no content): ${normalized}`);
        continue;
      }

      pages.push({
        url: normalized,
        title: extracted.title,
        content: extracted.content,
      });

      console.log(
        `  [${pages.length}/${opts.maxPages}] ${extracted.title} (${extracted.content.length} chars)`,
      );

      // Discover internal links
      const links = extractLinks(html, origin, normalized);
      for (const link of links) {
        const norm = normalizeUrl(link);
        if (!visited.has(norm) && !queue.includes(norm)) {
          queue.push(norm);
        }
      }
    } catch (error) {
      console.log(`  Error: ${normalized} - ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  console.log(`\nDone! Crawled ${pages.length} pages.\n`);
  return pages;
}

/**
 * Fetch a page and return the HTML + content type.
 */
async function fetchPage(
  url: string,
): Promise<{ html: string; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "gud-agent-crawler/1.0 (+https://github.com/gudlab/gud-agent)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    return { html, contentType };
  } catch {
    return null;
  }
}

/**
 * Extract all same-origin links from an HTML page.
 */
function extractLinks(html: string, origin: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      // Resolve relative URLs
      const absolute = new URL(href, pageUrl);

      // Only same-origin links
      if (absolute.origin !== origin) return;

      // Strip hash and query
      absolute.hash = "";
      absolute.search = "";

      const url = absolute.toString();

      // Skip self-links and already found
      if (url !== pageUrl && !links.includes(url)) {
        links.push(url);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return links;
}

/**
 * Check if a URL should be skipped.
 */
function shouldSkipUrl(url: string, origin: string, exclude: string[]): boolean {
  try {
    const parsed = new URL(url);

    // Must be same origin
    if (parsed.origin !== origin) return true;

    const path = parsed.pathname.toLowerCase();

    // Check default skip paths
    for (const skip of SKIP_PATHS) {
      if (path.startsWith(skip)) return true;
    }

    // Check file extensions
    for (const ext of SKIP_EXTENSIONS) {
      if (path.endsWith(ext)) return true;
    }

    // Check user-provided exclude patterns
    for (const pattern of exclude) {
      if (path.startsWith(pattern) || path.includes(pattern)) return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Normalize a URL by removing trailing slash, hash, and query string.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    let normalized = parsed.toString();
    // Remove trailing slash (except for root)
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
