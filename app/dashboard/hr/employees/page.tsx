"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/use-toast"
import type { AccountStatus } from "@/types"

type Employee = {
  id: string
  employeeId: string | null
  fullName: string
  email: string
  department: string | null
  status: AccountStatus
  statusReason: string | null
  statusChangedAt: string | null
  createdAt: string
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Deactivated", value: "DEACTIVATED" },
]

const STATUS_BADGE: Record<AccountStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  DEACTIVATED: "bg-slate-100 text-slate-600",
}

export default function EmployeesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get("status") ?? ""

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/v1/hr/employees${statusFilter ? `?status=${statusFilter}` : ""}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setEmployees(json.employees)
    } catch {
      toast("Failed to load employees.", "error")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  async function changeStatus(id: string, status: AccountStatus, reason?: string) {
    setActing(id + status)
    try {
      const res = await fetch(`/api/v1/hr/employees/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast(json.error ?? "Action failed.", "error")
        return
      }
      toast(`Employee ${status.toLowerCase()}.`, "success")
      await fetchEmployees()
    } catch {
      toast("Something went wrong.", "error")
    } finally {
      setActing(null)
    }
  }

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set("status", value)
    else params.delete("status")
    router.push(`/dashboard/hr/employees?${params.toString()}`)
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-5 mt-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage employee accounts and approvals.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              statusFilter === f.value
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No employees found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {employees.map(emp => (
            <Card key={emp.id}>
              <CardContent className="py-3 px-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 text-sm">{emp.fullName}</span>
                    {emp.employeeId && (
                      <span className="text-xs text-muted-foreground font-mono">{emp.employeeId}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[emp.status]}`}>
                      {emp.status}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{emp.email}</span>
                    {emp.department && (
                      <span className="text-xs text-muted-foreground">{emp.department}</span>
                    )}
                    {emp.statusReason && (
                      <span className="text-xs text-slate-500 italic">Reason: {emp.statusReason}</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  {emp.status === "PENDING" && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!!acting}
                        onClick={() => changeStatus(emp.id, "APPROVED")}
                        className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      >
                        {acting === emp.id + "APPROVED" ? "..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!acting}
                        onClick={() => {
                          const reason = prompt("Rejection reason (optional):")
                          changeStatus(emp.id, "REJECTED", reason ?? undefined)
                        }}
                        className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      >
                        {acting === emp.id + "REJECTED" ? "..." : "Reject"}
                      </Button>
                    </>
                  )}
                  {emp.status === "APPROVED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!acting}
                      onClick={() => {
                        const reason = prompt("Deactivation reason (optional):")
                        changeStatus(emp.id, "DEACTIVATED", reason ?? undefined)
                      }}
                      className="h-7 text-xs text-slate-600"
                    >
                      {acting === emp.id + "DEACTIVATED" ? "..." : "Deactivate"}
                    </Button>
                  )}
                  {(emp.status === "REJECTED" || emp.status === "DEACTIVATED") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!acting}
                      onClick={() => changeStatus(emp.id, "APPROVED")}
                      className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                    >
                      {acting === emp.id + "APPROVED" ? "..." : "Re-approve"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
