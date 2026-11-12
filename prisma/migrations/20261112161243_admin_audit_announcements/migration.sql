-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('MATCH_FOUND', 'BATTLE_RESULT', 'BATTLE_CANCELLED', 'ENTRY_EXPIRED', 'GIFT_RECEIVED', 'FRIEND_JOINED', 'BADGE_EARNED', 'REMATCH_REQUESTED', 'REMATCH_ACCEPTED', 'REMATCH_DECLINED', 'REMATCH_EXPIRED', 'ANNOUNCEMENT') NOT NULL;

-- CreateTable
CREATE TABLE `admin_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `entityType` VARCHAR(30) NOT NULL,
    `entityId` VARCHAR(30) NULL,
    `summary` VARCHAR(255) NOT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_logs_createdAt_idx`(`createdAt`),
    INDEX `admin_audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `admin_audit_logs_adminId_createdAt_idx`(`adminId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` VARCHAR(255) NOT NULL,
    `audience` VARCHAR(20) NOT NULL,
    `userId` VARCHAR(30) NULL,
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `announcements_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_audit_logs` ADD CONSTRAINT `admin_audit_logs_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

