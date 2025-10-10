/*
  Warnings:

  - Changed the type of `division` on the `User` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Division" AS ENUM ('Manager', 'Dalkon', 'Engineer', 'Vendor');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "division",
ADD COLUMN     "division" "Division" NOT NULL;

-- DropEnum
DROP TYPE "public"."Role";

-- CreateIndex
CREATE INDEX "User_email_division_idx" ON "User"("email", "division");
