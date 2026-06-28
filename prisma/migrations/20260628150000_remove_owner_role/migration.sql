-- Remove OWNER from Role enum
-- PostgreSQL does not support DROP VALUE on enums; we recreate the type.

BEGIN;

-- Convert any OWNER users to HR before dropping the value (safety net for existing data)
UPDATE "users" SET "role" = 'HR' WHERE "role" = 'OWNER';

CREATE TYPE "Role_new" AS ENUM ('EMPLOYEE', 'HR');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role_new"
  USING ("role"::text::"Role_new");

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

COMMIT;
