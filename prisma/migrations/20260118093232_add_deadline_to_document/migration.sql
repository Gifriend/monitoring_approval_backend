/*
  Warnings:

  - You are about to drop the column `deadline` on the `Approval` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Approval_approvedById_deadline_idx";

-- DropIndex
DROP INDEX "Approval_documentId_deadline_idx";

-- DropIndex
DROP INDEX "Approval_status_deadline_idx";

-- AlterTable
ALTER TABLE "Approval" DROP COLUMN "deadline";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deadline" TIMESTAMP(3);
