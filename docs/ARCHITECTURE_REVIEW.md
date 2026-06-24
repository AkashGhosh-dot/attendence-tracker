# Architecture Review — Attendance Management System

**Review Date**: 2026-06-24  
**Documents Reviewed**: REQUIREMENTS.md, DATABASE_SCHEMA.md, API_SPEC.md, CHANGELOG.md  
**Status**: PENDING APPROVAL — No code may be written until this review is approved and required changes are incorporated into the base documents.

---

## Executive Summary

The initial documentation establishes a reasonable foundation but contains **critical gaps** that would cause system failures, security vulnerabilities, and logical impossibilities if left unaddressed. The most severe issue is the **complete omission of the Owner role**, which creates an unresolvable bootstrap problem for HR account creation. Additionally, several attendance business rules are ambiguous or contradictory, the absent-tracking strategy is broken by design, and multiple security mechanisms are undocumented.

**Severity Classifications Used Below**:
- `CRITICAL` — Blocks system from functioning or is a significant security breach
- `HIGH` — Causes incorrect business behavior or data integrity failure
- `MEDIUM` — Causes poor UX, reporting errors, or maintainability problems
- `LOW` — Best-practice gap, future risk, or missing convenience feature

---

## Section 1 — Missing User Roles

### FINDING-R01 `CRITICAL` — Owner Role Is Completely Absent

The user explicitly requires three roles: **Employee**, **HR**, and **Owner**. The current documentation defines only Employee and HR. The Owner role does not appear in REQUIREMENTS.md, DATABASE_SCHEMA.md, or API_SPEC.md.

**Impact**: This creates a bootstrap impossibility. FR-AUTH-07 states: *"HR accounts are created directly in the database."* This means:
- Initial system deployment requires direct database (psql/Prisma Studio) access to create the first HR account.
- There is no UI-based workflow for any non-technical person to set up the system.
- Ongoing HR staff changes require developer/DBA involvement.
- This is an unacceptable operational and security dependency.

**Required Addition — Owner Role Definition**:

| Capability | Owner |
|------------|-------|
| Create HR accounts | Yes |
| Deactivate / reactivate HR accounts | Yes |
| View all HR accounts and their activity | Yes |
| Configure system-wide settings (late threshold, break cap) | Yes |
| View all employees and attendance | Yes (read-only or delegated to HR) |
| Cannot log their own attendance | Yes (exempt from attendance) |
| Cannot be created via self-registration | Seeded at deployment only |

**Required Changes**:
- Add `OWNER` to the `Role` enum in the database schema (`EMPLOYEE`, `HR`, `OWNER`).
- Add Owner account management section to REQUIREMENTS.md.
- Add `/api/owner/hr` endpoints to API_SPEC.md.
- Define that the first Owner account is seeded at deployment (one-time seed script) and documented.
- FR-AUTH-07 must be revised to: "HR accounts are created by an Owner through the Owner dashboard."

---

### FINDING-R02 `HIGH` — HR Role Has No Account Creation Path Through the UI

Even if Owner is added, the current docs give HR no way to see which HR accounts exist, and give no one a UI path to create the first Owner account. The bootstrap sequence must be defined:

```
Deployment seed script → creates 1 Owner account
Owner logs in → creates HR accounts via UI
HR logs in → approves Employee registrations
Employee logs in → logs attendance
```

This sequence must be documented in REQUIREMENTS.md.

---

## Section 2 — Missing Business Rules

### FINDING-BR01 `CRITICAL` — Break Is Ambiguously Mandatory vs. Optional

FR-ATT-01 states employees "can perform exactly four actions per working day, in order," listing all four steps including break. This implies break is mandatory.

FR-ATT-03 states "each employee is allowed one break per day only," using the word "allowed" which implies break is optional (a permission, not a requirement).

These two requirements directly contradict each other. The system cannot be built until this is resolved.

**Question to resolve**: Can an employee go directly from Start Work → End Work, skipping break entirely?

**Recommendation**: Break should be optional. The four-step sequence should be:

```
START_WORK (required)
  └→ START_BREAK (optional)
       └→ END_BREAK (required if break was started)
END_WORK (required)
```

This means valid sequences are:
- `START_WORK → END_WORK` (no break taken)
- `START_WORK → START_BREAK → END_BREAK → END_WORK` (break taken)

The `nextAction` values in the API must reflect this branching.

---

### FINDING-BR02 `CRITICAL` — Late Rule Timezone Is Undefined

FR-ATT-05: *"An employee is marked Late if their Start Work time is after 9:10 AM."*

