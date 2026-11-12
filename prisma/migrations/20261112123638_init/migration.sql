-- CreateTable
CREATE TABLE `admins` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MODERATOR') NOT NULL DEFAULT 'ADMIN',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(30) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `authUid` VARCHAR(128) NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `bannerUrl` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'BANNED') NOT NULL DEFAULT 'ACTIVE',
    `popularity` INTEGER NOT NULL DEFAULT 0,
    `referralCode` VARCHAR(20) NOT NULL,
    `hideReferralCount` BOOLEAN NOT NULL DEFAULT true,
    `activeFrameId` VARCHAR(191) NULL,
    `activeThemeId` VARCHAR(191) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_authUid_key`(`authUid`),
    UNIQUE INDEX `users_referralCode_key`(`referralCode`),
    INDEX `users_status_idx`(`status`),
    INDEX `users_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `games` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `iconUrl` VARCHAR(500) NULL,
    `criteria` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `games_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clips` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `videoUid` VARCHAR(64) NOT NULL,
    `playbackUrl` VARCHAR(500) NULL,
    `thumbnailUrl` VARCHAR(500) NULL,
    `durationSec` INTEGER NULL,
    `status` ENUM('PROCESSING', 'READY', 'FAILED', 'REMOVED') NOT NULL DEFAULT 'PROCESSING',
    `likesCount` INTEGER NOT NULL DEFAULT 0,
    `commentsCount` INTEGER NOT NULL DEFAULT 0,
    `removedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `clips_videoUid_key`(`videoUid`),
    INDEX `clips_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `clips_gameId_status_idx`(`gameId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clip_likes` (
    `userId` VARCHAR(191) NOT NULL,
    `clipId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `clip_likes_clipId_idx`(`clipId`),
    PRIMARY KEY (`userId`, `clipId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` VARCHAR(191) NOT NULL,
    `clipId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(500) NOT NULL,
    `status` ENUM('VISIBLE', 'REMOVED') NOT NULL DEFAULT 'VISIBLE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `comments_clipId_createdAt_idx`(`clipId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `matchmaking_tickets` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clipId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `criteria` JSON NOT NULL,
    `status` ENUM('QUEUED', 'MATCHED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
    `battleId` VARCHAR(191) NULL,
    `matchedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `matchmaking_tickets_gameId_status_createdAt_idx`(`gameId`, `status`, `createdAt`),
    INDEX `matchmaking_tickets_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `battles` (
    `id` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `clipAId` VARCHAR(191) NOT NULL,
    `clipBId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `votingStartsAt` DATETIME(3) NOT NULL,
    `votingEndsAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `votesA` INTEGER NOT NULL DEFAULT 0,
    `votesB` INTEGER NOT NULL DEFAULT 0,
    `winnerSide` ENUM('A', 'B') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `battles_status_votingEndsAt_idx`(`status`, `votingEndsAt`),
    INDEX `battles_gameId_status_idx`(`gameId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `votes` (
    `id` VARCHAR(191) NOT NULL,
    `battleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `side` ENUM('A', 'B') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `votes_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `votes_battleId_userId_key`(`battleId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_balances` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('VOTING', 'CHALLENGE') NOT NULL,
    `freeBalance` INTEGER NOT NULL DEFAULT 0,
    `purchasedBalance` INTEGER NOT NULL DEFAULT 0,
    `freeResetAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `credit_balances_userId_type_key`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('VOTING', 'CHALLENGE') NOT NULL,
    `source` ENUM('FREE', 'PURCHASED') NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` ENUM('DAILY_ALLOWANCE', 'PURCHASE', 'VOTE', 'BATTLE_ENTRY', 'MATCHMAKING_REFUND', 'ADMIN_ADJUSTMENT') NOT NULL,
    `refType` VARCHAR(30) NULL,
    `refId` VARCHAR(30) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_ledger_userId_type_createdAt_idx`(`userId`, `type`, `createdAt`),
    INDEX `credit_ledger_refType_refId_idx`(`refType`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_packs` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('VOTING', 'CHALLENGE') NOT NULL,
    `credits` INTEGER NOT NULL,
    `priceSar` DECIMAL(10, 2) NOT NULL,
    `storeProductId` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `credit_packs_storeProductId_key`(`storeProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` ENUM('APP_STORE', 'PLAY_STORE') NOT NULL,
    `storeTransactionId` VARCHAR(191) NOT NULL,
    `storeProductId` VARCHAR(100) NOT NULL,
    `kind` ENUM('CREDIT_PACK', 'GIFT', 'COSMETIC') NOT NULL,
    `refId` VARCHAR(30) NULL,
    `priceSar` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `rawPayload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases_storeTransactionId_key`(`storeTransactionId`),
    INDEX `purchases_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `purchases_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gifts` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `kind` ENUM('GIFT', 'STICKER') NOT NULL,
    `tier` ENUM('ENTRY', 'STANDARD', 'MID', 'ADVANCED', 'LEGENDARY') NOT NULL,
    `priceSar` DECIMAL(10, 2) NULL,
    `popularityValue` INTEGER NULL,
    `iconUrl` VARCHAR(500) NULL,
    `storeProductId` VARCHAR(100) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `gifts_slug_key`(`slug`),
    UNIQUE INDEX `gifts_storeProductId_key`(`storeProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gift_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `giftId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `battleId` VARCHAR(191) NULL,
    `clipId` VARCHAR(191) NULL,
    `purchaseId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPriceSar` DECIMAL(10, 2) NOT NULL,
    `popularityAwarded` INTEGER NOT NULL,
    `awardedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `gift_transactions_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
    INDEX `gift_transactions_senderId_createdAt_idx`(`senderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `popularity_events` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `source` ENUM('GIFT', 'REFERRAL', 'ADMIN_ADJUSTMENT') NOT NULL,
    `refId` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `popularity_events_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cosmetic_items` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('FRAME', 'THEME') NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `isFree` BOOLEAN NOT NULL DEFAULT false,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `priceSar` DECIMAL(10, 2) NULL,
    `assetUrl` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `storeProductId` VARCHAR(100) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cosmetic_items_slug_key`(`slug`),
    UNIQUE INDEX `cosmetic_items_storeProductId_key`(`storeProductId`),
    INDEX `cosmetic_items_kind_isActive_idx`(`kind`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_cosmetics` (
    `userId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NULL,
    `acquiredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `itemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referrals` (
    `id` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `inviteeId` VARCHAR(191) NOT NULL,
    `pointsAwarded` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `referrals_inviteeId_key`(`inviteeId`),
    INDEX `referrals_inviterId_idx`(`inviterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badges` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `description` VARCHAR(255) NULL,
    `iconUrl` VARCHAR(500) NULL,
    `criteria` JSON NULL,
    `isCriteriaPending` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `badges_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_badges` (
    `userId` VARCHAR(191) NOT NULL,
    `badgeId` VARCHAR(191) NOT NULL,
    `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `badgeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `targetType` ENUM('CLIP', 'COMMENT', 'USER') NOT NULL,
    `targetId` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolutionNote` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reports_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `reports_targetType_targetId_idx`(`targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `endpoint` VARCHAR(100) NOT NULL,
    `statusCode` INTEGER NULL,
    `responseBody` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idempotency_keys_userId_key_key`(`userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_activeFrameId_fkey` FOREIGN KEY (`activeFrameId`) REFERENCES `cosmetic_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_activeThemeId_fkey` FOREIGN KEY (`activeThemeId`) REFERENCES `cosmetic_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clips` ADD CONSTRAINT `clips_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clips` ADD CONSTRAINT `clips_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clip_likes` ADD CONSTRAINT `clip_likes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clip_likes` ADD CONSTRAINT `clip_likes_clipId_fkey` FOREIGN KEY (`clipId`) REFERENCES `clips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_clipId_fkey` FOREIGN KEY (`clipId`) REFERENCES `clips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matchmaking_tickets` ADD CONSTRAINT `matchmaking_tickets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matchmaking_tickets` ADD CONSTRAINT `matchmaking_tickets_clipId_fkey` FOREIGN KEY (`clipId`) REFERENCES `clips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matchmaking_tickets` ADD CONSTRAINT `matchmaking_tickets_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matchmaking_tickets` ADD CONSTRAINT `matchmaking_tickets_battleId_fkey` FOREIGN KEY (`battleId`) REFERENCES `battles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `battles` ADD CONSTRAINT `battles_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `battles` ADD CONSTRAINT `battles_clipAId_fkey` FOREIGN KEY (`clipAId`) REFERENCES `clips`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `battles` ADD CONSTRAINT `battles_clipBId_fkey` FOREIGN KEY (`clipBId`) REFERENCES `clips`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `votes` ADD CONSTRAINT `votes_battleId_fkey` FOREIGN KEY (`battleId`) REFERENCES `battles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `votes` ADD CONSTRAINT `votes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_balances` ADD CONSTRAINT `credit_balances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_ledger` ADD CONSTRAINT `credit_ledger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gift_transactions` ADD CONSTRAINT `gift_transactions_giftId_fkey` FOREIGN KEY (`giftId`) REFERENCES `gifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gift_transactions` ADD CONSTRAINT `gift_transactions_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gift_transactions` ADD CONSTRAINT `gift_transactions_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gift_transactions` ADD CONSTRAINT `gift_transactions_battleId_fkey` FOREIGN KEY (`battleId`) REFERENCES `battles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gift_transactions` ADD CONSTRAINT `gift_transactions_clipId_fkey` FOREIGN KEY (`clipId`) REFERENCES `clips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gift_transactions` ADD CONSTRAINT `gift_transactions_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `popularity_events` ADD CONSTRAINT `popularity_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_cosmetics` ADD CONSTRAINT `user_cosmetics_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_cosmetics` ADD CONSTRAINT `user_cosmetics_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `cosmetic_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_cosmetics` ADD CONSTRAINT `user_cosmetics_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_inviteeId_fkey` FOREIGN KEY (`inviteeId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_badgeId_fkey` FOREIGN KEY (`badgeId`) REFERENCES `badges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `idempotency_keys` ADD CONSTRAINT `idempotency_keys_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
