-- CreateTable
CREATE TABLE `TopupTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `refId` VARCHAR(191) NOT NULL,
    `trxId` VARCHAR(191) NULL,
    `amountIdr` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `payUrl` TEXT NULL,
    `qrString` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TopupTransaction_refId_key`(`refId`),
    INDEX `TopupTransaction_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TopupTransaction` ADD CONSTRAINT `TopupTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
