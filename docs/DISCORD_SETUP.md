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
   - Under **Privileged Gateway Intents**, enable **Message Content Intent**. ⚠️ **Required** — the bot declares this intent, so login fails with "Used disallowed intents" if it's off. (Enabling *Server Members Intent* too is harmless and future-proof.)
3. **General Information** tab → copy **Application ID** → this is `DISCORD_CLIENT_ID`.

---

## 2. Invite the bot to your server

**OAuth2 → URL Generator**:
- **Scopes:** `bot`, `applications.commands`
- **Bot Permissions:** `Send Messages`, `Embed Links`, `Read Message History`, `Use Application Commands`, `Manage Roles`

Open the generated URL, pick your server, authorize.

> `Manage Roles` is needed for the level-up role auto-assign (Phase 5). Without it, everything else still works — role sync just no-ops.

---

## 3. Set up server roles, channels & IDs

Enable **Developer Mode** (Discord Settings → Advanced → Developer Mode), then right-click → **Copy ID**.

1. **Guild ID** — right-click your server icon → Copy Server ID → `DISCORD_GUILD_ID` (used for *instant* slash-command registration in dev).
2. **Teacher role** — create a role (e.g. `Teacher`), assign it to yourself, copy its ID → `TEACHER_ROLE_ID`. **Required** — the bot won't start without it, and teacher commands (`/course-create`, `/lesson-add`, `/homework-create`, `/review`, `/attendance-mark`) check for this role.
3. *(Optional)* **Level roles** — create 6 roles matching the level titles and copy each ID into `LEVEL_ROLE_IDS` as JSON:

   | Level | Title |
   |-------|-------|
   | 1 | Beginner |
   | 2 | Coder |
   | 3 | Programmer |
   | 4 | Developer |
   | 5 | Master |
   | 6 | Legend |

   ```
   LEVEL_ROLE_IDS={"1":"<id>","2":"<id>","3":"<id>","4":"<id>","5":"<id>","6":"<id>"}
   ```

   ⚠️ **Drag the bot's own role ABOVE all six level roles** in Server Settings → Roles, or Discord refuses the role change (hierarchy rule).
4. *(Optional)* **Level-up channel** — create e.g. `#level-up`, copy its ID → `LEVELUP_CHANNEL_ID` (where level-up announcements post). If unset, announcements are silently skipped.

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
| `TEACHER_ROLE_ID` | ✅ | Teacher role ID from step 3 (bot won't boot without it) |
| `API_KEY` | ✅ | Shared secret, **min 16 chars**. Bot and API both read this same root `.env`, so one value authenticates the bot→API calls. Set a real random string. |
| `MONGODB_URI` | ✅ | Default `mongodb://localhost:27017/code-dojo` works with `pnpm docker:up` |
| `REDIS_URL` | ✅ | Default `redis://localhost:6379` |
| `JWT_SECRET` | ✅ | Any random string (reserved for a future web dashboard) |
| `LEVEL_ROLE_IDS` | ❌ | JSON map from step 3; role sync no-ops if unset |
| `LEVELUP_CHANNEL_ID` | ❌ | Announcement channel; skipped if unset |

---

## 5. Register commands & run

```bash
pnpm --filter @code-dojo/bot deploy-commands   # registers the 16 slash commands to your guild (instant)
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

Run these as slash commands in your server:

1. `/register` — creates your student profile.
2. `/profile` — shows XP / Level / Coins (with the progress bar).
3. **(Teacher)** `/course-create name:"Khoá TS 2026" description:"Intro" start_date:2026-07-10`
4. **(Teacher)** `/lesson-add order:1 topic:"Intro to TS" description:"basics" scheduled_date:2026-07-15T18:00`
5. `/schedule` — lists the course's lessons. `/lesson` — shows the next upcoming lesson.
6. **(Teacher)** `/homework-create title:"HW1" description:"do it" type:coding deadline:2026-07-20 xp_reward:100 coin_reward:50 max_score:100`
7. `/homework` — lists homework with indexes. `/submit homework:1 github_link:https://github.com/you/repo`
8. **(Teacher)** `/review` (no args → lists pending) then `/review submission_id:<id> status:accepted score:95 feedback:"nice"` → student gains XP + coins; crossing a threshold swaps their level role and posts to the level-up channel.
9. `/checkin` — marks attendance for today's lesson (needs a lesson scheduled today). **(Teacher)** `/attendance lesson:1` — the roster.
10. `/leaderboard metric:XP` — rankings with your own position.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Bot exits: "Used disallowed intents" | Enable **Message Content Intent** (step 1.2). |
| Bot exits: env validation error for `TEACHER_ROLE_ID` / `API_KEY` | Set them in `.env` (`API_KEY` ≥ 16 chars). |
| Slash commands don't appear | Re-run `deploy-commands`; guild commands are instant, global take ~1h. Ensure `DISCORD_GUILD_ID` is set for dev. |
| Teacher commands say "Chỉ giáo viên…" | Your account doesn't have the `TEACHER_ROLE_ID` role — assign it. |
| Level-up role not applied | Bot needs `Manage Roles` AND its role must sit **above** the level roles; check `LEVEL_ROLE_IDS`. |
| API calls 401 from the bot | `API_KEY` in `.env` must be set (the bot sends it as a Bearer token). |
| `/checkin` says "no lesson today" | Create a lesson whose `scheduled_date` falls on today (Asia/Ho_Chi_Minh). |

---

## Notes / current limitations (MVP, Phases 0–7)

- **Attendance "absent"** is teacher-marked (`/attendance-mark`), not auto-derived (no enrollment roster yet).
- **Leaderboard monthly reset** is a manual teacher action (`POST /api/gamification/leaderboard/rebuild`); *scheduled* reset + deadline reminders + streak tracking are Phase 8.
- **Resubmissions overwrite in place** (no attempt history).
- Coins are earned but there's no shop to spend them yet (Phase 10).
