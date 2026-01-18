/*
  Warnings:

  - You are about to drop the column `deadline` on the `Document` table. All the data in the column will be lost.
  - Added the required column `deadline` to the `Approval` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "deadline" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "deadline";

-- CreateIndex
CREATE INDEX "Approval_documentId_deadline_idx" ON "Approval"("documentId", "deadline");

-- CreateIndex
CREATE INDEX "Approval_approvedById_deadline_idx" ON "Approval"("approvedById", "deadline");

-- CreateIndex
CREATE INDEX "Approval_status_deadline_idx" ON "Approval"("status", "deadline");
