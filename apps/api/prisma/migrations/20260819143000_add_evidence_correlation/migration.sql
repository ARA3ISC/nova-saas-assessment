ALTER TABLE "AuditEvidence"
ADD COLUMN "correlationId" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX "AuditEvidence_correlationId_idx"
ON "AuditEvidence"("correlationId");
