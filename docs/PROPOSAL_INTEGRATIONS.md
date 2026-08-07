# Proposal: Breaking Out of the Discord Silo

> Status: slices 1–2 SHIPPED (F+G1+E-hiding on 2026-08-07; A1+C+G2 same day). Remaining: A2/A3, B, D. Originally written 2026-08-07 in response to:
> "the bot is too isolated in Discord — LeetCode pull? account linking? AI lesson generation? make it as convenient as possible."
> Complements [ROADMAP.md](ROADMAP.md) (Phases 8–12) and [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md).

## The core insight

Today every piece of content (lessons, homework) is typed by hand, and every verification
(grading, attendance) is done by hand. The three integrations below attack both problems:

| Pain today | Integration | After |
|---|---|---|
| Teacher writes homework by hand | **LeetCode import** | `/homework-create leetcode:<slug>` — title, difficulty, rewards auto-filled |
| Teacher grades every submission | **Account linking + auto-verify** | Student's LeetCode AC auto-accepts the submission → XP/coins flow with zero teacher clicks |
| Teacher writes lessons by hand | **AI generation** | `/generate-lesson prompt:"..."` → draft → teacher approves with one button |

---

## A. LeetCode integration (flagship)

### A1. Pull a problem into homework

- `/homework-create` gains an optional `leetcode` option (slug or URL).
- API fetches problem metadata from LeetCode's public GraphQL endpoint
  (`question(titleSlug:)` → title, difficulty, topic tags, link).
- Prefills title/description/link; suggests rewards by difficulty
  (configurable): Easy 50 XP / 20 coins · Medium 100 / 40 · Hard 200 / 80.
- Homework gains a `source` field: `{ type: 'leetcode', slug, difficulty, url }`.

### A2. Link student accounts (opt-in, verified)

- `/link leetcode:<username>` → bot replies with a one-time code
  (`CODE-DOJO-xxxx`) → student pastes it into their LeetCode profile summary →
  presses **Verify** button → API fetches the public profile, confirms the code,
  stores `integrations.leetcode.username` on the Student. Code removed after.
- Same pattern later for GitHub (`/link github:<username>`).
- Ownership is proven; no passwords or cookies ever involved.

### A3. Auto-verified submissions (the payoff)

- A scheduler polls each linked student's public `recentAcSubmissionList`
  (recent accepted submissions) every ~15 minutes.
- If a student has an AC on an assigned problem's slug after the assignment date:
  auto-create/auto-accept the submission → XP + coins + level-up + role sync +
  announcement, all through the existing grading pipeline. Teacher does nothing.
- Manual fallback: `/verify homework:<n>` triggers an immediate check
  (covers the "recent list only shows ~20 submissions" limitation).
- `/review` still exists for project/GitHub homework — this only automates
  LeetCode-type homework.

### Risks & mitigations

- **Unofficial API.** LeetCode has no official public API; the GraphQL endpoints
  are stable community knowledge but can change. → Isolate in one adapter
  service; degrade gracefully (import/verify fail → manual flow still works);
  cache problem metadata 24h; polite rate limiting + backoff.
- **Privacy.** Linking is opt-in, stores only the public username, verified by
  the student's own action. `/unlink` deletes it.

## B. AI content generation (teacher copilot)

All calls live in the API layer (bot stays thin). Uses the official Anthropic
TypeScript SDK (`@anthropic-ai/sdk`), key in `.env` (`ANTHROPIC_API_KEY`).

### B1. `/generate-lesson` and `/generate-homework` (teacher-only)

- `/generate-lesson prompt:"Giới thiệu async/await cho người mới" count:2`
- API calls Claude with **structured outputs** (JSON schema) → returns typed
  `{ topic, description, objectives[], suggestedHomework[] }` — no parsing
  fragility, maps 1:1 onto the existing create-lesson/homework endpoints.
- Bot shows an **ephemeral preview embed** with buttons:
  **✅ Tạo** · **🔄 Tạo lại** · **✏️ Sửa** (modal pre-filled with the draft) · **❌ Huỷ**.
- **Nothing is saved without an explicit teacher click** — AI drafts, human decides.
- Model: `claude-opus-5` ($5/$25 per MTok). A generated lesson is ~2–3K output
  tokens ≈ **under $0.10 per lesson** — cost is a non-issue at classroom scale.
  Still: log usage per month and enforce a soft monthly cap in config.

### B2. AI first-pass review (later phase)

