# Feature Checklist

> **P0 = MVP** — must ship before anyone uses it.
> **P1 = Core** — essential for daily operation.
> **P2 = Enhanced** — major quality-of-life improvements.
> **P3 = Advanced** — nice to have, do later.

---

## P0 — Minimum Viable Product

The system must do these things before a real class can use it.

### Student Management
- [ ] Student registration (Discord ID + display name)
- [ ] Student profile with XP, Level, Coins display
- [ ] `/register` slash command
- [ ] `/profile` slash command

### Course & Lesson
- [ ] Teacher can create a course
- [ ] Teacher can add lessons to a course
- [ ] `/lesson` command (view current/upcoming lesson info)
- [ ] `/schedule` command (list all lessons)

### Homework
- [ ] Teacher can create homework assignments
- [ ] Homework has: title, description, type, deadline, XP reward, coin reward
- [ ] `/homework` command (list pending + completed)
- [ ] `/submit` command (GitHub link or paste code)

### Submission Review
- [ ] Teacher can view all submissions
- [ ] Teacher can grade: accepted / needs revision
- [ ] Student sees feedback

### Permissions
- [ ] Teacher role (Discord role → API access control)
- [ ] Student role (limited access)

---

## P1 — Core Features

The system is usable daily with these.

### Attendance
- [ ] `/checkin` command (manual check-in per lesson)
- [ ] `/attendance` command (view personal attendance)
- [ ] Teacher can view class attendance per lesson
- [ ] Attendance status: present / late / absent

### XP System
- [ ] XP awarded automatically on homework completion
- [ ] XP awarded on attendance
- [ ] XP bonus for early submission
- [ ] Activity log (student can see "how did I earn this XP?")
- [ ] XP displayed in `/profile`

### Level System
- [ ] Level calculated from total XP
- [ ] Level thresholds: Beginner(1) → Coder(2) → Programmer(3) → Developer(4) → Master(5) → Legend(6)
- [ ] Discord role auto-assignment on level up
- [ ] Level-up announcement in a dedicated channel

### Leaderboard
- [ ] `/leaderboard` command
- [ ] Top XP ranking
- [ ] Top Coins ranking
- [ ] Paginated (top 10, next 10, etc.)

### Coin System (Basic)
- [ ] Coins earned alongside XP
- [ ] Coin balance shown in `/profile`

---

## P2 — Enhanced Features

These make the system feel "gamified" and reduce teacher busywork.

### Daily Streak
- [ ] `/daily` command (check-in for streak bonus)
- [ ] Streak counter (consecutive days)
- [ ] Streak milestone bonuses (7 days, 30 days, 100 days)
- [ ] Streak break notification (loss aversion mechanic)

### Reminders
- [ ] Auto-DM 24h before homework deadline
- [ ] Auto-DM 1h before homework deadline
- [ ] Overdue notice
- [ ] Class reminder 30min before lesson

### Quiz Type
- [ ] Multiple-choice quiz homework type
- [ ] Auto-grading (correct answer → instant score)
- [ ] Quiz results display

### Achievement Engine
- [ ] Achievements defined in database
- [ ] Condition checking on key events (submit, attend, level up)
- [ ] Achievement earned → announcement in #achievements channel
- [ ] `/achievements` command (list earned + locked)
- [ ] Pre-built achievements:
  - [ ] First Blood — first submission
  - [ ] Perfect Attendance — attend 10 consecutive lessons
  - [ ] No Sleep — submit between 12AM–5AM
  - [ ] Speed Runner — submit within 10min of homework release
  - [ ] Bug Hunter — first accepted coding submission
  - [ ] Streak Master — 30-day streak
  - [ ] Centurion — 100 total XP
  - [ ] Rich Kid — 500 coins accumulated
  - [ ] Overachiever — submit all homework in a course

### Reward Shop
- [ ] `/shop` command (browse items)
- [ ] `/buy` command (purchase item)
- [ ] Consumable items:
  - [ ] Hint (50 coin) — get a hint for current homework
  - [ ] Late Pass (200 coin) — submit after deadline without penalty
  - [ ] Skip Pass (500 coin) — skip one quiz, get average score
- [ ] Cosmetic items:
  - [ ] Nickname color change
  - [ ] Special Discord role (temporary)
  - [ ] Custom emoji unlock

---

## P3 — Advanced & Future

Stretch goals. Implement after everything above is stable.

### Boss Battle
- [ ] Boss defined with HP pool
- [ ] Every homework submission deals damage
- [ ] Boss HP visible in a channel (pinned embed)
- [ ] Boss defeated → whole class reward
- [ ] Boss types: weekly boss, course boss, special event boss

### Voice Attendance
- [ ] Auto-detect students in voice channel during lesson time
- [ ] Mark present if in channel for ≥ 50% of lesson
- [ ] Mark late if joined after 10min
- [ ] Fallback to manual `/checkin`

### Coding Challenge Auto-Grader
- [ ] Code submission runs against test cases
- [ ] Sandbox execution (Docker container)
- [ ] Time/memory limits
- [ ] Instant pass/fail result
- [ ] Challenge leaderboard (fastest solution, most efficient)

### Multi-Class Support
- [ ] Teacher manages multiple courses simultaneously
- [ ] Student enrolled in multiple courses
- [ ] Per-course leaderboards
- [ ] Per-course Discord category auto-creation

### Web Dashboard
- [ ] Teacher web UI (React + Tailwind)
- [ ] Student overview table (sortable, filterable)
- [ ] Grade submission in bulk
- [ ] Analytics charts (attendance rate, completion rate, score distribution)
- [ ] Export to Excel/CSV

### Analytics & Reports
- [ ] Student progress report (per course)
- [ ] Class performance summary
- [ ] At-risk student detection (low attendance + missing homework)
- [ ] Weekly digest (auto-post to teacher channel)

### Telegram Integration
- [ ] Telegram bot (same API, different client)
- [ ] Cross-platform: Discord + Telegram share same backend

### Parent Portal
- [ ] Parent view of student progress
- [ ] Weekly email report to parents
- [ ] Attendance notification to parents

### AI Features
- [ ] AI-powered code review (suggest improvements)
- [ ] Auto-generate quiz questions from lesson content
- [ ] Personalized homework difficulty based on student level
- [ ] Learning path recommendations

### Social Features
- [ ] Peer review (students review each other's code)
- [ ] Pair programming matching
- [ ] Study group formation
- [ ] Mentorship pairing (advanced + beginner)

### Event System
- [ ] Hackathon mode (time-limited challenge)
- [ ] Tournament bracket
- [ ] Seasonal events (Tet, Christmas, Summer)
- [ ] Limited-time achievements
