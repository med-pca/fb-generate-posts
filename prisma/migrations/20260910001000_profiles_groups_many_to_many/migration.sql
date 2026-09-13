-- Create the join table before removing the old one-to-many column.
CREATE TABLE "profile_groups" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_groups_pkey" PRIMARY KEY ("id")
);

-- Preserve every existing profile/group relationship.
INSERT INTO "profile_groups" (
    "id",
    "profile_id",
    "group_id",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    CONCAT('pg_', MD5("profile_id" || ':' || "id")),
    "profile_id",
    "id",
    'ACTIVE'::"RecordStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "groups";

ALTER TABLE "groups" DROP CONSTRAINT "groups_profile_id_fkey";
DROP INDEX "groups_profile_id_external_id_key";
DROP INDEX "groups_profile_id_status_idx";
ALTER TABLE "groups" DROP COLUMN "profile_id";

CREATE INDEX "profile_groups_group_id_status_idx"
ON "profile_groups"("group_id", "status");

CREATE UNIQUE INDEX "profile_groups_profile_id_group_id_key"
ON "profile_groups"("profile_id", "group_id");

CREATE UNIQUE INDEX "groups_external_id_key" ON "groups"("external_id");
CREATE INDEX "groups_status_idx" ON "groups"("status");

ALTER TABLE "profile_groups"
ADD CONSTRAINT "profile_groups_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_groups"
ADD CONSTRAINT "profile_groups_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
