-- AlterTable
ALTER TABLE `tiktoklivecomment` ADD COLUMN `visemeData` JSON NULL;

-- AlterTable
ALTER TABLE `tiktokliveconfig` ADD COLUMN `virtualHostMode` VARCHAR(191) NOT NULL DEFAULT 'viseme',
    ADD COLUMN `virtualHostMouthWidth` INTEGER NULL,
    ADD COLUMN `virtualHostMouthX` INTEGER NULL,
    ADD COLUMN `virtualHostMouthY` INTEGER NULL;

