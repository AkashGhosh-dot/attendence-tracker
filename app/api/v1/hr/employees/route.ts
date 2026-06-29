import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error
  void user

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status") ?? undefined
  const department = searchParams.get("department") ?? undefined

  const employees = await prisma.user.findMany({
    where: {
      role: "EMPLOYEE",
      ...(status ? { status: status as never } : {}),
      ...(department ? { department } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      fullName: true,
      email: true,
      department: true,
      status: true,
      statusReason: true,
      statusChangedAt: true,
      createdAt: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({ employees })
}
