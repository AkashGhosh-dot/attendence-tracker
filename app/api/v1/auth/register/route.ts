import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    {
      error: "Not Implemented",
      code: "NOT_IMPLEMENTED",
      message: "Employee registration is implemented in Sprint 2.",
    },
    { status: 501 }
  )
}
