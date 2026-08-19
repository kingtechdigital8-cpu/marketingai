-- AlterTable
ALTER TABLE `VideoClipBatch` ADD COLUMN `subtitleEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `transcript` JSON NULL;
