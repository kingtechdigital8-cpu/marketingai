-- DropForeignKey
ALTER TABLE `tiktoklivecomment` DROP FOREIGN KEY `TiktokLiveComment_hostVideoGenerationId_fkey`;

-- DropIndex
DROP INDEX `TiktokLiveComment_hostVideoGenerationId_fkey` ON `tiktoklivecomment`;

-- AlterTable
ALTER TABLE `tiktoklivecomment` DROP COLUMN `hostVideoGenerationId`;

-- AlterTable
ALTER TABLE `tiktokliveconfig` DROP COLUMN `virtualHostImageKey`,
    DROP COLUMN `virtualHostMode`,
    DROP COLUMN `virtualHostVoice`;
