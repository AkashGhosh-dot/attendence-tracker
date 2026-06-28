import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_OWNER_EMAIL
  const password = process.env.SEED_OWNER_PASSWORD
  const fullName = process.env.SEED_OWNER_FULL_NAME

  if (!email || !password || !fullName) {
    throw new Error(
      "Missing required environment variables: SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_FULL_NAME"
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const owner = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      fullName,
      role: "OWNER",
      status: "APPROVED",
    },
  })

  console.log(`✅ Owner: ${owner.email} (id: ${owner.id})`)
  console.log(`   password_hash starts with: ${owner.passwordHash.substring(0, 7)}`)

  const settings = [
    {
      key: "app_timezone",
      value: "Asia/Kolkata",
      description: "IANA timezone string used for all date/time calculations",
    },
    {
      key: "late_threshold_time",
      value: "09:10",
      description: "24-hour HH:MM; START_WORK after this time is marked Late",
    },
    {
      key: "max_break_duration_minutes",
      value: "60",
      description: "Maximum allowed break duration in minutes",
    },
    {
      key: "nightly_job_time",
      value: "23:59",
      description: "24-hour HH:MM in app_timezone when the nightly job runs",
    },
  ]

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
    console.log(`✅ Setting: ${setting.key} = ${setting.value}`)
  }

  console.log("\n✅ Seed completed successfully.")
  console.log(`   users: 1 row (Owner)`)
  console.log(`   system_settings: ${settings.length} rows`)
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
