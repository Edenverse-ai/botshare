-- CreateTable
CREATE TABLE "RobotAsset" (
    "id" TEXT NOT NULL,
    "modelId" TEXT,
    "serialNumber" TEXT,
    "serialKey" TEXT,
    "ownerName" TEXT NOT NULL DEFAULT 'Hifivebot',
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "publicId" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
    "condition" TEXT NOT NULL DEFAULT 'AWAITING_INSPECTION',
    "conditionEventAt" TIMESTAMP(3),
    "nameplateId" TEXT,
    "presentationId" TEXT,
    "registeredBrand" TEXT,
    "registeredModel" TEXT,
    "ownerConfirmedBy" TEXT,
    "ownerConfirmedAt" TIMESTAMP(3),
    "insurance" TEXT NOT NULL DEFAULT '',
    "tracker" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotRecord" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "correctionReason" TEXT,

    CONSTRAINT "RobotRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotFile" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RobotFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotAudit" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RobotAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotRequest" (
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,

    CONSTRAINT "RobotRequest_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "RobotAsset_serialKey_key" ON "RobotAsset"("serialKey");

-- CreateIndex
CREATE UNIQUE INDEX "RobotAsset_publicId_key" ON "RobotAsset"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "RobotRecord_supersedesId_key" ON "RobotRecord"("supersedesId");

-- CreateIndex
CREATE INDEX "RobotRecord_robotId_createdAt_idx" ON "RobotRecord"("robotId", "createdAt");

-- CreateIndex
CREATE INDEX "RobotFile_robotId_idx" ON "RobotFile"("robotId");

-- CreateIndex
CREATE INDEX "RobotAudit_robotId_createdAt_idx" ON "RobotAudit"("robotId", "createdAt");

-- AddForeignKey
ALTER TABLE "RobotAsset" ADD CONSTRAINT "RobotAsset_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "RobotModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRecord" ADD CONSTRAINT "RobotRecord_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "RobotAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRecord" ADD CONSTRAINT "RobotRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RobotRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotFile" ADD CONSTRAINT "RobotFile_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "RobotAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotAudit" ADD CONSTRAINT "RobotAudit_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "RobotAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Apply after the additive registry schema. These invariants also protect
-- identities and history from accidental direct ORM updates or cleanup.
CREATE SEQUENCE IF NOT EXISTS robot_public_number MINVALUE 1 MAXVALUE 999999 NO CYCLE;

CREATE OR REPLACE FUNCTION robot_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Robot identities cannot be deleted';
  END IF;
  IF OLD."publicId" IS NOT NULL AND NEW."publicId" IS DISTINCT FROM OLD."publicId" THEN
    RAISE EXCEPTION 'Robot IDs are permanent';
  END IF;
  IF OLD.lifecycle = 'RETIRED' AND (NEW.lifecycle <> 'RETIRED' OR NEW.condition <> OLD.condition) THEN
    RAISE EXCEPTION 'Retired robots cannot be reactivated';
  END IF;
  IF OLD.lifecycle <> 'DRAFT' AND NEW.lifecycle = 'DRAFT' THEN
    RAISE EXCEPTION 'Registration cannot be reversed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS robot_identity_guard ON "RobotAsset";
CREATE TRIGGER robot_identity_guard BEFORE UPDATE OR DELETE ON "RobotAsset"
FOR EACH ROW EXECUTE FUNCTION robot_identity_guard();

CREATE OR REPLACE FUNCTION robot_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Robot evidence and history are append-only';
END $$;
DROP TRIGGER IF EXISTS robot_audit_guard ON "RobotAudit";
CREATE TRIGGER robot_audit_guard BEFORE UPDATE OR DELETE ON "RobotAudit"
FOR EACH ROW EXECUTE FUNCTION robot_history_guard();
DROP TRIGGER IF EXISTS robot_file_guard ON "RobotFile";
CREATE TRIGGER robot_file_guard BEFORE UPDATE OR DELETE ON "RobotFile"
FOR EACH ROW EXECUTE FUNCTION robot_history_guard();

-- Defense in depth if deployed alongside Supabase's public schema: registry
-- data is accessed only by the server database connection, never PostgREST.
ALTER TABLE "RobotAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RobotAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RobotFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RobotRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RobotRecord" ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS robot_record_guard ON "RobotRecord";
CREATE TRIGGER robot_record_guard BEFORE UPDATE OR DELETE ON "RobotRecord"
FOR EACH ROW EXECUTE FUNCTION robot_history_guard();
