-- AlterTable
ALTER TABLE `videoclipbatch` ADD COLUMN `headlineBackground` VARCHAR(191) NOT NULL DEFAULT 'black',
    ADD COLUMN `headlineColor` VARCHAR(191) NOT NULL DEFAULT 'white',
    ADD COLUMN `headlineFont` VARCHAR(191) NOT NULL DEFAULT 'inter',
    ADD COLUMN `subtitleBackground` VARCHAR(191) NOT NULL DEFAULT 'black',
    ADD COLUMN `subtitleColor` VARCHAR(191) NOT NULL DEFAULT 'white',
    ADD COLUMN `subtitleFont` VARCHAR(191) NOT NULL DEFAULT 'inter';
