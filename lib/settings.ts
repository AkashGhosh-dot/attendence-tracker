import { prisma } from "@/lib/prisma"

export async function getSystemSetting(key: string): Promise<string> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  })

  if (!setting) {
    throw new Error(`System setting "${key}" not found. Run db:seed to initialize settings.`)
  }

  return setting.value
}
