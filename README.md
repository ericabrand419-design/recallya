# Recallya 2.2 Trust + Team

**Conversations that convert.**

Recallya is an agent-first relationship intelligence CRM built around a simple idea: the person doing the work should not have to remember, reconstruct and manually maintain every customer relationship.

This build combines the full product concept into one mobile-first prototype: relationship memory, Ask Recallya, next-best-action, lead intake, contextual selling, Voice Studio, Publisher, sequences, tasks/calendar capture, Autopilot controls and the separate Recallya Rouge add-on architecture.

## What is working in this prototype

### New in 2.2 — Trust + Team
- Source-backed relationship memory with confidence labels and human correction
- Relationship Timeline that compresses conversations, promises, documents and proposals into a readable story
- “Why this?” explanations for Next Best Action recommendations
- Team members, record ownership and handoffs
- Consent and preferred-channel controls per relationship
- Attention Center with prioritized notifications instead of alert spam
- Universal relationship search
- Duplicate / identity resolution review
- Workflow rules
- Documents, quotes/proposals and service-case context
- Email deliverability health snapshot
- Setup/onboarding checklist
- Workspace and people export controls
- Production schema support for memory provenance, consent, assignments, workflows, documents, proposals, service cases, notifications and identity resolution


## Multi-business / Portfolio

Recallya now treats every business as a separate workspace rather than a filter. Each workspace has its own customers, conversations, voice profiles, products, lead sources, sequences, Publisher campaigns, channel settings, automation rules, analytics and optional Rouge configuration.

The owner-level **Portfolio** view rolls up only high-level signals across authorized workspaces: conversations that need attention, open pipeline, leads, tasks and promises. **Ask Portfolio** is the intentional cross-business assistant. Normal **Ask Recallya** remains scoped to the active business.

Included prototype workspaces demonstrate the architecture with Agent First, Recallya and a creator-business example. Users can add additional businesses, switch context from mobile or desktop, edit business identity/goals/products and start new workspaces blank or from a sales CRM starter.

Production schema support includes `workspaces`, `workspace_members`, `workspace_products` and workspace ownership keys across CRM, automation, Publisher, lead, voice and Rouge tables. Lead intake accepts a `workspace_slug` so inbound forms and webhooks can route a lead to the correct business.

### Relationship intelligence
- Mobile-first **Today, Inbox, People, Ask Recallya and More** navigation
- Relationship records with memory, preferences, objections, promises, opportunity value, lead source and next-best-action
- **Ask Recallya** globally or inside one customer account
- **Do it / Draft / Schedule** action flow
- Promise tracking and agenda
- Natural-language capture that turns notes into memory, tasks and meeting items
- Global automation pause switch

### Contextual selling
Every relationship can carry a selling cue. Recallya is designed to answer the customer first, then recognize the next logical commercial step rather than forcing a generic pitch.

The inbox includes:
- **Draft in my voice**
- **Find natural offer**
- customer context beside the conversation
- Approval, Autopilot and Human modes

### Recallya Voice Studio
Voice profiles are reusable across conversations, sequences and campaigns. The prototype includes:
- Erica / Founder
- Agent First Sales
- Agent First Support
- Brand Social
- Recallya Rouge (separate provider profile)

Each profile stores directness, warmth, formality, sales energy, a description, approved examples, phrases to avoid and CTA style. Users can create and edit additional voices.

### Recallya Publisher
Create one campaign and choose multiple channels. Recallya prepares a channel-aware version and remembers which channels are auto-ready versus approval-first.

Included channel slots:
- X
- Bluesky
- Website
- Email
- Reddit (approval-first)
- LinkedIn (approval/API slot)

Campaigns store goal, voice, destination URL, schedule, channel list, publishing mode and conversion metrics. Publisher tracks posts, clicks, conversations, leads and attributed revenue so the CRM can connect publishing activity to actual relationships and sales.

`POST /api/publisher` returns policy-aware channel variants. Live publishing requires the sanctioned channel-specific adapter and credentials. `/api/x-post` remains the direct X publishing adapter when an authorized user access token is configured.

### Lead intake
- Manual lead entry
- CSV import
- Website demo form
- `POST /api/leads` webhook/API intake
- source attribution
- first Next Best Action
- immediate relationship and inbox record creation

### Email sequences
Sequences store a goal, selected Recallya voice and Manual / Approval / Autopilot mode. The product model is designed to stop or branch sequences when a person replies, books or converts instead of blindly sending a fixed drip.

### Automation Center
Rules are independently configurable for:
- routine replies
- task extraction
- calendar creation
- contextual selling
- Publisher
- email sequences

Each can be set to Autopilot, Approval, Recommend or Human as appropriate.

### Recallya Rouge
Rouge is deliberately separated from Core. It shares authorized relationship memory but uses its own:
- voice profile
- external provider
- boundaries
- approval/autopilot setting
- custom-request setting

Core does **not** generate mature dialogue itself. Rouge is the routing, context, memory and control layer for an external adult-capable provider configured by the business. The UI requires a separate configuration and is built around 18+ use, opt-outs and human-control boundaries.

`POST /api/voice-preview` will use the normal external text provider for business voice generation when configured. Requests tagged as the Rouge surface return a provider-required response instead of generating mature dialogue inside Core.

## Product principle

**Human owns:** identity, judgment, boundaries, relationships, offers, exceptions and final authority.

**Recallya owns:** memory, retrieval, context assembly, customer state, promises, reminders, next-action cues and routine orchestration.

**AI assists:** drafting, personalization, voice consistency, classification, timing, contextual selling and conversation continuation.

The goal is not another CRM employees must maintain. **Recallya maintains the relationship around the work they already do.**

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

No package install is required for this prototype.

## APIs included

- `POST /api/leads` — lead intake
- `POST /api/ask` — Ask Recallya, optionally backed by an external text provider
- `POST /api/voice-preview` — business voice generation/preview
- `POST /api/publisher` — channel-aware campaign adaptation
- `POST /api/x-post` — authorized X posting adapter
- `POST /api/approved-adapter` — sanctioned external platform adapter slot
- `POST /api/provider-test` — external provider test
- `POST /api/memory` — explain or correct source-backed relationship memory
- `GET/POST /api/workflows` — compile and preview conversational workflow rules
- `POST /api/handoff` — relationship ownership / handoff action point
- `GET /api/health` — health check
- `GET /api/cron` — scheduler wiring point

## Database

`sql/schema.sql` now includes:
- customers and platform identities
- conversations and messages
- organizations and opportunities
- commitments, tasks and calendar events
- email sequences and enrollments
- lead intake events
- voice profiles
- channel configurations
- publisher campaigns and scheduled posts
- automation rules
- Rouge configuration
- campaign attribution events
- approval queue and audit log
- workspaces, workspace membership and per-business product catalogs
- workspace isolation keys across customer, conversation, campaign, sequence, automation and Rouge data

## What still requires real credentials

This is a functional product prototype, not a production deployment. Real Gmail, Google Calendar, X, Bluesky, LinkedIn, Reddit or third-party creator-platform activity requires sanctioned APIs, OAuth/API credentials, production authentication, permissions and persistent storage. The app deliberately does not scrape credentials or browser-login into third-party accounts.

The `.env.example` file lists the server-side configuration points. Secrets should never be put in client-side code.
