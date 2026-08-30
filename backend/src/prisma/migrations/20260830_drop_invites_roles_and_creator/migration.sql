-- Drop the invite system, the role column on group_members, and the
-- group.createdById column. The product rule is that a Group IS its member
-- set: anyone who picks the same member set lands in the same group, with
-- no owner, no roles, and no invite flow. Invites by phone are gone; the
-- only way to become a member is to be included in a post's audience
-- (handled by findOrCreateGroupByMembers).
--
-- Drop order matters for FK constraints:
--   1. drop foreign keys from group_invites first
--   2. drop the group_invites table (and its indexes)
--   3. drop the groups_createdById_fkey FK on groups
--   4. drop the groups_createdById index
--   5. drop the groups.createdById column
--   6. drop the group_members.role column

-- 1. Drop FK constraints from group_invites
ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "group_invites_groupId_fkey";
ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "group_invites_inviterId_fkey";
ALTER TABLE "group_invites" DROP CONSTRAINT IF EXISTS "group_invites_inviteeId_fkey";

-- 2. Drop the group_invites table entirely
DROP TABLE IF EXISTS "group_invites";

-- 3. Drop the groups.createdById FK
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_createdById_fkey";

-- 4. Drop the groups.createdById index
DROP INDEX IF EXISTS "groups_createdById_idx";

-- 5. Drop the groups.createdById column
ALTER TABLE "groups" DROP COLUMN IF EXISTS "createdById";

-- 6. Drop the group_members.role column
ALTER TABLE "group_members" DROP COLUMN IF EXISTS "role";
