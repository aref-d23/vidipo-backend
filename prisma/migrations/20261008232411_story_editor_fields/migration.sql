-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "background" TEXT,
ADD COLUMN     "closeFriendsOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "drawings" JSONB,
ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "stickers" JSONB,
ADD COLUMN     "textOverlays" JSONB,
ALTER COLUMN "mediaUrl" DROP NOT NULL;
