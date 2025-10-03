/*
  Warnings:

  - Added the required column `type` to the `Approval` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('drawing', 'civil');

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "type" "ApprovalType" NOT NULL;
