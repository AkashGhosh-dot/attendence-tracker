import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Toaster } from "@/components/ui/toaster"

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <DashboardShell role="EMPLOYEE">{children}</DashboardShell>
      <Toaster />
    </>
  )
}
