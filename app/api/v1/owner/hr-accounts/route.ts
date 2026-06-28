import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"

const HR_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  status: true,
  statusReason: true,
  statusChangedAt: true,
  statusChangedBy: true,
  employeeId: true,
  department: true,
  createdAt: true,
} as const

export async function GET(request: NextRequest) {
  const { user, error } = await requireRole(["OWNER"])
  if (error) return error

  void user

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") as "APPROVED" | "DEACTIVATED" | null
  const search = searchParams.get("search") ?? ""
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")))

  const where = {
    role: "HR" as const,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [accounts, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: HR_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ accounts, total, page, pageSize })
}

const createHrSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  email: z.string().email("Invalid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export async function POST(request: NextRequest) {
  const { user, error } = await requireRole(["OWNER"])
  if (error) return error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = createHrSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { fullName, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return NextResponse.json(
      { error: "Email already registered", code: "EMAIL_CONFLICT" },
      { status: 409 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const account = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      role: "HR",
      status: "APPROVED",
      statusChangedBy: user!.id,
      statusChangedAt: new Date(),
    },
    select: HR_SELECT,
  })

  return NextResponse.json({ account }, { status: 201 })
}
