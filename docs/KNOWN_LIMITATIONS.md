# Known Limitations — Attendance Management System V1

All known constraints, deliberate simplifications, and out-of-scope items in V1. These are not bugs — they are accepted trade-offs with documented rationales and V2 paths. Referenced from DECISIONS.md where a trade-off was explicitly decided.

---

## Infrastructure Limitations

### KL-001: In-Memory Rate Limiting — Single Instance Only

**Affects**: NFR-08 (rate limiting on auth endpoints)  
**Related**: DEC-006

**Detail**: `lru-cache` stores rate limit counters in Node.js process memory. Each server instance maintains an independent counter. In a horizontally-scaled deployment, the load balancer distributes requests across instances, so each instance sees only a fraction of the total — the limit is never triggered.

**Mitigation in V1**: Single-instance deployment assumed. Document this for any future multi-instance deployment.

**V2 Path**: Replace with Upstash Redis rate limiter or similar distributed store.

---

### KL-002: No Forced Session Invalidation on Deactivation

**Affects**: FR-AUTH-11  
**Related**: DEC-002, KL-019

**Detail**: When an employee is deactivated, their existing login session remains valid for up to 8 hours. Sessions are stateless JWTs stored in cookies. The middleware reads role/status from the JWT (created at login time), not from the database. A deactivated employee can continue using the app until their JWT expires.

**Mitigation in V1**: The 8-hour session window limits the exposure period. HR should deactivate accounts at end of business day when possible.

**V2 Path**: Maintain a server-side session blocklist in Redis checked by middleware on each request.

---

### KL-003: No Distributed Lock for Nightly Job

**Detail**: The nightly job is triggered via an HTTP endpoint. If multiple server instances are running, calling the endpoint may run the job on any instance. Without a distributed lock, two calls in quick succession could process the same employees twice, creating duplicate ABSENT records (blocked by the `(user_id, date)` unique constraint) or duplicate INCOMPLETE transitions.

**Mitigation in V1**: The unique constraint prevents duplicate records. Idempotent design means double-running is safe but wasteful.

**V2 Path**: Use a Redis SETNX distributed lock around the nightly job logic to ensure exactly-once execution.

---

## Business Logic Limitations

### KL-004: Single App-Wide Timezone — No Per-Employee Timezone

**Affects**: FR-ATT-05, FR-ATT-10  
**Related**: DEC-005

**Detail**: All date/time evaluations (late check, calendar date for the `date` column, nightly job trigger) use one `app_timezone` setting. An employee in London on an IST-configured system would be evaluated as late if they start work after 09:10 IST, regardless of their local time.

**Mitigation in V1**: System is designed for single-location or single-timezone deployments.

**V2 Path**: Add a `timezone` field to `users` table for per-employee timezone override.

---

### KL-005: Work Past Midnight — Not Supported

**Affects**: FR-WD-05

**Detail**: If an employee records `Start Work` at 23:45 and `End Work` at 00:30 the next calendar day, the nightly job (running at 23:59) will mark the record as INCOMPLETE before `End Work` can be recorded.

**Mitigation in V1**: Document as Out of Scope. Affected employees should contact HR for manual correction (also not yet possible in V1 — see KL-006).

**V2 Path**: Detect cross-midnight work sessions and handle `total_work_minutes` calculation with date rollover.

---

### KL-006: No System Downtime Recovery for Employees

**Affects**: FR-WD-04

**Detail**: If the server is unavailable during attendance hours, employees cannot log actions. The nightly job marks them as ABSENT or INCOMPLETE. There is no HR manual override API in V1 to correct these records.

**Mitigation in V1**: HR should contact the development team to directly correct database records when downtime affects employees.

**V2 Path**: Add `PATCH /api/v1/hr/attendance/[id]` with audit trail for HR manual override.

---

### KL-007: REJECTED Email Cannot Be Re-Used

**Affects**: FR-AUTH-10

**Detail**: The email field has a UNIQUE constraint. A REJECTED employee cannot re-register using the same email. They must use a different email address.

**Rationale**: FR-AUTH-10 explicitly marks REJECTED as a terminal state. This is intentional — HR reviewed and deliberately rejected the account.

**Mitigation in V1**: HR should communicate to the employee before rejecting if re-registration with correction may be needed.

