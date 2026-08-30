-- Add profile fields to the users table.
-- - username: nullable for backward compat, but UNIQUE when set.
-- - avatarUrl: VARCHAR(512) to bound URL length.
-- - bio: VARCHAR(160) to bound bio length.
--
-- Per CLAUDE.md: Postgres UNIQUE constraint is sufficient for username
-- uniqueness — no bloom filter, cache, or rate-limit dedupe needed at this
-- stage. Conflicts surface as Prisma P2002, which the service layer maps to
-- a user-friendly validation error.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "avatarUrl" VARCHAR(512);
ALTER TABLE "users" ADD COLUMN "bio" VARCHAR(160);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
