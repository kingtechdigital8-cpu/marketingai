-- AlterTable
ALTER TABLE `TiktokLiveConfig` ADD COLUMN `aiPurpose` VARCHAR(191) NULL,
    ADD COLUMN `aiTone` VARCHAR(191) NULL,
    ADD COLUMN `avoidTopics` TEXT NULL,
    ADD COLUMN `businessInfo` TEXT NULL,
    ADD COLUMN `businessName` VARCHAR(191) NULL,
    ADD COLUMN `callToAction` TEXT NULL;
