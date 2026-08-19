-- AlterTable
ALTER TABLE `generation` ADD COLUMN `videoClipBatchId` VARCHAR(191) NULL,
    MODIFY `type` ENUM('SEO_KEYWORDS', 'SEO_META', 'SEO_ARTICLE', 'IMAGE_GENERATION', 'VIDEO_GENERATION', 'VOICE_DUB', 'TIKTOK_LIVE_REPLY', 'AVATAR_GENERATION', 'VIDEO_CLIP') NOT NULL;

-- CreateTable
CREATE TABLE `VideoClipBatch` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sourceLabel` VARCHAR(191) NOT NULL,
    `sourceVideoKey` VARCHAR(191) NOT NULL,
    `momentQuery` TEXT NOT NULL,
    `requestedCount` INTEGER NOT NULL,
    `aspectRatio` VARCHAR(191) NOT NULL,
    `headlineEnabled` BOOLEAN NOT NULL DEFAULT false,
    `effectPreset` VARCHAR(191) NULL,
    `durationSeconds` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'TRANSCRIBING', 'FINDING_MOMENTS', 'MOMENTS_FOUND', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `moments` JSON NULL,
    `analysisCreditCost` INTEGER NOT NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VideoClipBatch_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VideoClipBatch` ADD CONSTRAINT `VideoClipBatch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Generation` ADD CONSTRAINT `Generation_videoClipBatchId_fkey` FOREIGN KEY (`videoClipBatchId`) REFERENCES `VideoClipBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
