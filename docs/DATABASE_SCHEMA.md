# Database Schema — Attendance Management System

**Version**: 1.1  
**Last Updated**: 2026-06-24  
**Database**: PostgreSQL 15+  
**ORM**: Prisma

---

## Tables

### 1. `users`

Stores Employee, HR, and Owner accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Primary key |
| `employee_id` | `VARCHAR(50)` | UNIQUE, **NULLABLE** | Company employee ID. Required for EMPLOYEE role; NULL for HR and OWNER. |
| `full_name` | `VARCHAR(255)` | NOT NULL | Display name |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Login email |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Bcrypt hash (cost ≥ 12) |
| `department` | `VARCHAR(100)` | **NULLABLE** | Department (free-text). Required for EMPLOYEE role; NULL for HR and OWNER. |
| `role` | `ENUM('EMPLOYEE','HR','OWNER')` | NOT NULL, default `'EMPLOYEE'` | User role |
| `status` | `ENUM('PENDING','APPROVED','REJECTED','DEACTIVATED')` | NOT NULL, default `'PENDING'` | Account status |
| `status_reason` | `VARCHAR(500)` | NULL | Optional reason for the most recent status change |
| `status_changed_by` | `UUID` | NULL, FK → `users.id` | Who made the last status change (HR or Owner) |
| `status_changed_at` | `TIMESTAMP` | NULL | When the last status change occurred (UTC) |
| `created_at` | `TIMESTAMP` | NOT NULL, default `now()` | Account creation timestamp (UTC) |
| `updated_at` | `TIMESTAMP` | NOT NULL, auto-update | Last modified timestamp (UTC) |

**Indexes**: `email`, `employee_id`, `status`, `role`

**Application-level rules**:
- `employee_id` is enforced NOT NULL for `role = EMPLOYEE` at the application layer.
- `department` is enforced NOT NULL for `role = EMPLOYEE` at the application layer.
- `status` defaults to `PENDING` for EMPLOYEE self-registrations; HR accounts created by Owner start as `APPROVED`; the Owner seed account is `APPROVED`.
- `status_changed_by` references the HR/Owner user who performed the transition. NULL for initial registration.

---

### 2. `attendance_records`

One record per employee per working day. Created when an employee records their first action (`START_WORK`) or by the nightly job (for `ABSENT` records).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | NOT NULL, FK → `users.id` (Restrict) | Employee reference |
| `date` | `DATE` | NOT NULL | Calendar date in `app_timezone` at time of START_WORK |
| `start_work_at` | `TIMESTAMP` | NULL | UTC timestamp of START_WORK action |
| `start_break_at` | `TIMESTAMP` | NULL | UTC timestamp of START_BREAK action |
| `end_break_at` | `TIMESTAMP` | NULL | UTC timestamp of END_BREAK action |
| `end_work_at` | `TIMESTAMP` | NULL | UTC timestamp of END_WORK action |
| `break_duration_minutes` | `INTEGER` | NULL | Actual break duration: `(end_break_at − start_break_at)` in minutes. Set on END_BREAK. |
| `total_work_minutes` | `INTEGER` | NULL | Net work time: `(end_work_at − start_work_at) − COALESCE(break_duration_minutes, 0)`. Set on END_WORK. |
| `is_late` | `BOOLEAN` | NOT NULL, default `false` | Set on START_WORK: `true` if start_work_at in `app_timezone` is after `late_threshold_time` |
| `status` | `ENUM('PRESENT','ABSENT','INCOMPLETE')` | NOT NULL, default `'PRESENT'` | PRESENT: employee showed up. ABSENT: nightly job (no show). INCOMPLETE: nightly job (unfinished). |
| `current_step` | `ENUM('WORKING','ON_BREAK','RESUMED','COMPLETED','INCOMPLETE')` | NULL | Explicit state machine for the day's attendance progression. NULL only for ABSENT records. |
| `break_exceeded` | `BOOLEAN` | NOT NULL, default `false` | `true` if actual break duration exceeds `max_break_duration_minutes` |
| `break_not_completed` | `BOOLEAN` | NOT NULL, default `false` | `true` if nightly job finds START_BREAK recorded but END_BREAK not recorded |
| `created_at` | `TIMESTAMP` | NOT NULL, default `now()` | |
| `updated_at` | `TIMESTAMP` | NOT NULL, auto-update | |

**Unique constraint**: `(user_id, date)` — enforces one record per employee per calendar day.

**Indexes**:
- `(user_id, date)` — covered by the unique constraint; used for single-employee queries.
- `(date, user_id)` — composite index for date-range queries across all employees.
- `(date, status)` — composite index for HR reporting by status.

**State machine for `current_step`**:

