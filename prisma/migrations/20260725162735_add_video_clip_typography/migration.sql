-- AlterTable
ALTER TABLE `videoclipbatch` ADD COLUMN `headlineAlign` VARCHAR(191) NOT NULL DEFAULT 'center',
    ADD COLUMN `headlineBold` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `headlineFontScale` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `headlineItalic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `subtitleAlign` VARCHAR(191) NOT NULL DEFAULT 'center',
    ADD COLUMN `subtitleBold` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `subtitleFontScale` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `subtitleItalic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `subtitleUnderline` BOOLEAN NOT NULL DEFAULT false;
