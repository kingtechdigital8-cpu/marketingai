-- AlterTable
ALTER TABLE `tiktoklivecomment` ADD COLUMN `hostVideoGenerationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tiktokliveconfig` ADD COLUMN `overlayToken` VARCHAR(191) NULL,
    ADD COLUMN `virtualHostEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `virtualHostImageKey` VARCHAR(191) NULL,
    ADD COLUMN `virtualHostVoice` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `TiktokLiveConfig_overlayToken_key` ON `TiktokLiveConfig`(`overlayToken`);

-- AddForeignKey
ALTER TABLE `TiktokLiveComment` ADD CONSTRAINT `TiktokLiveComment_hostVideoGenerationId_fkey` FOREIGN KEY (`hostVideoGenerationId`) REFERENCES `Generation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

