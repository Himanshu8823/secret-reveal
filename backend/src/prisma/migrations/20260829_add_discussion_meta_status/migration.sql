-- Add status column to discussion_meta. Default 'active' matches the
-- Post.status convention so existing rows land in the expected state.
-- The Post.status denormalised column also gets the same value so feed
-- reads stay consistent until the next refresh.
ALTER TABLE "discussion_meta"
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'active';

-- Backfill Post.status for rows created before this migration (the
-- Post.status column already exists but may have NULLs from older test
-- fixtures). Safe no-op for production data because new posts always
-- write a non-null status.
UPDATE "posts"
  SET "status" = 'active'
  WHERE "status" IS NULL;