`9:10 AM` in which timezone? The system stores timestamps in UTC (NFR-05). If an employee works in UTC+5:30, a timestamp of `03:41 UTC` = `09:11 IST` (late), while the same timestamp read as UTC would be `03:41` (not late). The business logic will be completely wrong if this is not pinned.

**Required Change**: Add a system-wide timezone setting (managed by Owner) that defines the reference timezone for late calculation. Document this in REQUIREMENTS.md as a business rule.

---

### FINDING-BR03 `HIGH` — Absent Marking Process Is Undefined

No requirement defines when or how an `ABSENT` record is created. The current database design defaults a new `attendance_records` row to `status = ABSENT`, but rows are only created when an employee performs an action. Employees who don't show up at all have **no row whatsoever** in `attendance_records`.

This means:
- Querying "who was absent on 2025-01-15" requires a LEFT JOIN anti-pattern across all approved employees — which is correct but never specified.
- HR reporting described in FR-HR-07 will not work correctly without this strategy being defined.

**Required Decision** (choose one):
1. **Nightly cron job**: At end of each working day, create `ABSENT` records for all approved employees who have no record for that day.
2. **On-demand computation**: Absent status is always computed as "approved employee has no PRESENT record for a working day" — no rows created, computed at query time.

Both are valid. Option 2 is simpler but makes queries more complex. Option 1 is the recommended approach as it makes reporting straightforward and historical data self-contained.

---

### FINDING-BR04 `HIGH` — Incomplete Attendance Is Undefined

The following real-world scenarios have no defined behavior:

| Scenario | Current Handling | Problem |
|----------|-----------------|---------|
| Employee starts work, forgets to end work | `end_work_at` stays NULL | Is this PRESENT or ABSENT? `total_work_minutes` is NULL — broken |
| Employee starts break, forgets to end break | `end_break_at` stays NULL | Is this a working day? Break never resolved |
| Employee starts work, starts break, forgets everything else | Three fields are NULL | Completely ambiguous |

**Required Addition**: An `INCOMPLETE` attendance status must be defined, along with a policy for how long a record can remain incomplete (e.g., auto-close at midnight, or flag for HR review).

---

### FINDING-BR05 `HIGH` — Break Exceeded Behavior Is Undecided

FR-ATT-04 states: *"If an employee tries to End Break when the elapsed break time would exceed 60 minutes, the system must warn them and auto-close the break at the 60-minute mark OR show a violation flag — to be decided at implementation."*

This is explicitly deferred to implementation time, which violates specification-driven development. It must be decided now.

**Options**:
- **Auto-cap**: `end_break_at` is stored as `start_break_at + 60 minutes`, regardless of when the employee actually submitted END_BREAK. The break is force-closed at the 60-minute mark.
- **Flag-only**: `end_break_at` stores the actual time, `break_exceeded = true` is flagged, and HR is notified for review.

**Recommendation**: Flag-only (actual time stored, `break_exceeded = true`). Auto-capping falsifies the record. HR should see the real data and decide.

The API must return a clear `warning` field in this case, and the `break_duration_minutes` stored must be the **actual duration**, not capped at 60.

---

### FINDING-BR06 `MEDIUM` — Employee Works Past Midnight Is Undefined

What happens if an employee starts work at 10 PM and ends work at 1 AM the next day?
- The `date` column must reflect the start-of-work date, not the end-of-work date.
- `end_work_at` will be a timestamp on the next calendar day.
- The unique constraint `(user_id, date)` uses the date of the record, so this is manageable if the rule is explicit.

**Required Rule**: The `date` field is always set to the date of `START_WORK`. All subsequent actions on the same record (including `END_WORK` the next day) write to the same record.

---

### FINDING-BR07 `MEDIUM` — Holiday Retroactive Addition Is Undefined

If HR adds a holiday for 2025-01-15, but today is 2025-01-20, employees who worked on 2025-01-15 already have `PRESENT` records. What should happen?

**Required Rule**: Adding a holiday for a past date should either:
- Be blocked entirely (only future holidays allowed), or
- Be allowed but not retroactively modify existing attendance records.

**Recommendation**: Block holidays from being added for dates in the past (validate server-side). Deleting a past holiday is similarly risky.

---

### FINDING-BR08 `MEDIUM` — Account Reactivation Is Undefined

FR-AUTH-05 allows HR to deactivate an account. But there is no corresponding requirement for **reactivation**. A status machine of `APPROVED → DEACTIVATED` with no way back is a data dead-end.

