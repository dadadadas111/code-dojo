# Discord Setup Guide

How to connect the Code Dojo bot to a real Discord server and run the full stack.
This is the one piece not verifiable in CI — it needs a live bot token + guild.

---

## 0. Prerequisites (already done if you cloned + installed)

```bash
pnpm install
pnpm docker:up          # MongoDB (27017) + Redis (6379)
pnpm --filter @code-dojo/shared build
```

> Note: if you already run a local Redis on 6379, the compose Redis won't bind — that's fine, the API will use whichever Redis is on 6379.

---

## 1. Create the Discord application + bot

1. Go to <https://discord.com/developers/applications> → **New Application** → name it `Code Dojo`.
2. **Bot** tab → **Add Bot**.
   - **Reset Token** → copy it → this is `DISCORD_TOKEN`.
   - Under **Privileged Gateway Intents**, enable **Message Content Intent**. ⚠️ **Required** — the bot declares this intent, so login fails with "Used disallowed intents" if it's off. **Server Members Intent** is also ⚠️ **required** (the bot greets newcomers on join).
3. **General Information** tab → copy **Application ID** → this is `DISCORD_CLIENT_ID`.

---

## 2. Invite the bot to your server

**OAuth2 → URL Generator**:
- **Scopes:** `bot`, `applications.commands`
- **Bot Permissions:** `Send Messages`, `Embed Links`, `Read Message History`, `Use Application Commands`, `Manage Roles`

Open the generated URL, pick your server, authorize.

> `Manage Roles` is needed for the level-up role auto-assign (Phase 5). Without it, everything else still works — role sync just no-ops.

---

## 3. Get your server ID

Enable **Developer Mode** (Discord Settings → Advanced → Developer Mode), right-click your server icon → **Copy Server ID** → `DISCORD_GUILD_ID` (used for *instant* slash-command registration in dev).

That's the only ID you copy by hand. Roles and channels are created by the **`/setup`** command (step 6): the `Teacher` and `Student` roles (Student is auto-assigned on `/register`), the 6 level roles (Beginner → Legend), and a **Code Dojo** category with `#level-up`, `#thông-báo`, `#bài-tập` plus permission-gated bot-command channels — `#đăng-ký` open to everyone, `#lệnh-bot-1/2/3` visible only to Student+Teacher, and `#gv-lệnh-bot` Teacher-only (admins see everything). The IDs are saved to MongoDB via the API — no `.env` editing, no restart.

> Manual override (optional): `TEACHER_ROLE_ID`, `LEVEL_ROLE_IDS`, `LEVELUP_CHANNEL_ID` in `.env` still work as a *fallback* for installs that never ran `/setup`. Stored config from `/setup` takes precedence.

---

## 4. Fill in `.env` (repo root)

```bash
cp .env.example .env   # if you don't have one yet
```

| Variable | Required | Notes |
|----------|----------|-------|
| `DISCORD_TOKEN` | ✅ | Bot token from step 1 |
| `DISCORD_CLIENT_ID` | ✅ (for deploy) | Application ID; needed to register slash commands |
| `DISCORD_GUILD_ID` | dev | Your server ID → commands appear instantly |
| `API_KEY` | ✅ | Shared secret, **min 16 chars**. Bot and API both read this same root `.env`, so one value authenticates the bot→API calls. Set a real random string. |
| `MONGODB_URI` | ✅ | Default `mongodb://localhost:27017/code-dojo` works with `pnpm docker:up` |
| `REDIS_URL` | ✅ | Default `redis://localhost:6379` |
| `JWT_SECRET` | ✅ | Any random string (reserved for a future web dashboard) |
| `TEACHER_ROLE_ID` | ❌ | Fallback only — `/setup` creates & stores the role automatically |
| `LEVEL_ROLE_IDS` | ❌ | Fallback only — `/setup` fills these; role sync no-ops if nothing configured |
| `LEVELUP_CHANNEL_ID` | ❌ | Fallback only — `/setup` fills this; announcements skipped if nothing configured |

---

## 5. Register commands & run

```bash
pnpm --filter @code-dojo/bot deploy-commands   # registers the 24 slash commands to your guild (instant)
pnpm dev                                        # runs API (:3000) + bot together
```

You should see:
```
[API] Code Dojo API running at http://0.0.0.0:3000
[Bot] Logged in as Code Dojo#1234
```

Re-run `deploy-commands` whenever you add/rename a command.

---

## 6. Smoke test — the full teaching loop, in Discord

Run these as slash commands in your server. (`/help` shows this overview in Discord, grouped by role — students only see student commands.)

