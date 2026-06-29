import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

const EDITABLE_KEYS = [
  "app_timezone",
  "late_threshold_time",
  "max_break_duration_minutes",
  "nightly_job_time",
] as const

const patchSchema = z.object({
  app_timezone: z.string().min(1).optional(),
  late_threshold_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
    .optional(),
  max_break_duration_minutes: z
    .string()
    .regex(/^\d+$/, "Must be a number")
    .optional(),
  nightly_job_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
    .optional(),
})

export async function GET(_req: NextRequest) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error
  void user

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [...EDITABLE_KEYS] } },
    select: { key: true, value: true, description: true },
    orderBy: { key: "asc" },
  })

  return NextResponse.json({ settings })
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    )
  }

  const updates = Object.entries(parsed.data).filter(([, v]) => v !== undefined) as [string, string][]

  if (updates.length === 0) {
    return NextResponse.json({ error: "No settings provided", code: "BAD_REQUEST" }, { status: 400 })
  }

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.systemSetting.update({
        where: { key },
        data: { value, updatedBy: user!.id },
      })
    )
  )

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [...EDITABLE_KEYS] } },
    select: { key: true, value: true, description: true },
    orderBy: { key: "asc" },
  })

  return NextResponse.json({ settings })
}
