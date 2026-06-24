# API Specification — Attendance Management System

**Version**: 1.1  
**Last Updated**: 2026-06-24  
**Base URL**: `/api/v1`  
**Authentication**: NextAuth.js session (cookie-based). All endpoints except `/api/v1/auth/register` and the NextAuth handler require a valid session.  
**Format**: JSON request/response bodies. `Content-Type: application/json`.

---

## Shared Types

### SafeUser DTO
All API responses that return user data use the `SafeUser` type, which **never** includes `passwordHash`.

```typescript
type SafeUser = {
  id: string;
  employeeId: string | null;
  fullName: string;
  email: string;
  department: string | null;
  role: "EMPLOYEE" | "HR" | "OWNER";
  status: "PENDING" | "APPROVED" | "REJECTED" | "DEACTIVATED";
  statusReason: string | null;
  statusChangedAt: string | null;        // ISO 8601 UTC
  statusChangedBy: SafeUser | null;      // nested, without further nesting
  createdAt: string;
}
```

### AttendanceRecord DTO

```typescript
type AttendanceRecord = {
  id: string;
  date: string;                          // YYYY-MM-DD
  startWorkAt: string | null;            // ISO 8601 UTC
  startBreakAt: string | null;
  endBreakAt: string | null;
  endWorkAt: string | null;
  breakDurationMinutes: number | null;
  totalWorkMinutes: number | null;
  isLate: boolean;
  status: "PRESENT" | "ABSENT" | "INCOMPLETE";
  currentStep: "WORKING" | "ON_BREAK" | "RESUMED" | "COMPLETED" | "INCOMPLETE" | null;
  breakExceeded: boolean;
  breakNotCompleted: boolean;
}
```

### History Entry DTO (used in history responses only)
Extends `AttendanceRecord` with virtual fields for non-record days:

```typescript
type HistoryEntry = AttendanceRecord & {
  dayType: "WORKING" | "SUNDAY" | "HOLIDAY";
  holidayName: string | null;            // set when dayType = "HOLIDAY"
  displayStatus: "PRESENT" | "ABSENT" | "INCOMPLETE" | "SUNDAY" | "HOLIDAY";
}
```

---

## Rate Limiting

Auth endpoints (`/register` and the login action of NextAuth) are rate-limited to **10 requests per minute per IP**. When the limit is exceeded, the response is:

```
HTTP 429 Too Many Requests
Retry-After: 60
```

---

## Authentication

### POST `/api/v1/auth/register`
Employee self-registration. Creates account with `PENDING` status.

**Auth**: None required.

**Request body**:
```json
{
  "fullName": "string",
  "email": "string",
  "password": "string (min 8 characters)",
  "employeeId": "string",
  "department": "string"
}
```

**Response** `201`:
```json
{ "message": "Registration successful. Your account is pending HR approval." }
```

**Errors**:
- `400 VALIDATION_ERROR` — Missing required fields, password too short, invalid email format
- `409 CONFLICT` — Email or employeeId already registered

---

### POST `/api/v1/auth/[...nextauth]`
NextAuth.js handler. Manages login (credentials), logout, and session refresh.

**Login request body** (sent by NextAuth Credentials provider):
```json
{ "email": "string", "password": "string" }
```

Login succeeds only if `status = APPROVED`. On failure, NextAuth returns a 401 with a message indicating the account status (`PENDING`, `REJECTED`, or `DEACTIVATED`).

---

### GET `/api/v1/auth/session`
Returns the current session (handled by NextAuth.js). Includes role and status from the database.

**Session payload**:
```json
{
  "user": {
    "id": "uuid",
    "email": "string",
    "fullName": "string",
    "role": "EMPLOYEE | HR | OWNER",
    "status": "APPROVED"
  },
  "expires": "ISO 8601"
}
```

---

## Holidays (All Authenticated Users)

### GET `/api/v1/holidays`
Returns active (non-deleted) holidays. Accessible by all authenticated roles.

**Auth**: Any authenticated user.

