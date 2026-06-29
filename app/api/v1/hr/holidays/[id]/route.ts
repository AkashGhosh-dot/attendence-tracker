import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error

  const holiday = await prisma.holiday.findUnique({ where: { id: params.id } })
  if (!holiday || holiday.deletedAt !== null) {
    return NextResponse.json({ error: "Holiday not found", code: "NOT_FOUND" }, { status: 404 })
  }

  await prisma.holiday.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), deletedBy: user!.id },
  })

  return new NextResponse(null, { status: 204 })
}
