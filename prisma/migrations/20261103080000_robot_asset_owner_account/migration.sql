-- Give a registered robot an owner account.
--
-- `ownerName` was free text defaulting to 'Hifivebot' with no relation to a
-- user, so the database could not answer which account owns a machine and no
-- authorisation rule could be written against it. `ownerId` replaces it.
-- Nullable: a draft may exist before its owner is known, but registration
-- refuses to issue a Robot ID without one.
--
-- APPLY THIS ONLY AFTER THE NEW CODE IS PUBLISHED, for the same reason as
-- 20261103070000: the previously published deploy still selects "ownerName".

-- AlterTable
ALTER TABLE "RobotAsset" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RobotAsset_ownerId_idx" ON "RobotAsset"("ownerId");

-- AddForeignKey
ALTER TABLE "RobotAsset" DROP CONSTRAINT IF EXISTS "RobotAsset_ownerId_fkey";
ALTER TABLE "RobotAsset" ADD CONSTRAINT "RobotAsset_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- No backfill: the only existing row is an empty draft with the default
-- 'Hifivebot' string, which names no account. An administrator sets its owner
-- when the draft is completed.
ALTER TABLE "RobotAsset" DROP COLUMN IF EXISTS "ownerName";