- When a student submits a GitHub link, API fetches the repo tree + key files
  (size-capped), Claude drafts a review (score suggestion + feedback in
  Vietnamese) against the homework description.
- Draft posts to `#gv-lệnh-bot` with **[Dùng feedback này]** / **[Tự chấm]**
  buttons. Teacher approves — the teacher-in-the-loop stays, but grading a
  routine submission drops from minutes to seconds.

## C. GitHub validation (cheap win)

- On `/submit` with a GitHub link: official GitHub API checks the repo exists,
  is public, (if linked) belongs to the student, and grabs the last-commit time.
- Review embed shows "⚠️ repo không tồn tại" or "last commit: 2h ago" —
  teachers stop clicking dead links.

## D. Scheduler & notifications (= Roadmap Phase 8, extended)

One `node-cron` scheduler in the API powers:

- Deadline reminders (24h & 1h before) — DM + `#thông-báo`.
- Lesson reminder 30 minutes before `scheduled_date` + auto check-in window.
- **LeetCode auto-verify polling (A3) rides this same scheduler.**
- Weekly teacher digest in `#gv-lệnh-bot`: pending reviews, upcoming deadlines,
  at-risk students (2+ missed deadlines / absences).
- Monthly leaderboard auto-reset + "Student of the Month" announcement.

## F. Recurring schedule engine (lịch học cố định)

Today `/lesson-add` demands a manual `scheduled_date` for every lesson — the
single most repetitive input in the teacher flow. Replace it with a course-level
recurring schedule that lessons snap onto.

### F1. Define the rhythm once — per-slot times

Real schedules are not uniform (e.g. **Sat 08:00 AND Mon 20:00**), so the shape
is a list of slots, each with its own day *and* time:

- `Course.schedule = { slots: [{ day: 6, time: "08:00" }, { day: 1, time: "20:00" }], timezone: 'Asia/Ho_Chi_Minh' }`
- Set via `/schedule-set slot1:"T7 08:00" slot2:"T2 20:00"` (up to 4 slot
  options; also settable at `/course-create`). Shown in the `/schedule` header.

### F2. Lessons snap to slots

- `/lesson-add` no longer requires a date: the new lesson takes the **next free
  teaching slot** after the last scheduled lesson — where a slot is the next
  calendar date matching any configured `{day, time}` pair, in chronological
  order (…Sat 08:00 → Mon 20:00 → Sat 08:00…). Explicit `scheduled_date` stays
  as an override for one-off sessions.
- Deterministic mapping: lessons ordered by `order`, assigned to consecutive
  slots. Adding lesson #7 to a Tue/Fri course whose #6 lands on Fri → #7 lands
  next Tue. Zero date-typing.

### F3. `/postpone` — shift the world in one command

- `/postpone` (teacher): the next upcoming lesson moves to the next teaching
  slot, and **every lesson after it cascades one slot later** — the whole
  course stays consistent with the real-world calendar.
- `/postpone lesson:<n>` targets a specific lesson (everything after it shifts).
- Optional `reason:"..."` → bot announces to `#thông-báo`:
  "Buổi 5 (Async/Await) dời từ T3 12/08 → T6 15/08. Lý do: ..." — students find
  out without the teacher writing an announcement.
- Inverse: `/unpostpone` (or `/pull-forward`) reverses the last shift if pressed
  by mistake.
- Edge cases: holidays = just postpone again (each press = one more slot);
  lessons already **completed** (date in the past / attendance taken) never move.

### F4. Viewing (mostly exists, gets richer)

- `/schedule` — upgrade to a week-grouped view: `T3 12/08 — Buổi 5: Async/Await`,
  postponed lessons marked 🔁, header shows the recurring rhythm.
- `/lesson` — already shows the next lesson + topic; add countdown ("còn 2 ngày").
- Reminders (section D) read the same data: 30' before each slot, auto-open check-in.

This slice has **no external dependencies** — pure schema + logic + two commands,
and it makes Phase 8 reminders dramatically more useful.

## G. Onboarding UI & channel identity

### G1. What each auto-generated channel is for (today → proposed)

