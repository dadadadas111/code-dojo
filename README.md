# Code Dojo

> Gamified Learning Management System for programming classes.
> Discord-first. API-driven. Built for teachers who want to spend less time managing and more time teaching.

## What Problem Does This Solve?

Teaching programming to a class of students involves a lot of manual busywork:
tracking attendance, assigning homework, checking submissions, sending reminders,
grading, updating leaderboards — all of which typically lives in Google Sheets,
Zalo messages, and sticky notes.

**Code Dojo** automates all of this through Discord (the interface students already use)
backed by a proper REST API (so it works with any client — web, mobile, Telegram, etc.).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend (UI)** | Discord (Slash Commands, Embeds, Roles) |
| **Bot Runtime** | Node.js + [discord.js](https://discord.js.org/) v14 |
| **Backend API** | Node.js + Express + TypeScript |
| **Database** | MongoDB (via Mongoose) |
| **Cache / LB** | Redis (ioredis) |
| **Language** | TypeScript (strict mode) |
| **Package Manager** | pnpm (workspaces) |
| **Infrastructure** | Docker Compose (MongoDB + Redis) |

## Architecture

```
┌──────────┐     Slash Commands     ┌──────────┐     REST API      ┌──────────┐
│ Discord  │ ◄────────────────────► │ Bot      │ ◄───────────────► │ API      │
│ (UI)     │     Embeds, Roles      │ (Thin)   │                   │ (Express)│
└──────────┘                        └──────────┘                   └────┬─────┘
                                                                       │
                                                              ┌────────┴────────┐
                                                              │  MongoDB  Redis  │
                                                              └─────────────────┘
```

The **Bot** is intentionally thin — it only parses Discord interactions,
calls the REST API, and formats responses. All business logic lives in the **API** layer.
This means you can later swap Discord for a web dashboard or Telegram bot
without rewriting anything.

## Project Structure

```
code-dojo/
├── packages/
│   ├── shared/        # Shared TypeScript types, constants, utilities
│   ├── api/           # Express REST API (business logic + database)
│   └── bot/           # Discord.js bot (thin command → API layer)
├── docs/              # Project documentation
├── docker-compose.yml # MongoDB + Redis for local development
├── tsconfig.base.json # Shared TypeScript configuration
└── package.json       # Root workspace scripts
```

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm i -g pnpm`)
- **Docker** (for MongoDB & Redis)

### Setup

```bash
# 1. Clone & enter
git clone <repo-url> code-dojo
cd code-dojo

# 2. Install dependencies
pnpm install

# 3. Start infrastructure
pnpm docker:up

# 4. Copy env file & fill in values
cp .env.example .env
# Edit .env — add your DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID

# 5. Build shared package
pnpm --filter @code-dojo/shared build

# 6. Start development
pnpm dev          # Runs API + Bot in parallel
# or individually:
pnpm dev:api      # API on http://localhost:3000
pnpm dev:bot      # Bot connects to Discord
```

### Register Discord Commands

```bash
pnpm --filter @code-dojo/bot deploy-commands
```

## Documentation

| Document | Description |
|----------|-------------|
| [ROADMAP.md](docs/ROADMAP.md) | Development phases & milestones |
| [FEATURES.md](docs/FEATURES.md) | Feature checklist with priorities (P0–P3) |
| [ADVANCED_FEATURES.md](docs/ADVANCED_FEATURES.md) | Future ideas & stretch goals |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, tech decisions |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev environment, conventions, workflow |

## License

UNLICENSED — Private project.
