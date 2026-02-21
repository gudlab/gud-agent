# gud-agent

**Your AI customer agent that answers questions, collects leads, and books meetings.**

Built with [GudDesk](https://github.com/gudlab/guddesk) + [GudCal](https://github.com/gudlab/gudcal) + [GudForm](https://github.com/gudlab/gudform) + [Vercel AI SDK](https://sdk.vercel.ai).

---

## What It Does

`gud-agent` is an AI-powered customer agent that plugs into your GudDesk chat widget. When a visitor sends a message, the agent:

1. **Answers questions** from your knowledge base (a simple Markdown file)
2. **Captures lead info** (name, email, company) and saves it to GudForm
3. **Checks available time slots** on GudCal
4. **Books meetings** directly through the conversation

All of this happens automatically in the chat widget — no human agent needed.

## How It Works

```
Visitor types in GudDesk chat widget
              │
              ▼
   GudDesk fires webhook ──→ gud-agent server
                                    │
                                    ▼
                           LLM processes message
                           (with tool calling)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Search KB      Check GudCal     Submit to
            (Markdown)       availability      GudForm
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
                        Reply via GudDesk API
                        (appears in widget)
```

## Quick Start

### Prerequisites

- [GudDesk](https://github.com/gudlab/guddesk) instance running
- [GudCal](https://github.com/gudlab/gudcal) instance running
- [GudForm](https://github.com/gudlab/gudform) instance running
- OpenAI or Anthropic API key

### 1. Clone and install

```bash
git clone https://github.com/gudlab/gud-agent.git
cd gud-agent
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Pick your LLM
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Your GudDesk instance
GUDDESK_URL=https://your-guddesk.com
GUDDESK_API_KEY=gd_bot_your_app_id

# Your GudCal instance
GUDCAL_URL=https://your-gudcal.com
GUDCAL_USERNAME=your-username
GUDCAL_EVENT_SLUG=30-min-demo
GUDCAL_EVENT_TYPE_ID=your-event-type-uuid

# Your GudForm instance
GUDFORM_URL=https://your-gudform.com
GUDFORM_FORM_ID=your-lead-form-id
GUDFORM_FIELD_NAME=question-id-for-name
GUDFORM_FIELD_EMAIL=question-id-for-email
```

### 3. Edit your knowledge base

Replace `knowledge/base.md` with information about your company, products, pricing, and FAQs.

### 4. Configure GudDesk webhook

In your GudDesk instance, add a webhook URL pointing to your gud-agent:

```
POST https://your-gud-agent.com/webhook
```

Set the webhook to fire on `message.created` events.

### 5. Run

```bash
# Development
pnpm dev

# Production
pnpm build && pnpm start
```

## LLM Tools

| Tool | Description | Powered By |
|------|-------------|------------|
| `search_kb` | Searches the knowledge base for answers | Local Markdown file |
| `collect_info` | Captures lead information (name, email, company) | GudForm API |
| `check_slots` | Checks available meeting time slots | GudCal API |
| `book_meeting` | Books a meeting at a selected time | GudCal API |

The agent uses [Vercel AI SDK](https://sdk.vercel.ai) for LLM-agnostic tool calling. Switch between OpenAI and Anthropic by changing one env var.

## Customization

### Change the knowledge base

Edit `knowledge/base.md` — it's just a Markdown file. The agent splits it by headings and searches for relevant sections based on the visitor's question.

### Change the LLM

```env
# OpenAI
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini

# Anthropic
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
```

### Add custom tools

Create a new file in `src/tools/` using the Vercel AI SDK `tool()` function, then add it to the tools object in `src/agent.ts`.

## Deploy

### Docker

```bash
docker build -t gud-agent .
docker run -p 3001:3001 --env-file .env gud-agent
```

### Railway / Render / Fly.io

1. Push to GitHub
2. Connect your repo
3. Add environment variables from `.env.example`
4. Deploy

The server listens on the `PORT` environment variable (defaults to 3001).

## Architecture

```
gud-agent/
├── src/
│   ├── index.ts              # Express server + webhook handler
│   ├── agent.ts              # LLM agent with tool calling
│   ├── config.ts             # Environment configuration
│   ├── tools/
│   │   ├── search-kb.ts      # Knowledge base search
│   │   ├── collect-info.ts   # Lead capture via GudForm
│   │   ├── check-slots.ts    # Availability via GudCal
│   │   └── book-meeting.ts   # Booking via GudCal
│   └── clients/
│       ├── guddesk.ts        # GudDesk API client
│       ├── gudcal.ts         # GudCal API client
│       └── gudform.ts        # GudForm API client
├── knowledge/
│   └── base.md               # Your knowledge base (edit this!)
├── .env.example
├── Dockerfile
└── package.json
```

## Built With

- [GudDesk](https://github.com/gudlab/guddesk) — Open-source customer support with live chat widget
- [GudCal](https://github.com/gudlab/gudcal) — Open-source scheduling and calendar booking
- [GudForm](https://github.com/gudlab/gudform) — Open-source form builder
- [Vercel AI SDK](https://sdk.vercel.ai) — LLM-agnostic AI toolkit
- [Express](https://expressjs.com) — Minimal Node.js server

## License

MIT
