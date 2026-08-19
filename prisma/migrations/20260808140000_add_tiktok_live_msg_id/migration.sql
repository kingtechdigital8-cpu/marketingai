-- AlterTable
ALTER TABLE `tiktoklivecomment` ADD COLUMN `tiktokMsgId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `TiktokLiveComment_tiktokMsgId_key` ON `TiktokLiveComment`(`tiktokMsgId`);

