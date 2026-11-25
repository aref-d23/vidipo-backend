/*
  Warnings:

  - A unique constraint covering the columns `[userId,storyId]` on the table `StoryReaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "StoryReaction_userId_storyId_key" ON "StoryReaction"("userId", "storyId");
