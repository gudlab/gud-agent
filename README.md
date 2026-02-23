# gud-agent

**Turn your website into an AI support agent in 5 minutes.**

Crawl your site, build a knowledge base automatically, and let AI answer your customers' questions — powered by [GudDesk](https://github.com/gudlab/guddesk), [Vercel AI SDK](https://sdk.vercel.ai), and optionally [GudCal](https://github.com/gudlab/gudcal) + [GudForm](https://github.com/gudlab/gudform).

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/gudlab/gud-agent.git
cd gud-agent
pnpm install
```

### 2. Crawl your website

```bash
pnpm crawl https://your-website.com
```

This crawls your site and auto-generates `knowledge/base.md` — the AI's knowledge base. No manual writing needed.

```
  Crawling https://your-website.com...

  [1/20] Home (1,842 chars)
  [2/20] About Us (2,105 chars)
  [3/20] Pricing (1,523 chars)
  [4/20] Features (3,201 chars)
  [5/20] FAQ (2,890 chars)

  Crawl complete!
  Pages crawled: 12
  Word count:    4,521
  Output:        knowledge/base.md
```

### 3. Configure

```bash
cp .env.example .env
```

Set your **GudDesk URL** and **API key** — that's all you need:

```env
OPENAI_API_KEY=sk-...
GUDDESK_URL=https://your-guddesk.com
GUDDESK_API_KEY=gd_bot_your_app_id
```

### 4. Set up GudDesk webhook

Either set a public URL for your agent, or use ngrok (see below) so the agent can auto-register the webhook.

- **Option A — Manual:** In GudDesk, add a webhook: `POST https://your-agent-url.com/webhook`
- **Option B — Ngrok (local dev):** Set `NGROK_ENABLED=true` and `NGROK_AUTHTOKEN=...` in `.env`. On start, a tunnel is created and the webhook is registered automatically.

### 5. Run

```bash
pnpm dev
```

That's it! Your AI agent is now answering customer questions in your GudDesk chat widget.

---

## How It Works

```
Visitor types in GudDesk chat widget
              |
              v
   GudDesk fires webhook --> gud-agent server
                                    |
                                    v
                           LLM processes message
                           (with tool calling)
                                    |
                    +---------------+---------------+
                    v               v               v
              Search KB      Check GudCal     Submit to
          (auto-generated)   availability      GudForm
                    |               |               |
                    +---------------+---------------+
                                    |
                                    v
                        Reply via GudDesk API
                        (appears in widget)
```

## Crawler Options

```bash
# Crawl with more pages
pnpm crawl https://acme.com --max-pages 50

# Exclude specific paths
pnpm crawl https://acme.com --exclude "/blog,/careers,/legal"

# Custom output path
pnpm crawl https://acme.com --output my-kb.md

# Slower crawling (be extra polite)
pnpm crawl https://acme.com --delay 500
```

The crawler:
- Follows internal links (same domain only)
- Extracts readable content using Mozilla Readability
- Strips navigation, footers, scripts, and boilerplate
- Generates structured Markdown with sections per page
- Skips assets, API routes, and admin pages automatically

## Optional Plugins

### Scheduling (GudCal)

Let the agent check availability and book meetings. Add these env vars:

```env
GUDCAL_URL=https://your-gudcal.com
GUDCAL_USERNAME=your-username
GUDCAL_EVENT_SLUG=30-min-demo
GUDCAL_EVENT_TYPE_ID=your-event-type-uuid
```

The agent gains two tools: `check_slots` and `book_meeting`.

### Lead Capture (GudForm)

Save visitor information as leads. Add these env vars:

```env
GUDFORM_URL=https://your-gudform.com
GUDFORM_FORM_ID=your-lead-form-id
GUDFORM_FIELD_NAME=question-id-for-name
GUDFORM_FIELD_EMAIL=question-id-for-email
```

The agent gains the `collect_info` tool.

## LLM Configuration

Switch between OpenAI and Anthropic with one env var:

```env
# OpenAI (default)
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini

# Anthropic
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
```

## Customization

### Edit the knowledge base

After crawling, review and edit `knowledge/base.md`. It's just Markdown — add FAQs, remove irrelevant sections, or add details the crawler missed.

### Add custom tools

Create a new file in `src/tools/` using the Vercel AI SDK `tool()` function, then add it to the tools object in `src/agent.ts`.

## Deploy

### Docker

```bash
docker build -t gud-agent .
docker run -p 3001:3001 --env-file .env gud-agent
```

To expose the agent via ngrok from Docker, set in `.env`:

- `NGROK_ENABLED=true` (or `1` / `yes`)
- `NGROK_AUTHTOKEN=<your-token>` from [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)

The tunnel starts on server boot and the GudDesk webhook is registered with the ngrok URL automatically.

### Railway / Render / Fly.io

1. Push to GitHub
2. Connect your repo
3. Set environment variables
4. Deploy

## Architecture

```
gud-agent/
├── src/
│   ├── index.ts              # Express server + webhook handler
│   ├── agent.ts              # LLM agent with tool calling
│   ├── config.ts             # Environment configuration
│   ├── cli/
│   │   └── crawl.ts          # Website crawler CLI
│   ├── crawler/
│   │   ├── index.ts          # BFS site crawler
│   │   ├── extractor.ts      # Readability content extraction
│   │   └── markdown.ts       # KB markdown generator
│   ├── tools/
│   │   ├── search-kb.ts      # Knowledge base search
│   │   ├── collect-info.ts   # Lead capture (GudForm)
│   │   ├── check-slots.ts    # Availability (GudCal)
│   │   └── book-meeting.ts   # Booking (GudCal)
│   └── clients/
│       ├── guddesk.ts        # GudDesk API client
│       ├── gudcal.ts         # GudCal API client
│       └── gudform.ts        # GudForm API client
├── knowledge/
│   └── base.md               # Auto-generated knowledge base
├── .env.example
├── Dockerfile
└── package.json
```

## Built With

- [GudDesk](https://github.com/gudlab/guddesk) - Open-source customer support with live chat widget
- [GudCal](https://github.com/gudlab/gudcal) - Open-source scheduling and calendar booking
- [GudForm](https://github.com/gudlab/gudform) - Open-source form builder
- [Vercel AI SDK](https://sdk.vercel.ai) - LLM-agnostic AI toolkit
- [Mozilla Readability](https://github.com/mozilla/readability) - Content extraction
- [Cheerio](https://cheerio.js.org) - HTML parsing

## License

MIT
