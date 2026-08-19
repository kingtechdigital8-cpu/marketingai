/*
  Warnings:

  - You are about to drop the column `sessionId` on the `tiktokliveconfig` table. All the data in the column will be lost.
  - You are about to drop the column `ttTargetIdc` on the `tiktokliveconfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `tiktokliveconfig` DROP COLUMN `sessionId`,
    DROP COLUMN `ttTargetIdc`;
