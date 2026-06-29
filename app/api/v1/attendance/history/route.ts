import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getSystemSetting } from "@/lib/settings"
import { formatInTimeZone } from "date-fns-tz"
import { subDays } from "date-fns"
import type { HistoryEntry } from "@/types"

function displayStatus(status: string, isLate: boolean): string {
  if (status === "ABSENT") return "Absent"
  if (status === "INCOMPLETE") return "Incomplete"
  if (isLate) return "Late"
  return "Present"
}

export async function GET() {
  const { user, error } = await requireRole(["EMPLOYEE"])
  if (error) return error

  const tz = await getSystemSetting("app_timezone")
  const nowUtc = new Date()

  const todayStr = formatInTimeZone(nowUtc, tz, "yyyy-MM-dd")
  const todayDate = new Date(todayStr + "T00:00:00.000Z")
  const fromDate = subDays(todayDate, 29)

  const [records, holidays] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        userId: user!.id,
        date: { gte: fromDate, lte: todayDate },
      },
      orderBy: { date: "desc" },
    }),
    prisma.holiday.findMany({
      where: {
        date: { gte: fromDate, lte: todayDate },
        deletedAt: null,
      },
      select: { date: true, name: true },
    }),
  ])

  const holidayMap = new Map(
    holidays.map(h => [h.date.toISOString().slice(0, 10), h.name])
  )

  const entries: HistoryEntry[] = records.map(r => {
    const dateStr = r.date.toISOString().slice(0, 10)
    const holidayName = holidayMap.get(dateStr) ?? null
    const dayType = holidayName ? "HOLIDAY" : "WORKING"

    return {
      id: r.id,
      userId: r.userId,
      date: dateStr,
      startWorkAt: r.startWorkAt,
      startBreakAt: r.startBreakAt,
      endBreakAt: r.endBreakAt,
      endWorkAt: r.endWorkAt,
      breakDurationMinutes: r.breakDurationMinutes,
      totalWorkMinutes: r.totalWorkMinutes,
      isLate: r.isLate,
      status: r.status as HistoryEntry["status"],
      currentStep: r.currentStep as HistoryEntry["currentStep"],
      breakExceeded: r.breakExceeded,
      breakNotCompleted: r.breakNotCompleted,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      dayType,
      holidayName,
      displayStatus: displayStatus(r.status, r.isLate),
    }
  })

  return NextResponse.json({ entries, timezone: tz })
}
