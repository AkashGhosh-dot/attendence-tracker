"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/lib/use-toast"

type AttendanceRow = {
  id: string
  employeeId: string | null
  fullName: string
  department: string | null
  record: {
    startWorkAt: string | null
    endWorkAt: string | null
    breakDurationMinutes: number | null
    totalWorkMinutes: number | null
    isLate: boolean
    status: string
    currentStep: string | null
    breakExceeded: boolean
  } | null
}

type AttendanceData = {
  date: string
  timezone: string
  isHoliday: boolean
  holidayName: string | null
  summary: {
    total: number
    present: number
    absent: number
    incomplete: number
    late: number
    notMarked: number
  }
  rows: AttendanceRow[]
}

const STEP_LABEL: Record<string, string> = {
  WORKING: "Working",
  ON_BREAK: "On Break",
  RESUMED: "Resumed",
  COMPLETED: "Completed",
  INCOMPLETE: "Incomplete",
}

function fmtTime(iso: string | null, tz: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function fmtMins(mins: number | null) {
  if (mins === null) return "—"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function AttendanceOverviewPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<AttendanceData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/hr/attendance?date=${d}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      toast("Failed to load attendance.", "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(date) }, [date, fetchData])

  const tz = data?.timezone ?? "Asia/Kolkata"

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-5 mt-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Daily view of all employee attendance.</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </div>

      {data?.isHoliday && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Public Holiday: <strong>{data.holidayName}</strong> — no attendance expected.
        </div>
      )}

      {/* Summary row */}
      {data && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Total", value: data.summary.total },
            { label: "Present", value: data.summary.present, color: "text-green-600" },
            { label: "Absent", value: data.summary.absent, color: "text-red-500" },
            { label: "Incomplete", value: data.summary.incomplete, color: "text-orange-500" },
            { label: "Late", value: data.summary.late, color: "text-amber-600" },
            { label: "Not Marked", value: data.summary.notMarked, color: "text-slate-400" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-bold ${s.color ?? "text-slate-900"}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : data?.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No approved employees found.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium pr-4">Employee</th>
                <th className="pb-2 font-medium pr-4">Clock In</th>
                <th className="pb-2 font-medium pr-4">Clock Out</th>
                <th className="pb-2 font-medium pr-4">Break</th>
                <th className="pb-2 font-medium pr-4">Net Work</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.rows.map(row => {
                const rec = row.record
                const statusLabel = rec
                  ? rec.currentStep
                    ? STEP_LABEL[rec.currentStep] ?? rec.currentStep
                    : rec.status
                  : "Not Marked"

                const statusColor = !rec
                  ? "text-slate-400"
                  : rec.status === "PRESENT" && rec.currentStep === "COMPLETED"
                  ? "text-green-600"
                  : rec.status === "ABSENT"
                  ? "text-red-500"
                  : rec.status === "INCOMPLETE"
                  ? "text-orange-500"
                  : "text-blue-600"

                return (
                  <tr key={row.id} className="py-2">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-slate-900">{row.fullName}</div>
                      {row.department && (
                        <div className="text-xs text-muted-foreground">{row.department}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {fmtTime(rec?.startWorkAt ?? null, tz)}
                      {rec?.isLate && (
                        <span className="ml-1 text-amber-600 font-sans">(Late)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{fmtTime(rec?.endWorkAt ?? null, tz)}</td>
                    <td className="py-2.5 pr-4 text-xs">
                      {fmtMins(rec?.breakDurationMinutes ?? null)}
                      {rec?.breakExceeded && (
                        <span className="ml-1 text-orange-500">!</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-xs">{fmtMins(rec?.totalWorkMinutes ?? null)}</td>
                    <td className={`py-2.5 text-xs font-medium ${statusColor}`}>{statusLabel}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
