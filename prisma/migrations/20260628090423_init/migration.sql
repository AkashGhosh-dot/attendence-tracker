-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'HR', 'OWNER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "AttendanceStep" AS ENUM ('WORKING', 'ON_BREAK', 'RESUMED', 'COMPLETED', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" VARCHAR(50),
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "department" VARCHAR(100),
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
    "status_reason" VARCHAR(500),
    "status_changed_by" UUID,
    "status_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_work_at" TIMESTAMP(3),
    "start_break_at" TIMESTAMP(3),
    "end_break_at" TIMESTAMP(3),
    "end_work_at" TIMESTAMP(3),
    "break_duration_minutes" INTEGER,
    "total_work_minutes" INTEGER,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "current_step" "AttendanceStep",
    "break_exceeded" BOOLEAN NOT NULL DEFAULT false,
    "break_not_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" VARCHAR(500),
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "attendance_records_date_user_id_idx" ON "attendance_records"("date", "user_id");

-- CreateIndex
CREATE INDEX "attendance_records_date_status_idx" ON "attendance_records"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_user_id_date_key" ON "attendance_records"("user_id", "date");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "holidays_deleted_at_idx" ON "holidays"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
