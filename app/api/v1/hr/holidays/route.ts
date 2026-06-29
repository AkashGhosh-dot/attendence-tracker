import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  name: z.string().min(1).max(255),
})

export async function GET(req: NextRequest) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error
  void user

  const { searchParams } = req.nextUrl
  const year = searchParams.get("year")

  const holidays = await prisma.holiday.findMany({
    where: {
      deletedAt: null,
      ...(year
        ? {
            date: {
              gte: new Date(`${year}-01-01T00:00:00.000Z`),
              lt: new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`),
            },
          }
        : {}),
    },
    select: { id: true, date: true, name: true, createdAt: true },
    orderBy: { date: "asc" },
  })

  return NextResponse.json({ holidays })
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireRole(["HR"])
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    )
  }

  const { date, name } = parsed.data
  const dateUtc = new Date(date + "T00:00:00.000Z")

  const existing = await prisma.holiday.findFirst({
    where: { date: dateUtc, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json(
      { error: "A holiday already exists on this date.", code: "CONFLICT" },
      { status: 409 }
    )
  }

  const holiday = await prisma.holiday.create({
    data: { date: dateUtc, name, createdBy: user!.id },
    select: { id: true, date: true, name: true, createdAt: true },
  })

  return NextResponse.json({ holiday }, { status: 201 })
}
