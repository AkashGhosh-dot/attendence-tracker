import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"

const patchSchema = z.object({
  action: z.enum(["DEACTIVATE", "REACTIVATE"]),
  reason: z.string().max(500).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await requireRole(["OWNER"])
  if (error) return error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { action, reason } = parsed.data

  const target = await prisma.user.findFirst({
    where: { id: params.id, role: "HR" },
    select: { id: true, status: true, fullName: true },
  })

  if (!target) {
    return NextResponse.json(
      { error: "HR account not found", code: "NOT_FOUND" },
      { status: 404 }
    )
  }

  if (action === "DEACTIVATE") {
    if (target.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Account must be APPROVED to deactivate", code: "INVALID_TRANSITION" },
        { status: 422 }
      )
    }
  } else {
    if (target.status !== "DEACTIVATED") {
      return NextResponse.json(
        { error: "Account must be DEACTIVATED to reactivate", code: "INVALID_TRANSITION" },
        { status: 422 }
      )
    }
  }

  const newStatus = action === "DEACTIVATE" ? "DEACTIVATED" : "APPROVED"

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      status: newStatus,
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

  return NextResponse.json({ account: updated })
}
