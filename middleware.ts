import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"

const ROLE_DASHBOARDS = {
  EMPLOYEE: "/dashboard/employee",
  HR: "/dashboard/hr",
} as const

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const { pathname } = req.nextUrl

  // No session — reject API calls, redirect pages to login
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }
    if (pathname === "/login" || pathname === "/register") {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Session exists but account not approved — redirect to /pending
  if (token.status !== "APPROVED") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      )
    }
    if (pathname === "/pending") return NextResponse.next()
    return NextResponse.redirect(new URL("/pending", req.url))
  }

  // Approved user — enforce role-based routing
  const role = token.role as "EMPLOYEE" | "HR"
  const dashboard = ROLE_DASHBOARDS[role]

  // Unknown role (e.g. stale JWT from a removed role) — clear session and force re-login
  if (!dashboard) {
    const res = NextResponse.redirect(new URL("/login", req.url))
    res.cookies.delete("next-auth.session-token")
    res.cookies.delete("__Secure-next-auth.session-token")
    return res
  }

  // Redirect away from auth/root pages when already logged in
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/pending"
  ) {
    return NextResponse.redirect(new URL(dashboard, req.url))
  }

  // Prevent cross-role dashboard access
  if (pathname.startsWith("/dashboard/employee") && role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL(dashboard, req.url))
  }
  if (pathname.startsWith("/dashboard/hr") && role !== "HR") {
    return NextResponse.redirect(new URL(dashboard, req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api/v1/auth|_next/static|_next/image|favicon\\.ico).*)"],
}