```
START_WORK fired  →  current_step = WORKING
START_BREAK fired →  current_step = ON_BREAK
END_BREAK fired   →  current_step = RESUMED
END_WORK fired    →  current_step = COMPLETED
Nightly job runs  →  any non-COMPLETED becomes INCOMPLETE
```

**Available actions by `current_step`**:

| current_step | break_already_taken | availableActions |
|---|---|---|
| NULL (no record) | n/a | `["START_WORK"]` |
| `WORKING` | false | `["START_BREAK", "END_WORK"]` |
| `WORKING` | true | `["END_WORK"]` |
| `ON_BREAK` | — | `["END_BREAK"]` |
| `RESUMED` | — | `["END_WORK"]` |
| `COMPLETED` | — | `[]` |
| `INCOMPLETE` | — | `[]` |

> `break_already_taken` is derived by checking `start_break_at IS NOT NULL`.

**Holiday and Sunday logic**: These are **not stored** as `attendance_records` rows. The API layer computes Sunday dates from the calendar and queries the `holidays` table to build a complete history view. They appear in API responses as virtual entries.

---

### 3. `holidays`

HR-configurable list of public holidays. Uses soft delete — no hard deletes allowed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Primary key |
| `date` | `DATE` | NOT NULL | Holiday date. Partial unique index on `date WHERE deleted_at IS NULL`. |
| `name` | `VARCHAR(255)` | NOT NULL | Holiday name (e.g., "Republic Day") |
| `created_by` | `UUID` | NOT NULL, FK → `users.id` (Restrict) | HR user who added this holiday |
| `created_at` | `TIMESTAMP` | NOT NULL, default `now()` | |
| `deleted_at` | `TIMESTAMP` | NULL | Soft-delete timestamp. NULL = active holiday. |
| `deleted_by` | `UUID` | NULL, FK → `users.id` (SetNull) | HR user who soft-deleted this holiday |

**Partial unique index** (applied via raw migration — Prisma does not support this natively):
```sql
CREATE UNIQUE INDEX holidays_date_active_unique
  ON holidays (date)
  WHERE deleted_at IS NULL;
```
This allows the same date to be re-added after a soft delete.

**Indexes**: `date`, `deleted_at`

---

### 4. `system_settings`

Key-value store for Owner-configurable system parameters.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Primary key |
| `key` | `VARCHAR(100)` | UNIQUE, NOT NULL | Setting key (see table below) |
| `value` | `TEXT` | NOT NULL | Setting value (always stored as string; application parses type) |
| `description` | `VARCHAR(500)` | NULL | Human-readable description of the setting |
| `updated_by` | `UUID` | NULL, FK → `users.id` (SetNull) | Owner who last updated. NULL for seed values. |
| `updated_at` | `TIMESTAMP` | NOT NULL, auto-update | |

**Seed values**:

| key | value | description |
|-----|-------|-------------|
| `app_timezone` | `Asia/Kolkata` | IANA timezone for all date/time calculations |
| `late_threshold_time` | `09:10` | 24-hour HH:MM; START_WORK after this time is marked Late |
| `max_break_duration_minutes` | `60` | Maximum allowed break duration in minutes |
| `nightly_job_time` | `23:59` | 24-hour HH:MM in app_timezone when the nightly job runs |

---

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────────────────────────

enum Role {
  EMPLOYEE
  HR
  OWNER
}

enum AccountStatus {
  PENDING
  APPROVED
  REJECTED
  DEACTIVATED
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  INCOMPLETE
}

enum AttendanceStep {
  WORKING
  ON_BREAK
  RESUMED
  COMPLETED
  INCOMPLETE
}

// ─── Models ───────────────────────────────────────────────────────────────────

model User {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  employeeId        String?       @unique @map("employee_id") @db.VarChar(50)
  fullName          String        @map("full_name") @db.VarChar(255)
  email             String        @unique @db.VarChar(255)
  passwordHash      String        @map("password_hash") @db.VarChar(255)
  department        String?       @db.VarChar(100)
  role              Role          @default(EMPLOYEE)
  status            AccountStatus @default(PENDING)
  statusReason      String?       @map("status_reason") @db.VarChar(500)
  statusChangedBy   String?       @map("status_changed_by") @db.Uuid
  statusChangedAt   DateTime?     @map("status_changed_at")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  // Self-referential relation: who changed this user's status
  statusChanger     User?         @relation("UserStatusHistory", fields: [statusChangedBy], references: [id], onDelete: SetNull)
  statusChangedUsers User[]       @relation("UserStatusHistory")

  // Attendance records owned by this employee
  attendance        AttendanceRecord[]

  // Holidays this user created or deleted
  createdHolidays   Holiday[]     @relation("HolidayCreatedBy")
  deletedHolidays   Holiday[]     @relation("HolidayDeletedBy")

  // System settings this Owner last updated
  updatedSettings   SystemSetting[]

  @@index([status])
  @@index([role])
  @@map("users")
}

