/*
  Warnings:

  - Added the required column `deadline` to the `Approval` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'overdue';

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "deadline" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "overallDeadline" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Approval_documentId_deadline_idx" ON "Approval"("documentId", "deadline");

-- CreateIndex
CREATE INDEX "Approval_approvedById_deadline_idx" ON "Approval"("approvedById", "deadline");

-- CreateIndex
CREATE INDEX "Approval_status_deadline_idx" ON "Approval"("status", "deadline");

-- CreateIndex
CREATE INDEX "Document_status_overallDeadline_idx" ON "Document"("status", "overallDeadline");

-- CreateIndex
CREATE INDEX "Document_submittedById_createdAt_idx" ON "Document"("submittedById", "createdAt");

-- CreateIndex
CREATE INDEX "User_email_role_idx" ON "User"("email", "role");
