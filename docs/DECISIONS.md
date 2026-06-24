# Architecture Decisions — Attendance Management System

All key decisions made during the planning and specification phase. This is an append-only log — do not delete entries, only add new ones or mark decisions as superseded.

---

## DEC-001: Tech Stack

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: Next.js 14 (App Router) + TypeScript (strict) + Prisma ORM + PostgreSQL 15 + Tailwind CSS + shadcn/ui

**Alternatives considered**:
- Express.js + React (SPA): Requires manual setup of routing, SSR, and API layer. No built-in auth, SSG, or ISR. Rejected.
- Remix: Similar capability to Next.js but smaller ecosystem and fewer production references at scale.
- Django/FastAPI + React: Two separate deployments, more DevOps overhead. Rejected for a small-team HR system.

**Rationale**: Next.js gives us a single deployment artifact, collocated API routes, React Server Components for zero-JS server rendering, and first-class TypeScript support. Prisma provides type-safe database access and a declarative migration system. PostgreSQL is the industry standard for relational data. shadcn/ui provides accessible, customizable components without a third-party bundle.

---

## DEC-002: Authentication Library

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: NextAuth.js v4 with JWT strategy and Credentials provider

**Alternatives considered**:
- Auth.js v5 (NextAuth v5): In release candidate as of planning date; API surface still changing. Rejected for production use.
- Clerk: External SaaS; user data leaves the system; cannot enforce HR approval gate at provider level; monthly cost. Rejected.
- Auth0: Same concerns as Clerk. Rejected.
- Custom JWT implementation: Requires building CSRF protection, token rotation, cookie security, and session refresh manually. NextAuth provides all of this for free. Rejected.

**Rationale**: NextAuth v4 is battle-tested, has extensive documentation, and integrates cleanly with Next.js App Router via `getServerSession()` on the server and `getToken()` at the Edge. JWT strategy eliminates the need for a sessions table.

---

## DEC-003: NextAuth Route Path

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: Mount NextAuth handler at `/api/v1/auth/[...nextauth]` (not the default `/api/auth/[...nextauth]`). Configure `SessionProvider` with `basePath="/api/v1/auth"` so client-side helpers (`signIn`, `signOut`, `useSession`) use the same path.

**Rationale**: All application API routes use the `/api/v1` prefix for versioning. Auth is an application concern, so it belongs under the same prefix. The `basePath` prop on `SessionProvider` makes this work transparently for all client-side NextAuth functions.

---

## DEC-004: Password Hashing

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: bcryptjs (pure JavaScript) with cost factor 12

**Alternatives considered**:
- `bcrypt` (native Node.js bindings): Faster, but requires native build tools (node-gyp) on every deployment target. Rejected for operational simplicity.
- Argon2: More modern, but no well-maintained pure-JS option; native bindings required. Rejected.
- scrypt: Built into Node.js crypto module, but less community familiarity for auth use cases. Deferred to V2 consideration.

**Rationale**: `bcryptjs` requires no native dependencies, works identically across all environments (local, CI, Docker, serverless), and cost factor 12 meets NFR-03. The performance difference vs native bcrypt is negligible for an authentication flow.

---

## DEC-005: Date and Timezone Handling

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: `date-fns` + `date-fns-tz` for all date manipulation. Single `app_timezone` system setting (IANA timezone string) as the reference for all business rule evaluations.

**Alternatives considered**:
- `moment.js` + `moment-timezone`: Large bundle size; mutable API; project in maintenance mode. Rejected.
- `dayjs` + `dayjs/plugin/timezone`: Smaller, but `date-fns` has broader TypeScript coverage and a more functional API (pure functions, no mutation). Rejected.
- `Luxon`: Excellent, but less commonly used in Next.js ecosystems; fewer examples. Rejected.
- Native `Intl` API: Does not provide arithmetic utilities. Rejected for business logic use.

