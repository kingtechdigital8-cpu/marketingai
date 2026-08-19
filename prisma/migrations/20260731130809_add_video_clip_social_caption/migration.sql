-- AlterTable
ALTER TABLE `Generation` ADD COLUMN `socialCaption` TEXT NULL;

-- AlterTable
ALTER TABLE `VideoClipBatch` ADD COLUMN `socialCaptionEnabled` BOOLEAN NOT NULL DEFAULT false;
