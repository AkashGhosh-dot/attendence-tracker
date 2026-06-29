"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

type NavItem = { label: string; href: string }

const NAV: Record<string, NavItem[]> = {
  HR: [
    { label: "Overview", href: "/dashboard/hr" },
    { label: "Employees", href: "/dashboard/hr/employees" },
    { label: "Attendance", href: "/dashboard/hr/attendance" },
    { label: "Holidays", href: "/dashboard/hr/holidays" },
    { label: "Settings", href: "/dashboard/hr/settings" },
  ],
  EMPLOYEE: [
    { label: "Dashboard", href: "/dashboard/employee" },
    { label: "History", href: "/dashboard/employee/history" },
  ],
}

export function DashboardShell({
  children,
  role,
}: {
  children: React.ReactNode
  role?: "EMPLOYEE" | "HR"
}) {
  const pathname = usePathname()
  const navItems = role ? (NAV[role] ?? []) : []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-6">
        <span className="font-semibold text-sm text-slate-700">Attendance</span>
        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                pathname === item.href
                  ? "bg-slate-100 font-medium text-slate-900"
                  : "text-muted-foreground hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-muted-foreground"
        >
          Sign Out
        </Button>
      </header>
      {children}
    </div>
  )
}
