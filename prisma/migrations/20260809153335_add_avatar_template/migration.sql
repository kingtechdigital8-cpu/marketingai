-- CreateTable
CREATE TABLE `AvatarTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `vrmKey` VARCHAR(191) NOT NULL,
    `thumbnailKey` VARCHAR(191) NOT NULL,
    `credit` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AvatarTemplate_vrmKey_key`(`vrmKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the one template that previously lived hardcoded in
-- src/lib/tiktok-live-avatar-templates.ts, so existing users who already
-- selected it keep working once that file switches to reading from this
-- table instead of the static array.
INSERT INTO `AvatarTemplate` (`id`, `label`, `vrmKey`, `thumbnailKey`, `credit`, `order`, `createdAt`)
VALUES (
    'pixiv-sample-1',
    'Avatar 01',
    'system/avatar-templates/pixiv-sample-1/model.vrm',
    'system/avatar-templates/pixiv-sample-1/thumbnail.png',
    'pixiv Inc. — VRM 1.0 sample (commercial use & redistribution allowed)',
    0,
    CURRENT_TIMESTAMP(3)
);
