# Architecture

## High-Level Design

```
┌──────────────────────────────────────────────────────────┐
│                     Discord (UI Layer)                    │
│  Slash Commands  │  Embeds  │  Voice  │  Roles  │  DMs   │
└────────────────────────┬─────────────────────────────────┘
                         │  WebSocket (Gateway)
                         │  HTTP (Interactions)
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   Discord Bot (Thin Client)               │
│  • Parse slash commands                                   │
│  • Call REST API                                          │
│  • Format + send embeds                                   │
│  • NO business logic                                      │
│  • NO direct database access                              │
└────────────────────────┬─────────────────────────────────┘
                         │  HTTP (REST)
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   REST API (Express)                      │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │Students │ │ Courses  │ │ Homework │ │ Attendance  │  │
│  │ Router  │ │ Router   │ │ Router   │ │ Router      │  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       │           │            │               │         │
│  ┌────┴────┐ ┌────┴─────┐ ┌────┴─────┐ ┌──────┴──────┐  │
│  │Student  │ │ Course   │ │Homework  │ │Attendance   │  │
│  │Service  │ │ Service  │ │Service   │ │Service      │  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       │           │            │               │         │
│  ┌────┴───────────┴────────────┴───────────────┴──────┐  │
│  │              Gamification Engine                    │  │
│  │  ┌──────┐  ┌───────┐  ┌────────────┐  ┌─────────┐  │  │
│  │  │  XP  │  │ Coin  │  │Achievement │  │  Streak  │  │  │
│  │  │Engine│  │Engine │  │  Engine    │  │  Engine  │  │  │
│  │  └──────┘  └───────┘  └────────────┘  └─────────┘  │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │                                │
│              ┌───────────┴───────────┐                    │
│              │    Data Access Layer  │                    │
│              │  (Mongoose Models)    │                    │
│              └───────────┬───────────┘                    │
└──────────────────────────┼────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
        ┌──────────┐             ┌──────────┐
        │ MongoDB  │             │  Redis   │
        │ (Primary │             │ (Cache,  │
        │  Store)  │             │  Queue,  │
        └──────────┘             │  LB)     │
                                 └──────────┘
```

## Design Principles

### 1. Bot is Thin
The Discord bot only does three things:
1. **Parse** incoming slash commands and interactions
2. **Call** the REST API (authenticated as the bot)
3. **Format** the API response into Discord embeds/messages

The bot must **never**:
- Access MongoDB directly
- Contain business logic
- Calculate XP/levels
- Validate submissions

This ensures the system works with any client (Telegram, Web, Mobile).

### 2. API-First
Every feature starts as an API endpoint, then gets a Discord command.
The API is the **source of truth** — Discord is just one consumer.

### 3. Event-Driven Gamification
Gamification engines (XP, Coins, Achievements, Streaks) are triggered by events,
not by the command handlers directly.

```typescript
// Not this:
async function handleSubmit(studentId, homeworkId) {
  const submission = await saveSubmission(...);
  await addXp(studentId, 100);        // ❌ Tight coupling
  await checkAchievements(studentId); // ❌
}

// But this:
async function handleSubmit(studentId, homeworkId) {
  const submission = await saveSubmission(...);
  await eventBus.emit('submission.created', { studentId, homeworkId });
  // XP engine listens for 'submission.created'
  // Achievement engine listens for 'submission.created'
  // Streak engine listens for 'submission.created'
}
```

### 4. Stateless API
No sessions. No sticky connections. Each request is authenticated via a simple
bot token or JWT (for future web dashboard). This makes horizontal scaling trivial.

## Authentication

### Phase 1: Bot-to-API (Internal)
Simple shared secret (`API_KEY`) in headers. The bot and API are deployed together,
so a static token is sufficient.

```
Bot → API:  Authorization: Bearer <API_KEY>
```

### Phase 2: Web Dashboard (Future)
JWT-based auth for teachers. Students don't log into the web dashboard (they use Discord).

```
Teacher → Login → JWT → API:  Authorization: Bearer <JWT>
```

## Data Flow Examples

### Student submits homework
```
1. Student types /submit link:https://github.com/... in Discord
2. Discord sends interaction to Bot
3. Bot calls: POST /api/submissions { homeworkId, studentId, githubLink }
4. API validates:
   - Student exists?
   - Homework exists?
   - Not past deadline? (or has late pass?)
   - Not already submitted?
5. API saves Submission (status: 'pending')
6. API emits event: 'submission.created'
7. XP Engine listens → awards XP (delayed, only on accept)
8. Achievement Engine listens → checks "First Blood", "Speed Runner"
9. API returns submission to Bot
10. Bot formats confirmation embed → sends to Discord
```

