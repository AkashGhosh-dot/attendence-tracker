# Requirements — Attendance Management System

**Version**: 1.1  
**Last Updated**: 2026-06-24  
**Status**: Approved — incorporates Architecture Review decisions

---

## 1. Overview

A web-based Attendance Management System where employees self-register, HR approves their accounts, and employees log daily attendance with strict business rules around working hours, breaks, and holidays. An Owner role serves as the super-administrator who manages HR accounts and system-wide settings.

---

## 2. Roles

| Role | Description |
|------|-------------|
| **Employee** | Self-registers; logs daily attendance after HR approval |
| **HR** | Approves/rejects employee accounts; views all attendance; manages holidays |
| **Owner** | Super-admin; creates and manages HR accounts; configures system-wide settings |

---

## 3. Functional Requirements

### 3.0 Bootstrap & System Initialization

- **FR-BOOT-01**: On initial deployment, exactly one Owner account is created via a one-time seed script. This is the only account that ever bypasses the registration workflow.
- **FR-BOOT-02**: The seed script accepts Owner email, password, and full name as configuration values.
- **FR-BOOT-03**: The complete bootstrap sequence is:
  ```
  1. Seed script runs → Owner account created
  2. Owner logs in → creates HR accounts via Owner dashboard
  3. HR logs in → approves pending employee registrations
  4. Employee self-registers → HR approves → Employee logs attendance
  ```

---

### 3.1 Authentication & Account Management

- **FR-AUTH-01**: Employees self-register with: Full Name, Email, Password, Department, and Employee ID.
- **FR-AUTH-02**: All newly self-registered accounts are set to `PENDING` status until an HR user approves them.
- **FR-AUTH-03**: Users with `PENDING`, `REJECTED`, or `DEACTIVATED` status cannot log in. The login page displays a clear status message explaining why.
- **FR-AUTH-04**: HR can approve or reject pending employee registrations, with an optional free-text reason.
- **FR-AUTH-05**: HR can deactivate an approved employee account, with an optional free-text reason.
- **FR-AUTH-06**: All users (Employee, HR, Owner) authenticate with email + password.
- **FR-AUTH-07**: HR accounts are created exclusively by the Owner through the Owner dashboard. HR cannot self-register.
- **FR-AUTH-08**: Passwords must be at least 8 characters.
- **FR-AUTH-09**: When an account status changes, the system records: who made the change, when, and the optional reason.
- **FR-AUTH-10**: Account status transitions follow this strict state machine — no other transitions are permitted:
  ```
  PENDING     → APPROVED     (action by: HR)
  PENDING     → REJECTED     (action by: HR)
  APPROVED    → DEACTIVATED  (action by: HR or Owner)
  DEACTIVATED → APPROVED     (action by: Owner only)
  REJECTED    → (terminal — employee must re-register with a different email)
  ```
- **FR-AUTH-11**: A deactivated employee's existing sessions expire at their natural 8-hour timeout. There is no forced immediate logout in V1.
- **FR-AUTH-12**: Employee ID must be unique across the system. Duplicate Employee IDs are rejected at registration.

---

### 3.2 Owner Dashboard

- **FR-OWNER-01**: Owner can create an HR account by providing Full Name, Email, and a temporary password. Created HR accounts start in `APPROVED` status (no approval step for HR).
- **FR-OWNER-02**: Owner can view a paginated list of all HR accounts with their status (APPROVED or DEACTIVATED).
- **FR-OWNER-03**: Owner can deactivate an HR account with an optional reason.
- **FR-OWNER-04**: Owner can reactivate a deactivated HR account.
- **FR-OWNER-05**: Owner can view and update system-wide settings:

  | Setting Key | Description | Default Value |
  |-------------|-------------|---------------|
  | `app_timezone` | IANA timezone string used for all date/time calculations | `Asia/Kolkata` |
  | `late_threshold_time` | 24-hour time (HH:MM) after which Start Work is marked Late | `09:10` |
  | `max_break_duration_minutes` | Maximum allowed break duration in minutes | `60` |
  | `nightly_job_time` | 24-hour time (HH:MM) when the nightly job runs in `app_timezone` | `23:59` |

- **FR-OWNER-06**: Owner has read-only access to all employee and attendance data (same views as HR, without modification rights over attendance).

---

### 3.3 Attendance Logging (Employee)

- **FR-ATT-01**: An approved employee may perform the following actions on any working day. Two valid sequences exist:

  **Without break (break skipped — allowed):**
  ```
  Start Work → End Work
  ```

  **With break:**
  ```
  Start Work → Start Break → End Break → End Work
  ```

