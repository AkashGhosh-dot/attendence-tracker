"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/lib/use-toast"

type Overview = {
  pendingApprovals: number
  todaySummary: {
    date: string
    present: number
    absent: number
    incomplete: number
    late: number
    notMarked: number
    total: number
  }
  nextHoliday: { name: string; date: string } | null
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-slate-100 rounded animate-pulse ${className ?? ""}`} />
}

export default function HROverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [attRes, empRes, holRes] = await Promise.all([
          fetch("/api/v1/hr/attendance"),
          fetch("/api/v1/hr/employees?status=PENDING"),
          fetch("/api/v1/hr/holidays"),
        ])
        if (!attRes.ok || !empRes.ok || !holRes.ok) throw new Error()

        const [att, emp, hol] = await Promise.all([
          attRes.json(),
          empRes.json(),
          holRes.json(),
        ])

        const today = new Date().toISOString().slice(0, 10)
        const upcoming = (hol.holidays as { name: string; date: string }[])
          .find(h => h.date.slice(0, 10) >= today) ?? null

        setData({
          pendingApprovals: emp.employees.length,
          todaySummary: att.summary ? { date: att.date, ...att.summary } : {
            date: att.date, present: 0, absent: 0, incomplete: 0, late: 0, notMarked: 0, total: 0,
          },
          nextHoliday: upcoming ? { name: upcoming.name, date: upcoming.date.slice(0, 10) } : null,
        })
      } catch {
        toast("Failed to load overview.", "error")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <main className="p-6 max-w-4xl mx-auto space-y-6 mt-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </main>
    )
  }

  const s = data?.todaySummary

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6 mt-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">HR Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Today — {s?.date}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Present" value={s?.present ?? 0} color="text-green-600" />
        <StatCard label="Not Marked" value={s?.notMarked ?? 0} color="text-slate-500" />
        <StatCard label="Late" value={s?.late ?? 0} color="text-amber-600" />
        <StatCard label="Pending Approvals" value={data?.pendingApprovals ?? 0} color="text-blue-600" href="/dashboard/hr/employees?status=PENDING" />
      </div>

      {/* Secondary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Total Employees" value={s?.total ?? 0} />
            <Row label="Present" value={s?.present ?? 0} />
            <Row label="Absent" value={s?.absent ?? 0} />
            <Row label="Incomplete" value={s?.incomplete ?? 0} />
            <Row label="Not Yet Marked" value={s?.notMarked ?? 0} />
            <div className="pt-2">
              <Link href="/dashboard/hr/attendance" className="text-xs text-blue-600 hover:underline">
                View full attendance →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Next Holiday</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.nextHoliday ? (
              <div>
                <p className="text-lg font-semibold text-slate-900">{data.nextHoliday.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(data.nextHoliday.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric",
                  })}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming holidays.</p>
            )}
            <div className="pt-4">
              <Link href="/dashboard/hr/holidays" className="text-xs text-blue-600 hover:underline">
                Manage holidays →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function StatCard({ label, value, color, href }: { label: string; value: number; color: string; href?: string }) {
  const content = (
    <Card className={href ? "hover:border-slate-300 transition-colors cursor-pointer" : ""}>
      <CardContent className="pt-5 pb-4">
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