**Query params**:
- `year` (optional, integer — defaults to current year in `app_timezone`)

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "date": "2025-01-26",
      "name": "Republic Day",
      "createdAt": "2025-01-01T10:00:00Z"
    }
  ]
}
```

---

## Attendance — Employee

### GET `/api/v1/attendance/today`
Returns the current employee's attendance state for today, including which actions are available.

**Auth**: `EMPLOYEE` (APPROVED)

**Response** `200`:
```json
{
  "date": "2025-01-15",
  "isWorkingDay": true,
  "dayType": "WORKING",
  "holidayName": null,
  "record": {
    "id": "uuid",
    "date": "2025-01-15",
    "startWorkAt": "2025-01-15T03:30:00Z",
    "startBreakAt": null,
    "endBreakAt": null,
    "endWorkAt": null,
    "breakDurationMinutes": null,
    "totalWorkMinutes": null,
    "isLate": false,
    "status": "PRESENT",
    "currentStep": "WORKING",
    "breakExceeded": false,
    "breakNotCompleted": false
  },
  "availableActions": ["START_BREAK", "END_WORK"]
}
```

When `isWorkingDay = false`, `record` is `null` and `availableActions` is `[]`.  
When no action has been taken yet today, `record` is `null` and `availableActions` is `["START_WORK"]`.

**`availableActions` values by state**:

| Condition | availableActions |
|-----------|-----------------|
| No record / not started | `["START_WORK"]` |
| currentStep = WORKING, no break taken | `["START_BREAK", "END_WORK"]` |
| currentStep = WORKING, break already taken | `["END_WORK"]` |
| currentStep = ON_BREAK | `["END_BREAK"]` |
| currentStep = RESUMED | `["END_WORK"]` |
| currentStep = COMPLETED or INCOMPLETE | `[]` |
| Non-working day | `[]` |

---

### POST `/api/v1/attendance/action`
Records one attendance action for today. Timestamps are always server-generated.

**Auth**: `EMPLOYEE` (APPROVED)

**Request body**:
```json
{ "action": "START_WORK | START_BREAK | END_BREAK | END_WORK" }
```

**Response** `200`:
```json
{
  "message": "Start Work recorded.",
  "record": { /* AttendanceRecord DTO */ },
  "warning": null
}
```

`warning` is a non-null string if `break_exceeded = true` on an END_BREAK action (e.g., `"Break duration of 75 minutes exceeds the 60-minute limit."`).

**Business logic executed server-side**:
1. Validate action is permitted given current `current_step` (see state machine in DATABASE_SCHEMA.md).
2. Confirm today is a working day (not Sunday, not active holiday).
3. Acquire row-level lock on the attendance record (or use `upsert` with transaction) to prevent concurrent double-submissions.
4. Record server timestamp.
5. For `START_WORK`: compute `is_late` from server time vs. `late_threshold_time` in `app_timezone`.
6. For `END_BREAK`: compute `break_duration_minutes`; set `break_exceeded` if over limit.
7. For `END_WORK`: compute `total_work_minutes = (end_work_at - start_work_at in minutes) - COALESCE(break_duration_minutes, 0)`.

**Errors**:
- `400 WRONG_SEQUENCE` — Action not valid for current step
- `400 NON_WORKING_DAY` — Today is Sunday or a holiday
- `400 BREAK_ALREADY_TAKEN` — Attempted START_BREAK when break was already used today
- `403 FORBIDDEN` — User is not an APPROVED Employee
- `409 CONFLICT` — Concurrent request conflict (retry)

---

### GET `/api/v1/attendance/history`
Returns a calendar-complete attendance history for the requesting employee. Includes both DB records and virtual entries for Sundays and holidays.

**Auth**: `EMPLOYEE` (APPROVED)

**Query params**:
- `month` (optional, format: `YYYY-MM` — defaults to current month in `app_timezone`)
- `page` (default: 1)
- `limit` (default: 31, max: 100)

**Response** `200`:
```json
{
  "data": [
    {
      "date": "2025-01-15",
      "dayType": "WORKING",
      "holidayName": null,
      "displayStatus": "PRESENT",
      "startWorkAt": "2025-01-15T03:30:00Z",
      "startBreakAt": "2025-01-15T06:00:00Z",
      "endBreakAt": "2025-01-15T06:30:00Z",
      "endWorkAt": "2025-01-15T11:00:00Z",
      "breakDurationMinutes": 30,
      "totalWorkMinutes": 450,
      "isLate": false,
      "status": "PRESENT",
      "currentStep": "COMPLETED",
      "breakExceeded": false,
      "breakNotCompleted": false
    },
    {
      "date": "2025-01-26",
      "dayType": "HOLIDAY",
      "holidayName": "Republic Day",
      "displayStatus": "HOLIDAY",
      "startWorkAt": null,
      "startBreakAt": null,
      "endBreakAt": null,
      "endWorkAt": null,
      "breakDurationMinutes": null,
      "totalWorkMinutes": null,
      "isLate": false,
      "status": null,
      "currentStep": null,
      "breakExceeded": false,
      "breakNotCompleted": false
    }
  ],
  "summary": {
    "presentDays": 18,
    "absentDays": 2,
    "incompleteDays": 1,
    "lateDays": 3,
    "totalWorkingDays": 21
  },
  "pagination": { "page": 1, "limit": 31, "total": 31 }
}
```

---

## HR — Employee Management

### GET `/api/v1/hr/employees`
Returns a paginated, searchable list of employees (EMPLOYEE role only — does not return HR or Owner accounts).

**Auth**: `HR`

**Query params**:
- `search` (optional) — case-insensitive partial match on `full_name` OR `email`
- `status` (optional): `PENDING | APPROVED | REJECTED | DEACTIVATED`
- `department` (optional) — case-insensitive partial match on `department`
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "employeeId": "EMP001",
      "fullName": "Jane Smith",
      "email": "jane@example.com",
      "department": "Engineering",
      "role": "EMPLOYEE",
      "status": "PENDING",
      "statusReason": null,
      "statusChangedAt": null,
      "statusChangedBy": null,
      "createdAt": "2025-01-10T08:00:00Z"
    }
  ],
  "pendingCount": 5,
  "pagination": { "page": 1, "limit": 20, "total": 87 }
}
```

