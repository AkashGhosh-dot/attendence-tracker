import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

const bodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "DEACTIVATED"]),
  reason: z.string().max(500).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 })
  }

  const { status, reason } = parsed.data
  const { id } = params

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target || target.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Employee not found", code: "NOT_FOUND" }, { status: 404 })
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status,
      statusReason: reason ?? null,
      statusChangedBy: user!.id,
      statusChangedAt: new Date(),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
      statusReason: true,
      statusChangedAt: true,
    },
  })

  return NextResponse.json({ employee: updated })
}
