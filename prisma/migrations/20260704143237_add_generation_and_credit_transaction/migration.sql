-- CreateTable
CREATE TABLE `Generation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('SEO_KEYWORDS', 'SEO_META', 'SEO_ARTICLE') NOT NULL,
    `status` ENUM('COMPLETED', 'FAILED') NOT NULL DEFAULT 'COMPLETED',
    `title` VARCHAR(191) NOT NULL,
    `input` JSON NOT NULL,
    `content` TEXT NULL,
    `creditCost` INTEGER NOT NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Generation_userId_type_idx`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `type` ENUM('TOPUP', 'USAGE', 'REFUND', 'BONUS') NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CreditTransaction_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Generation` ADD CONSTRAINT `Generation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditTransaction` ADD CONSTRAINT `CreditTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditTransaction` ADD CONSTRAINT `CreditTransaction_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `Generation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
