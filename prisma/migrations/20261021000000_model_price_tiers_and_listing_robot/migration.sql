-- Optional tiered rental prices per robot model, and the registered robot a
-- service is built on. Additive: existing services keep robotAssetId NULL.
CREATE TABLE "RobotModelPriceTier" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "maxQty" INTEGER,
    "pricing" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RobotModelPriceTier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RobotModelPriceTier_unit_check" CHECK ("unit" IN ('DAY', 'MONTH')),
    CONSTRAINT "RobotModelPriceTier_pricing_check" CHECK ("pricing" IN ('PER_UNIT', 'TOTAL')),
    CONSTRAINT "RobotModelPriceTier_range_check" CHECK ("minQty" >= 1 AND ("maxQty" IS NULL OR "maxQty" >= "minQty")),
    CONSTRAINT "RobotModelPriceTier_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "RobotModelPriceTier_modelId_unit_minQty_idx" ON "RobotModelPriceTier"("modelId", "unit", "minQty");
ALTER TABLE "RobotModelPriceTier" ADD CONSTRAINT "RobotModelPriceTier_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "RobotModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Served only through the server database connection, like the registry tables.
ALTER TABLE "RobotModelPriceTier" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Listing" ADD COLUMN "robotAssetId" TEXT;
CREATE INDEX "Listing_robotAssetId_idx" ON "Listing"("robotAssetId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_robotAssetId_fkey" FOREIGN KEY ("robotAssetId") REFERENCES "RobotAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
