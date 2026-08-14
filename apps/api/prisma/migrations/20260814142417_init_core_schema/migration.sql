-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrganizationAccessStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CommercialStatus" AS ENUM ('DEMO', 'PILOT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BusinessScopeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BusinessScopeType" AS ENUM ('RESTAURANT', 'PROPERTY_DEVELOPMENT', 'CONSTRUCTION', 'EVENT');

-- CreateEnum
CREATE TYPE "OrganizationProfile" AS ENUM ('Administrator', 'User');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateTable
CREATE TABLE "Identity" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordCredential" (
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "recentAuthenticatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticationThrottle" (
    "id" UUID NOT NULL,
    "normalizedAccount" TEXT NOT NULL,
    "sourceBucket" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "firstFailedAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticationThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPrincipal" (
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "accessStatus" "OrganizationAccessStatus" NOT NULL DEFAULT 'PROVISIONING',
    "commercialStatus" "CommercialStatus" NOT NULL DEFAULT 'DEMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "profile" "OrganizationProfile" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessEpoch" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationOwnership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessScope" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "type" "BusinessScopeType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "externalIdentifier" TEXT,
    "location" TEXT,
    "responsiblePerson" TEXT,
    "status" "BusinessScopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_normalizedEmail_key" ON "Identity"("normalizedEmail");

-- CreateIndex
CREATE INDEX "Identity_email_idx" ON "Identity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordCredential_identityId_key" ON "PasswordCredential"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_identityId_revokedAt_idx" ON "AuthSession"("identityId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_identityId_idx" ON "PasswordResetToken"("identityId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthenticationThrottle_lockedUntil_idx" ON "AuthenticationThrottle"("lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationThrottle_normalizedAccount_sourceBucket_key" ON "AuthenticationThrottle"("normalizedAccount", "sourceBucket");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPrincipal_identityId_key" ON "PlatformPrincipal"("identityId");

-- CreateIndex
CREATE INDEX "Organization_accessStatus_idx" ON "Organization"("accessStatus");

-- CreateIndex
CREATE INDEX "Organization_commercialStatus_idx" ON "Organization"("commercialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_identityId_key" ON "Membership"("identityId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Membership_organizationId_profile_idx" ON "Membership"("organizationId", "profile");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_id_key" ON "Membership"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_identityId_key" ON "Membership"("organizationId", "identityId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationOwnership_organizationId_key" ON "OrganizationOwnership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationOwnership_membershipId_key" ON "OrganizationOwnership"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationOwnership_organizationId_membershipId_key" ON "OrganizationOwnership"("organizationId", "membershipId");

-- CreateIndex
CREATE INDEX "Company_organizationId_status_idx" ON "Company"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Company_organizationId_id_key" ON "Company"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Company_organizationId_name_key" ON "Company"("organizationId", "name");

-- CreateIndex
CREATE INDEX "BusinessScope_organizationId_companyId_status_idx" ON "BusinessScope"("organizationId", "companyId", "status");

-- CreateIndex
CREATE INDEX "BusinessScope_organizationId_normalizedName_idx" ON "BusinessScope"("organizationId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessScope_organizationId_id_key" ON "BusinessScope"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessScope_organizationId_companyId_type_normalizedName__key" ON "BusinessScope"("organizationId", "companyId", "type", "normalizedName", "externalIdentifier");

-- AddForeignKey
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPrincipal" ADD CONSTRAINT "PlatformPrincipal_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOwnership" ADD CONSTRAINT "OrganizationOwnership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOwnership" ADD CONSTRAINT "OrganizationOwnership_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessScope" ADD CONSTRAINT "BusinessScope_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessScope" ADD CONSTRAINT "BusinessScope_organizationId_companyId_fkey" FOREIGN KEY ("organizationId", "companyId") REFERENCES "Company"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
