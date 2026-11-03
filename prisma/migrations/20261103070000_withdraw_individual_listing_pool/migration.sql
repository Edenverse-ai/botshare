-- Withdraw the individual-owned robot pool.
-- Reverses 20260701163347_add_individual_listing. The pool held zero rows in
-- production when this was written, so no listing data is lost; the columns
-- and the enum go with it.
--
-- APPLY THIS ONLY AFTER THE NEW CODE IS PUBLISHED. The previously published deploy
-- still selects these columns (checkout selected isIndividualOwned/status, getListings
-- joined operator), so dropping them while it serves traffic 500s checkout and the
-- catalog. The new client never references them, so it runs fine against a database
-- that still has them — deploy first, migrate second.

-- DropForeignKey
ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "Listing_operatorId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Listing_operatorId_idx";
DROP INDEX IF EXISTS "Listing_isIndividualOwned_status_idx";

-- AlterTable
ALTER TABLE "Listing"
  DROP COLUMN IF EXISTS "claimedAt",
  DROP COLUMN IF EXISTS "isIndividualOwned",
  DROP COLUMN IF EXISTS "operatorId",
  DROP COLUMN IF EXISTS "status";

-- DropEnum
DROP TYPE IF EXISTS "ListingStatus";
