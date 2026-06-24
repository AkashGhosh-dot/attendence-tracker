# Implementation Roadmap — Attendance Management System

**Version**: 1.0  
**Created**: 2026-06-24  
**Status**: PENDING APPROVAL — No code may be written until this roadmap is approved.

---

## Overview

Seven sprints, each representing a vertical slice of working functionality. Each sprint must pass its exit criteria before the next sprint begins. All API routes follow the `/api/v1` prefix. All code is TypeScript with strict mode.

**Stack**: Next.js 14 (App Router) · Prisma · PostgreSQL · NextAuth.js · Tailwind CSS

---

## Sprint 1 — Project Setup & Infrastructure

**Goal**: A running Next.js application connected to PostgreSQL with the full database schema applied, the Owner account seeded, and role-based middleware in place. No UI beyond a login page.

### Backend Tasks
- [ ] Initialize Next.js 14 project with TypeScript (strict), Tailwind CSS, ESLint
- [ ] Configure Prisma with PostgreSQL datasource
- [ ] Write complete Prisma schema (`users`, `attendance_records`, `holidays`, `system_settings`) per DATABASE_SCHEMA.md
- [ ] Create initial Prisma migration
- [ ] Apply partial unique index for holidays via raw SQL in migration: `CREATE UNIQUE INDEX holidays_date_active_unique ON holidays (date) WHERE deleted_at IS NULL;`
- [ ] Write seed script (`prisma/seed.ts`): creates Owner account + inserts four default `system_settings` rows
- [ ] Configure NextAuth.js with Credentials provider at `/api/v1/auth/[...nextauth]`
- [ ] Write Next.js middleware (`middleware.ts`) that enforces role-based route protection:
  - `/dashboard/employee/*` → requires `role = EMPLOYEE` and `status = APPROVED`
  - `/dashboard/hr/*` → requires `role = HR` and `status = APPROVED`
  - `/dashboard/owner/*` → requires `role = OWNER`
  - Unauthenticated requests → redirect to `/login`
  - Authenticated with PENDING/REJECTED/DEACTIVATED status → redirect to `/pending`