### Teacher grades submission
```
1. Teacher uses /review command (or future web dashboard)
2. Bot calls: PATCH /api/submissions/:id { status: 'accepted', score: 85, feedback: '...' }
3. API updates submission
4. API emits event: 'submission.graded'
5. XP Engine → awards XP to student
6. Coin Engine → awards coins to student
7. Level Engine → checks if level-up needed
8. Bot DMs student: "Bài tập của bạn đã được chấm! +100 XP"
```

## Database Schema (MongoDB)

### Collections

| Collection | Purpose | Indexes |
|-----------|---------|---------|
| `students` | Student profiles | `discordId` (unique), `level` |
| `courses` | Course metadata | `isActive` |
| `lessons` | Lessons within courses | `courseId`, `scheduledDate` |
| `homeworks` | Homework assignments | `courseId`, `deadline`, `isActive` |
| `submissions` | Student submissions | `homeworkId+studentId` (compound), `status` |
| `attendances` | Attendance records | `lessonId+studentId` (compound) |
| `achievements` | Achievement definitions | `id` |
| `student_achievements` | Earned achievements | `studentId`, `achievementId+studentId` (compound) |
| `shop_items` | Items available in shop | `isActive` |
| `purchases` | Student purchases | `studentId`, `itemId` |
| `activity_logs` | Audit trail for XP/coins | `studentId`, `type`, `createdAt` |

### Key Relationships
```
Student 1 ──── * Submission
Student 1 ──── * Attendance
Student 1 ──── * ActivityLog
Student 1 ──── * StudentAchievement
Student 1 ──── * Purchase

Course 1 ──── * Lesson
Course 1 ──── * Homework

Homework 1 ──── * Submission
Lesson 1 ──── * Attendance

Achievement 1 ──── * StudentAchievement
ShopItem 1 ──── * Purchase
```

## Redis Usage

| Use Case | Data Structure | Key Pattern |
|----------|---------------|-------------|
| XP Leaderboard | Sorted Set | `leaderboard:xp` |
| Coin Leaderboard | Sorted Set | `leaderboard:coins` |
| Streak Leaderboard | Sorted Set | `leaderboard:streak` |
| Job Queue (reminders) | List / BullMQ | `queue:reminders` |
| Rate Limiting | String (TTL) | `ratelimit:<userId>:<command>` |
| Cache: Student Profile | String (JSON) | `cache:student:<id>` (TTL: 5min) |

## API Route Design

```
/api
├── /health                    GET     Health check
├── /students
│   ├── /                      GET     List students (paginated)
│   ├── /                      POST    Register student
│   ├── /:id                   GET     Student profile
│   ├── /:id                   PATCH   Update student
│   └── /:id/activity          GET     Activity log
├── /courses
│   ├── /                      GET     List courses
│   ├── /                      POST    Create course [TEACHER]
│   ├── /:id                   GET     Course detail
│   └── /:id                   PATCH   Update course [TEACHER]
├── /courses/:courseId/lessons
│   ├── /                      GET     List lessons
│   ├── /                      POST    Create lesson [TEACHER]
│   ├── /:id                   GET     Lesson detail
│   └── /:id                   PATCH   Update lesson [TEACHER]
├── /courses/:courseId/homework
│   ├── /                      GET     List homework
│   ├── /                      POST    Create homework [TEACHER]
│   └── /:id                   GET     Homework detail
├── /submissions
│   ├── /                      POST    Submit homework
│   ├── /:id                   GET     Submission detail
│   └── /:id                   PATCH   Grade submission [TEACHER]
├── /attendance
│   ├── /checkin               POST    Check in to lesson
│   ├── /lesson/:lessonId      GET     Attendance for lesson [TEACHER]
│   └── /student/:studentId    GET     Attendance for student
├── /gamification
│   ├── /leaderboard/xp        GET     XP leaderboard
│   ├── /leaderboard/coins     GET     Coin leaderboard
│   └── /achievements          GET     All achievements
├── /shop
│   ├── /items                 GET     Available items
│   └── /purchase              POST    Buy item
└── /dashboard                 GET     Teacher dashboard stats [TEACHER]
```

## Technology Decisions

### Why Express (not Fastify)?
Express has the largest ecosystem, most tutorials, and your team likely knows it.
We can swap to Fastify later if performance becomes an issue — the service layer
won't change.

### Why MongoDB (not PostgreSQL)?
- Flexible schema: homework types vary, achievement conditions are semi-structured
- No complex JOINs needed: most queries are single-collection
- Discord bot data is inherently document-shaped
- Mongoose provides enough schema validation

### Why Redis (not just MongoDB)?
- Leaderboards need sorted sets (MongoDB can do it but it's slow and resource-heavy)
- Job queues for reminders
- Rate limiting for slash commands
- Cache for frequently-accessed profiles

### Why TypeScript?
- Shared types package between API and Bot
- Catch bugs at compile time, not runtime
- Better IDE experience for the team
- Discord.js has excellent TS support