| Channel | Today | Proposed upgrade |
|---|---|---|
| `#đăng-ký` | Open to everyone; where newcomers run `/register` | Pinned **welcome embed with a [🎓 Đăng ký ngay] button** → opens a modal (display name) → registers + grants Student role. Zero slash-command knowledge needed to join. |
| `#thông-báo` | Plain public channel — anyone can chat | **Read-only for members** (only Teacher + bot post). Bot posts here: postpone notices, new-homework announcements, deadline reminders, monthly leaderboard results. |
| `#level-up` | Bot posts level-up celebrations (already wired) | Also **read-only** — it's a feed, not a chat. |
| `#bài-tập` | ⚠️ Honest answer: **decorative scaffold, wired to nothing** | Make it earn its name: bot **auto-posts every new homework** here (embed + the submit select menu), deadline reminders thread onto the post, students discuss/ask under each homework. |
| `#lệnh-bot-1/2/3` | Student + Teacher command playground | unchanged |
| `#gv-lệnh-bot` | Teacher-only command channel | unchanged |

### G2. "Join → pick roles" onboarding (the fancy-server feel)

Two layers, complementary:

- **Bot-driven (works on any server, build first):** on `guildMemberAdd`, bot
  posts a welcome embed in `#đăng-ký` mentioning the newcomer, with buttons:
  **[🎓 Đăng ký học viên]** (modal → register + Student role) and
  **[❓ Mình là ai/làm gì ở đây]** (ephemeral orientation). Optionally a
  self-serve **role-picker select menu** (interests: Frontend / Backend / Game…,
  cosmetic roles) — the "pick your roles" experience big servers have.
  Requires Server Members Intent (one toggle).
- **Discord-native onboarding screens** (the full-screen flow you see on big
  servers): requires the server to enable **Community** mode. Bots *can*
  configure it via API (`guild.editOnboarding` — prompts, default channels),
  so `/setup` could offer a "configure native onboarding" step when Community
  is on. Worth doing later; the bot-driven layer covers 90% of the value
  without the Community-mode prerequisites.

## E. Smaller UX wins (opportunistic)

- **Hide commands from the wrong roles** (giảm ngợp cho học sinh). Discord's
  mechanics here are specific:
  - Admin commands (`/setup`, `/assign-role`, `/uninstall`, `/reset`) are
    **already hidden** from non-admins via `default_member_permissions`.
  - Teacher commands can't be hidden *by the bot* based on a custom role —
    since Discord's Permissions v2, per-command role overrides can only be set
    by a server admin (or an OAuth2 user token), never by the bot token.
    The fix: set `default_member_permissions: 0` on the 6 teacher commands
    (→ invisible to everyone except admins), then a **one-time** manual step in
    Server Settings → Integrations → Code Dojo: grant the `Teacher` role on
    those commands. `/setup`'s summary will print exact instructions.
  - Net result: students' command picker shows only the ~11 student commands.
- **Welcome flow**: on member join, bot greets in `#đăng-ký` and points to
  `/register` (needs Server Members Intent — one toggle in the dev portal).
- **Modal forms** for `/course-create` / `/lesson-add` — date fields are much
  friendlier in a form than in slash-command options.
- Already logged in [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md), unchanged
  priority: boss battles, voice auto-attendance, sandboxed auto-grader, web dashboard.

---

## Data model changes (summary)

| Model | Change |
|---|---|
| `Student` | `integrations: { leetcode?: { username, verifiedAt }, github?: { username, verifiedAt } }` |
| `Homework` | `source: { type: 'manual' \| 'leetcode', slug?, difficulty?, url? }` |
| `Course` | `schedule: { slots: [{ day: number, time: string }], timezone: string }` (section F) |
| `Lesson` | `postponedCount: number` (audit trail for 🔁 badge; date stays the source of truth) |
| new `AiUsage` | per-month token/cost log for B features |

## Suggested build order (value ÷ effort)

| # | Slice | Effort | Value |
|---|---|---|---|
| 1 | **F** recurring schedule + `/postpone` + teacher-command hiding (E) + **G1** channel perms/wiring | ~2 days | High — daily teacher friction gone, no external deps |
| 2 | **A1** LeetCode import + **C** GitHub validation + **G2** welcome/onboarding | ~1–2 days | High — instant teacher convenience + first-join polish |
| 3 | **A2+A3** account linking + auto-verify scheduler | ~2–3 days | **Highest — removes grading from the loop** |
| 4 | **D** reminder scheduler (Phase 8; reads F's schedule data) | ~2 days | High — already on the roadmap |
| 5 | **B1** AI lesson/homework generation | ~2 days | High wow, low risk (human-in-the-loop) |
| 6 | **B2** AI first-pass review | ~2–3 days | Medium-high; builds on 2+5 |

Slices are independent — any order works, but 1 → 2 makes the flagship demo
("teacher imports a problem, student solves it on LeetCode, XP appears in
Discord with nobody grading anything") possible after two slices.
