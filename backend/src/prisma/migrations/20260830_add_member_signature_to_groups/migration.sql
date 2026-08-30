-- Add memberSignature to groups. A group's identity is now its member set
-- (sorted, comma-joined user ids), so two posts selecting the same members
-- land in the same group row. The column is nullable on purpose: legacy
-- rows created before this migration have no signature and stay
-- queryable by id, just unreachable by findOrCreateGroupByMembers.
--
-- We index first, then enforce uniqueness via a partial UNIQUE index that
-- ignores NULLs — Postgres treats multiple NULLs as distinct in a plain
-- UNIQUE constraint, so a partial index is the only way to allow NULLs
-- for legacy rows while still preventing duplicates for new rows.

-- Add column (nullable).
ALTER TABLE "groups" ADD COLUMN "memberSignature" VARCHAR(2000);

-- Partial UNIQUE index: enforces uniqueness only for non-null signatures.
-- Legacy rows with NULL stay out of the index and don't collide with each
-- other or with newly-signed groups.
CREATE UNIQUE INDEX "groups_memberSignature_key"
  ON "groups"("memberSignature")
  WHERE "memberSignature" IS NOT NULL;
