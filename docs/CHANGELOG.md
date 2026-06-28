# Changelog — Attendance Management System

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Changed — 2026-06-28 — Architecture: Remove Owner Role (Two-Role Simplification)

**Breaking change**: OWNER role removed from the system. System now has two roles: HR and EMPLOYEE.

**Removed**
- `OWNER` value from `Role` enum in Prisma schema (migration: `20260628150000_remove_owner_role`)
- `app/api/v1/owner/` — all owner API routes deleted
- `app/dashboard/owner/` — owner dashboard pages deleted
- Middleware route guard for `/dashboard/owner`
- `SEED_OWNER_*` environment variables from `.env.example`

**Changed**
- `prisma/seed.ts` — now creates a single HR Administrator account (`hr@company.com` / `ChangeMe@123`, role=HR, status=APPROVED); no env variables required for seeding
- `middleware.ts` — `ROLE_DASHBOARDS` updated to only include EMPLOYEE and HR
- `types/index.ts`, `types/next-auth.d.ts`, `lib/auth.ts`, `lib/auth-helpers.ts` — `"OWNER"` removed from all Role union types
- `components/layout/dashboard-shell.tsx` — OWNER nav entry removed
- `app/(auth)/pending/page.tsx` — OWNER removed from role→dashboard redirect map
- `.env.example` — removed `SEED_OWNER_*`, added `DIRECT_URL`

**Migration note**: Run `prisma migrate deploy` to apply `20260628150000_remove_owner_role`. Any existing OWNER rows are automatically converted to HR before the enum value is dropped.

### Added — 2026-06-28 — Sprint 2: Authentication & Account Management

**Backend**
- `POST /api/v1/auth/register` — employee self-registration with Zod validation, bcrypt (cost 12), email + employeeId uniqueness checks; returns 201
- `GET /api/v1/owner/hr-accounts` — paginated HR account list with optional `status` and `search` filters (max 100/page)
- `POST /api/v1/owner/hr-accounts` — Owner creates HR account (role=HR, status=APPROVED immediately)
- `PATCH /api/v1/owner/hr-accounts/[id]/status` — Owner deactivates (APPROVED→DEACTIVATED) or reactivates (DEACTIVATED→APPROVED) HR accounts; enforces state machine
- `lib/rate-limit.ts` — in-memory IP-based rate limiter (10 req/min); applied to `/api/v1/auth/register`
- Extended NextAuth JWT/session to carry `statusReason` so the pending page can display rejection/deactivation reasons

**Frontend**
- `/register` — full employee self-registration form (fullName, email, employeeId, department, password + confirm); shows success card on submission
- `/pending` — updated to display status-specific reason from session (e.g., "Your account registration was rejected. Reason: ...")
- `/dashboard/owner` — Owner home page with navigation cards (HR Accounts, Settings placeholder)
- `/dashboard/owner/hr-accounts` — HR account management: table with status badges, inline Create HR Account form, Deactivate/Reactivate buttons with optimistic loading state
- `DashboardShell` — upgraded from placeholder to role-aware nav bar with active-link highlighting and Sign Out button

### Added — 2026-06-25 — Sprint 1 Pre-Implementation Documentation

**Documentation**
- `docs/DECISIONS.md` — Immutable log of 17 architectural and product decisions made during planning phase, each with alternatives considered and rationale
- `docs/KNOWN_LIMITATIONS.md` — 19 known V1 limitations across infrastructure, business logic, features, and security, each with mitigation notes and V2 paths

### Added — 2026-06-24 — Architecture Review & Specification Update (v1.1)

**Documentation**
- `docs/ARCHITECTURE_REVIEW.md` — Full architecture review: 25 required changes, 10 optional improvements identified across roles, security, database, API, and reporting

