-- AlterTable
ALTER TABLE `TiktokLiveConfig` DROP COLUMN `autoSend`;

-- AlterTable
ALTER TABLE `TiktokLiveComment` DROP COLUMN `sentToChat`,
    MODIFY `replyStatus` ENUM('NONE', 'GENERATING', 'GENERATED', 'FAILED') NOT NULL DEFAULT 'NONE';