**Required Addition**: Define whether a DEACTIVATED account can be reactivated, and if so, by whom (HR? Owner?). The valid status transitions should be documented as a state machine:

```
PENDING → APPROVED (by HR)
PENDING → REJECTED (by HR)
APPROVED → DEACTIVATED (by HR or Owner)
DEACTIVATED → APPROVED (by Owner only — recommended)
REJECTED → (no further transition — reapplication creates a new account)
```

---

### FINDING-BR09 `MEDIUM` — REJECTED Employee Re-registration Is Undefined

If HR rejects an employee's registration, can that employee register again? If they try to use the same email, the UNIQUE constraint will block them. If they use a different email, they create a duplicate entry.

**Required Rule**: Document whether rejected employees can re-register, and if so, what happens to the old rejected record.

---

### FINDING-BR10 `LOW` — No Reason Field for Approval/Rejection

When HR rejects an employee, there is no way to communicate why. Similarly, when HR deactivates an account, no reason is recorded.

**Recommendation**: Add an optional `status_reason` (VARCHAR) and `status_changed_by` (FK to HR user) on the `users` table for audit purposes.

---

## Section 3 — Security Concerns

### FINDING-SEC01 `CRITICAL` — HR Bootstrap via Direct DB Access Is a Security Vulnerability

FR-AUTH-07: *"HR accounts are created directly in the database."* Requiring direct database access in production to create administrative accounts is a violation of the principle of least privilege and violates standard security practices:
- Production database credentials would need to be shared with whoever is setting up HR accounts.
- There is no audit trail for database-level insertions.
- Resolved by implementing the Owner role (see FINDING-R01).

---

### FINDING-SEC02 `HIGH` — No Rate Limiting Specified

There is no mention of rate limiting anywhere in the requirements or API spec. This exposes:
- `POST /api/auth/register` to spam registrations.
- `POST /api/auth/[...nextauth]` (login) to brute-force password attacks.
- `POST /api/attendance/action` to spam requests.

**Required Addition**: Rate limiting must be specified for at minimum login (e.g., 5 failed attempts per 15 minutes per IP locks the account temporarily) and registration.

---

### FINDING-SEC03 `HIGH` — API Responses Leak Sensitive Data

`PATCH /api/hr/employees/[id]/status` returns `"employee": { /* updated User */ }`. The `User` model contains `passwordHash`. Returning the full user object leaks the password hash to the client.

**Required Change**: All API responses that return user objects must explicitly exclude `passwordHash`. This must be enforced at the serialization layer, not just documentation.

---

### FINDING-SEC04 `HIGH` — No Audit Trail for Administrative Actions

There is no logging of:
- Which HR user approved/rejected which employee account.
- When the status change occurred.
- Which HR user added or deleted a holiday.
- Who deactivated an employee account.

The `holidays` table has `created_by` but no `deleted_by`. The `users` table has no `approved_by`, `approved_at`, `rejected_by`, or `rejected_at`.

**Required Additions to Schema**:
- `users`: `status_changed_by UUID FK`, `status_changed_at TIMESTAMP`, `status_reason VARCHAR`
- `holidays`: Soft delete via `deleted_at TIMESTAMP`, `deleted_by UUID FK` instead of hard delete

---

### FINDING-SEC05 `HIGH` — Employee ID Is Self-Reported and Unverified

FR-AUTH-01 allows employees to enter their own Employee ID at registration. There is no mechanism to verify this against a company roster. This means:
- Any external person can register with a valid Employee ID if they know it.
- Two people can race to register with the same Employee ID (the UNIQUE constraint only prevents one from succeeding).
- An employee could claim a colleague's Employee ID.

**Required Decision**: Either:
- Accept this limitation and document it explicitly, or
- Add a pre-approved Employee ID allowlist table that HR/Owner pre-populates before employees register.

---

### FINDING-SEC06 `HIGH` — No Password Reset Flow

There is no forgot-password or password-reset endpoint in the API. An employee who forgets their password has no self-service recovery path.

**Required Addition**: Even if email notifications are out of scope for v1, the system needs a defined strategy. Recommendation: Add a `POST /api/auth/reset-password` flow to the backlog with a placeholder in the API spec. For v1, a simpler option: HR/Owner can reset a specific user's password through the admin dashboard.

---

### FINDING-SEC07 `MEDIUM` — Concurrent Attendance Action Race Condition

