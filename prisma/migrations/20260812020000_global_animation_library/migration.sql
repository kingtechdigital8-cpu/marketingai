-- DropForeignKey
ALTER TABLE `AvatarAnimation` DROP FOREIGN KEY `AvatarAnimation_userId_fkey`;

-- DropIndex
DROP INDEX `AvatarAnimation_userId_createdAt_idx` ON `AvatarAnimation`;

-- DropIndex
DROP INDEX `AvatarAnimation_userId_slug_key` ON `AvatarAnimation`;

-- AlterTable
ALTER TABLE `AvatarAnimation` MODIFY `userId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TiktokLiveComment` ADD COLUMN `customAnimationId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `AvatarAnimation_slug_key` ON `AvatarAnimation`(`slug`);

-- CreateIndex
CREATE INDEX `AvatarAnimation_createdAt_idx` ON `AvatarAnimation`(`createdAt`);

-- AddForeignKey
ALTER TABLE `TiktokLiveComment` ADD CONSTRAINT `TiktokLiveComment_customAnimationId_fkey` FOREIGN KEY (`customAnimationId`) REFERENCES `AvatarAnimation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AvatarAnimation` ADD CONSTRAINT `AvatarAnimation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

