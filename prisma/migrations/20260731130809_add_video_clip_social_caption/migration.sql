-- AlterTable
ALTER TABLE `generation` ADD COLUMN `socialCaption` TEXT NULL;

-- AlterTable
ALTER TABLE `videoclipbatch` ADD COLUMN `socialCaptionEnabled` BOOLEAN NOT NULL DEFAULT false;
