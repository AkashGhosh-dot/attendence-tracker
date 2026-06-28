import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type AttendanceRecord = {
  id: string
  currentStep: "WORKING" | "ON_BREAK" | "RESUMED" | "COMPLETED" | "INCOMPLETE" | null
  startWorkAt: string | null
  startBreakAt: string | null
  endBreakAt: string | null
  endWorkAt: string | null
  breakDurationMinutes: number | null
  totalWorkMinutes: number | null
  isLate: boolean
  breakExceeded: boolean
}

type Props = {
  record: AttendanceRecord | null
  timezone: string
  workElapsedMs: number
  breakElapsedMs: number
  actionLoading: string | null
  onAction: (action: string) => void
}

export function AttendanceCard({
  record,
  timezone,
  workElapsedMs,
  breakElapsedMs,
  actionLoading,
  onAction,
}: Props) {
  const step = record?.currentStep ?? null
  const busy = actionLoading !== null

  if (!record || step === null) {
    return (
      <Card>
        <CardContent className="pt-10 pb-10 flex flex-col items-center gap-6 text-center">
          <div>
            <p className="text-base font-semibold text-slate-700">Not Started</p>
            <p className="text-sm text-muted-foreground mt-1">Ready to start your workday?</p>
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => onAction("START_WORK")}
          >
            {actionLoading === "START_WORK" ? "Starting…" : "Start Work"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === "WORKING" || step === "RESUMED") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Working
            </CardTitle>
            <div className="flex gap-2">
              {record.isLate && (
                <Badge variant="destructive" className="text-xs">Late</Badge>
              )}
              {record.breakExceeded && (
                <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                  Break Exceeded
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Clocked in" value={formatTime(record.startWorkAt, timezone)} />

          <div className="rounded-lg border bg-slate-50 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Working for</p>
            <p className="text-4xl font-mono font-semibold tracking-tight text-slate-800">
              {formatElapsed(workElapsedMs)}
            </p>
          </div>

          {(record.breakDurationMinutes ?? 0) > 0 && (
            <Row
              label="Break taken"
              value={formatMinutes(record.breakDurationMinutes ?? 0)}
            />
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onAction("START_BREAK")}
            >
              {actionLoading === "START_BREAK" ? "…" : "Take Break"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => onAction("END_WORK")}
            >
              {actionLoading === "END_WORK" ? "…" : "End Work"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === "ON_BREAK") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            On Break
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Break started" value={formatTime(record.startBreakAt, timezone)} />

          <div className="rounded-lg border bg-amber-50 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">On break for</p>
            <p className="text-4xl font-mono font-semibold tracking-tight text-amber-700">
              {formatElapsed(breakElapsedMs)}
            </p>
          </div>

          {(record.breakDurationMinutes ?? 0) > 0 && (
            <Row
              label="Previous breaks"
              value={formatMinutes(record.breakDurationMinutes ?? 0)}
            />
          )}

          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => onAction("END_BREAK")}
          >
            {actionLoading === "END_BREAK" ? "…" : "End Break"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === "COMPLETED") {
    const grossMs =
      record.startWorkAt && record.endWorkAt
        ? new Date(record.endWorkAt).getTime() - new Date(record.startWorkAt).getTime()
        : 0
    const grossMinutes = Math.floor(grossMs / 60_000)
    const breakMins = record.breakDurationMinutes ?? 0
    const netMins = record.totalWorkMinutes ?? Math.max(0, grossMinutes - breakMins)

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-green-600 text-lg">✓</span>
              Work Completed
            </CardTitle>
            {record.isLate && (
              <Badge variant="destructive" className="text-xs">Late</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Clock In" value={formatTime(record.startWorkAt, timezone)} />
          <Row label="Clock Out" value={formatTime(record.endWorkAt, timezone)} />
          <div className="border-t pt-3 space-y-3">
            <Row label="Total Time" value={formatMinutes(grossMinutes)} />
            <Row label="Break Time" value={formatMinutes(breakMins)} />
            <Row label="Net Working Hours" value={formatMinutes(netMins)} highlight />
          </div>
          {record.breakExceeded && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Break limit was exceeded today.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // INCOMPLETE or unknown
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="font-medium text-slate-700">Incomplete</p>
        <p className="text-sm text-muted-foreground mt-1">
          Your attendance was not fully recorded today.
        </p>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-bold text-slate-900" : "font-medium text-slate-700"}>
        {value}
      </span>
    </div>
  )
}

function formatTime(iso: string | null, timezone: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return "0:00"
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }
  return `${m}:${String(sec).padStart(2, "0")}`
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}
