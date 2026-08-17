/*
  Warnings:

  - You are about to drop the column `isBorrowed` on the `reservations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "isBorrowed",
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 0;
