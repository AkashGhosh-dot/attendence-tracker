"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type StatusInfo = {
  title: string
  description: string
  badge: string
  variant: "secondary" | "destructive" | "default" | "outline"
}

function getStatusInfo(status: string, reason: string | null | undefined): StatusInfo {
  switch (status) {
    case "PENDING":
      return {
        title: "Account Pending Approval",
        description: "Your registration is under review by HR. You will be able to log in once your account is approved.",
        badge: "Pending",
        variant: "secondary",
      }
    case "REJECTED":
      return {
        title: "Account Registration Rejected",
        description: reason
          ? `Your account registration was rejected. Reason: ${reason}`
          : "Your account registration was rejected. Please contact HR for more information or register with a different email address.",
        badge: "Rejected",
        variant: "destructive",
      }
    case "DEACTIVATED":
      return {
        title: "Account Deactivated",
        description: reason
          ? `Your account has been deactivated. Reason: ${reason}`
          : "Your account has been deactivated. Please contact HR or the system administrator.",
        badge: "Deactivated",
        variant: "destructive",
      }
    default:
      return {
        title: "Access Restricted",
        description: "Your account does not currently have access to this system.",
        badge: status,
        variant: "secondary",
      }
  }
}

export default function PendingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
    if (status === "authenticated" && session?.user.status === "APPROVED") {
      const dashMap: Record<string, string> = {
        EMPLOYEE: "/dashboard/employee",
        HR: "/dashboard/hr",
      }
      router.push(dashMap[session.user.role] ?? "/login")
    }
  }, [status, session, router])

  if (status === "loading" || !session) {
    return null
  }

  const info = getStatusInfo(session.user.status, session.user.statusReason)

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>{info.title}</CardTitle>
          <Badge variant={info.variant}>{info.badge}</Badge>
        </div>
        <CardDescription className="text-sm leading-relaxed">
          {info.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Welcome, <span className="font-medium">{session.user.fullName}</span>.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign Out
        </Button>
      </CardContent>
    </Card>
  )
}