**V2 Path**: Add an Owner capability to hard-delete REJECTED accounts, freeing the email for re-registration.

---

## Feature Limitations

### KL-008: No Email / SMS Notifications

**Detail**: Employees do not receive notifications when their account is approved, rejected, or deactivated. HR does not receive notifications for new pending registrations (only the in-app badge count, FR-HR-09).

**V2 Path**: Integrate transactional email (Resend, SendGrid, or AWS SES) with triggers on status changes.

---

### KL-009: No Password Self-Service Reset

**Detail**: If a user forgets their password, they cannot reset it themselves. The Owner must update the password directly via database or a targeted seed operation.

**V2 Path**: Add email-based password reset flow with HMAC-signed, time-limited reset tokens.

---

### KL-010: No Attendance Record Export

**Detail**: HR cannot export attendance data to CSV or Excel. All data must be accessed through the UI.

**V2 Path**: Add `GET /api/v1/hr/attendance/export?format=csv` with streaming response and chunked processing for large date ranges.

---

### KL-011: No Leave Management

**Detail**: The system does not distinguish between ABSENT (no show) and LEAVE (approved absence). All absences are recorded uniformly as `ABSENT` by the nightly job.

**V2 Path**: Add a Leave module with leave types, leave requests, and HR approval workflow. APPROVED leave days should not be marked ABSENT by the nightly job.

---

### KL-012: Department Free-Text — No Typo Prevention

**Affects**: FR-HR-01  
**Related**: DEC-013

**Detail**: Department is a free-text field. Typos create reporting fragmentation. "Engineering" and "Enginreing" appear as separate departments in HR filters.

**Mitigation in V1**: HR should establish a naming convention and enforce it during employee approval.

**V2 Path**: Add a Departments table with a foreign key on `users.department_id`. Migrate free-text values during V2 migration.

---

### KL-013: No Bulk Holiday Import

**Detail**: HR must add holidays one at a time through the UI. Adding a full year's calendar requires many individual form submissions.

**V2 Path**: Add `POST /api/v1/hr/holidays/bulk-import` accepting a JSON array or CSV file.

---

### KL-014: No Real-Time UI Updates

**Detail**: If HR approves an employee's account while the employee is viewing `/pending`, the page does not auto-update. The employee must manually refresh or re-authenticate.

**V2 Path**: Server-Sent Events (SSE) for the `/pending` page to push status changes in real time.

---

### KL-015: No Overtime Calculations

**Detail**: `total_work_minutes` is stored, but there is no concept of expected work hours, overtime threshold, or overtime pay calculations.

**V2 Path**: Add `expected_work_minutes` system setting and computed `overtime_minutes` on reports.

---

### KL-016: HR Cannot See Other HR Activity

**Detail**: HR users have no visibility into other HR users' actions (approvals, holiday additions, etc.). Only the Owner has a cross-HR view.

**Rationale**: Intentional for privacy. Each HR user manages their own workqueue.

---

### KL-017: Employee ID is Self-Reported — No Roster Validation

**Detail**: Employees enter any string as their Employee ID during self-registration. There is no validation against an authoritative employee roster.

**Mitigation in V1**: HR verifies the Employee ID manually during the approval review.

**V2 Path**: Add a pre-imported employee roster table; validate Employee ID at registration time.

---

## Security Limitations

### KL-018: No Audit History for System Settings Values

**Detail**: `system_settings.updated_by` and `updated_at` record who last changed a setting and when, but there is no history of previous values. A setting changed from `09:00` to `09:30` and back to `09:00` shows only the last change.

**V2 Path**: Add a `system_settings_history` table logging every change as a new row with old and new values.

---

### KL-019: JWT Status Not Refreshed Mid-Session

**Affects**: Security posture for deactivated accounts  
**Related**: KL-002

**Detail**: The JWT contains `status: "APPROVED"` at the time of login. If an account is deactivated between login and the next request, the middleware reads the stale JWT value. The middleware cannot detect the deactivation until the JWT expires (up to 8 hours).

**This is the same root cause as KL-002, described from the security angle.**

**V2 Path**: Short-lived access tokens (e.g., 15-minute expiry) with refresh token rotation, or a server-side blocklist checked per request.
