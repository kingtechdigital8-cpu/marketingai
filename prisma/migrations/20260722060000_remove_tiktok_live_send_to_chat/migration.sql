-- AlterTable
ALTER TABLE `tiktokliveconfig` DROP COLUMN `autoSend`;

-- AlterTable
ALTER TABLE `tiktoklivecomment` DROP COLUMN `sentToChat`,
    MODIFY `replyStatus` ENUM('NONE', 'GENERATING', 'GENERATED', 'FAILED') NOT NULL DEFAULT 'NONE';