0. **(Admin)** `/setup` — one-shot onboarding: creates the `Teacher` + `Student` roles, the 6 level roles, the **Code Dojo** category with `#level-up` / `#thông-báo` / `#bài-tập`, and the gated bot-command channels (`#đăng-ký` public, `#lệnh-bot-1/2/3` Student+Teacher, `#gv-lệnh-bot` Teacher-only), then saves all IDs to the database (idempotent — safe to re-run; it reuses what exists and re-applies channel permissions). Then **assign the `Teacher` role to yourself** — the bot can't know who teaches.
1. `/register` — creates your student profile.
2. `/profile` — shows XP / Level / Coins (with the progress bar).
3. **(Teacher)** `/course-create name:"Khoá TS 2026" description:"Intro" start_date:2026-07-10`
4. **(Teacher)** `/schedule-set slot1:"T7 08:00" slot2:"T2 20:00"` — the course's fixed weekly rhythm; then `/lesson-add order:1 topic:"Intro to TS" description:"basics"` — **no date needed**, the lesson snaps onto the next free slot (`scheduled_date:` still works as an override). Busy day? `/postpone` shifts everything one slot and announces it in `#thông-báo`.
5. `/schedule` — lists the course's lessons. `/lesson` — shows the next upcoming lesson.
6. **(Teacher)** `/homework-create title:"HW1" description:"do it" type:coding deadline:2026-07-20 xp_reward:100 coin_reward:50 max_score:100` — or import from LeetCode in one option: `/homework-create leetcode:two-sum deadline:2026-07-20` (title, difficulty, and XP/coin rewards auto-fill; new homework auto-posts to `#bài-tập` with a submit menu). New members get greeted in `#đăng-ký` with a register button — no commands needed.
7. `/homework` — lists homework with indexes **and a select menu: pick one to open the submit form** (or use `/submit homework:1 github_link:https://github.com/you/repo`)
8. **(Teacher)** `/review` (no args → pending list with a select menu: **pick a submission → ✅/✏️ buttons → score+feedback form**; or grade by hand with `/review submission_id:<id> status:accepted score:95 feedback:"nice"`) → student gains XP + coins; crossing a threshold swaps their level role and posts to the level-up channel. **(Admin)** `/assign-role` manually assigns/removes the Teacher or level roles.
9. `/checkin` — marks attendance for today's lesson (needs a lesson scheduled today). **(Teacher)** `/attendance lesson:1` — the roster.
10. `/leaderboard metric:XP` — rankings with your own position.

---

### Dev utilities: tear down & retest

Both are admin-only with a confirm-button step, so nothing is deleted by accident:

- **`/reset`** — wipes ALL class data (students, courses, lessons, homework, submissions, attendance, activity logs, leaderboards). Discord roles/channels and the guild config survive. Use between test runs.
- **`/uninstall`** — the inverse of `/setup`: deletes the Teacher role, level roles, the Code Dojo category + its channels, and the stored guild config. Class data survives. Run `/setup` again to reinstall.

`/reset` then `/uninstall` returns a server to a completely clean slate.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Bot exits: "Used disallowed intents" | Enable **Message Content Intent** (step 1.2). |
| Bot exits: env validation error for `API_KEY` | Set it in `.env` (≥ 16 chars). |
| Slash commands don't appear | Re-run `deploy-commands`; guild commands are instant, global take ~1h. Ensure `DISCORD_GUILD_ID` is set for dev. |
| `/setup` says the bot lacks permissions | Grant the bot's role `Manage Roles` + `Manage Channels` (or re-invite with step 2's URL). |
| Teacher commands say "Chỉ giáo viên…" | Run `/setup` if you haven't, then assign the `Teacher` role to your account. |
| Teachers can't SEE teacher commands | Teacher commands default to admin-only visibility. One-time: Server Settings → Integrations → Code Dojo → grant the `Teacher` role on each teacher command (`/setup`'s summary lists them). Students then see only student commands. |
| Level-up role not applied | The bot's role must sit **above** the level roles (drag it up in Server Settings → Roles). `/setup` warns you when this is the case. |
| API calls 401 from the bot | `API_KEY` in `.env` must be set (the bot sends it as a Bearer token). |
| `/checkin` says "no lesson today" | Create a lesson whose `scheduled_date` falls on today (Asia/Ho_Chi_Minh). |

---

## Notes / current limitations (MVP, Phases 0–7)

- **Attendance "absent"** is teacher-marked (`/attendance-mark`), not auto-derived (no enrollment roster yet).
- **Leaderboard monthly reset** is a manual teacher action (`POST /api/gamification/leaderboard/rebuild`); *scheduled* reset + deadline reminders + streak tracking are Phase 8.
- **Resubmissions overwrite in place** (no attempt history).
- Coins are earned but there's no shop to spend them yet (Phase 10).
