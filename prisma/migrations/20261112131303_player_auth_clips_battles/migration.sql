-- DropForeignKey
ALTER TABLE `matchmaking_tickets` DROP FOREIGN KEY `matchmaking_tickets_gameId_fkey`;

-- DropIndex
DROP INDEX `clips_videoUid_key` ON `clips`;

-- DropIndex
DROP INDEX `matchmaking_tickets_gameId_status_createdAt_idx` ON `matchmaking_tickets`;

-- AlterTable
ALTER TABLE `clips` DROP COLUMN `playbackUrl`,
    DROP COLUMN `thumbnailUrl`,
    DROP COLUMN `videoUid`,
    ADD COLUMN `thumbnailKey` VARCHAR(191) NULL,
    ADD COLUMN `videoKey` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `credit_ledger` MODIFY `reason` ENUM('DAILY_ALLOWANCE', 'FREE_EXPIRED', 'PURCHASE', 'VOTE', 'BATTLE_ENTRY', 'MATCHMAKING_REFUND', 'ADMIN_ADJUSTMENT') NOT NULL;

-- AlterTable
ALTER TABLE `matchmaking_tickets` DROP COLUMN `criteria`,
    ADD COLUMN `rank` VARCHAR(60) NOT NULL,
    ADD COLUMN `weaponClass` VARCHAR(60) NOT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `passwordHash` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_tokenHash_key`(`tokenHash`),
    INDEX `password_reset_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `clips_videoKey_key` ON `clips`(`videoKey`);

-- CreateIndex
CREATE INDEX `matchmaking_tickets_gameId_status_weaponClass_rank_createdAt_idx` ON `matchmaking_tickets`(`gameId`, `status`, `weaponClass`, `rank`, `createdAt`);

-- CreateIndex
CREATE INDEX `matchmaking_tickets_clipId_status_idx` ON `matchmaking_tickets`(`clipId`, `status`);

-- CreateIndex
CREATE INDEX `matchmaking_tickets_status_expiresAt_idx` ON `matchmaking_tickets`(`status`, `expiresAt`);

-- AddForeignKey
ALTER TABLE `matchmaking_tickets` ADD CONSTRAINT `matchmaking_tickets_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

