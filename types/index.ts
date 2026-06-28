export type Role = "EMPLOYEE" | "HR"
export type AccountStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEACTIVATED"
export type AttendanceStatus = "PRESENT" | "ABSENT" | "INCOMPLETE"
export type AttendanceStep = "WORKING" | "ON_BREAK" | "RESUMED" | "COMPLETED" | "INCOMPLETE"
export type DayType = "WORKING" | "SUNDAY" | "HOLIDAY"

export interface SafeUser {
  id: string
  employeeId: string | null
  fullName: string
  email: string
  department: string | null
  role: Role
  status: AccountStatus
  statusReason: string | null
  statusChangedAt: Date | null
  statusChangedBy: string | null
  createdAt: Date
}

export interface AttendanceRecordDTO {
  id: string
  userId: string
  date: string
  startWorkAt: Date | null
  startBreakAt: Date | null
  endBreakAt: Date | null
  endWorkAt: Date | null
  breakDurationMinutes: number | null
  totalWorkMinutes: number | null
  isLate: boolean
  status: AttendanceStatus
  currentStep: AttendanceStep | null
  breakExceeded: boolean
  breakNotCompleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface HistoryEntry extends AttendanceRecordDTO {
  dayType: DayType
  holidayName: string | null
  displayStatus: string
}

export interface ApiError {
  error: string
  code: string
  details?: unknown
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
