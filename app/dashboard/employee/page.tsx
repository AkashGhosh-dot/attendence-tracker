"use client"

import { useSession } from "next-auth/react"
import { useCallback, useEffect, useState } from "react"
import { AttendanceCard, type AttendanceRecord } from "@/components/attendance/attendance-card"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/lib/use-toast"

type TodayData = {
  record: AttendanceRecord | null
  availableActions: string[]
  isSunday: boolean
  isHoliday: boolean
  holidayName: string | null
  date: string
  timezone: string
}

const ACTION_MESSAGES: Record<string, string> = {
  START_WORK: "Work started. Have a great day! 💪",
  START_BREAK: "Break started. Enjoy your break! ☕",
  END_BREAK: "Break ended. Back to work!",
  END_WORK: "Work completed. Great job today! 🎉",
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export default function EmployeePage() {
  const { data: session } = useSession()
  const [data, setData] = useState<TodayData | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/attendance/today")
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      toast("Failed to load attendance data.", "error")
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  async function handleAction(action: string) {
    setActionLoading(action)
    try {
      const res = await fetch("/api/v1/attendance/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast(json.error ?? "Action failed.", "error")
        return
      }

      if (json.warning) toast(json.warning, "info")
      toast(ACTION_MESSAGES[action] ?? "Done!", "success")
      await fetchToday()
    } catch {
      toast("Something went wrong. Please try again.", "error")
    } finally {
      setActionLoading(null)
    }
  }

  if (pageLoading || !session) {
    return (
      <main className="p-6 max-w-md mx-auto space-y-4 mt-8">
        <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4" />
        <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
        <div className="h-56 bg-slate-100 rounded-xl animate-pulse mt-6" />
      </main>
    )
  }

  const record = data?.record ?? null
  const timezone = data?.timezone ?? "Asia/Kolkata"
  const nowMs = now.getTime()

  const workElapsedMs = record?.startWorkAt
    ? Math.max(
        0,
        (record.currentStep === "ON_BREAK"
          ? new Date(record.startBreakAt!).getTime()
          : nowMs) -
          new Date(record.startWorkAt).getTime() -
          (record.breakDurationMinutes ?? 0) * 60_000
      )
    : 0

  const breakElapsedMs =
    record?.startBreakAt && record.currentStep === "ON_BREAK"
      ? Math.max(0, nowMs - new Date(record.startBreakAt).getTime())
      : 0

  const firstName = session.user.fullName.split(" ")[0]

  return (
    <main className="p-6 max-w-md mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {getGreeting()}, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {now.toLocaleDateString("en-US", {
            timeZone: timezone,
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          {" · "}
          <span className="font-mono">
            {now.toLocaleTimeString("en-US", {
              timeZone: timezone,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            })}
          </span>
        </p>
      </div>

      {/* Non-working day banners */}
      {data?.isSunday && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-3xl mb-3">🌤️</p>
            <p className="font-semibold text-slate-700">It&apos;s Sunday!</p>
            <p className="text-sm text-muted-foreground mt-1">Enjoy your day off.</p>
          </CardContent>
        </Card>
      )}

      {data?.isHoliday && !data.isSunday && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-3xl mb-3">🎉</p>
            <p className="font-semibold text-slate-700">Public Holiday</p>
            <p className="text-sm text-muted-foreground mt-1">{data.holidayName}</p>
          </CardContent>
        </Card>
      )}

      {/* Main attendance card */}
      {!data?.isSunday && !data?.isHoliday && (
        <AttendanceCard
          record={record}
          timezone={timezone}
          workElapsedMs={workElapsedMs}
          breakElapsedMs={breakElapsedMs}
          actionLoading={actionLoading}
          onAction={handleAction}
        />
      )}
    </main>
  )
}
