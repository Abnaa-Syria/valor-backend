-- AlterTable
ALTER TABLE `badges` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `gift_transactions` ADD COLUMN `battleSide` ENUM('A', 'B') NULL;

-- AlterTable
ALTER TABLE `purchases` ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1,
    MODIFY `provider` ENUM('APP_STORE', 'PLAY_STORE', 'TEST') NOT NULL;

-- AlterTable
ALTER TABLE `user_badges` ADD COLUMN `awardedById` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `rematches` (
    `id` VARCHAR(191) NOT NULL,
    `originalBattleId` VARCHAR(191) NOT NULL,
    `challengerId` VARCHAR(191) NOT NULL,
    `opponentId` VARCHAR(191) NOT NULL,
    `challengerClipId` VARCHAR(191) NOT NULL,
    `opponentClipId` VARCHAR(191) NULL,
    `battleId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `expiresAt` DATETIME(3) NOT NULL,
    `respondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rematches_originalBattleId_key`(`originalBattleId`),
    UNIQUE INDEX `rematches_battleId_key`(`battleId`),
    INDEX `rematches_opponentId_status_idx`(`opponentId`, `status`),
    INDEX `rematches_challengerId_status_idx`(`challengerId`, `status`),
    INDEX `rematches_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('MATCH_FOUND', 'BATTLE_RESULT', 'BATTLE_CANCELLED', 'ENTRY_EXPIRED', 'GIFT_RECEIVED', 'FRIEND_JOINED', 'BADGE_EARNED', 'REMATCH_REQUESTED', 'REMATCH_ACCEPTED', 'REMATCH_DECLINED', 'REMATCH_EXPIRED') NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` VARCHAR(255) NOT NULL,
    `data` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `notifications_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rematches` ADD CONSTRAINT `rematches_originalBattleId_fkey` FOREIGN KEY (`originalBattleId`) REFERENCES `battles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rematches` ADD CONSTRAINT `rematches_battleId_fkey` FOREIGN KEY (`battleId`) REFERENCES `battles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rematches` ADD CONSTRAINT `rematches_challengerId_fkey` FOREIGN KEY (`challengerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rematches` ADD CONSTRAINT `rematches_opponentId_fkey` FOREIGN KEY (`opponentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rematches` ADD CONSTRAINT `rematches_challengerClipId_fkey` FOREIGN KEY (`challengerClipId`) REFERENCES `clips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rematches` ADD CONSTRAINT `rematches_opponentClipId_fkey` FOREIGN KEY (`opponentClipId`) REFERENCES `clips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

