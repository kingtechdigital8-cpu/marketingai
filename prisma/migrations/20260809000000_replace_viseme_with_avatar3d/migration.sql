-- DataFix: "viseme" (CSS mouth-shape-on-photo) mode is being replaced by
-- "avatar3d" (VRM). Existing rows set to the old value fall back to "video"
-- (a safe neutral default) rather than "avatar3d" directly, since switching
-- them straight to avatar3d would leave them with no visual until they
-- upload a .vrm file.
UPDATE `TiktokLiveConfig` SET `virtualHostMode` = 'video' WHERE `virtualHostMode` = 'viseme';

-- AlterTable
ALTER TABLE `TiktokLiveConfig` DROP COLUMN `virtualHostMouthStyle`,
    DROP COLUMN `virtualHostMouthWidth`,
    DROP COLUMN `virtualHostMouthX`,
    DROP COLUMN `virtualHostMouthY`,
    ADD COLUMN `virtualHostVrmKey` VARCHAR(191) NULL,
    MODIFY `virtualHostMode` VARCHAR(191) NOT NULL DEFAULT 'avatar3d';

