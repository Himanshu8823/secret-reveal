-- CreateTable GroupInvite for pending confirmation flow
CREATE TABLE "group_invites" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "inviterId" UUID NOT NULL,
    "inviteeId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- Unique per group+invitee
CREATE UNIQUE INDEX "group_invites_groupId_inviteeId_key" ON "group_invites"("groupId", "inviteeId");

-- Index for pending lookup
CREATE INDEX "group_invites_inviteeId_status_idx" ON "group_invites"("inviteeId", "status");
CREATE INDEX "group_invites_groupId_idx" ON "group_invites"("groupId");

-- Foreign keys
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