**Rationale**: `date-fns` is tree-shakeable, immutable, and fully typed. `date-fns-tz` adds IANA timezone support needed for `app_timezone`. The pair is the most popular date handling choice in the Next.js community.

---

## DEC-006: Rate Limiting Strategy

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: `lru-cache`-based in-memory rate limiter applied in API route handlers (Node.js runtime). Not implemented in Edge middleware.

**Trade-offs accepted**:
- Does NOT work across multiple server instances (horizontal scaling). Documented in KNOWN_LIMITATIONS.md (KL-001).
- Resets on server restart.
- Sufficient for V1 (single-instance deployment assumed).

**Rationale**: NFR-08 requires "basic" rate limiting only. A Redis-based distributed limiter adds infrastructure complexity inappropriate for V1. Edge middleware cannot maintain shared in-memory state across requests. The in-memory approach in Node.js API routes provides adequate protection for a single-instance deployment.

---

## DEC-007: UI Component System

**Status**: Accepted  
**Date**: 2026-06-24

**Decision**: shadcn/ui — New York style, Slate base color, CSS variables enabled, RSC mode enabled

**Alternatives considered**:
- Material UI (MUI): Large bundle, opinionated styling that conflicts with Tailwind, difficult to override. Rejected.
- Chakra UI: Not Tailwind-native; requires its own CSS-in-JS runtime. Rejected.
- Headless UI (Tailwind Labs): Minimal components; would require building most UI primitives from scratch. Rejected.
- Pure Tailwind + custom components: Maximum flexibility but high initial development cost. Deferred to V2 if shadcn proves limiting.

**Rationale**: shadcn/ui copies component source into the project, providing full ownership and no black-box dependency. Built on Radix UI primitives for accessibility. New York style is more compact and appropriate for data-dense HR dashboards. Slate color is neutral and professional.

---

## DEC-008: Break is Optional

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: Break is optional. Two valid sequences: `Start Work → End Work` OR `Start Work → Start Break → End Break → End Work`. Skipping the break entirely is allowed.

**Rationale**: The initial spec was ambiguous. Requiring a break creates operational burden and forces employees to take breaks they may not need. Optional break aligns with standard attendance system behavior and allows `availableActions` to return `["START_BREAK", "END_WORK"]` when break hasn't been taken yet.

---

## DEC-009: Break Exceeded — Flag Only, No Auto-Cap

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: When `End Break` is recorded and break duration exceeds `max_break_duration_minutes`, the actual timestamp is stored unchanged. `break_exceeded = true` is set, and a warning is returned in the API response. No auto-capping, no blocking.

**Rationale**: Auto-capping break time creates misleading records (stored time ≠ actual time). Blocking `End Break` when the cap is exceeded leaves the employee stranded in `ON_BREAK` state permanently. Flagging with a warning gives HR visibility while allowing the employee to complete their day.

---

## DEC-010: Absent Tracking — Nightly Job

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: A nightly job runs at `nightly_job_time` (default 23:59 in `app_timezone`). It creates `ABSENT` records for employees with no attendance on the current working day, and marks in-progress records as `INCOMPLETE`.

**Alternatives considered**:
- On-demand computation (virtual absences): No ABSENT rows stored; absences computed when HR queries. Rejected because HR summary metrics (total absent, total incomplete) would require expensive full-scan queries across employee list and date range on every report view.

**Rationale**: Storing ABSENT records makes HR reporting queries simple and fast (indexed scans on `date, status`). The nightly job is implemented as a protected internal HTTP endpoint callable from any external scheduler (OS cron, GitHub Actions, etc.).

---

## DEC-011: Holiday Soft Delete with Partial Unique Index

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: Holidays are never hard-deleted. `deleted_at` and `deleted_by` columns mark deleted records. A partial unique index `WHERE deleted_at IS NULL` enforces one active holiday per date while allowing the same date to be re-added after deletion.

