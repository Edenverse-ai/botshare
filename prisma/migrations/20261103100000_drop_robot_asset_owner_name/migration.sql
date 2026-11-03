-- CONTRACT: remove RobotAsset."ownerName", replaced by "ownerId".
--
-- APPLY THIS ONLY AFTER THE NEW CODE IS PUBLISHED. Until then the published
-- deploy still selects "ownerName", and dropping it breaks every registry
-- read. Pair of 20261103080000, which adds "ownerId" and must go first.
--
-- No backfill: the only existing row is an empty draft carrying the default
-- 'Hifivebot' string, which names no account. An administrator sets its owner
-- when the draft is completed.

-- AlterTable
ALTER TABLE "RobotAsset" DROP COLUMN IF EXISTS "ownerName";
