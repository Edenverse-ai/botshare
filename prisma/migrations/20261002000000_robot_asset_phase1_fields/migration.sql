-- Spec HFB-TECH-ID-001 Phase 1 asset fields. Additive and nullable (currency
-- defaults to USD), so existing rows and older application builds are unaffected.
ALTER TABLE "RobotAsset" ADD COLUMN "replacementValue" DECIMAL(12,2);
ALTER TABLE "RobotAsset" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "RobotAsset" ADD COLUMN "operatingHours" DECIMAL(10,1);
ALTER TABLE "RobotAsset" ADD COLUMN "firmwareVersion" TEXT;
ALTER TABLE "RobotAsset" ADD COLUMN "oemDeviceId" TEXT;
