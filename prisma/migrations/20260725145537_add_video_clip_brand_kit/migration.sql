-- AlterTable
ALTER TABLE `VideoClipBatch` ADD COLUMN `autoTransitions` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `fitMode` VARCHAR(191) NOT NULL DEFAULT 'fill',
    ADD COLUMN `introKey` VARCHAR(191) NULL,
    ADD COLUMN `musicKey` VARCHAR(191) NULL,
    ADD COLUMN `musicVolumePercent` INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN `outroKey` VARCHAR(191) NULL,
    ADD COLUMN `overlayCtaText` TEXT NULL,
    ADD COLUMN `overlayLogoKey` VARCHAR(191) NULL,
    ADD COLUMN `overlayLogoPosition` VARCHAR(191) NOT NULL DEFAULT 'top-right',
    ADD COLUMN `removeFillerWords` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `removePauses` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `VideoClipAsset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('LOGO', 'INTRO', 'OUTRO', 'MUSIC') NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VideoClipAsset_userId_kind_idx`(`userId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VideoClipAsset` ADD CONSTRAINT `VideoClipAsset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