NFR-04 mentions "no double punch-ins" but does not specify the mechanism. Without a database-level lock or transaction, two simultaneous `POST /api/attendance/action` requests for the same user could both pass the validation check (neither sees the other's write yet) and both succeed, corrupting the record.

**Required Specification**: The attendance action handler must use a database transaction with a row-level lock (e.g., `SELECT ... FOR UPDATE` on the record) or a unique constraint that prevents the race. This must be specified, not left to implementation.

---

### FINDING-SEC08 `MEDIUM` — No Role Enforcement Middleware Specification

The API spec says "Auth: HR" or "Auth: EMPLOYEE" on each endpoint, but there is no specification of how this is enforced. Without explicit middleware documentation, it's easy for route-level authorization checks to be missed or inconsistently implemented.

**Required Addition**: Specify that a middleware layer (Next.js middleware or route handler wrapper) enforces role-based access control before any handler logic runs.

---

### FINDING-SEC09 `MEDIUM` — Session Timeout and Multi-Device Policy Undefined

There is no specification for:
- Session timeout duration (when does a JWT/session expire?).
- Whether the same user can be logged in on multiple devices simultaneously.
- What happens to a session when a user is deactivated mid-session.

**Required Additions**: Minimum: session expiry time (recommendation: 8 hours for employees, 24 hours for HR/Owner). When a user is deactivated, any active sessions must be invalidated.

---

### FINDING-SEC010 `LOW` — Input Validation Rules Are Incomplete

Requirements specify only password length (min 8 chars). Missing:
- Email format validation.
- Employee ID format/length constraints (is it always "EMP" + digits?).
- Full name: max length, allowed characters.
- Department name: max length, allowed characters (or should be from a predefined list).

---

## Section 4 — Database Design Concerns

### FINDING-DB01 `HIGH` — No Departments Table

`department` is a free-text `VARCHAR(100)` field on `users`. This creates data integrity problems:
- "Engineering", "engineering", "Enginering" are three distinct department values.
- HR filtering by department (`GET /api/hr/employees?department=Engineering`) will miss typos.
- `GET /api/hr/attendance?department=Engineering` will miss employees with typos.

**Required Change**: Add a `departments` table with `id` and `name`. The `users.department` should be a FK reference `department_id → departments.id`. HR/Owner manages the list of departments.

---

### FINDING-DB02 `HIGH` — Employee ID Field is Problematic for HR/Owner Users

The `employee_id` column is `UNIQUE NOT NULL` for all users, including HR and Owner. HR and Owner users likely don't have company Employee IDs, or have different ID formats.

**Options**:
- Make `employee_id` nullable (NULL for HR and Owner users).
- Give HR and Owner users synthetic IDs (e.g., `HR-001`).
- Separate HR/Owner into a different table.

**Recommendation**: Make `employee_id` nullable. It's only meaningful for the EMPLOYEE role. The NOT NULL constraint should only be enforced at the application layer for employees.

---

### FINDING-DB03 `HIGH` — No Explicit Attendance State Machine Column

The current design derives attendance step from NULL/non-NULL timestamp columns:
- `start_work_at IS NULL` → step 0 (not started)
- `start_work_at NOT NULL AND start_break_at IS NULL` → step 1 (can take break or end work)
- `start_break_at NOT NULL AND end_break_at IS NULL` → step 2 (on break)
- `end_break_at NOT NULL AND end_work_at IS NULL` → step 3 (can end work)
- `end_work_at NOT NULL` → step 4 (done)

This NULL-chaining approach is fragile. If break is optional (FINDING-BR01), step 1 and step 3 are ambiguous — both have `end_break_at IS NULL`.

**Required Addition**: Add `current_step ENUM('NOT_STARTED', 'WORKING', 'ON_BREAK', 'RESUMED', 'COMPLETED', 'INCOMPLETE')` to `attendance_records`. This makes state explicit, simplifies logic, and allows for future states (e.g., INCOMPLETE).

---

### FINDING-DB04 `HIGH` — `total_work_minutes` Formula Has a NULL Bug

The documented formula: `end_work_at − start_work_at − break_duration_minutes`

If no break was taken, `break_duration_minutes` is NULL. In PostgreSQL, `integer - NULL = NULL`. This means `total_work_minutes` would be NULL even for a complete workday with no break.

**Required Fix**: Formula must be: `EXTRACT(EPOCH FROM (end_work_at - start_work_at))/60 - COALESCE(break_duration_minutes, 0)`

---

### FINDING-DB05 `HIGH` — Soft Delete Missing from Holidays

`DELETE /api/hr/holidays/[id]` performs a hard delete. If a holiday is deleted, there is no record that it ever existed. If it was deleted in error, recovery requires database-level intervention.

More critically, if attendance records were already created for a day marked as HOLIDAY, deleting the holiday loses the context for why those records have `status = HOLIDAY`.

**Required Change**: Add soft delete to holidays: `deleted_at TIMESTAMP NULL`, `deleted_by UUID FK`. Hard delete should be disallowed.

---

### FINDING-DB06 `MEDIUM` — No Composite Index for HR Reporting Queries

The most frequent HR queries will be range-based: "show me all attendance between these two dates." The current indexes are single-column. The critical missing index is:

```sql
CREATE INDEX idx_attendance_date_user ON attendance_records (date, user_id);
CREATE INDEX idx_attendance_date_status ON attendance_records (date, status);
```

The existing `@@unique([userId, date])` provides a composite index for single-user queries, but date-range queries across all users need the `(date, user_id)` ordering.

---

### FINDING-DB07 `MEDIUM` — CASCADE Behavior Undefined for All Relations

Prisma requires explicit `onDelete` and `onUpdate` cascade rules for all foreign keys. Currently none are defined:
- What happens to `attendance_records` if the related `users` row is deleted?
- What happens to `holidays` if the creating HR user is deactivated/deleted?

**Required Specification**: Define cascade rules for all foreign keys:
- `attendance_records.user_id → users.id`: `onDelete: RESTRICT` (prevent user deletion if they have records).
- `holidays.created_by → users.id`: `onDelete: RESTRICT`.

---

### FINDING-DB08 `MEDIUM` — No Audit Trail for Status Changes on Users

The `users` table records `created_at` and `updated_at`, but nothing about what changed, who changed it, or when each status transition happened.

**Required Additions**: 
- `approved_by UUID NULL FK → users.id`
- `approved_at TIMESTAMP NULL`
- `status_reason VARCHAR(500) NULL`

---

### FINDING-DB09 `LOW` — `attendance_records.date` vs. Server Timezone

The `date` column is a `DATE` type. But "today's date" depends on which timezone the server uses to interpret the current UTC time. A server in UTC+0 and an employee in UTC+5:30 may disagree on what "today" is for the first 5.5 hours of the UTC day.

**Required Specification**: Confirm the application timezone (recommendation: a single configurable timezone set at the Owner level), and specify that the `date` field always uses this application timezone to determine the calendar date.

---

## Section 5 — API Design Concerns

### FINDING-API01 `HIGH` — No Owner API Namespace

There are no Owner-level API endpoints anywhere in the spec. Owner needs at minimum:

```
GET  /api/owner/hr                    — list all HR accounts
POST /api/owner/hr                    — create HR account
PATCH /api/owner/hr/[id]/status       — deactivate/reactivate HR
GET  /api/owner/settings              — view system settings
PATCH /api/owner/settings             — update system settings (timezone, late threshold, break cap)
```

---

### FINDING-API02 `HIGH` — Password Hash Leaked in Employee Status Response

`PATCH /api/hr/employees/[id]/status` returns `"employee": { /* updated User */ }`. The Prisma `User` model includes `passwordHash`. Without an explicit select/omit clause, the response leaks the hash.

**Required Change**: Define a `SafeUser` DTO type that explicitly excludes `passwordHash`, `createdAt`, `updatedAt` from all API responses. All endpoints must use this type.

---

### FINDING-API03 `HIGH` — `GET /api/hr/holidays` Is Misrouted

This endpoint is documented under `/api/hr/holidays` but is marked as accessible by both HR and EMPLOYEE roles. Employees should not be hitting routes in the `/api/hr/` namespace. This should be separated:

- `GET /api/holidays` — public to all authenticated users (returns holidays for a given year)
- `POST /api/hr/holidays` — HR only
- `DELETE /api/hr/holidays/[id]` — HR only

---

### FINDING-API04 `HIGH` — Missing `GET /api/hr/employees/[id]`

There is no endpoint to retrieve a single employee's full profile. The HR dashboard needs to show an employee's details before approving or rejecting. The PATCH endpoint exists but no corresponding GET.

---

### FINDING-API05 `MEDIUM` — `GET /api/hr/attendance` Requires Both Date Params

Both `startDate` and `endDate` are marked as `required`. This prevents simple queries like "show today's attendance" or "show this month." Default values should be provided:
- Default `startDate`: first day of current month
- Default `endDate`: today

---

### FINDING-API06 `MEDIUM` — No Search on HR Employee List

`GET /api/hr/employees` only supports filtering by `status` and `department`. Missing:
- `search` parameter for name or email search (full-text or ILIKE)
- `employeeId` parameter for exact lookup

---

### FINDING-API07 `MEDIUM` — No API Versioning Strategy

All endpoints are at `/api/...` with no version prefix. Future breaking changes (e.g., changing the attendance action response shape) will have no migration path.

**Recommendation**: Prefix all routes with `/api/v1/...` from the start. This is much harder to add retroactively.

---

### FINDING-API08 `MEDIUM` — DELETE Response Should Be 204 Not 200

`DELETE /api/hr/holidays/[id]` returns `200` with a body `{ "message": "Holiday removed." }`. REST convention for successful DELETE with no body is `204 No Content`. Returning a body with `200` is acceptable but inconsistent with REST standards.

**Recommendation**: Use `204 No Content` for delete operations.

---

### FINDING-API09 `MEDIUM` — Missing Employee Profile Update Endpoints

Employees have no way to:
- Update their name or department (e.g., after a legal name change or departmental transfer).
- Change their own password.

These should exist:
- `PATCH /api/me/profile` — update name, department
- `PATCH /api/me/password` — change password (requires current password)

---

### FINDING-API10 `MEDIUM` — `nextAction` Logic Does Not Account for Break-Optional Scenario

The API currently defines `nextAction` values as: `START_WORK | START_BREAK | END_BREAK | END_WORK | DONE | NONE`

If break is optional (FINDING-BR01), the valid next actions after `START_WORK` are either `START_BREAK` or `END_WORK`. The `nextAction` field cannot be a single value in this case.

**Required Change**: Return `availableActions: string[]` instead of `nextAction: string` to represent the branching choices:
- After START_WORK: `["START_BREAK", "END_WORK"]`
- After START_BREAK: `["END_BREAK"]`
- After END_BREAK: `["END_WORK"]`
- After END_WORK: `[]` (done)

---

### FINDING-API11 `LOW` — No Export Endpoint for HR Reporting

FR-HR-07 mentions HR can view a summary report, but there is no CSV or Excel export endpoint. This is a near-universal HR requirement.

**Recommendation**: Add to backlog: `GET /api/hr/attendance/export?format=csv&startDate=...&endDate=...`

---

### FINDING-API12 `LOW` — No Attendance History Export for Employees

Employees may want to download their own attendance history for personal records or disputes. Add to backlog: `GET /api/attendance/history/export`.

---

## Section 6 — Attendance Workflow Verification

### Workflow: Start Work → Start Break → End Break → End Work

| Step | Trigger | Validations Needed | Currently Documented? |
|------|---------|-------------------|----------------------|
| START_WORK | Employee clicks "Start Work" | 1. Not a Sunday; 2. Not a holiday; 3. No existing record for today; 4. User is APPROVED | Partially — missing idempotency lock |
| START_BREAK | Employee clicks "Start Break" | 1. START_WORK already done; 2. No break already taken today; 3. Still within working day | Yes |
| END_BREAK | Employee clicks "End Break" | 1. START_BREAK already done; 2. END_BREAK not already done; 3. Compute duration; 4. Flag if > 60 min | FR-ATT-04 is undecided |
| END_WORK | Employee clicks "End Work" | 1. START_WORK done; 2. If break started, break must be ended first; 3. Compute total hours | Yes |

**Gap**: No specification for what happens if the server clock drifts or the employee manipulates their device clock. Timestamps must always come from the **server**, never from the client request body.

---

## Section 7 — Late Rule Verification

FR-ATT-05: Late if `START_WORK` is after 9:10 AM.

**Issues**:
1. Timezone undefined (see FINDING-BR02) — `CRITICAL`.
2. What about Saturdays? The system excludes Sundays but Saturdays appear to be working days. Is 9:10 AM the late threshold on Saturdays too? Clarification needed.
3. Is the late threshold configurable, or hard-coded? If it's hard-coded at 9:10 AM, it cannot be changed without a code deployment. Recommendation: store late threshold time in system settings, managed by Owner.

---

## Section 8 — Absent Rule Verification

An employee is **Absent** on a working day if they did not record any attendance.

**Issues**:
1. No process defined to create ABSENT records (see FINDING-BR03) — `CRITICAL`.
2. What if an employee starts work but never ends? Is that PRESENT (with incomplete status) or ABSENT? Not defined.
3. The `status` field defaults to `ABSENT` in the database, but a row is only created when an action is taken. This means the default is meaningless — rows with `status = ABSENT` already have `start_work_at` set (because the row was created when the employee started work). The semantics are broken.

**Recommended Fix**: Change default status to `IN_PROGRESS` when `START_WORK` is first recorded. Only set `PRESENT` when `END_WORK` is recorded. Leave `ABSENT` for records created by the nightly cron job.

---

## Section 9 — Scalability Concerns

### FINDING-SC01 `MEDIUM` — No Background Job Infrastructure

Auto-marking absent employees requires a scheduled job at end of day. There is no specification for how this runs. Options for Next.js:
- Vercel Cron Jobs (if hosted on Vercel)
- An external cron calling a protected internal API endpoint
- A standalone Node.js cron process

This must be decided and documented before implementation.

---

### FINDING-SC02 `MEDIUM` — No Pagination Limit Cap

Both HR attendance and employee list endpoints accept a `limit` query parameter with no documented maximum. A request with `limit=100000` could load the entire database into memory.

**Required Change**: Server must enforce a hard cap (recommendation: max 100 per page for list endpoints, max 366 for attendance history).

---

### FINDING-SC03 `LOW` — No Caching Strategy

`GET /api/attendance/today` is called on every page load by employees and will be the most frequent read. `GET /api/holidays` changes rarely.

**Recommendation**: Document caching behavior:
- `/api/holidays` — cache for 1 hour, invalidate on holiday add/delete.
- `/api/attendance/today` — do not cache (must reflect real-time state).

---

### FINDING-SC04 `LOW` — No Archival Strategy for Attendance Records

Over years of operation, `attendance_records` will accumulate millions of rows. No archival or partitioning strategy is mentioned.

**Recommendation**: Add to future considerations: PostgreSQL table partitioning by year on the `date` column.

---

## Section 10 — Reporting Concerns

### FINDING-RP01 `HIGH` — Absent Reporting Is Architecturally Broken

As described in FINDING-BR03, absent employees have no row in `attendance_records`. Any report of absent employees must perform an anti-join across all APPROVED employees for each working day in the range. This works but is O(employees × days) and will be slow at scale without the nightly cron approach.

**Required Decision**: Confirm absent record creation strategy before implementation.

---

### FINDING-RP02 `MEDIUM` — No "Incomplete Attendance" Report

Employees who started work but never ended (forgot to punch out) appear as `PRESENT` records with `end_work_at = NULL`. This is indistinguishable from an "in-progress" record (employee is still at work). HR needs a report for incomplete records from past days.

**Required Addition**: A working day that has passed and has `end_work_at = NULL` should be flagged as `INCOMPLETE`. The nightly cron should flip these to `INCOMPLETE` status.

---

### FINDING-RP03 `MEDIUM` — No Break-Exceeded Aggregate in HR Summary

The HR attendance summary response includes `totalPresent`, `totalAbsent`, `totalLate`, `totalHoliday` — but not `totalBreakExceeded`. This is a missing metric for HR discipline reports.

---

### FINDING-RP04 `MEDIUM` — No Department-Level Roll-Up

FR-HR-07 asks for summary by day or period. There is no requirement or API for aggregating by department. "How many employees in Engineering were late in June?" cannot be answered by current APIs without multiple calls and client-side aggregation.

---

### FINDING-RP05 `LOW` — Employee History Does Not Show Sunday/Holiday Context

`GET /api/attendance/history` shows attendance records. But for Sundays and holidays (if using the nightly cron approach), the record would show `status: SUNDAY` or `status: HOLIDAY` with no other timestamps. Without the holiday name in the response, the employee history table will have gaps with no explanation.

**Required**: Include `holidayName` field in history records where `status = HOLIDAY`.

---

## Section 11 — Holiday Management Concerns

### FINDING-HM01 `MEDIUM` — No Validation: Holiday Cannot Be on a Sunday

The API spec documents this: `"400 — date is a Sunday"`, but the requirement does not mention it. The validation should be in REQUIREMENTS.md, not just implied by the API spec.

---

### FINDING-HM02 `MEDIUM` — Maximum Future Holiday Date Is Undefined

HR could add a holiday 50 years in the future. Should there be a reasonable limit (e.g., within the next 2 years)?

---

### FINDING-HM03 `LOW` — No Holiday Bulk Import

Entering 15+ holidays for a year one by one is a poor UX. Consider bulk import (CSV upload or paste). Not critical for v1, but worth noting.

---

## Section 12 — Registration and Approval Workflow Concerns

### FINDING-RW01 `HIGH` — No HR Notification of Pending Registrations

When an employee registers, HR has no mechanism to know about it (email is out of scope). HR must manually check the pending registrations list. This means approvals could be delayed indefinitely.

**Required Addition**: In-app notification badge/count for HR showing number of pending approvals. This is a UI requirement, not an email requirement.

---

### FINDING-RW02 `MEDIUM` — Multiple Registrations by Same Person

A person rejected for one email can immediately register again with a different email. There is no mechanism (short of Employee ID uniqueness) to prevent this. Employee ID uniqueness helps but is unverified.

---

### FINDING-RW03 `LOW` — No Approval History Viewable by Employee

After registration, an employee with PENDING status sees... nothing. There's no requirement for what the employee sees after registration and before approval. They should see a clear "Your account is pending HR approval" message.

---

## Summary — Required Changes Before Implementation

The following items **must** be resolved and incorporated into the base documents before any code is written:

| # | Finding | Severity | Document to Update |
|---|---------|----------|-------------------|
| 1 | Add Owner role with full definition | CRITICAL | REQUIREMENTS.md, DATABASE_SCHEMA.md, API_SPEC.md |
| 2 | Resolve: Is break mandatory or optional? | CRITICAL | REQUIREMENTS.md |
| 3 | Define late-rule timezone (app-wide timezone setting) | CRITICAL | REQUIREMENTS.md, DATABASE_SCHEMA.md |
| 4 | Define ABSENT record creation strategy (cron vs. computed) | CRITICAL | REQUIREMENTS.md, API_SPEC.md |
| 5 | Define INCOMPLETE attendance status and rules | HIGH | REQUIREMENTS.md, DATABASE_SCHEMA.md |
| 6 | Decide break-exceeded behavior (flag vs. auto-cap) | HIGH | REQUIREMENTS.md, API_SPEC.md |
| 7 | Add Departments table to schema | HIGH | DATABASE_SCHEMA.md |
| 8 | Add soft delete to holidays (audit trail) | HIGH | DATABASE_SCHEMA.md, API_SPEC.md |
| 9 | Add `current_step` column to attendance_records | HIGH | DATABASE_SCHEMA.md |
| 10 | Add `approved_by`, `approved_at`, `status_reason` to users | HIGH | DATABASE_SCHEMA.md |
| 11 | Fix `total_work_minutes` NULL bug (use COALESCE) | HIGH | DATABASE_SCHEMA.md |
| 12 | Make `employee_id` nullable for HR/Owner roles | HIGH | DATABASE_SCHEMA.md |
| 13 | Remove password hash from all API responses (SafeUser DTO) | HIGH | API_SPEC.md |
| 14 | Move `GET /api/hr/holidays` to `/api/holidays` | HIGH | API_SPEC.md |
| 15 | Add `GET /api/hr/employees/[id]` endpoint | HIGH | API_SPEC.md |
| 16 | Add Owner API namespace and endpoints | HIGH | API_SPEC.md |
| 17 | Replace `nextAction` with `availableActions[]` | MEDIUM | API_SPEC.md |
| 18 | Define account status transition state machine | MEDIUM | REQUIREMENTS.md |
| 19 | Define re-registration rules for REJECTED employees | MEDIUM | REQUIREMENTS.md |
| 20 | Specify rate limiting requirements | MEDIUM | REQUIREMENTS.md, API_SPEC.md |
| 21 | Define session timeout and multi-device policy | MEDIUM | REQUIREMENTS.md |
| 22 | Define cascade rules for all foreign keys | MEDIUM | DATABASE_SCHEMA.md |
| 23 | Add composite indexes for reporting queries | MEDIUM | DATABASE_SCHEMA.md |
| 24 | Default pagination cap (max 100) | MEDIUM | API_SPEC.md |
| 25 | Add in-app notification requirement for HR pending count | MEDIUM | REQUIREMENTS.md |

---

## Optional Improvements (Post-Approval, Backlog)

| # | Finding | Priority |
|---|---------|----------|
| 1 | API versioning (`/api/v1/...`) | High |
| 2 | Employee self-service profile update (`PATCH /api/me/profile`) | High |
| 3 | Password change endpoint (`PATCH /api/me/password`) | High |
| 4 | HR/Employee attendance export (CSV) | Medium |
| 5 | Employee ID pre-approval allowlist table | Medium |
| 6 | Department-level roll-up reports | Medium |
| 7 | Holiday bulk import | Low |
| 8 | Table partitioning strategy for attendance_records | Low |
| 9 | Redis caching for holidays endpoint | Low |
| 10 | `totalBreakExceeded` in HR summary responses | Low |

---

*This document must be approved and all CRITICAL and HIGH findings resolved in the base documentation before implementation begins.*
