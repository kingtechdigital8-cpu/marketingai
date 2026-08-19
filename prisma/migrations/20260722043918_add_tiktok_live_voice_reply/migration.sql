-- AlterTable
ALTER TABLE `tiktoklivecomment` ADD COLUMN `replyAudioUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `tiktokliveconfig` ADD COLUMN `voice` VARCHAR(191) NOT NULL DEFAULT 'alloy';
