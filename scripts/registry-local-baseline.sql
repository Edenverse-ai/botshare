-- Local-only compatibility for two pre-existing User fields which are present
-- in the checked-in Prisma schema but missing from its historical migrations.
-- This is NOT a production migration or part of the Robot Registry schema.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedVersion" TEXT;
