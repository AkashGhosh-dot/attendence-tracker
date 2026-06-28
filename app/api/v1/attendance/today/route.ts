import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getSystemSetting } from "@/lib/settings"
import { toZonedTime, formatInTimeZone } from "date-fns-tz"
import { getDay } from "date-fns"
import type { AttendanceRecord } from "@prisma/client"

function getAvailableActions(record: AttendanceRecord | null): string[] {
  if (!record) return ["START_WORK"]
  switch (record.currentStep) {
    case "WORKING":
    case "RESUMED":
      return ["START_BREAK", "END_WORK"]
    case "ON_BREAK":
      return ["END_BREAK"]
    case "COMPLETED":
    case "INCOMPLETE":
      return []
    default:
      return ["START_WORK"]
  }
}

export async function GET() {
  const { user, error } = await requireRole(["EMPLOYEE"])
  if (error) return error

  const tz = await getSystemSetting("app_timezone")
  const nowUtc = new Date()
  const todayStr = formatInTimeZone(nowUtc, tz, "yyyy-MM-dd")
  const todayDate = new Date(todayStr + "T00:00:00.000Z")

  const nowInTz = toZonedTime(nowUtc, tz)
  const isSunday = getDay(nowInTz) === 0

  const [record, holiday] = await Promise.all([
    prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: user!.id, date: todayDate } },
    }),
    prisma.holiday.findFirst({
      where: { date: todayDate, deletedAt: null },
    }),
  ])

  const isHoliday = !!holiday
  const availableActions = isSunday || isHoliday ? [] : getAvailableActions(record)

  return NextResponse.json({
    record,
    availableActions,
    isSunday,
    isHoliday,
    holidayName: holiday?.name ?? null,
    date: todayStr,
    timezone: tz,
  })
}
