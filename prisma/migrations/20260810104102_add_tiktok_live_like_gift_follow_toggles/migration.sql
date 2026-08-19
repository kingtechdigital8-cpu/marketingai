-- AlterTable
ALTER TABLE `TiktokLiveConfig` ADD COLUMN `autoReplyFollows` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `autoReplyGifts` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `autoReplyLikes` BOOLEAN NOT NULL DEFAULT false;
