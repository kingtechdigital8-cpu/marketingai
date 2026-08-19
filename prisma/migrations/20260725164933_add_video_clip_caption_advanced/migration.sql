-- AlterTable
ALTER TABLE `VideoClipBatch` ADD COLUMN `subtitleHighlightColor` VARCHAR(191) NOT NULL DEFAULT '10B981',
    ADD COLUMN `subtitleLineMode` VARCHAR(191) NOT NULL DEFAULT 'multi',
    ADD COLUMN `subtitlePosition` VARCHAR(191) NOT NULL DEFAULT 'auto',
    ADD COLUMN `subtitlePositionX` INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN `subtitlePositionY` INTEGER NOT NULL DEFAULT 85,
    ADD COLUMN `subtitleShadowEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `subtitleShadowOffsetX` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `subtitleShadowOffsetY` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `subtitleStrokeColor` VARCHAR(191) NOT NULL DEFAULT '000000',
    ADD COLUMN `subtitleStrokeWidth` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `subtitleUppercase` BOOLEAN NOT NULL DEFAULT false;