**Requirements (REQUIREMENTS.md)**
- Added **Owner role** (FR-BOOT-01–03, FR-OWNER-01–06): Owner bootstrapped via seed script; creates/manages HR accounts; configures system-wide settings
- Added **system-wide settings model** (FR-OWNER-05): `app_timezone`, `late_threshold_time`, `max_break_duration_minutes`, `nightly_job_time` — configurable by Owner
- Resolved ambiguity: **break is now explicitly optional** (FR-ATT-01); valid sequences are `Start Work → End Work` or `Start Work → Start Break → End Break → End Work`
- Added **INCOMPLETE attendance status** (FR-ATT-08, FR-ATT-09): End Work not recorded → INCOMPLETE; Break started but not ended → INCOMPLETE + `break_not_completed = true`
- Added **`break_not_completed` flag** (FR-ATT-09): set by nightly job when break was opened but never closed
- Added **nightly automated job** section (FR-NIGHTLY-01–05): creates ABSENT records for no-shows; marks in-progress records INCOMPLETE
- Decided break-exceeded behavior (FR-ATT-04): actual time stored, `break_exceeded = true` flagged, warning returned — no auto-capping
- Defined late rule timezone (FR-ATT-05): uses `app_timezone` system setting
- Added `date` field assignment rule (FR-ATT-10): always calendar date of START_WORK in `app_timezone`
- Added server-side timestamp rule (FR-ATT-11): client timestamps are never used
- Revised FR-AUTH-07: HR accounts created by Owner via dashboard (not direct DB access)
- Added account status state machine (FR-AUTH-10) with explicit valid transitions
- Added status change audit trail requirement (FR-AUTH-09): `status_changed_by`, `status_changed_at`, `status_reason`
- Added employee search requirement (FR-HR-01): partial match on name or email
- Added `GET /hr/employees/[id]` requirement (FR-HR-02)
- Added HR in-app pending registration badge (FR-HR-09)
- Added `totalIncomplete` and `totalBreakExceeded` to HR summary (FR-HR-06)
- Added basic rate limiting NFR (NFR-08): 10 req/min/IP on auth endpoints
- Added basic session timeout NFR (NFR-09): 8 hours
- Added pagination cap NFR (NFR-10): max 100 records per page
- Marked system downtime handling and work-past-midnight as Out of Scope V1
- Marked Department module as Out of Scope V1 (free-text field retained)
- Marked advanced session management as Out of Scope V1

**Database Schema (DATABASE_SCHEMA.md)**
- Added `OWNER` to `Role` enum
- Added `INCOMPLETE` to `AttendanceStatus` enum; removed `HOLIDAY` and `SUNDAY` from DB enum (now virtual in API layer)
- Added `current_step` column (`AttendanceStep` enum: `WORKING`, `ON_BREAK`, `RESUMED`, `COMPLETED`, `INCOMPLETE`) to `attendance_records`
- Added `break_not_completed` boolean column to `attendance_records`
- Changed `attendance_records.status` default from `ABSENT` to `PRESENT` (row only created on START_WORK)
- Fixed `total_work_minutes` formula: now uses `COALESCE(break_duration_minutes, 0)` to handle no-break case
- Made `users.employee_id` nullable (HR and Owner have no company employee ID)
- Made `users.department` nullable (HR and Owner have no department)
- Added `users.status_reason VARCHAR(500) NULL`
- Added `users.status_changed_by UUID NULL FK → users.id (SetNull)`
- Added `users.status_changed_at TIMESTAMP NULL`
- Added soft-delete columns to `holidays`: `deleted_at TIMESTAMP NULL`, `deleted_by UUID NULL FK → users.id (SetNull)`
- Replaced `holidays.date UNIQUE` with partial unique index `WHERE deleted_at IS NULL` (applied via raw migration)
- Added new `system_settings` table (key-value store seeded with four settings)
- Added composite indexes: `(date, user_id)` and `(date, status)` on `attendance_records`
- Defined explicit `onDelete` cascade rules for all FK relations
- Updated Prisma schema to reflect all of the above

**API Specification (API_SPEC.md)**
- Applied `/api/v1` prefix to all routes
- Added `SafeUser` DTO (excludes `passwordHash` from all responses)
- Added `AttendanceRecord` DTO and `HistoryEntry` DTO (with `dayType`, `holidayName`, `displayStatus`)
- Moved `GET /holidays` out of `/hr` namespace to `/api/v1/holidays` (accessible by all authenticated roles)
- Changed `nextAction: string` to `availableActions: string[]` in today's endpoint (supports branching after START_WORK)
- Added `GET /api/v1/hr/employees/[id]` endpoint
- Added `search` query parameter to `GET /api/v1/hr/employees`
- Added `pendingCount` to employee list response (HR badge data)
- Added `reason` field to `PATCH /hr/employees/[id]/status` request body
- Updated `DELETE /hr/holidays/[id]` to soft-delete (returns `200` with deleted holiday data)
- Added `breakExceeded` filter to `GET /hr/attendance`
- Added `totalIncomplete` and `totalBreakExceeded` to HR attendance summary
- Made `startDate` / `endDate` optional (default: current month) in `GET /hr/attendance`
- Added Owner endpoint namespace: `GET/POST /owner/hr-accounts`, `PATCH /owner/hr-accounts/[id]/status`, `GET/PATCH /owner/settings`
- Added rate limiting documentation (429 response)
- Added RBAC summary table
- Added complete error code table

---

## [0.1.0] — 2026-06-24 — Initial Documentation

### Added
- `docs/REQUIREMENTS.md` — Initial functional and non-functional requirements
- `docs/DATABASE_SCHEMA.md` — Initial PostgreSQL schema with Prisma model definitions
- `docs/API_SPEC.md` — Initial REST API specification
- `docs/CHANGELOG.md` — This file
