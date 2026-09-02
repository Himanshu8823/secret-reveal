-- WhatsApp-style comment replies: a comment may quote another comment.

-- AlterTable
-- Null = top-level comment. Existing rows all become top-level, which is
-- what they already were.
ALTER TABLE "comments" ADD COLUMN "replyToId" UUID;

-- CreateIndex
-- Loading a thread resolves each row's quoted parent by this column.
CREATE INDEX "comments_replyToId_idx" ON "comments"("replyToId");

-- AddForeignKey
-- ON DELETE SET NULL, not CASCADE: deleting a quoted comment must not
-- delete the replies to it. They keep their own text and simply lose the
-- quote, the same way WhatsApp shows a reply whose original is gone.
ALTER TABLE "comments" ADD CONSTRAINT "comments_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