`pendingCount` is always returned regardless of filters — used to populate the HR notification badge.

---

### GET `/api/v1/hr/employees/[id]`
Returns a single employee's full profile.

**Auth**: `HR`

**Response** `200`:
```json
{
  "employee": {
    "id": "uuid",
    "employeeId": "EMP001",
    "fullName": "Jane Smith",
    "email": "jane@example.com",
    "department": "Engineering",
    "role": "EMPLOYEE",
    "status": "APPROVED",
    "statusReason": null,
    "statusChangedAt": "2025-01-11T09:00:00Z",
    "statusChangedBy": {
      "id": "uuid",
      "fullName": "HR Manager",
      "email": "hr@example.com",
      "role": "HR"
    },
    "createdAt": "2025-01-10T08:00:00Z"
  }
}
```

**Errors**:
- `404 NOT_FOUND` — Employee not found, or the id belongs to an HR/Owner user

---

### PATCH `/api/v1/hr/employees/[id]/status`
Changes an employee's account status. HR can approve, reject, or deactivate. Reactivation (DEACTIVATED → APPROVED) is Owner only and handled via the Owner namespace.

**Auth**: `HR`

**Request body**:
```json
{
  "status": "APPROVED | REJECTED | DEACTIVATED",
  "reason": "string (optional)"
}
```

**Response** `200`:
```json
{
  "message": "Account approved.",
  "employee": { /* SafeUser DTO */ }
}
```

**Errors**:
- `400 INVALID_TRANSITION` — Attempted status transition not permitted by the state machine
- `403 FORBIDDEN` — HR attempted a transition only Owner can perform (e.g., reactivation)
- `404 NOT_FOUND` — Employee not found

---

## HR — Attendance

