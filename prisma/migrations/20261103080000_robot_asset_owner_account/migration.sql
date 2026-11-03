-- EXPAND: give RobotAsset an owner account.
--
-- `ownerName` was free text with no relation to a user, so the database could
-- not answer which account owns a machine and nothing could be authorised
-- against it. `ownerId` replaces it. Nullable: a draft may precede knowing its
-- owner, but registration refuses to issue a Robot ID without one.
--
-- APPLY THIS BEFORE PUBLISHING THE NEW CODE. It is purely additive, so the
-- currently published deploy ignores the new column, while the new code needs
-- it the moment it serves a registry request. The matching DROP of
-- "ownerName" is a separate migration precisely because it has the opposite
-- ordering requirement.

-- AlterTable
ALTER TABLE "RobotAsset" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RobotAsset_ownerId_idx" ON "RobotAsset"("ownerId");

-- AddForeignKey
ALTER TABLE "RobotAsset" DROP CONSTRAINT IF EXISTS "RobotAsset_ownerId_fkey";
ALTER TABLE "RobotAsset" ADD CONSTRAINT "RobotAsset_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
