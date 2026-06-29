"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/use-toast"

type Setting = {
  key: string
  value: string
  description: string | null
}

const FIELD_META: Record<string, { label: string; placeholder: string; hint: string }> = {
  app_timezone: {
    label: "App Timezone",
    placeholder: "Asia/Kolkata",
    hint: "IANA timezone string (e.g. Asia/Kolkata, America/New_York)",
  },
  late_threshold_time: {
    label: "Late Threshold",
    placeholder: "09:10",
    hint: "24-hour HH:MM — clock-ins after this time are marked Late",
  },
  max_break_duration_minutes: {
    label: "Max Break Duration (minutes)",
    placeholder: "60",
    hint: "Total break time allowed per day before a warning is shown",
  },
  nightly_job_time: {
    label: "Nightly Job Time",
    placeholder: "23:59",
    hint: "24-hour HH:MM in app timezone when the nightly absent-marking job runs",
  },
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/hr/settings")
        if (!res.ok) throw new Error()
        const json = await res.json()
        setSettings(json.settings)
        const initial: Record<string, string> = {}
        for (const s of json.settings) initial[s.key] = s.value
        setValues(initial)
      } catch {
        toast("Failed to load settings.", "error")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/v1/hr/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) {
        toast(json.error ?? "Failed to save settings.", "error")
        return
      }
      setSettings(json.settings)
      toast("Settings saved.", "success")
    } catch {
      toast("Something went wrong.", "error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="p-6 max-w-xl mx-auto mt-4 space-y-4">
        <div className="h-8 bg-slate-100 rounded animate-pulse w-40" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </main>
    )
  }

  return (
    <main className="p-6 max-w-xl mx-auto space-y-6 mt-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure attendance rules and app behaviour.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Attendance Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            {settings.map(s => {
              const meta = FIELD_META[s.key]
              return (
                <div key={s.key} className="space-y-1.5">
                  <Label htmlFor={s.key} className="text-sm font-medium">
                    {meta?.label ?? s.key}
                  </Label>
                  <Input
                    id={s.key}
                    value={values[s.key] ?? ""}
                    onChange={e => setValues(v => ({ ...v, [s.key]: e.target.value }))}
                    placeholder={meta?.placeholder}
                    className="h-9"
                  />
                  {meta?.hint && (
                    <p className="text-xs text-muted-foreground">{meta.hint}</p>
                  )}
                </div>
              )
            })}

            <Button type="submit" disabled={saving} className="w-full mt-2">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