- [ ] Configure environment variables structure (`.env.example`): `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- [ ] Set up project folder structure:
  ```
  app/
    api/v1/
    (auth)/login/
    (auth)/register/
    (auth)/pending/
    dashboard/employee/
    dashboard/hr/
    dashboard/owner/
  lib/
    prisma.ts          ← singleton Prisma client
    auth.ts            ← NextAuth config
    middleware/        ← role guards
    settings.ts        ← helper to read system_settings from DB
  types/
    index.ts           ← shared TypeScript types (SafeUser, AttendanceRecord DTOs)
  components/
    ui/                ← shared UI components
  ```

### Frontend Tasks
- [ ] `/login` page — email + password form, role-aware redirect on success
- [ ] `/pending` page — displays account status message (PENDING, REJECTED, or DEACTIVATED) with appropriate explanation

### Exit Criteria
- `npm run dev` starts without errors
- `npx prisma migrate dev` applies all migrations successfully
- `npx prisma db seed` creates the Owner account and 4 system settings rows
- Owner can log in at `/login` and is redirected to `/dashboard/owner`
- Role middleware redirects unauthenticated users to `/login`
- `.env.example` documents all required environment variables

---

## Sprint 2 — Authentication & Account Management

**Goal**: Complete registration and login flows for all three roles. Employees can self-register. Owner can create HR accounts. PENDING employees see a status page. Rate limiting on auth endpoints.

### Backend Tasks
- [ ] `POST /api/v1/auth/register` — employee self-registration endpoint
  - Validate: fullName, email (format), password (≥ 8 chars), employeeId (non-empty), department (non-empty)
  - Check uniqueness: email, employeeId
  - Hash password with bcrypt (cost 12)
  - Insert user with `role = EMPLOYEE`, `status = PENDING`
  - Return `201` with message
- [ ] Extend NextAuth credentials handler:
  - Reject login if `status ≠ APPROVED`
  - Return status-specific error message for non-approved accounts
  - Include `id`, `role`, `status`, `fullName` in session token
- [ ] `POST /api/v1/owner/hr-accounts` — Owner creates HR account
  - Validate: fullName, email, password
  - Insert with `role = HR`, `status = APPROVED`
- [ ] `GET /api/v1/owner/hr-accounts` — Owner lists HR accounts with optional status/search filters
- [ ] `PATCH /api/v1/owner/hr-accounts/[id]/status` — Owner deactivates/reactivates HR account
  - Enforce valid transitions per state machine
  - Write `status_changed_by`, `status_changed_at`, `status_reason`
- [ ] Basic rate limiting on `/api/v1/auth/register` and the NextAuth login action (10 req/min/IP using in-memory store or Next.js middleware header check)

### Frontend Tasks
- [ ] `/register` page — self-registration form (fullName, email, password, employeeId, department); shows success message on submit; links to `/login`
- [ ] `/pending` page — displays different messages based on session status:
  - PENDING: "Your account is awaiting HR approval."
  - REJECTED: "Your account registration was rejected. Reason: [reason]."
  - DEACTIVATED: "Your account has been deactivated. Reason: [reason]."
- [ ] `/dashboard/owner` page — Owner home with link to HR account management
- [ ] `/dashboard/owner/hr-accounts` page — table of HR accounts; Create HR Account form; deactivate/reactivate buttons

### Exit Criteria
- Employee can self-register and receives confirmation message
- Employee with PENDING status cannot log in and sees PENDING message
- Owner can log in and create an HR account
- Newly created HR can log in immediately
- Deactivated HR sees DEACTIVATED message on login attempt
- Rate limiting returns `429` after 10 rapid auth requests from same IP

---

## Sprint 3 — Employee Attendance Logging

**Goal**: A fully functional attendance logging day for an employee. All four actions work correctly, break is optional, late detection is accurate, Sunday and holiday blocking is in place.

### Backend Tasks
- [ ] `GET /api/v1/attendance/today` — returns today's record and `availableActions[]`
  - Read `app_timezone` from `system_settings`
  - Determine today's date in `app_timezone`
  - Check if today is Sunday (always excluded)
  - Check if today is an active holiday (query `holidays WHERE deleted_at IS NULL AND date = today`)
  - Query `attendance_records` for `(user_id, date)` pair
  - Compute `availableActions[]` from `current_step` and `start_break_at` presence
- [ ] `POST /api/v1/attendance/action` — records one action
  - Read `app_timezone`, `late_threshold_time`, `max_break_duration_minutes` from `system_settings`
  - Validate action is permitted by current state machine step
  - Reject if today is Sunday or holiday
  - Use Prisma transaction with `SELECT ... FOR UPDATE` equivalent (Prisma `$transaction` with `findFirst` then update) to prevent concurrent double-submissions
  - `START_WORK`: upsert record with `start_work_at = now()`, `current_step = WORKING`, `status = PRESENT`, `is_late` computed
  - `START_BREAK`: update `start_break_at = now()`, `current_step = ON_BREAK`
  - `END_BREAK`: update `end_break_at = now()`, compute `break_duration_minutes`, set `break_exceeded` if over limit, set `current_step = RESUMED`
  - `END_WORK`: update `end_work_at = now()`, compute `total_work_minutes` using `COALESCE(break_duration_minutes, 0)`, set `current_step = COMPLETED`
  - Return `warning` message when `break_exceeded = true`
- [ ] `GET /api/v1/holidays` — returns active holidays for given year (used by today-check and employee view)

### Frontend Tasks
- [ ] `/dashboard/employee` — Employee home page:
  - Today's date and day type (WORKING / SUNDAY / HOLIDAY + name)
  - Current attendance state description (e.g., "You are currently on break")
  - Contextual action button(s) from `availableActions[]` with confirmation modal before each action
  - Warning banner if `break_exceeded = true` after END_BREAK
  - On Sunday: "Attendance logging is not available on Sundays."
  - On holiday: "Today is a public holiday: [Holiday Name]. Attendance logging is not available."
- [ ] Loading and error states for all actions
- [ ] Optimistic UI: disable action button immediately after click to prevent double-submit

### Exit Criteria
- Employee can perform the full `START_WORK → START_BREAK → END_BREAK → END_WORK` sequence
- Employee can perform `START_WORK → END_WORK` (skip break)
- Late flag is set correctly if `START_WORK` is after `late_threshold_time` in `app_timezone`
- Attempting any action on Sunday returns `400 NON_WORKING_DAY`; UI disables buttons
- Attempting any action on a configured holiday returns `400 NON_WORKING_DAY`; UI disables buttons with holiday name
- Break exceeding 60 minutes returns `warning` in response; `break_exceeded = true` stored
- Concurrent double-click on an action button results in exactly one DB write

---

## Sprint 4 — HR Attendance Dashboard

**Goal**: HR can view, filter, and summarize all employee attendance records. The pending registration count badge is visible.

### Backend Tasks
- [ ] `GET /api/v1/hr/attendance` — filtered attendance records for all employees
  - Filters: `userId`, `department` (ILIKE), `startDate` (default: first of current month), `endDate` (default: today), `isLate`, `status`, `breakExceeded`
  - Pagination with max 100 limit cap
  - Include `employee` sub-object in each row (SafeUser fields only)
  - Compute `summary`: `totalPresent`, `totalAbsent`, `totalIncomplete`, `totalLate`, `totalBreakExceeded`
- [ ] Extend `GET /api/v1/hr/employees` to always return `pendingCount` (count of `status = PENDING` employees)

### Frontend Tasks
- [ ] `/dashboard/hr` — HR home page with navigation and pending registration badge
- [ ] `/dashboard/hr/attendance` — attendance table page:
  - Date range picker (startDate / endDate, defaults to current month)
  - Filters: employee search, department text, late status, attendance status
  - Paginated table with columns: Employee, Employee ID, Department, Date, Start Work, End Work, Break Duration, Total Hours, Late, Status, Break Exceeded
  - Summary bar above table: Present / Absent / Incomplete / Late / Break Exceeded counts
  - Loading skeleton while fetching
  - Empty state when no records match filters

### Exit Criteria
- HR sees all employees' attendance records for the current month by default
- Date range filter correctly narrows results
- `isLate = true` filter returns only late records
- Summary counts match the filtered data
- Pending count badge shows in HR navigation

---

## Sprint 5 — Employee Management (HR)

**Goal**: HR can search, view, approve, reject, and deactivate employees. The full account lifecycle is functional from the HR dashboard.

### Backend Tasks
- [ ] `GET /api/v1/hr/employees` — full implementation with all query params
  - `search`: ILIKE on `full_name OR email`
  - `status`: exact match filter
  - `department`: ILIKE filter
  - Pagination (max 100)
  - Include `pendingCount` in every response
- [ ] `GET /api/v1/hr/employees/[id]` — single employee profile with nested `statusChangedBy`
- [ ] `PATCH /api/v1/hr/employees/[id]/status` — full state machine enforcement
  - HR can: PENDING → APPROVED, PENDING → REJECTED, APPROVED → DEACTIVATED
  - HR cannot: DEACTIVATED → APPROVED (returns `403 FORBIDDEN`)
  - Write `status_reason`, `status_changed_by`, `status_changed_at`
- [ ] `PATCH /api/v1/owner/hr-accounts/[id]/status` — Owner can: DEACTIVATED → APPROVED on any user (Employee or HR)

### Frontend Tasks
- [ ] `/dashboard/hr/employees` — employee list page:
  - Search input (name or email, live search with debounce)
  - Status filter tabs: All / Pending / Approved / Rejected / Deactivated
  - Department text filter
  - Paginated table: Employee ID, Name, Email, Department, Status, Registered At, Actions
  - "Pending" tab highlighted with count badge
  - Approve / Reject buttons on PENDING rows (with optional reason modal)
  - Deactivate button on APPROVED rows (with optional reason modal)
- [ ] `/dashboard/hr/employees/[id]` — employee profile page:
  - All profile fields
  - Status change history (current status, reason, changed by, changed at)
  - Quick actions: Approve / Reject / Deactivate (context-dependent)
- [ ] Owner: add "Reactivate" button on DEACTIVATED employee/HR profile pages accessible from `/dashboard/owner`

### Exit Criteria
- HR can search employees by partial name or email
- Approving a PENDING employee allows that employee to immediately log in
- Rejecting shows reason stored; employee sees rejection message on login
- Deactivating blocks future logins for that employee
- HR attempting to reactivate a DEACTIVATED account receives `403 FORBIDDEN`
- Owner can reactivate a DEACTIVATED account successfully
- `pendingCount` in the employee list matches actual count of PENDING employees

---

## Sprint 6 — Holiday Management

**Goal**: HR can add and soft-delete holidays. All attendance blocking (Sunday + holiday) is validated against the holiday list. Employees see holiday names in the UI.

### Backend Tasks
- [ ] `POST /api/v1/hr/holidays` — add holiday with full validation:
  - Date must not be a Sunday
  - Date must not be in the past (vs. today in `app_timezone`)
  - No active (non-deleted) holiday for that date (partial unique index guards this)
  - Set `created_by` to current HR user
- [ ] `DELETE /api/v1/hr/holidays/[id]` — soft-delete:
  - Set `deleted_at = now()`, `deleted_by = current HR user ID`
  - Return `404` if already soft-deleted
- [ ] `GET /api/v1/holidays` — return only active holidays (`WHERE deleted_at IS NULL`) for the given year
- [ ] Update `POST /api/v1/attendance/action` to re-query active holidays on each action (already included in Sprint 3 logic; confirm it uses soft-delete filter)

### Frontend Tasks
- [ ] `/dashboard/hr/holidays` — holiday management page:
  - Year selector (defaults to current year)
  - List of active holidays in chronological order: Date, Day of Week, Name, Added By, Added On, Delete button
  - Add Holiday form (date picker + name input) with validation messages
  - Confirmation dialog before soft-delete
  - Empty state if no holidays configured
- [ ] `/dashboard/employee` — update today's panel to show holiday name when blocked (already designed in Sprint 3; confirm it uses `GET /holidays` data)
- [ ] Employee attendance history (Sprint 7) will show HOLIDAY entries; foundation established here

### Exit Criteria
- HR can add a holiday for a future non-Sunday date
- Attempting to add a holiday for a Sunday returns `400 INVALID_DATE`
- Attempting to add a holiday for a past date returns `400 INVALID_DATE`
- Attempting to add a duplicate active holiday returns `409 CONFLICT`
- After adding a holiday, employees cannot log attendance on that date
- Soft-deleting a holiday re-enables attendance logging on that date
- Soft-deleted holidays do not appear in the active holiday list
- Same date can be re-added after soft-deletion

---

## Sprint 7 — Reports, Nightly Job & Owner Settings

**Goal**: Complete employee history view with monthly summary, nightly automated job marking INCOMPLETE/ABSENT records, and Owner system settings configuration. System is feature-complete for V1.

### Backend Tasks
- [ ] `GET /api/v1/attendance/history` — calendar-complete history for the requesting employee
  - Query `attendance_records` for the requested month
  - Query `holidays` for active holidays in the month
  - Build a full day-by-day calendar response:
    - For each calendar day in the month:
      - If Sunday → `dayType: "SUNDAY"`, `displayStatus: "SUNDAY"`, no DB record
      - If holiday → `dayType: "HOLIDAY"`, `holidayName: "..."`, `displayStatus: "HOLIDAY"`, no DB record
      - If DB record exists → `dayType: "WORKING"`, `displayStatus` from `status`
      - If no DB record on working day → `dayType: "WORKING"`, `displayStatus: "ABSENT"`, null timestamps
  - Compute `summary`: `presentDays`, `absentDays`, `incompleteDays`, `lateDays`, `totalWorkingDays` (excluding Sundays and holidays)
- [ ] **Nightly Job** — scheduled task:
  - Implementation: Next.js API route `GET /api/v1/internal/nightly-job` protected by a shared secret header (`X-Internal-Secret`), called by Vercel Cron / OS cron at `nightly_job_time` in `app_timezone`
  - Logic:
    1. Read `app_timezone` and `nightly_job_time` from `system_settings`
    2. Determine today's working date in `app_timezone`
    3. Skip if today is Sunday
    4. Skip if today is an active holiday
    5. Find all APPROVED EMPLOYEE users
    6. For each employee:
       - If no record for today → create `{ status: ABSENT, current_step: null }` record
       - If record exists and `current_step ≠ COMPLETED` → set `status = INCOMPLETE`, `current_step = INCOMPLETE`; if `start_break_at IS NOT NULL AND end_break_at IS NULL` → also set `break_not_completed = true`
- [ ] `GET /api/v1/owner/settings` — return all system settings key-value pairs
- [ ] `PATCH /api/v1/owner/settings` — update one or more settings
  - Validate `app_timezone` against IANA timezone list
  - Validate `late_threshold_time` matches `HH:MM` format
  - Validate `max_break_duration_minutes` is a positive integer
  - Validate `nightly_job_time` matches `HH:MM` format

### Frontend Tasks
- [ ] `/dashboard/employee/history` — attendance history page:
  - Month/year selector (defaults to current month)
  - Full calendar table: one row per day of month
  - Columns: Date, Day, Type (Working/Sunday/Holiday), Status badge, Start Work, Start Break, End Break, End Work, Break Duration, Total Hours, Late badge, Notes (e.g., "Break not completed", "Break exceeded limit")
  - Monthly summary cards: Present / Absent / Incomplete / Late days
  - Holiday rows highlighted with holiday name
  - Sunday rows shown in muted style
- [ ] `/dashboard/owner/settings` — Owner settings page:
  - Editable form for all four settings
  - Timezone input with validation (IANA tz string)
  - Time inputs for late threshold and nightly job time
  - Number input for max break duration
  - Save button with success/error feedback

### Exit Criteria
- Employee history shows a complete calendar for the month with no gaps
- Sunday rows show `displayStatus: "SUNDAY"` with no timestamps
- Holiday rows show `displayStatus: "HOLIDAY"` with holiday name
- Absent rows (working day, no attendance) show `displayStatus: "ABSENT"`
- Monthly summary counts are accurate
- Nightly job endpoint creates ABSENT records for employees who did not log attendance
- Nightly job marks in-progress records as INCOMPLETE
- Nightly job sets `break_not_completed = true` when applicable
- Owner can update `late_threshold_time` and the new threshold takes effect immediately on the next START_WORK action
- Owner can update `app_timezone` and date calculations use the new timezone
- Invalid settings values are rejected with `400 VALIDATION_ERROR`

---

## Sprint Dependency Map

```
Sprint 1 (Infrastructure)
    └── Sprint 2 (Auth)
            ├── Sprint 3 (Employee Attendance)
            │       └── Sprint 4 (HR Attendance View)
            │               └── Sprint 5 (Employee Management)
            │                       └── Sprint 6 (Holiday Management)
            │                               └── Sprint 7 (Reports + Nightly Job + Settings)
            └── Sprint 4 can begin in parallel with Sprint 3
                (HR dashboard doesn't depend on employee attendance UI)
```

---

## Definition of Done (All Sprints)

A sprint is complete when:
1. All backend tasks are implemented and respond correctly to valid and invalid requests.
2. All frontend tasks are implemented with loading states, error states, and empty states.
3. TypeScript compiles with zero errors (`tsc --noEmit`).
4. Prisma client is regenerated after any schema change (`npx prisma generate`).
5. New API endpoints manually tested via browser or API client (Postman / curl).
6. No console errors in the browser during normal usage.
7. CHANGELOG.md is updated with the sprint's additions.
8. API_SPEC.md, DATABASE_SCHEMA.md, and REQUIREMENTS.md are updated if anything was clarified or changed during implementation.

---

## Out of Scope for All Sprints (V1)

The following will not be built in any sprint:
- Email / SMS notifications
- Attendance record export (CSV / Excel)
- Password reset self-service
- Department module (Departments table)
- Leave management
- Payroll integration
- Advanced session management
- System downtime handling
- Work past midnight
- Bulk holiday import
