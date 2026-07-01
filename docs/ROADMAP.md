# Development Roadmap

> Each phase delivers a **working, testable increment**. Do not move to the next phase
> until the current one is verified.

---

## Phase 0: Project Scaffold & Infrastructure

**Goal:** Team can clone, install, and run the full stack locally.

| # | Task | Status |
|---|------|--------|
| 0.1 | Monorepo setup (pnpm workspaces, tsconfig, ESLint) | ✅ Done |
| 0.2 | Docker Compose (MongoDB + Redis) | ✅ Done |
| 0.3 | Shared types package (`@code-dojo/shared`) | ✅ Done |
| 0.4 | API skeleton (Express + health check) | ✅ Done |
| 0.5 | Bot skeleton (discord.js + ping command) | ✅ Done |
| 0.6 | Environment config (.env + validation) | ✅ Done |
| 0.7 | Database connection + Mongoose setup | ✅ Done |
| 0.8 | CI placeholder (.github/workflows) | ✅ Done |

**Deliverable:** `pnpm dev` starts both API and Bot. `/ping` works in Discord.

**Estimated:** 1–2 days

---

## Phase 1: Student Management & Authentication

**Goal:** Students can register. System knows who everyone is.

| # | Task | Status |
|---|------|--------|
| 1.1 | `Student` Mongoose model + validation | ✅ Done |
| 1.2 | `POST /api/students` — Register | ✅ Done |
| 1.3 | `GET /api/students/:id` — Profile | ✅ Done |
| 1.4 | `GET /api/students` — List (paginated) | ✅ Done |
| 1.5 | `PATCH /api/students/:id` — Update | ✅ Done |
| 1.6 | `/register` slash command (Discord → API) | ✅ Done |
| 1.7 | `/profile` slash command (embed display) | ✅ Done |
| 1.8 | Discord ID ↔ Student linking | ✅ Done |

**Deliverable:** `/register` creates student. `/profile` shows XP/Level/Coins.

**Estimated:** 2–3 days

---

## Phase 2: Course & Lesson Management

**Goal:** Teachers can create courses and schedule lessons.

| # | Task | Status |
|---|------|--------|
| 2.1 | `Course` + `Lesson` Mongoose models | ✅ Done |
| 2.2 | Course CRUD API | ✅ Done |
| 2.3 | Lesson CRUD API | ✅ Done |
| 2.4 | `/lesson` slash command (view today/next lesson) | ✅ Done |
| 2.5 | `/schedule` slash command (course calendar) | ✅ Done |
| 2.6 | Teacher-only permissions (Discord roles → API auth) | ✅ Done |

**Deliverable:** Teacher creates course → adds lessons → students view schedule.

**Estimated:** 2–3 days

---

## Phase 3: Homework & Submission System

**Goal:** Core teaching loop — assign → submit → review → feedback.

| # | Task | Status |
|---|------|--------|
| 3.1 | `Homework` Mongoose model | ✅ Done |
| 3.2 | `Submission` Mongoose model | ✅ Done |
| 3.3 | Homework CRUD API | ✅ Done |
| 3.4 | Submission API (create, list, update status) | ✅ Done |
| 3.5 | `/homework` slash command (list + detail) | ✅ Done |
| 3.6 | `/submit` slash command (link + paste) | ✅ Done |
| 3.7 | `/review` slash command (teacher grades) | ✅ Done |
| 3.8 | Submission status flow: pending → grading → accepted/revision/late | ✅ Done |

**Deliverable:** Teacher assigns homework → student submits → teacher reviews.

**Estimated:** 3–4 days

---

## Phase 4: Attendance System

**Goal:** Track who showed up. Simple, reliable.

| # | Task | Status |
|---|------|--------|
| 4.1 | `Attendance` Mongoose model | ✅ Done |
| 4.2 | Attendance API (mark, list, stats) | ✅ Done |
| 4.3 | `/checkin` slash command | ✅ Done |
| 4.4 | `/attendance` command (view history) | ✅ Done |
| 4.5 | Attendance summary embed (per lesson, per student) | ✅ Done |

**Deliverable:** `/checkin` marks attendance. Teacher sees who's present/absent.

**Estimated:** 2 days

---

## Phase 5: XP & Level Engine

**Goal:** Students earn XP. Levels unlock. Discord roles sync.

| # | Task | Status |
|---|------|--------|
| 5.1 | `ActivityLog` Mongoose model (audit trail) | ✅ Done |
| 5.2 | XP calculation engine (from shared constants) | ✅ Done |
| 5.3 | XP awarded on: homework complete, attendance, early submit | ✅ Done |
| 5.4 | Level-up detection + announcement | ✅ Done |
| 5.5 | Discord role auto-assign (Beginner → Coder → ... → Legend) | ✅ Done |
| 5.6 | XP displayed in `/profile` | ✅ Done |

**Deliverable:** Students see XP. Leveling up changes their Discord role.

**Estimated:** 2–3 days

---

## Phase 6: Coin System

**Goal:** Separate currency for spending. Independent of XP.

