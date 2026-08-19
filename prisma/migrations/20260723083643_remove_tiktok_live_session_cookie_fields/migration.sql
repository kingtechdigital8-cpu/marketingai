/*
  Warnings:

  - You are about to drop the column `sessionId` on the `TiktokLiveConfig` table. All the data in the column will be lost.
  - You are about to drop the column `ttTargetIdc` on the `TiktokLiveConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `TiktokLiveConfig` DROP COLUMN `sessionId`,
    DROP COLUMN `ttTargetIdc`;