**Implementation note**: Prisma does not support partial unique indexes natively. The index is added via raw SQL appended to the initial migration file before applying.

**Rationale**: Audit trail preservation — knowing when and who deleted a holiday matters for HR accountability. The partial index correctly handles uniqueness for the soft-delete pattern without blocking re-addition of the same date.

---

## DEC-012: Owner Bootstrap — Seed Script Only

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: The Owner account is created exclusively via `prisma db seed`. There is no UI route or API endpoint to create an Owner. The seed uses `upsert` for idempotency (safe to run multiple times).

**Rationale**: Only one Owner account is ever needed. A UI for Owner creation would require either a one-time setup wizard (complex) or an unauthenticated API endpoint (security risk). The seed script approach is simpler, more secure, and standard for bootstrap accounts.

---

## DEC-013: Department — Free-Text in V1

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: `department` is a `VARCHAR(100)` free-text field on the `users` table with no foreign key to a Departments table. HR filtering uses case-insensitive `ILIKE`. No Departments table in V1.

**Rationale**: A Departments table requires additional CRUD screens for HR and adds complexity disproportionate to V1 scope. Free-text with `ILIKE` filtering provides 90% of the value at 10% of the implementation cost. A Departments table is explicitly deferred to V2.

---

## DEC-014: System Settings — Database Key-Value Store

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: Runtime-configurable settings (`app_timezone`, `late_threshold_time`, `max_break_duration_minutes`, `nightly_job_time`) are stored in a `system_settings` table. Owner updates them via the Owner dashboard UI with no code redeploy needed.

**Alternatives considered**:
- Environment variables: Requires a server restart/redeploy to change. Rejected for settings that business owners need to adjust without developer involvement.
- Config file (JSON/YAML): Same drawback as env vars. Rejected.

**Rationale**: Database storage makes settings runtime-configurable by the Owner. A short-TTL in-memory cache will be added in Sprint 7 to avoid per-request DB reads.

---

## DEC-015: Explicit State Machine Column (`current_step`)

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: `current_step` column (enum: `WORKING`, `ON_BREAK`, `RESUMED`, `COMPLETED`, `INCOMPLETE`) explicitly tracks attendance progression rather than deriving state from NULL timestamp columns.

**Rationale**: Deriving state from NULLs is ambiguous with optional break. A record with `start_work_at` set and `start_break_at` NULL could mean "break not started yet" OR "break was skipped." The `current_step` column makes state unambiguous at all times and eliminates complex NULL-chaining logic in every query and API handler.

---

## DEC-016: `availableActions` Array (not `nextAction` String)

**Status**: Accepted  
**Date**: 2026-06-24 (resolved during Architecture Review)

**Decision**: The today's-attendance API returns `availableActions: string[]` rather than `nextAction: string`. This allows the API to return `["START_BREAK", "END_WORK"]` after `START_WORK` when break hasn't been taken yet.

**Rationale**: A single `nextAction` field cannot represent a branching choice. The array form accurately models the state machine's multi-path transitions and is forward-compatible with any additional future actions.

---

## DEC-017: PENDING/Non-Approved Users — Authenticate but Redirect to `/pending`

**Status**: Accepted  
**Date**: 2026-06-24 (decided during Sprint 1 implementation)

**Decision**: The `authorize()` function in NextAuth allows users of any status (PENDING, REJECTED, DEACTIVATED, APPROVED) to authenticate if their password is correct. The Edge middleware then redirects non-APPROVED users to `/pending`, where they see a status-specific message.

**Rationale**: FR-AUTH-03 states non-APPROVED users "cannot log in" in the functional sense (cannot access the dashboard). However, allowing authentication and showing their status on `/pending` provides better UX than a generic "invalid credentials" error. This pattern is common in SaaS products (GitHub email verification, Slack workspace approval). The `/pending` page serves as a useful holding area for the registration → HR approval → access flow.
