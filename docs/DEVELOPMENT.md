# Development Guide

## Prerequisites

Install these before anything else:

| Tool | Version | Check |
|------|---------|-------|
| Node.js | >= 20 | `node --version` |
| pnpm | >= 9 | `pnpm --version` |
| Docker | >= 24 | `docker --version` |
| Git | >= 2.40 | `git --version` |

### Quick Install (Ubuntu/Debian)

```bash
# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 20
nvm use 20

# pnpm
npm install -g pnpm@latest

# Docker (via official repo)
# https://docs.docker.com/engine/install/ubuntu/
```

## First-Time Setup

```bash
# 1. Clone
git clone <repo-url> code-dojo
cd code-dojo

# 2. Install all dependencies
pnpm install

# 3. Start infrastructure
pnpm docker:up
# Verify:
docker ps
# Should show: code-dojo-mongo (port 27017) + code-dojo-redis (port 6379)

# 4. Create environment file
cp .env.example .env

# 5. Edit .env with your values
# Required: DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
# Optional: customize ports, JWT secret

# 6. Build shared package (required once, then after changes to shared/)
pnpm --filter @code-dojo/shared build

# 7. Verify everything works
pnpm dev
# Should see:
# [API] Code Dojo API running at http://0.0.0.0:3000
# [Bot] Logged in as Code Dojo#1234
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Bot token from [Discord Developer Portal](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_ID` | ✅ | Application ID (same portal) |
| `DISCORD_GUILD_ID` | dev only | Server ID for instant command registration |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `API_PORT` | ❌ | API port (default: 3000) |
| `JWT_SECRET` | ❌ | Random string for future web auth |

### Getting Discord Credentials

1. Go to https://discord.com/developers/applications
2. Create "New Application" → name it "Code Dojo"
3. Go to "Bot" tab → "Add Bot"
4. Copy the **Token** → this is `DISCORD_TOKEN`
5. Copy the **Application ID** → this is `DISCORD_CLIENT_ID`
6. Enable these **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent
7. Go to "OAuth2" → "URL Generator"
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Manage Roles`, `Read Message History`, `Use Slash Commands`
   - Use the generated URL to invite the bot to your server
8. Enable Developer Mode in Discord → right-click your server → Copy ID → this is `DISCORD_GUILD_ID`

## Daily Development

### Start Everything
```bash
pnpm dev
```
Runs API and Bot concurrently with hot reload (tsx watch).

### Start Individually
```bash
pnpm dev:api    # API only on :3000
pnpm dev:bot    # Bot only
```

### After Changing shared/
```bash
pnpm --filter @code-dojo/shared build
```

### Type Checking
```bash
pnpm typecheck    # All packages
pnpm --filter @code-dojo/api typecheck   # API only
```

### Linting & Formatting
```bash
pnpm lint           # Check all
pnpm lint:fix       # Auto-fix
pnpm format         # Format all files
pnpm format:check   # Check formatting (CI)
```

### Register/Update Discord Commands
```bash
pnpm --filter @code-dojo/bot deploy-commands
```

### Docker
```bash
pnpm docker:up      # Start MongoDB + Redis
pnpm docker:down    # Stop
pnpm docker:logs    # View logs
```

### Clean Build
```bash
pnpm clean          # Remove all dist/
pnpm build          # Rebuild all
```

## Project Conventions

### File Naming
- Source files: `kebab-case.ts`
- Test files: `*.test.ts` or `*.spec.ts`
- Config files: `*.config.ts` or `*.config.js`

### Code Style
- **TypeScript strict mode** — no `any` without explicit justification
- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and mapped types
- Explicit return types on public functions
- No default exports (use named exports for better tree-shaking and IDE support)

### Import Order
```typescript
// 1. Node builtins
import { readFile } from 'node:fs/promises';

// 2. External packages
import express from 'express';
import mongoose from 'mongoose';

// 3. Workspace packages
import { Student, XP_REWARDS } from '@code-dojo/shared';

// 4. Relative imports
import { StudentService } from './services/student.service';
```

### API Package Structure
```
packages/api/src/
├── index.ts              # Entry: start server
├── app.ts                # Express app factory
├── config/
│   └── env.ts            # Environment variable validation
├── db/
│   ├── connection.ts     # MongoDB + Redis connection
│   └── models/           # Mongoose models
│       ├── student.model.ts
│       ├── course.model.ts
│       └── ...
├── routes/               # Express routers (thin — validate + delegate)
│   ├── student.routes.ts
│   ├── course.routes.ts
│   └── ...
├── services/             # Business logic
│   ├── student.service.ts
│   ├── course.service.ts
│   ├── xp.service.ts
│   └── ...
├── middleware/
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── validation.middleware.ts
└── events/
    └── event-bus.ts      # Simple event emitter
```

### Bot Package Structure
```
packages/bot/src/
├── index.ts              # Entry: login + event handlers
├── deploy-commands.ts    # Slash command registration script
├── commands/             # One file per command
│   ├── ping.command.ts
│   ├── profile.command.ts
│   └── ...
├── embeds/               # Discord embed builders
│   ├── profile.embed.ts
│   ├── leaderboard.embed.ts
│   └── ...
└── utils/
    ├── api-client.ts     # HTTP client for calling REST API
    └── permissions.ts    # Role/permission checks
```

### Git Workflow

```
main         ← production-ready (protected)
  │
  ├── phase/1-student-management
  ├── phase/2-course-lesson
  ├── phase/3-homework-submission
  └── ...
```

- Branch naming: `phase/<number>-<description>` or `feat/<description>`
- Commit messages: imperative mood, Vietnamese or English
  - Good: `Add student registration endpoint`
  - Good: `Thêm API đăng ký học sinh`
  - Bad: `added stuff`
- One feature per branch
- Squash merge to `main`

### Testing Strategy

| Level | Tool | What to Test |
|-------|------|-------------|
| Unit | Vitest / Jest | Service logic, XP calculation, achievement conditions |
| Integration | Supertest | API endpoints with test MongoDB |
| E2E | Manual (for now) | Discord slash commands |

Run tests:
```bash
pnpm --filter @code-dojo/api test
```

## Troubleshooting

### Bot won't start: "DISCORD_TOKEN is not set"
→ Create `.env` from `.env.example` and add your token.

### "Cannot find module '@code-dojo/shared'"
→ Run `pnpm --filter @code-dojo/shared build`

### MongoDB connection refused
→ Run `pnpm docker:up` to start MongoDB

### Slash commands not appearing in Discord
→ Run `pnpm --filter @code-dojo/bot deploy-commands`
→ Commands registered to a specific guild appear instantly
→ Global commands take up to 1 hour

### Port 3000 already in use
→ Change `API_PORT` in `.env`

### pnpm install fails
→ Check Node version: `node --version` (needs >= 20)
→ Check pnpm version: `pnpm --version` (needs >= 9)
→ Try: `rm -rf node_modules pnpm-lock.yaml && pnpm install`

## Resources

- [Discord.js Guide](https://discordjs.guide/)
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Mongoose Docs](https://mongoosejs.com/docs/guide.html)
- [Express Docs](https://expressjs.com/)
- [Redis Commands](https://redis.io/commands/)
