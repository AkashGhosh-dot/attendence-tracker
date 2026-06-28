import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const registerSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  email: z.string().email("Invalid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters"),
  employeeId: z.string().min(1, "Employee ID is required").max(50),
  department: z.string().min(1, "Department is required").max(100),
})

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { fullName, email, password, employeeId, department } = parsed.data

  const [existingEmail, existingEmployeeId] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { employeeId }, select: { id: true } }),
  ])

  if (existingEmail) {
    return NextResponse.json(
      { error: "Email already registered", code: "EMAIL_CONFLICT" },
      { status: 409 }
    )
  }
  if (existingEmployeeId) {
    return NextResponse.json(
      { error: "Employee ID already in use", code: "EMPLOYEE_ID_CONFLICT" },
      { status: 409 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      employeeId,
      department,
      role: "EMPLOYEE",
      status: "PENDING",
    },
  })

  return NextResponse.json(
    { message: "Registration successful. Your account is pending HR approval." },
    { status: 201 }
  )
}
