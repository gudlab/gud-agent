#!/usr/bin/env node

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { crawlSite } from "../crawler/index.js";
import { generateMarkdown } from "../crawler/markdown.js";
import { guddesk } from "../clients/guddesk.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function printUsage() {
  console.log(`
  gud-agent crawl — Generate a knowledge base from your website

  Usage:
    pnpm crawl <url> [options]

  Options:
    --max-pages <n>    Maximum pages to crawl (default: 20)
    --output <path>    Output file path (default: knowledge/base.md)
    --exclude <paths>  Comma-separated paths to exclude (e.g., "/blog,/docs")
    --delay <ms>       Delay between requests in ms (default: 200)
    --sync             Push crawled pages to GudDesk knowledge base as articles
    --publish          Auto-publish articles when syncing (default: draft)
    --help             Show this help message

  Examples:
    pnpm crawl https://acme.com
    pnpm crawl https://acme.com --max-pages 50
    pnpm crawl https://acme.com --exclude "/blog,/careers" --max-pages 30
    pnpm crawl https://acme.com --sync --publish
`);
}

function parseArgs(args: string[]): {
  url: string;
  maxPages: number;
  output: string;
  exclude: string[];
  delay: number;
  sync: boolean;
  publish: boolean;
} {
  if (args.length === 0 || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const url = args[0];

  // Validate URL
  try {
    new URL(url);
  } catch {
    console.error(`Error: "${url}" is not a valid URL. Include the protocol (https://)`);
    process.exit(1);
  }

  let maxPages = 20;
  let output = resolve(__dirname, "../../knowledge/base.md");
  let exclude: string[] = [];
  let delay = 200;
  let sync = false;
  let publish = false;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--max-pages":
        maxPages = parseInt(args[++i], 10);
        if (isNaN(maxPages) || maxPages < 1) {
          console.error("Error: --max-pages must be a positive number");
          process.exit(1);
        }
        break;
      case "--output":
        output = resolve(args[++i]);
        break;
      case "--exclude":
        exclude = args[++i].split(",").map((p) => p.trim());
        break;
      case "--delay":
        delay = parseInt(args[++i], 10);
        if (isNaN(delay) || delay < 0) {
          console.error("Error: --delay must be a non-negative number");
          process.exit(1);
        }
        break;
      case "--sync":
        sync = true;
        break;
      case "--publish":
        publish = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return { url, maxPages, output, exclude, delay, sync, publish };
}

/**
 * Generate a URL-safe slug from a page title.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Create a short excerpt from content (first 200 chars, break at sentence).
 */
function makeExcerpt(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 200) return cleaned;

  const truncated = cleaned.slice(0, 200);
  const lastPeriod = truncated.lastIndexOf(". ");
  if (lastPeriod > 100) return truncated.slice(0, lastPeriod + 1);
  return truncated.trim() + "…";
}

/**
 * Sync crawled pages to GudDesk as knowledge base articles.
 */