- **FR-ATT-02**: Actions must strictly follow the sequence defined in FR-ATT-01:
  - `Start Break` requires `Start Work` to have been recorded.
  - `End Break` requires `Start Break` to have been recorded.
  - `End Work` requires `Start Work` to have been recorded **and**, if `Start Break` was recorded, `End Break` must also be recorded first.
  - Each action can only be performed once per day.

- **FR-ATT-03**: Each employee is allowed a **maximum of one break per day**. Taking a break is optional.

- **FR-ATT-04**: Break duration enforcement uses the `max_break_duration_minutes` system setting (default: 60 minutes). If the actual break duration exceeds this limit upon recording `End Break`:
  - The actual `end_break_at` timestamp is stored unchanged (no auto-capping or auto-closing).
  - `break_exceeded` is set to `true`.
  - A warning message is returned in the API response.
  - The violation is visible to HR in attendance reports.

- **FR-ATT-05**: An employee is marked **Late** (`is_late = true`) when `Start Work` is recorded if the timestamp, converted to `app_timezone`, is after the time specified by `late_threshold_time`. The `is_late` flag is set at the moment `Start Work` is recorded and is never changed afterward.

- **FR-ATT-06**: Employees **cannot edit or delete** their own attendance records at any time.

- **FR-ATT-07**: Employees can view their own attendance history in read-only mode.

- **FR-ATT-08**: **Incomplete Attendance — Work Not Ended**: If `end_work_at` is not recorded by the time the nightly job runs, the record's `status` is set to `INCOMPLETE`.

- **FR-ATT-09**: **Incomplete Attendance — Break Not Ended**: If `start_break_at` was recorded but `end_break_at` was not recorded by the time the nightly job runs, the record's `status` is set to `INCOMPLETE` and `break_not_completed` is set to `true`.

- **FR-ATT-10**: The `date` field on an attendance record is always the calendar date of the `Start Work` action, resolved in `app_timezone`.

- **FR-ATT-11**: All action timestamps are recorded on the server at the moment the API request is received. Client-side timestamps are never used.

---

### 3.4 Working Days

- **FR-WD-01**: **Sundays are always excluded.** No attendance action is accepted on a Sunday. The system rejects any action on a Sunday and the UI disables attendance buttons with the message "Attendance logging is not available on Sundays."

- **FR-WD-02**: **Configurable Holidays.** HR can designate specific dates as public holidays. No attendance action is accepted on a holiday date. The UI disables attendance buttons with the holiday name displayed (e.g., "Today is a public holiday: Republic Day").

- **FR-WD-03**: The working-day check evaluates Sundays first, then holidays.

- **FR-WD-04**: **System Downtime** — If the server is unavailable when an employee attempts a punch action, there is no automatic recovery or offline buffering. This is **Out of Scope for V1**; affected employees should contact HR.

- **FR-WD-05**: **Work Past Midnight** — Scenarios where `End Work` occurs on a different calendar date than `Start Work` are **Out of Scope for V1**.

---

### 3.5 Nightly Automated Job

- **FR-NIGHTLY-01**: A nightly scheduled job runs once per calendar day at the time specified by `nightly_job_time` in `app_timezone` (default: `23:59`).

- **FR-NIGHTLY-02**: The job skips Sundays and public holidays.

- **FR-NIGHTLY-03**: For each approved employee with no attendance record for the current working day, the job creates an `ABSENT` record.

- **FR-NIGHTLY-04**: For each approved employee whose attendance record has `end_work_at IS NULL` (work not ended), the job sets `status = INCOMPLETE`.

- **FR-NIGHTLY-05**: If the record being marked `INCOMPLETE` also has `start_break_at IS NOT NULL AND end_break_at IS NULL`, the job also sets `break_not_completed = true`.

---

### 3.6 HR Dashboard

- **FR-HR-01**: HR can view a paginated, searchable list of all employees. The `search` query supports case-insensitive partial match on Full Name or Email. Filters: `status`, `department` (text match).

- **FR-HR-02**: HR can view a single employee's full profile including all status change history.

- **FR-HR-03**: HR can approve or reject pending employee registrations. An optional rejection reason is recorded and stored.

- **FR-HR-04**: HR can deactivate an approved employee with an optional reason.

- **FR-HR-05**: HR can view attendance records for any employee or all employees, with the following filters:
  - Date range (`startDate` / `endDate`, defaults to current month)
  - Employee (by ID or name search)
  - Department (text match)
  - Late status (`true` / `false`)
  - Attendance status (`PRESENT`, `ABSENT`, `INCOMPLETE`)

