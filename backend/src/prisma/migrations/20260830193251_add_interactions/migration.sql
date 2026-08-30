-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "allowedInteractions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ratingScale" INTEGER;

-- CreateTable
CREATE TABLE "yes_no_votes" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" VARCHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "yes_no_votes_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "ratings" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE INDEX "yes_no_votes_postId_idx" ON "yes_no_votes"("postId");

-- CreateIndex
CREATE INDEX "ratings_postId_idx" ON "ratings"("postId");

-- AddForeignKey
ALTER TABLE "yes_no_votes" ADD CONSTRAINT "yes_no_votes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yes_no_votes" ADD CONSTRAINT "yes_no_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
