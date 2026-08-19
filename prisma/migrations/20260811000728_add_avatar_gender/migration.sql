
-- AlterTable
ALTER TABLE `AvatarTemplate` ADD COLUMN `gender` VARCHAR(191) NOT NULL DEFAULT 'female';

-- AlterTable
ALTER TABLE `TiktokLiveConfig` ADD COLUMN `virtualHostGender` VARCHAR(191) NOT NULL DEFAULT 'female';

