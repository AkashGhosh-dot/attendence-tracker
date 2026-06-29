"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/use-toast"

type Holiday = {
  id: string
  date: string
  name: string
  createdAt: string
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ date: "", name: "" })
  const [submitting, setSubmitting] = useState(false)

  const currentYear = new Date().getFullYear().toString()

  const fetchHolidays = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/hr/holidays?year=${currentYear}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setHolidays(json.holidays)
    } catch {
      toast("Failed to load holidays.", "error")
    } finally {
      setLoading(false)
    }
  }, [currentYear])

  useEffect(() => { fetchHolidays() }, [fetchHolidays])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/v1/hr/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, name: form.name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast(json.error ?? "Failed to add holiday.", "error")
        return
      }
      toast("Holiday added.", "success")
      setForm({ date: "", name: "" })
      await fetchHolidays()
    } catch {
      toast("Something went wrong.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/v1/hr/holidays/${id}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        toast("Failed to delete holiday.", "error")
        return
      }
      toast("Holiday removed.", "success")
      setHolidays(prev => prev.filter(h => h.id !== id))
    } catch {
      toast("Something went wrong.", "error")
    } finally {
      setDeleting(null)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6 mt-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Holiday Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage public holidays for {currentYear}.</p>
      </div>

      {/* Add form */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleAdd} className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label htmlFor="hdate" className="text-xs">Date</Label>
              <Input
                id="hdate"
                type="date"
                value={form.date}
                min={`${currentYear}-01-01`}
                max={`${currentYear}-12-31`}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-44 h-8 text-sm"
                required
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-48">
              <Label htmlFor="hname" className="text-xs">Holiday Name</Label>
              <Input
                id="hname"
                type="text"
                placeholder="e.g. Independence Day"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm"
                maxLength={255}
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={submitting} className="h-8">
              {submitting ? "Adding..." : "Add Holiday"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Holiday list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : holidays.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No holidays added for {currentYear}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {holidays.map(h => {
            const isPast = h.date.slice(0, 10) < today
            return (
              <Card key={h.id} className={isPast ? "opacity-60" : ""}>
                <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-slate-900 text-sm">{h.name}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {new Date(h.date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}
                    </span>
                    {isPast && <span className="ml-2 text-xs text-slate-400">(past)</span>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleting === h.id}
                    onClick={() => handleDelete(h.id)}
                    className="h-7 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    {deleting === h.id ? "..." : "Remove"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
