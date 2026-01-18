/*
  Warnings:

  - The `status` column on the `Document` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `documentType` column on the `Document` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `type` on the `Approval` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `Approval` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Approval" DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'submitted',
DROP COLUMN "documentType",
ADD COLUMN     "documentType" TEXT;

-- CreateIndex
CREATE INDEX "Approval_status_deadline_idx" ON "Approval"("status", "deadline");

-- CreateIndex
CREATE INDEX "Document_status_contractDate_idx" ON "Document"("status", "contractDate");