### GET `/api/v1/hr/attendance`
Returns attendance records for all employees (or a filtered subset). Does not include Sunday/Holiday virtual entries — those are shown in the employee history view.

**Auth**: `HR`

**Query params**:
- `userId` (optional) — filter by a specific employee UUID
- `department` (optional) — case-insensitive partial match on department
- `startDate` (optional, `YYYY-MM-DD` — defaults to first day of current month)
- `endDate` (optional, `YYYY-MM-DD` — defaults to today in `app_timezone`)
- `isLate` (optional, `true | false`)
- `status` (optional): `PRESENT | ABSENT | INCOMPLETE`
- `breakExceeded` (optional, `true | false`)
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Response** `200`:
```json
{
  "data": [
    {
      "employee": {
        "id": "uuid",
        "employeeId": "EMP001",
        "fullName": "Jane Smith",
        "department": "Engineering"
      },
      "date": "2025-01-15",
      "startWorkAt": "2025-01-15T03:40:00Z",
      "startBreakAt": "2025-01-15T06:00:00Z",
      "endBreakAt": "2025-01-15T07:10:00Z",
      "endWorkAt": "2025-01-15T11:00:00Z",
      "breakDurationMinutes": 70,
      "totalWorkMinutes": 380,
      "isLate": true,
      "status": "PRESENT",
      "currentStep": "COMPLETED",
      "breakExceeded": true,
      "breakNotCompleted": false
    }
  ],
  "summary": {
    "totalPresent": 18,
    "totalAbsent": 4,
    "totalIncomplete": 2,
    "totalLate": 3,
    "totalBreakExceeded": 1
  },
  "pagination": { "page": 1, "limit": 20, "total": 24 }
}
```

---

## HR — Holiday Management

### POST `/api/v1/hr/holidays`
Add a new active holiday. Validates that the date is not a Sunday, not in the past, and not already an active holiday for that date.

**Auth**: `HR`

**Request body**:
```json
{ "date": "2025-08-15", "name": "Independence Day" }
```

**Response** `201`:
```json
{
  "message": "Holiday added.",
  "holiday": {
    "id": "uuid",
    "date": "2025-08-15",
    "name": "Independence Day",
    "createdAt": "2025-01-20T10:00:00Z"
  }
}
```

**Errors**:
- `400 VALIDATION_ERROR` — Invalid date format
- `400 INVALID_DATE` — Date is a Sunday, or date is in the past
- `409 CONFLICT` — An active holiday already exists for this date

---

### DELETE `/api/v1/hr/holidays/[id]`
Soft-deletes a holiday. Sets `deleted_at` and `deleted_by`. The holiday is hidden from all active views but the record is retained in the database.

**Auth**: `HR`

**Response** `200`:
```json
{
  "message": "Holiday removed.",
  "holiday": {
    "id": "uuid",
    "date": "2025-08-15",
    "name": "Independence Day",
    "deletedAt": "2025-01-25T10:00:00Z"
  }
}
```

**Errors**:
- `404 NOT_FOUND` — Holiday not found or already deleted

---

## Owner — HR Account Management

### GET `/api/v1/owner/hr-accounts`
Returns a paginated list of all HR accounts.

**Auth**: `OWNER`

**Query params**:
- `status` (optional): `APPROVED | DEACTIVATED`
- `search` (optional) — partial match on name or email
- `page` (default: 1), `limit` (default: 20, max: 100)

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "HR Manager",
      "email": "hr@company.com",
      "role": "HR",
      "status": "APPROVED",
      "statusReason": null,
      "statusChangedAt": null,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

---

### POST `/api/v1/owner/hr-accounts`
Creates a new HR account. HR accounts are created in `APPROVED` status; no approval step is needed.

**Auth**: `OWNER`

**Request body**:
```json
{
  "fullName": "string",
  "email": "string",
  "password": "string (min 8 characters)"
}
```

**Response** `201`:
```json
{
  "message": "HR account created.",
  "hr": { /* SafeUser DTO */ }
}
```

