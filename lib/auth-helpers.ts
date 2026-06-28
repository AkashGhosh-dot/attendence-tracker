import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

type Role = "EMPLOYEE" | "HR" | "OWNER"

export async function requireRole(allowedRoles: Role[]) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    }
  }

  if (session.user.status !== "APPROVED") {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      ),
    }
  }

  if (!allowedRoles.includes(session.user.role as Role)) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      ),
    }
  }

  return { user: session.user, error: null }
}
