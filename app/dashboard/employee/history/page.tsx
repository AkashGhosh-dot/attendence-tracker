"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/lib/use-toast"
import type { HistoryEntry } from "@/types"

const STATUS_FILTERS = ["All", "Present", "Late", "Absent", "Incomplete"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_STYLE: Record<string, string> = {
  Present: "bg-green-100 text-green-700",
  Late: "bg-amber-100 text-amber-700",
  Absent: "bg-red-100 text-red-600",
  Incomplete: "bg-orange-100 text-orange-600",
  Holiday: "bg-blue-100 text-blue-600",
}

function fmtTime(iso: Date | string | null, tz: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function fmtMins(mins: number | null): string {
  if (mins === null || mins <= 0) return "—"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getDayName(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
}

function grossMinutes(entry: HistoryEntry): number | null {
  if (!entry.startWorkAt || !entry.endWorkAt) return null
  return Math.floor(
    (new Date(entry.endWorkAt).getTime() - new Date(entry.startWorkAt).getTime()) / 60_000
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  )
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All")
  const [dateSearch, setDateSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/attendance/history")
        if (!res.ok) throw new Error()
        const json = await res.json()
        setEntries(json.entries)
        setTimezone(json.timezone)
      } catch {
        setHasError(true)
        toast("Failed to load attendance history.", "error")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter !== "All" && e.displayStatus !== statusFilter) return false
      if (dateSearch) {
        const haystack = [
          fmtDate(e.date).toLowerCase(),
          getDayName(e.date).toLowerCase(),
          e.date,
        ].join(" ")
        if (!haystack.includes(dateSearch.toLowerCase())) return false
      }
      return true
    })
  }, [entries, statusFilter, dateSearch])

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-5 mt-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance History</h1>
        <p className="text-sm text-muted-foreground mt-1">Your attendance records for the last 30 days.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by date…"
          value={dateSearch}
          onChange={e => setDateSearch(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 w-48"
        />
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                statusFilter === f
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {hasError && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">
            Failed to load attendance history. Please refresh the page.
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !hasError && entries.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            You don&apos;t have any attendance records yet.
          </CardContent>
        </Card>
      )}

      {/* No filter results */}
      {!loading && !hasError && entries.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No records match the selected filter.
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {(loading || filtered.length > 0) && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Clock In</th>
                <th className="px-4 py-3 font-medium">Clock Out</th>
                <th className="px-4 py-3 font-medium">Total Time</th>
                <th className="px-4 py-3 font-medium">Break</th>
                <th className="px-4 py-3 font-medium">Net Working</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.map(entry => {
                    const gross = grossMinutes(entry)
                    const statusStyle = STATUS_STYLE[entry.displayStatus] ?? "bg-slate-100 text-slate-600"
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                          {fmtDate(entry.date)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {getDayName(entry.date)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {fmtTime(entry.startWorkAt, timezone)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {fmtTime(entry.endWorkAt, timezone)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {fmtMins(gross)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {fmtMins(entry.breakDurationMinutes)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                          {fmtMins(entry.totalWorkMinutes)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                            {entry.displayStatus}
                            {entry.holidayName && (
                              <span className="ml-1 opacity-70">· {entry.holidayName}</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {entries.length} record{entries.length !== 1 ? "s" : ""}
        </p>
      )}
    </main>
  )
}
