/*
  Warnings:

  - The values [drawing] on the enum `ApprovalType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Consultant] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApprovalType_new" AS ENUM ('protection', 'civil');
ALTER TABLE "Document" ALTER COLUMN "documentType" TYPE "ApprovalType_new" USING ("documentType"::text::"ApprovalType_new");
ALTER TABLE "Approval" ALTER COLUMN "type" TYPE "ApprovalType_new" USING ("type"::text::"ApprovalType_new");
ALTER TYPE "ApprovalType" RENAME TO "ApprovalType_old";
ALTER TYPE "ApprovalType_new" RENAME TO "ApprovalType";
DROP TYPE "public"."ApprovalType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('Manager', 'Dalkon', 'Engineer', 'Vendor');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "contractId" INTEGER;

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "contractDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");

-- CreateIndex
CREATE INDEX "Document_contractId_idx" ON "Document"("contractId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
