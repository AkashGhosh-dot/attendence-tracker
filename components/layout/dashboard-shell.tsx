export function DashboardShell({
  children,
  role,
}: {
  children: React.ReactNode
  role?: "EMPLOYEE" | "HR" | "OWNER"
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-8 py-4">
        <p className="text-sm text-muted-foreground">
          {role} dashboard — navigation implemented in Sprint 4–5.
        </p>
      </header>
      {children}
    </div>
  )
}
