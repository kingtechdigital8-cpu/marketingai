-- AlterTable
ALTER TABLE `TiktokLiveComment` ADD COLUMN `replyAudioUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `TiktokLiveConfig` ADD COLUMN `voice` VARCHAR(191) NOT NULL DEFAULT 'alloy';
