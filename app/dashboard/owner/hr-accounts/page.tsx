"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type HrAccount = {
  id: string
  fullName: string
  email: string
  status: "APPROVED" | "DEACTIVATED"
  createdAt: string
}

type CreateForm = {
  fullName: string
  email: string
  password: string
}

export default function HrAccountsPage() {
  const [accounts, setAccounts] = useState<HrAccount[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>({ fullName: "", email: "", password: "" })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function fetchAccounts() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch("/api/v1/owner/hr-accounts")
      if (!res.ok) throw new Error("Failed to load accounts")
      const data = await res.json()
      setAccounts(data.accounts)
      setTotal(data.total)
    } catch {
      setFetchError("Could not load HR accounts. Please refresh.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateLoading(true)

    try {
      const res = await fetch("/api/v1/owner/hr-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      })

      const data = await res.json()

      if (!res.ok) {
        setCreateError(
          data.code === "EMAIL_CONFLICT"
            ? "This email is already registered."
            : data.error ?? "Failed to create account."
        )
        return
      }

      setCreateForm({ fullName: "", email: "", password: "" })
      setShowCreate(false)
      fetchAccounts()
    } catch {
      setCreateError("Something went wrong. Please try again.")
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleStatusChange(id: string, action: "DEACTIVATE" | "REACTIVATE") {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/v1/owner/hr-accounts/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Action failed.")
        return
      }
      fetchAccounts()
    } catch {
      alert("Something went wrong.")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HR Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} account{total !== 1 ? "s" : ""} total</p>
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setCreateError(null) }}>
          {showCreate ? "Cancel" : "Create HR Account"}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New HR Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4 max-w-sm">
              <div className="space-y-2">
                <Label htmlFor="c-fullName">Full Name</Label>
                <Input
                  id="c-fullName"
                  value={createForm.fullName}
                  onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))}
                  required
                  disabled={createLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  required
                  disabled={createLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-password">Password</Label>
                <Input
                  id="c-password"
                  type="password"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                  disabled={createLoading}
                />
                <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
              </div>
              {createError && (
                <p className="text-sm text-destructive" role="alert">{createError}</p>
              )}
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creating…" : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {fetchError && (
        <p className="text-sm text-destructive" role="alert">{fetchError}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No HR accounts yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {accounts.map(account => (
                <tr key={account.id}>
                  <td className="px-4 py-3 font-medium">{account.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{account.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={account.status === "APPROVED" ? "default" : "destructive"}>
                      {account.status === "APPROVED" ? "Active" : "Deactivated"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {account.status === "APPROVED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading === account.id}
                        onClick={() => handleStatusChange(account.id, "DEACTIVATE")}
                      >
                        {actionLoading === account.id ? "…" : "Deactivate"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading === account.id}
                        onClick={() => handleStatusChange(account.id, "REACTIVATE")}
                      >
                        {actionLoading === account.id ? "…" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
