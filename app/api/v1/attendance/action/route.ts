import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getSystemSetting } from "@/lib/settings"
import { toZonedTime, formatInTimeZone } from "date-fns-tz"
import { getDay } from "date-fns"
import type { AttendanceRecord } from "@prisma/client"

const bodySchema = z.object({
  action: z.enum(["START_WORK", "START_BREAK", "END_BREAK", "END_WORK"]),
})

class ActionError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus: number
  ) {
    super(message)
  }
}

type Step = "WORKING" | "ON_BREAK" | "RESUMED" | "COMPLETED" | "INCOMPLETE"

function assertStep(
  record: AttendanceRecord | null,
  allowed: (Step | null)[],
  code: string,
  msg: string
) {
  const step = (record?.currentStep ?? null) as Step | null
  if (!allowed.includes(step)) throw new ActionError(msg, code, 422)
}

async function runAction(
  action: string,
  userId: string,
  record: AttendanceRecord | null,
  nowUtc: Date,
  nowInTz: Date,
  todayDate: Date,
  lateThresholdStr: string,
  maxBreakMinutes: number
): Promise<{ record: AttendanceRecord; warning?: string }> {
  switch (action) {
    case "START_WORK": {
      assertStep(record, [null], "ALREADY_STARTED", "Work already started today.")

      const [thHour, thMin] = lateThresholdStr.split(":").map(Number)
      const h = nowInTz.getHours()
      const m = nowInTz.getMinutes()
      const isLate = h > thHour || (h === thHour && m >= thMin)

      const created = await prisma.attendanceRecord.create({
        data: {
          userId,
          date: todayDate,
          startWorkAt: nowUtc,
          currentStep: "WORKING",
          status: "PRESENT",
          isLate,
        },
      })
      return { record: created }
    }

    case "START_BREAK": {
      assertStep(record, ["WORKING", "RESUMED"], "INVALID_STATE", "Cannot take a break right now.")

      const updated = await prisma.attendanceRecord.update({
        where: { id: record!.id },
        data: {
          startBreakAt: nowUtc,
          endBreakAt: null,
          currentStep: "ON_BREAK",
        },
      })
      return { record: updated }
    }

    case "END_BREAK": {
      assertStep(record, ["ON_BREAK"], "INVALID_STATE", "No active break to end.")
      if (!record!.startBreakAt) {
        throw new ActionError("Break start time missing.", "INVALID_STATE", 422)
      }

      const breakMs = nowUtc.getTime() - record!.startBreakAt.getTime()
      const breakMins = Math.floor(breakMs / 60_000)
      const totalBreakMins = (record!.breakDurationMinutes ?? 0) + breakMins
      const breakExceeded = totalBreakMins > maxBreakMinutes

      const updated = await prisma.attendanceRecord.update({
        where: { id: record!.id },
        data: {
          endBreakAt: nowUtc,
          breakDurationMinutes: totalBreakMins,
          breakExceeded,
          currentStep: "RESUMED",
        },
      })

      return {
        record: updated,
        warning: breakExceeded
          ? `Total break time (${totalBreakMins}m) exceeded the allowed ${maxBreakMinutes} minutes.`
          : undefined,
      }
    }

    case "END_WORK": {
      assertStep(record, ["WORKING", "RESUMED"], "INVALID_STATE", "Cannot end work right now.")
      if (!record!.startWorkAt) {
        throw new ActionError("Work start time missing.", "INVALID_STATE", 422)
      }

      const workMs = nowUtc.getTime() - record!.startWorkAt.getTime()
      const breakMs = (record!.breakDurationMinutes ?? 0) * 60_000
      const totalWorkMinutes = Math.floor(Math.max(0, workMs - breakMs) / 60_000)

      const updated = await prisma.attendanceRecord.update({
        where: { id: record!.id },
        data: {
          endWorkAt: nowUtc,
          totalWorkMinutes,
          currentStep: "COMPLETED",
        },
      })
      return { record: updated }
    }

    default:
      throw new ActionError("Unknown action.", "BAD_REQUEST", 400)
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireRole(["EMPLOYEE"])
  if (error) return error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action", code: "VALIDATION_ERROR" }, { status: 400 })
  }

  const { action } = parsed.data
  const userId = user!.id

  const [tz, lateThresholdStr, maxBreakStr] = await Promise.all([
    getSystemSetting("app_timezone"),
    getSystemSetting("late_threshold_time"),
    getSystemSetting("max_break_duration_minutes"),
  ])
  const maxBreakMinutes = parseInt(maxBreakStr, 10)

  const nowUtc = new Date()
  const nowInTz = toZonedTime(nowUtc, tz)
  const todayStr = formatInTimeZone(nowUtc, tz, "yyyy-MM-dd")
  const todayDate = new Date(todayStr + "T00:00:00.000Z")

  if (getDay(nowInTz) === 0) {
    return NextResponse.json(
      { error: "Attendance logging is not available on Sundays.", code: "NON_WORKING_DAY" },
      { status: 400 }
    )
  }

  const holiday = await prisma.holiday.findFirst({
    where: { date: todayDate, deletedAt: null },
  })
  if (holiday) {
    return NextResponse.json(
      { error: `Today is a public holiday: ${holiday.name}.`, code: "NON_WORKING_DAY" },
      { status: 400 }
    )
  }

  const record = await prisma.attendanceRecord.findUnique({
    where: { userId_date: { userId, date: todayDate } },
  })

  try {
    const result = await runAction(
      action,
      userId,
      record,
      nowUtc,
      nowInTz,
      todayDate,
      lateThresholdStr,
      maxBreakMinutes
    )
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ActionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      )
    }
    throw err
  }
}
