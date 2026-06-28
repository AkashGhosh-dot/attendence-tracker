import { DashboardShell } from "@/components/layout/dashboard-shell"

export default function HRLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardShell role="HR">{children}</DashboardShell>
}