- **FR-HR-06**: HR can view an attendance summary for a selected period: total present, total absent, total incomplete, total late, total break-exceeded.

- **FR-HR-07**: HR can add a public holiday with a date and name. Validation rules:
  - Date must not be a Sunday.
  - Date must not already exist as an active (non-deleted) holiday.
  - Date must not be in the past (server date in `app_timezone`).

- **FR-HR-08**: HR can soft-delete a holiday. The record is retained in the database with `deleted_at` and `deleted_by` set; the holiday no longer appears in active views.

- **FR-HR-09**: HR sees an in-app notification badge displaying the count of employee registrations with `PENDING` status.

---

### 3.7 Employee Dashboard

- **FR-EMP-01**: The employee dashboard displays today's attendance state and which actions are currently available.

- **FR-EMP-02**: The UI shows contextual action button(s) based on the current step:
  - No record yet → **[Start Work]**
  - `WORKING` step, no break taken → **[Start Break]** and **[End Work]**
  - `WORKING` step, break already taken → **[End Work]**
  - `ON_BREAK` step → **[End Break]**
  - `RESUMED` step → **[End Work]**
  - `COMPLETED` or `INCOMPLETE` → No buttons; status message shown.
  - Non-working day → No buttons; reason shown.

- **FR-EMP-03**: Employee can view their attendance history. Columns: Date, Day Type (Working / Sunday / Holiday), Start Work, Start Break, End Break, End Work, Break Duration, Total Hours, Status, Late, Notes (e.g., "Break not completed", "Break exceeded").

- **FR-EMP-04**: Employee sees a monthly summary card: Present Days, Absent Days, Incomplete Days, Late Days.

---

## 4. Non-Functional Requirements

- **NFR-01**: The application must be responsive and usable on desktop and mobile browsers.
- **NFR-02**: All custom API endpoints require an active authenticated session. Role enforcement is applied at the middleware layer before any route handler executes.
- **NFR-03**: Passwords are stored as bcrypt hashes with a minimum cost factor of 12.
- **NFR-04**: Attendance actions use database-level row locking (within a transaction) to prevent concurrent double-submissions for the same employee on the same day.
- **NFR-05**: All `TIMESTAMP` values are stored in UTC. Conversion to display timezone uses the `app_timezone` system setting.
- **NFR-06**: Stack: Next.js 14+ (App Router), Prisma ORM, PostgreSQL 15+.
- **NFR-07**: UI: Tailwind CSS, TypeScript (strict mode).
- **NFR-08**: **Rate Limiting (Basic)**: Authentication endpoints (`/register` and login) are limited to 10 requests per minute per IP address. Exceeded limits return `429 Too Many Requests`.
- **NFR-09**: **Session Timeout (Basic)**: Sessions expire after 8 hours. No advanced multi-device session management in V1.
- **NFR-10**: **Pagination Cap**: All paginated endpoints enforce a server-side maximum of 100 records per page. Requests exceeding this are clamped to 100.

---

## 5. Business Rules Summary

| Rule | Value / Source |
|------|---------------|
| Break per day | Maximum 1; taking a break is optional |
| Break duration limit | `max_break_duration_minutes` system setting (default: 60 min) |
| Break exceeded behavior | Actual time stored; `break_exceeded = true` flagged; warning returned |
| Late threshold | After `late_threshold_time` in `app_timezone` (default: 09:10 IST) |
| Timezone | Single app-wide `app_timezone` setting (default: Asia/Kolkata) |
| Sunday exclusion | Every Sunday; no attendance logging allowed |
| Holiday management | HR-configurable; soft-delete only (no hard deletes) |
| Attendance editing | Employees cannot edit or delete records |
| Account self-registration | Employees only; requires HR approval before login |
| HR account creation | Owner only, through Owner dashboard |
| INCOMPLETE status | Set by nightly job when End Work not recorded by end of day |
| ABSENT status | Created by nightly job when no attendance recorded on a working day |
| Break not completed | Flagged by nightly job when Start Break was recorded but not End Break |

---

## 6. Out of Scope (V1)

- Overtime calculations
- Leave management (sick leave, casual leave, etc.)
- Payroll integration
- Email / SMS notifications of any kind
- Mobile native application
- Multi-timezone per employee (single app-wide timezone only)
- System downtime attendance correction
- Work past midnight (End Work crossing into next calendar day)
- Department module (no Departments table — department is unvalidated free-text on Employee records)
- Advanced session management (forced logout on deactivation, single-device enforcement)
- Attendance record export (CSV / Excel)
- Bulk holiday import
- HR / Employee password reset self-service (V1 requires Owner to reset via seeding)
