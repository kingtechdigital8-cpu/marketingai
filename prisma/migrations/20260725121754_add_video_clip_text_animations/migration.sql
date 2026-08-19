-- AlterTable
ALTER TABLE `videoclipbatch` ADD COLUMN `headlineAnimation` VARCHAR(191) NOT NULL DEFAULT 'none',
    ADD COLUMN `subtitleAnimation` VARCHAR(191) NOT NULL DEFAULT 'none';
