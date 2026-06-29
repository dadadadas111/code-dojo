# Advanced & Future Features Log

> Ideas that are exciting but not yet scoped into the roadmap.
> Log them here so they're not forgotten. Promote to [FEATURES.md](FEATURES.md)
> when ready to implement.

---

## 🐉 Boss Battle System

**Concept:** A shared boss with HP. The whole class cooperates to defeat it.

**Mechanics:**
- Boss has a name, avatar, HP pool, and damage multiplier
- Every homework submission = damage dealt to boss
- Damage formula: `baseDamage * studentLevel * qualityMultiplier`
- Boss HP tracked in a pinned Discord embed (real-time updates)
- When HP reaches 0 → boss defeated → auto-announce + class reward

**Boss Types:**
| Type | Duration | HP | Reward |
|------|----------|-----|--------|
| Weekly Boss | 7 days | 5,000 | 150 XP each |
| Course Boss | Entire course | 50,000 | 500 XP + 200 coins each |
| Event Boss | 48 hours | 2,000 | Special achievement + role |

**Stretch:** Boss fights back — randomly "attacks" students (lose 10 XP, must answer a question to recover).

---

## 🎙️ Voice Channel Auto-Attendance

**Concept:** Instead of `/checkin`, detect who's actually in the voice channel.

**Mechanics:**
- During a scheduled lesson, monitor voice channel state
- Student present if in channel for ≥ 50% of lesson duration
- Student late if joined after first 10 minutes
- Student absent if never joined

**Edge Cases:**
- Muted/deafened? Still present.
- Joined, left, joined again? Sum total time.
- Multiple voice channels? Only monitor the designated class channel.

**Fallback:** Manual `/checkin` overrides auto-detection.

---

## 🧪 Coding Challenge Auto-Grader

**Concept:** Submit code → runs against hidden test cases → instant result.

**Architecture:**
```
Student submits code
  → API saves submission
  → Job pushed to Redis queue
  → Worker pulls job
  → Spawns Docker container (sandbox)
  → Runs code against test cases
  → Reports: passed/failed, execution time, memory
  → Result saved to submission
  → Bot DMs student with result
```

**Safety:** Strict Docker resource limits (CPU, memory, network disabled, time limit). Never run untrusted code on the host.

---

## 🌐 Web Dashboard

**Concept:** A proper web UI for teachers. Discord is great for students, but teachers need tables, charts, and bulk operations.

**Tech:** React + Tailwind CSS + TanStack Query (or just server-rendered with htmx if keeping it simple).

**Key Pages:**
| Page | Purpose |
|------|---------|
| `/courses` | List all courses, create new |
| `/courses/:id` | Course detail: lessons, homework, students |
| `/students` | Student roster, search, filter |
| `/students/:id` | Full student profile: submissions, attendance, XP history |
| `/submissions` | Bulk review: filter by status, grade in-place |
| `/analytics` | Charts: attendance rate, completion rate, score distribution |

No login system needed initially — can use a simple shared secret or IP whitelist.

---

## 📊 Analytics Engine

**Concept:** Data that helps teachers make decisions.

**Metrics:**
- Attendance rate per student / per class / over time
- Homework completion rate
- Average submission score
- Average time-to-submit (from assignment to submission)
- XP growth velocity (XP per week)
- Coin earn vs spend ratio

**At-Risk Detection:**
- Attendance < 60% in last 4 lessons → flag
- Homework completion < 50% in last 2 weeks → flag
- Score average < 50% of class average → flag
- No activity for 7+ days → flag

**Output:** `/at-risk` command or dashboard section showing flagged students.

---

## 🤖 AI-Powered Features (Future)

**AI Code Review:**
- When student submits code, GPT/Claude reviews it
- Suggests improvements, catches common bugs
- Not a replacement for teacher review — a supplement
- Flagged clearly as "AI Review" so students know

**Quiz Generation:**
- From lesson content (slides, notes), auto-generate MCQ questions
- Teacher reviews and approves before publishing

**Adaptive Difficulty:**
- Student performance history → adjust homework difficulty
- Strong student: gets harder challenge version
- Struggling student: gets extra hints, simpler version

**Learning Path:**
- Student wants to learn X → system recommends which courses/lessons

---

## 👨‍👩‍👧 Parent Portal

**Concept:** Parents get visibility into their child's progress.

**Features:**
- Weekly email digest: attendance, homework status, XP earned
- Web view: same data, always accessible
- No Discord account needed
- Opt-in by student/parent

---

## 🏆 Tournament & Events

**Hackathon Mode:**
- 2–4 hour coding event
- Special challenge released at start
- Live leaderboard updates
- Prizes for top 3

**Seasonal Events:**
- Tết Holiday Challenge (Lunar New Year themed)
- Summer Code Camp
- Christmas Coding Marathon
- Special event achievements + cosmetics

---

## 🔄 Cross-Platform

**Telegram Bot:**
- Same API, different client package (`packages/telegram-bot/`)
- All features available on both platforms
- Student chooses preferred platform

**Mobile App (React Native):**
- Push notifications for deadlines
- Quick submit (photo of handwritten code)
- Offline-capable (queue submissions)

---

## 🧩 Misc Ideas

- **Custom Emoji Rewards:** Students design emojis, teacher adds to server as reward
- **Duo Mode:** Pair programming random matching, bonus XP for collaboration
- **Code Review Marketplace:** Students earn coins reviewing peers' code
- **Knowledge Base:** Auto-generated FAQ from common questions in #coding-help
- **Study Music Bot:** Lo-fi stream during study sessions, controlled via commands
- **Year in Review:** End-of-year stats recap (Spotify Wrapped style)
- **Alumni System:** Graduated students become mentors, earn special role
