-- AlterTable
ALTER TABLE `generation` MODIFY `type` ENUM('SEO_KEYWORDS', 'SEO_META', 'SEO_ARTICLE', 'IMAGE_GENERATION', 'VIDEO_GENERATION', 'VOICE_DUB', 'TIKTOK_LIVE_REPLY') NOT NULL;

-- CreateTable
CREATE TABLE `TiktokLiveConfig` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tiktokUsername` VARCHAR(191) NOT NULL,
    `sessionId` TEXT NULL,
    `ttTargetIdc` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `autoReply` BOOLEAN NOT NULL DEFAULT false,
    `autoSend` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('STOPPED', 'CONNECTING', 'LIVE', 'ERROR') NOT NULL DEFAULT 'STOPPED',
    `lastError` TEXT NULL,
    `roomId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TiktokLiveConfig_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TiktokLiveComment` (
    `id` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `commenterName` VARCHAR(191) NOT NULL,
    `commentText` TEXT NOT NULL,
    `suggestedReply` TEXT NULL,
    `replyStatus` ENUM('NONE', 'GENERATING', 'GENERATED', 'SENT', 'FAILED') NOT NULL DEFAULT 'NONE',
    `sentToChat` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TiktokLiveComment_configId_createdAt_idx`(`configId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TiktokLiveConfig` ADD CONSTRAINT `TiktokLiveConfig_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TiktokLiveComment` ADD CONSTRAINT `TiktokLiveComment_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `TiktokLiveConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