| # | Task | Status |
|---|------|--------|
| 6.1 | Coin balance field on Student | ⬜ |
| 6.2 | Coin earning triggers (parallel to XP) | ⬜ |
| 6.3 | Coin transaction history | ⬜ |
| 6.4 | Coin display in `/profile` | ⬜ |

**Deliverable:** Coins accumulate. Visible in profile.

**Estimated:** 1–2 days

---

## Phase 7: Leaderboard

**Goal:** Competition drives engagement.

| # | Task | Status |
|---|------|--------|
| 7.1 | Leaderboard API (Top XP, Top Coins, Top Streak) | ⬜ |
| 7.2 | Redis sorted sets for fast ranking | ⬜ |
| 7.3 | `/leaderboard` slash command (paginated embed) | ⬜ |
| 7.4 | Monthly reset option | ⬜ |

**Deliverable:** `/leaderboard` shows rankings. Redis-backed for performance.

**Estimated:** 2 days

---

## Phase 8: Reminder Scheduler

**Goal:** No more manual "nộp bài đi em ơi" messages.

| # | Task | Status |
|---|------|--------|
| 8.1 | Deadline tracking (cron/agenda) | ⬜ |
| 8.2 | 24h-before reminder DM | ⬜ |
| 8.3 | 1h-before reminder DM | ⬜ |
| 8.4 | Overdue notice + late penalty | ⬜ |
| 8.5 | `/daily` streak check-in command | ⬜ |
| 8.6 | Streak tracking + streak-break notification | ⬜ |

**Deliverable:** System sends reminders automatically. Streak mechanic active.

**Estimated:** 3–4 days

---

## Phase 9: Achievement Engine

**Goal:** Unlockable achievements create dopamine hits.

| # | Task | Status |
|---|------|--------|
| 9.1 | `Achievement` + `StudentAchievement` models | ⬜ |
| 9.2 | Achievement condition evaluator | ⬜ |
| 9.3 | Trigger checks (on submit, on checkin, on level up) | ⬜ |
| 9.4 | Discord announcement embed when earned | ⬜ |
| 9.5 | `/achievements` command (list earned + locked) | ⬜ |
| 9.6 | Pre-built achievements: First Blood, Perfect Attendance, No Sleep, Speed Runner, Bug Hunter | ⬜ |

**Deliverable:** Students unlock achievements. Server gets announcements.

**Estimated:** 3–4 days

---

## Phase 10: Reward Shop

**Goal:** Give coins a purpose. Students choose their rewards.

| # | Task | Status |
|---|------|--------|
| 10.1 | `ShopItem` + `Purchase` models | ⬜ |
| 10.2 | Shop API (list items, purchase, use) | ⬜ |
| 10.3 | `/shop` slash command (browse + buy) | ⬜ |
| 10.4 | Consumable items: hint (50 coin), late submit (200 coin), skip quiz (500 coin) | ⬜ |
| 10.5 | Cosmetic items: nickname color, special role, custom emoji | ⬜ |

**Deliverable:** Students spend coins in shop. Items have effects.

**Estimated:** 3–4 days

---

## Phase 11: Teacher Dashboard

**Goal:** Teacher sees everything at a glance. No more digging through menus.

| # | Task | Status |
|---|------|--------|
| 11.1 | Dashboard API (aggregate stats) | ⬜ |
| 11.2 | `/stats` slash command (class overview) | ⬜ |
| 11.3 | `/missing` command (who hasn't submitted) | ⬜ |
| 11.4 | `/falling-behind` command (low performers) | ⬜ |
| 11.5 | Homework completion rate chart | ⬜ |
| 11.6 | Export to CSV | ⬜ |

**Deliverable:** Teacher commands give instant answers. No manual tracking.

**Estimated:** 3–4 days

---

## Phase 12: Polish & Advanced Features

**Goal:** Everything that makes it "wow". See [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md).

| # | Task | Status |
|---|------|--------|
| 12.1 | Boss Battle system | ⬜ |
| 12.2 | Voice channel auto-attendance | ⬜ |
| 12.3 | Coding challenge auto-grader | ⬜ |
| 12.4 | Multi-class support | ⬜ |
| 12.5 | Web dashboard (React) | ⬜ |
| 12.6 | Analytics & reports | ⬜ |

**Estimated:** Ongoing

---

## Timeline Summary

| Phase | Focus | Estimate |
|-------|-------|----------|
| 0 | Scaffold | 1–2 days |
| 1 | Students | 2–3 days |
| 2 | Courses | 2–3 days |
| 3 | Homework | 3–4 days |
| 4 | Attendance | 2 days |
| 5 | XP/Level | 2–3 days |
| 6 | Coins | 1–2 days |
| 7 | Leaderboard | 2 days |
| 8 | Reminders | 3–4 days |
| 9 | Achievements | 3–4 days |
| 10 | Shop | 3–4 days |
| 11 | Dashboard | 3–4 days |
| 12 | Polish | Ongoing |

**Total MVP (Phases 0–7):** ~3–4 weeks part-time
**Total Full (Phases 0–11):** ~6–8 weeks part-time
