
-- AlterTable
ALTER TABLE `avatartemplate` ADD COLUMN `gender` VARCHAR(191) NOT NULL DEFAULT 'female';

-- AlterTable
ALTER TABLE `tiktokliveconfig` ADD COLUMN `virtualHostGender` VARCHAR(191) NOT NULL DEFAULT 'female';

