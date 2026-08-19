-- AlterTable
ALTER TABLE `TopupTransaction` ADD COLUMN `paymentGuide` TEXT NULL,
    ADD COLUMN `qrLink` TEXT NULL;
