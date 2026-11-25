-- DropIndex
DROP INDEX "StoryReaction_storyId_userId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideReadReceipts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isGhostMode" BOOLEAN NOT NULL DEFAULT false;
