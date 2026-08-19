-- CreateEnum
CREATE TYPE "TransactionalEmailTemplate" AS ENUM ('INITIAL_OWNER_INVITATION_V1', 'COLLABORATOR_INVITATION_V1', 'PASSWORD_RESET_V1');

-- CreateEnum
CREATE TYPE "OutboxMessageStatus" AS ENUM ('PENDING', 'DELIVERED');

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "template" "TransactionalEmailTemplate" NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "encryptedEnvelope" TEXT NOT NULL,
    "status" "OutboxMessageStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastFailureCode" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_deliveryKey_key" ON "OutboxMessage"("deliveryKey");
CREATE INDEX "OutboxMessage_organizationId_status_idx" ON "OutboxMessage"("organizationId", "status");
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_message_tenant_isolation
ON "OutboxMessage"
AS PERMISSIVE
FOR ALL
TO nova_app
USING (
  "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON "OutboxMessage" TO nova_app;
