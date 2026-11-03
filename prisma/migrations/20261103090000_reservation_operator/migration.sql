-- Record who physically performs a booked service.
--
-- With owning and listing bound into one role, the customer's counterparty is
-- the robot's owner. The party that actually turns up can be someone else, and
-- today that subcontract leaves no trace: the asset ledger is audited but the
-- service delivery is not. Nullable, recorded only — no dispatch, scheduling
-- or notification logic hangs off it.
--
-- APPLY THIS BEFORE PUBLISHING THE NEW CODE. Additive, so the published
-- deploy ignores it, but the new admin orders page includes the operator
-- relation and fails without the column.

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "operatorId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Reservation_operatorId_idx" ON "Reservation"("operatorId");

-- AddForeignKey
ALTER TABLE "Reservation" DROP CONSTRAINT IF EXISTS "Reservation_operatorId_fkey";
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
