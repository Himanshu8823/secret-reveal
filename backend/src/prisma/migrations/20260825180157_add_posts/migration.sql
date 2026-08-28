-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "s3Key" VARCHAR(512),
    "mimeType" VARCHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "caption" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_meta" (
    "postId" UUID NOT NULL,
    "timerMinutes" INTEGER NOT NULL,
    "revealEndsAt" TIMESTAMPTZ(6) NOT NULL,
    "revealedAt" TIMESTAMP(3),
    "revealNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "discussion_meta_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "post_media" (
    "postId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("postId","mediaId")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_media" (
    "responseId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "response_media_pkey" PRIMARY KEY ("responseId","mediaId")
);

-- CreateTable
CREATE TABLE "reactions" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'like',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_uploaderId_createdAt_idx" ON "media"("uploaderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_groupId_createdAt_idx" ON "posts"("groupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_authorId_createdAt_idx" ON "posts"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_status_createdAt_idx" ON "posts"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "discussion_meta_revealEndsAt_revealedAt_idx" ON "discussion_meta"("revealEndsAt", "revealedAt");

-- CreateIndex
CREATE INDEX "post_media_mediaId_idx" ON "post_media"("mediaId");

-- CreateIndex
CREATE INDEX "responses_postId_createdAt_idx" ON "responses"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "response_media_mediaId_idx" ON "response_media"("mediaId");

-- CreateIndex
CREATE INDEX "reactions_postId_idx" ON "reactions"("postId");

-- CreateIndex
CREATE INDEX "comments_postId_createdAt_idx" ON "comments"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_meta" ADD CONSTRAINT "discussion_meta_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_media" ADD CONSTRAINT "response_media_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_media" ADD CONSTRAINT "response_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