**Errors**:
- `400 VALIDATION_ERROR` — Missing fields or invalid email
- `409 CONFLICT` — Email already registered

---

### PATCH `/api/v1/owner/hr-accounts/[id]/status`
Deactivates or reactivates an HR account. Also handles Employee account reactivation (DEACTIVATED → APPROVED, which only Owner can perform).

**Auth**: `OWNER`

**Request body**:
```json
{
  "status": "APPROVED | DEACTIVATED",
  "reason": "string (optional)"
}
```

**Response** `200`:
```json
{
  "message": "HR account deactivated.",
  "user": { /* SafeUser DTO */ }
}
```

**Errors**:
- `400 INVALID_TRANSITION` — Transition not permitted
- `404 NOT_FOUND` — Account not found

---

## Owner — System Settings

### GET `/api/v1/owner/settings`
Returns all system settings.

**Auth**: `OWNER`

**Response** `200`:
```json
{
  "settings": {
    "app_timezone": "Asia/Kolkata",
    "late_threshold_time": "09:10",
    "max_break_duration_minutes": "60",
    "nightly_job_time": "23:59"
  }
}
```

---

### PATCH `/api/v1/owner/settings`
Updates one or more system settings. Only the keys listed in the response above are valid.

**Auth**: `OWNER`

**Request body**:
```json
{
  "app_timezone": "Asia/Kolkata",
  "late_threshold_time": "09:30"
}
```

**Response** `200`:
```json
{
  "message": "Settings updated.",
  "settings": {
    "app_timezone": "Asia/Kolkata",
    "late_threshold_time": "09:30",
    "max_break_duration_minutes": "60",
    "nightly_job_time": "23:59"
  }
}
```

**Errors**:
- `400 VALIDATION_ERROR` — Unknown setting key, invalid timezone string, invalid time format

---

## Role-Based Access Control Summary

| Endpoint | EMPLOYEE | HR | OWNER |
|----------|----------|----|-------|
| `POST /auth/register` | Public | Public | Public |
| `GET /holidays` | ✓ | ✓ | ✓ |
| `GET /attendance/today` | ✓ | — | — |
| `POST /attendance/action` | ✓ | — | — |
| `GET /attendance/history` | ✓ | — | — |
| `GET /hr/employees` | — | ✓ | — |
| `GET /hr/employees/[id]` | — | ✓ | — |
| `PATCH /hr/employees/[id]/status` | — | ✓ (limited transitions) | — |
| `GET /hr/attendance` | — | ✓ | — |
| `POST /hr/holidays` | — | ✓ | — |
| `DELETE /hr/holidays/[id]` | — | ✓ | — |
| `GET /owner/hr-accounts` | — | — | ✓ |
| `POST /owner/hr-accounts` | — | — | ✓ |
| `PATCH /owner/hr-accounts/[id]/status` | — | — | ✓ |
| `GET /owner/settings` | — | — | ✓ |
| `PATCH /owner/settings` | — | — | ✓ |

> Owner can also access `/hr/employees` and `/hr/attendance` for read operations in V1 by using the same HR-facing views. Separate Owner-level attendance endpoints are not created in V1.

---

## Error Response Format

All error responses use this shape:

```json
{
  "error": "Human-readable error message.",
  "code": "MACHINE_READABLE_CODE"
}
```

**Error codes**:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `VALIDATION_ERROR` | 400 | Request body or query param failed validation |
| `WRONG_SEQUENCE` | 400 | Attendance action not valid for current step |
| `NON_WORKING_DAY` | 400 | Action attempted on Sunday or holiday |
| `BREAK_ALREADY_TAKEN` | 400 | START_BREAK attempted when break was already taken today |
| `INVALID_DATE` | 400 | Holiday date is Sunday, in the past, or otherwise invalid |
| `INVALID_TRANSITION` | 400 | Account status transition not permitted by state machine |
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Session exists but role is not permitted for this endpoint |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Unique constraint violation (email, employeeId, holiday date) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded on auth endpoint |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
