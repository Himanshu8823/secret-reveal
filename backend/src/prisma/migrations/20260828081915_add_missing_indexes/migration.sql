-- CreateIndex
CREATE INDEX "comments_authorId_createdAt_idx" ON "comments"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "responses_authorId_createdAt_idx" ON "responses"("authorId", "createdAt" DESC);
