CREATE UNIQUE INDEX "OwnershipTransferProposal_one_pending_per_organization"
ON "OwnershipTransferProposal" ("organizationId")
WHERE "status" = 'PENDING';