async function syncToGudDesk(
  pages: { url: string; title: string; content: string }[],
  _sourceUrl: string,
  publish: boolean,
): Promise<{ created: number; updated: number; skipped: number }> {
  console.log("\n  📡 Syncing to GudDesk knowledge base...\n");

  // Fetch existing articles to detect duplicates by slug
  let existingArticles: Awaited<ReturnType<typeof guddesk.listArticles>> = [];
  try {
    const drafts = await guddesk.listArticles({ published: false });
    const published = await guddesk.listArticles({ published: true });
    existingArticles = [...drafts, ...published];
  } catch (err) {
    console.warn("  ⚠  Could not fetch existing articles:", err instanceof Error ? err.message : err);
  }

  const existingBySlug = new Map(existingArticles.map((a) => [a.slug, a]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const page of pages) {
    const slug = slugify(page.title);
    if (!slug) {
      skipped++;
      continue;
    }

    const excerpt = makeExcerpt(page.content);
    const body = `${page.content}\n\n---\n*Source: [${page.title}](${page.url})*`;

    const existing = existingBySlug.get(slug);

    try {
      if (existing) {
        // Update existing article with fresh content
        await guddesk.updateArticle(existing.id, {
          title: page.title,
          body,
          excerpt,
          isPublished: publish,
        });
        updated++;
        console.log(`  ✏️  Updated: ${page.title}`);
      } else {
        // Create new article
        await guddesk.createArticle({
          title: page.title,
          slug,
          body,
          excerpt,
          isPublished: publish,
        });
        created++;
        console.log(`  ✅ Created: ${page.title}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If slug conflict (409), try with a suffix
      if (msg.includes("409")) {
        try {
          const suffixedSlug = `${slug}-${Date.now().toString(36).slice(-4)}`;
          await guddesk.createArticle({
            title: page.title,
            slug: suffixedSlug,
            body,
            excerpt,
            isPublished: publish,
          });
          created++;
          console.log(`  ✅ Created (suffixed): ${page.title}`);
        } catch (retryErr) {
          skipped++;
          console.log(`  ⏭️  Skipped: ${page.title} (${retryErr instanceof Error ? retryErr.message : "error"})`);
        }
      } else {
        skipped++;
        console.log(`  ⏭️  Skipped: ${page.title} (${msg})`);
      }
    }
  }

  return { created, updated, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const { url, maxPages, output, exclude, delay, sync, publish } = parseArgs(args);

  console.log("┌─────────────────────────────────────────┐");
  console.log("│  gud-agent crawl                        │");
  console.log("└─────────────────────────────────────────┘");

  const startTime = Date.now();

  // Crawl the site
  const pages = await crawlSite(url, { maxPages, exclude, delayMs: delay });

  if (pages.length === 0) {
    console.error("No pages with extractable content were found.");
    console.error("Make sure the URL is correct and the site is accessible.");
    process.exit(1);
  }

  // Generate markdown (always — used as local fallback)
  const markdown = generateMarkdown(pages, url);

  // Write to local file
  writeFileSync(output, markdown, "utf-8");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const wordCount = markdown.split(/\s+/).length;

  console.log("┌─────────────────────────────────────────┐");
  console.log("│  Crawl complete!                        │");
  console.log("├─────────────────────────────────────────┤");
  console.log(`│  Pages crawled: ${String(pages.length).padEnd(25)}│`);
  console.log(`│  Word count:    ${String(wordCount).padEnd(25)}│`);
  console.log(`│  Time:          ${(elapsed + "s").padEnd(25)}│`);
  console.log(`│  Output:        ${output.length > 25 ? "..." + output.slice(-22) : output.padEnd(25)}│`);
  console.log("└─────────────────────────────────────────┘");

  // Sync to GudDesk if --sync flag is set
  if (sync) {
    try {
      const result = await syncToGudDesk(pages, url, publish);

      console.log("");
      console.log("┌─────────────────────────────────────────┐");
      console.log("│  GudDesk KB sync complete!              │");
      console.log("├─────────────────────────────────────────┤");
      console.log(`│  Created:  ${String(result.created).padEnd(30)}│`);
      console.log(`│  Updated:  ${String(result.updated).padEnd(30)}│`);
      console.log(`│  Skipped:  ${String(result.skipped).padEnd(30)}│`);
      console.log(`│  Status:   ${(publish ? "Published" : "Draft").padEnd(30)}│`);
      console.log("└─────────────────────────────────────────┘");
    } catch (err) {
      console.error("\n  ❌ GudDesk sync failed:", err instanceof Error ? err.message : err);
      console.error("  Make sure GUDDESK_URL and GUDDESK_API_KEY are set correctly.");
    }
  }

  console.log("");
  console.log("Next steps:");
  console.log(`  1. Review ${output}`);
  if (!sync) {
    console.log("  2. Run: pnpm crawl <url> --sync --publish  (to push to GudDesk KB)");
  }
  console.log(`  ${sync ? "2" : "3"}. Run: pnpm dev`);
  console.log("");
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
