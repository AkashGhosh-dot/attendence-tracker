"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

type NavItem = { label: string; href: string }

const NAV: Record<string, NavItem[]> = {
  OWNER: [
    { label: "Dashboard", href: "/dashboard/owner" },
    { label: "HR Accounts", href: "/dashboard/owner/hr-accounts" },
  ],
  HR: [
    { label: "Dashboard", href: "/dashboard/hr" },
  ],
  EMPLOYEE: [
    { label: "Dashboard", href: "/dashboard/employee" },
  ],
}

export function DashboardShell({
  children,
  role,
}: {
  children: React.ReactNode
  role?: "EMPLOYEE" | "HR" | "OWNER"
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
