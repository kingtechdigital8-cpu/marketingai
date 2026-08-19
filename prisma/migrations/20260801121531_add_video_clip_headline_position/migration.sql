-- AlterTable
ALTER TABLE `videoclipbatch` ADD COLUMN `headlinePosition` VARCHAR(191) NOT NULL DEFAULT 'top',
    ADD COLUMN `headlinePositionX` INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN `headlinePositionY` INTEGER NOT NULL DEFAULT 6;
