import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getSystemSetting } from "@/lib/settings"
import { formatInTimeZone } from "date-fns-tz"

export async function GET(req: NextRequest) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error
  void user

  const tz = await getSystemSetting("app_timezone")
  const { searchParams } = req.nextUrl

  // Default to today in app timezone
  const dateParam = searchParams.get("date")
  const dateStr = dateParam ?? formatInTimeZone(new Date(), tz, "yyyy-MM-dd")
  const dateUtc = new Date(dateStr + "T00:00:00.000Z")

  const [employees, records, holiday] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EMPLOYEE", status: "APPROVED" },
      select: { id: true, employeeId: true, fullName: true, department: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.attendanceRecord.findMany({
      where: { date: dateUtc },
      select: {
        userId: true,
        startWorkAt: true,
        endWorkAt: true,
        breakDurationMinutes: true,
        totalWorkMinutes: true,
        isLate: true,
        status: true,
        currentStep: true,
        breakExceeded: true,
      },
    }),
    prisma.holiday.findFirst({ where: { date: dateUtc, deletedAt: null } }),
  ])

  const recordMap = new Map(records.map(r => [r.userId, r]))

  const rows = employees.map(emp => {
    const rec = recordMap.get(emp.id) ?? null
    return {
      ...emp,
      record: rec,
    }
  })

  const summary = {
    total: employees.length,
    present: records.filter(r => r.status === "PRESENT").length,
    absent: records.filter(r => r.status === "ABSENT").length,
    incomplete: records.filter(r => r.status === "INCOMPLETE").length,
    late: records.filter(r => r.isLate).length,
    notMarked: employees.length - records.length,
  }

  return NextResponse.json({ date: dateStr, timezone: tz, isHoliday: !!holiday, holidayName: holiday?.name ?? null, summary, rows })
}
