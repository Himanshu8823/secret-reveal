-- Polls replace the Yes/No interaction.
--
-- A poll's question is the post caption; only its answers live here. The
-- Yes/No interaction is dropped entirely (product decision), so its table
-- and any "yesNo" entries left in posts.allowedInteractions go with it.

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "poll_options_postId_idx" ON "poll_options"("postId");

-- CreateIndex
-- Fixes display order and stops two options sharing a slot on one post.
CREATE UNIQUE INDEX "poll_options_postId_order_key" ON "poll_options"("postId", "order");

-- CreateTable
CREATE TABLE "poll_votes" (
    "optionId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("optionId","userId")
);

-- CreateIndex
CREATE INDEX "poll_votes_postId_idx" ON "poll_votes"("postId");

-- CreateIndex
-- Clearing a voter's previous answers on single-select is keyed on this.
CREATE INDEX "poll_votes_postId_userId_idx" ON "poll_votes"("postId", "userId");

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
-- Null for every non-poll post; only meaningful next to a "poll" entry
-- in allowedInteractions.
ALTER TABLE "posts" ADD COLUMN "pollMultiSelect" BOOLEAN;

-- Drop the Yes/No interaction.
--
-- Existing posts keep working: removing "yesNo" from allowedInteractions
-- leaves the post's other interactions intact. A post whose ONLY
-- interaction was yesNo would end up with an empty array, which the API
-- treats as "no interactions available" — it still renders, it just
-- offers nothing to vote on. That is the intended outcome for a dropped
-- feature; back-filling those to another interaction would invent
-- author intent that was never there.
UPDATE "posts"
SET "allowedInteractions" = array_remove("allowedInteractions", 'yesNo')
WHERE 'yesNo' = ANY("allowedInteractions");

-- DropTable
-- Votes cast on the removed interaction are dropped with it; they have
-- no meaning once the interaction no longer exists.
DROP TABLE IF EXISTS "yes_no_votes";