model AttendanceRecord {
  id                   String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId               String           @map("user_id") @db.Uuid
  date                 DateTime         @db.Date
  startWorkAt          DateTime?        @map("start_work_at")
  startBreakAt         DateTime?        @map("start_break_at")
  endBreakAt           DateTime?        @map("end_break_at")
  endWorkAt            DateTime?        @map("end_work_at")
  breakDurationMinutes Int?             @map("break_duration_minutes")
  totalWorkMinutes     Int?             @map("total_work_minutes")
  isLate               Boolean          @default(false) @map("is_late")
  status               AttendanceStatus @default(PRESENT)
  currentStep          AttendanceStep?  @map("current_step")
  breakExceeded        Boolean          @default(false) @map("break_exceeded")
  breakNotCompleted    Boolean          @default(false) @map("break_not_completed")
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([userId, date])
  @@index([date, userId])
  @@index([date, status])
  @@map("attendance_records")
}

model Holiday {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date      DateTime  @db.Date
  name      String    @db.VarChar(255)
  createdBy String    @map("created_by") @db.Uuid
  createdAt DateTime  @default(now()) @map("created_at")
  deletedAt DateTime? @map("deleted_at")
  deletedBy String?   @map("deleted_by") @db.Uuid

  creator User  @relation("HolidayCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  deleter User? @relation("HolidayDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  // NOTE: The unique constraint on (date) is a PARTIAL unique index applied via
  // raw migration: CREATE UNIQUE INDEX holidays_date_active_unique ON holidays (date)
  // WHERE deleted_at IS NULL;
  // This allows the same date to be re-added after a soft delete.
  @@index([date])
  @@index([deletedAt])
  @@map("holidays")
}

model SystemSetting {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key         String    @unique @db.VarChar(100)
  value       String    @db.Text
  description String?   @db.VarChar(500)
  updatedBy   String?   @map("updated_by") @db.Uuid
  updatedAt   DateTime  @updatedAt @map("updated_at")

  updater User? @relation(fields: [updatedBy], references: [id], onDelete: SetNull)

  @@map("system_settings")
}
```

---

## Key Design Decisions

1. **One record per employee per working day**: The `(user_id, date)` unique constraint prevents duplicate attendance records. ABSENT records are created by the nightly job for employees with no action.

2. **Explicit state machine (`current_step`)**: Rather than deriving state by checking which timestamp columns are NULL, `current_step` makes the attendance step explicit. This prevents ambiguity when break is optional (a record with `WORKING` step and a non-null `start_break_at` means break was completed; without a step column these states are indistinguishable).

3. **Stored computed fields**: `break_duration_minutes` and `total_work_minutes` are stored at write time for efficient reporting queries. `total_work_minutes` uses `COALESCE(break_duration_minutes, 0)` to handle the no-break case correctly.

4. **UTC storage, single app timezone for display**: All `TIMESTAMP` columns store UTC. The `app_timezone` system setting is the single source of truth for all date/time display and business rule evaluations (late check, calendar date for `date` column, nightly job timing).

5. **Soft delete for holidays**: `deleted_at` / `deleted_by` preserve the audit trail. The partial unique index `WHERE deleted_at IS NULL` enforces active-holiday uniqueness while allowing the same date to be re-added after deletion.

6. **`employee_id` is nullable**: HR and Owner roles don't carry a company employee ID. The NOT NULL enforcement is at the application layer for EMPLOYEE role only, keeping the DB schema generic.

7. **`AttendanceStatus` simplified to three values**: `PRESENT`, `ABSENT`, `INCOMPLETE`. Sunday and Holiday are not stored as DB records — they are computed by the API layer from the calendar and the `holidays` table, and presented as virtual entries in history responses.

8. **Cascade rules explicit for all FK relations**:
   - `attendance_records → users`: `onDelete: Restrict` (cannot delete a user who has records)
   - `holidays.created_by → users`: `onDelete: Restrict`
   - `holidays.deleted_by → users`: `onDelete: SetNull`
   - `users.status_changed_by → users`: `onDelete: SetNull`
   - `system_settings.updated_by → users`: `onDelete: SetNull`

9. **No Departments table in V1**: Department is a free-text `VARCHAR` field. Filtering by department in HR views uses case-insensitive SQL `ILIKE`. A Departments table is deferred to V2.

10. **`system_settings` as the single configuration source**: Late threshold, break cap, timezone, and nightly job time are all runtime-configurable by the Owner without code changes. The application reads these on each relevant request (or caches with a short TTL).
