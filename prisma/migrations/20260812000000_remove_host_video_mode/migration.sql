-- DropForeignKey
ALTER TABLE `TiktokLiveComment` DROP FOREIGN KEY `TiktokLiveComment_hostVideoGenerationId_fkey`;

-- DropIndex
DROP INDEX `TiktokLiveComment_hostVideoGenerationId_fkey` ON `TiktokLiveComment`;

-- AlterTable
ALTER TABLE `TiktokLiveComment` DROP COLUMN `hostVideoGenerationId`;

-- AlterTable
ALTER TABLE `TiktokLiveConfig` DROP COLUMN `virtualHostImageKey`,
    DROP COLUMN `virtualHostMode`,
    DROP COLUMN `virtualHostVoice`;
