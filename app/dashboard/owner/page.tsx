import Link from "next/link"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function OwnerDashboard() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Owner Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage HR accounts and system settings.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/owner/hr-accounts">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="text-base">HR Accounts</CardTitle>
              <CardDescription>Create, view, and manage HR user accounts.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="text-base">System Settings</CardTitle>
            <CardDescription>Timezone, late threshold, break limits — available in Sprint 7.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  )
}
